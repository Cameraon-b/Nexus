using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Nexus.Application;
using Nexus.Domain;

namespace Nexus.Infrastructure;

public sealed class AgentStore(NexusDb db)
{
    public async Task RequireAdmin(Guid? accountId)
    {
        if (accountId is null) throw new RuleViolation(401, "Authentication required.");
        if (!await (from a in db.Accounts
                    join p in db.Participants on a.ParticipantId equals p.Id
                    where a.Id == accountId && a.IsAdmin && p.IsAdmin && p.Kind == "human" && p.State == "active"
                    select a.Id).AnyAsync())
            throw new RuleViolation(403, "Active human administrator required.");
    }

    public async Task<CreateAgentResponse> Create(CreateAgentRequest request)
    {
        var name = request.DisplayName?.Trim();
        var description = request.Description?.Trim() ?? "";
        var label = request.TokenLabel?.Trim();
        if (string.IsNullOrEmpty(name) || name.Length > 100)
            throw new RuleViolation(400, "Display name must be between 1 and 100 characters.");
        if (description.Length > 160)
            throw new RuleViolation(400, "Description must be at most 160 characters.");
        if (string.IsNullOrEmpty(label) || label.Length > 100)
            throw new RuleViolation(400, "Token label must be between 1 and 100 characters.");

        await using var transaction = await db.Database.BeginTransactionAsync();
        // Shares the public-membership lock with registration and Topic creation.
        // No setup, direct-pair, participant-row or author/request lock is acquired.
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(7843951002)");
        var agent = new Participant { Id = Guid.NewGuid(), Name = name, Description = description, Kind = "agent", Availability = "unknown" };
        var raw = "nexus_int_" + Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
        var token = new IntegrationToken { ParticipantId = agent.Id, Label = label, TokenHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(raw))) };
        db.Participants.Add(agent);
        db.IntegrationTokens.Add(token);
        var publicIds = await db.Conversations.Where(c => c.State == "active" && (c.Kind == "main" || c.Kind == "topical")).Select(c => c.Id).ToArrayAsync();
        db.Memberships.AddRange(publicIds.Select(id => new Membership { ConversationId = id, ParticipantId = agent.Id }));
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return new(agent, IntegrationTokenDto.From(token), raw);
    }

    public async Task<AgentSummary[]> List()
    {
        var agents = await db.Participants.AsNoTracking().Where(p => p.Kind == "agent").OrderBy(p => p.Name).ThenBy(p => p.Id).ToArrayAsync();
        var tokens = await db.IntegrationTokens.AsNoTracking().OrderBy(t => t.CreatedAt).ThenBy(t => t.Id).ToArrayAsync();
        var counts = await db.MessageDrafts.AsNoTracking().Where(d => d.State == "pending").GroupBy(d => d.AuthorId).Select(g => new { Id = g.Key, Count = g.Count() }).ToDictionaryAsync(g => g.Id, g => g.Count);
        return agents.Select(a => new AgentSummary(a, tokens.Where(t => t.ParticipantId == a.Id).Select(IntegrationTokenDto.From).ToArray(), counts.GetValueOrDefault(a.Id))).ToArray();
    }

    public async Task<IssueIntegrationTokenResponse> Replace(Guid participantId, IssueIntegrationTokenRequest request)
    {
        var label = request.Label?.Trim();
        if (string.IsNullOrEmpty(label) || label.Length > 100)
            throw new RuleViolation(400, "Token label must be between 1 and 100 characters.");
        await using var transaction = await db.Database.BeginTransactionAsync();
        await IntegrationStore.AcquireAgentLock(db, participantId);
        if (!await db.Participants.AnyAsync(p => p.Id == participantId && p.Kind == "agent" && p.State == "active"))
            throw new RuleViolation(404, "Agent not found.");
        var active = await db.IntegrationTokens.SingleOrDefaultAsync(t => t.ParticipantId == participantId && t.State == "active");
        if (active?.Id != request.ExpectedTokenId)
            throw new RuleViolation(409, "Token state changed. Refresh before replacing.");
        if (active is not null)
        {
            active.State = "revoked";
            active.RevokedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync();
        }
        var raw = "nexus_int_" + Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
        var token = new IntegrationToken { ParticipantId = participantId, Label = label, TokenHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(raw))) };
        db.IntegrationTokens.Add(token);
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return new(IntegrationTokenDto.From(token), raw);
    }

    public async Task Revoke(Guid tokenId)
    {
        var participantId = await db.IntegrationTokens.Where(t => t.Id == tokenId).Select(t => (Guid?)t.ParticipantId).SingleOrDefaultAsync();
        if (participantId is null) throw new RuleViolation(404, "Token not found.");
        await using var transaction = await db.Database.BeginTransactionAsync();
        await IntegrationStore.AcquireAgentLock(db, participantId.Value);
        await db.IntegrationTokens.Where(t => t.Id == tokenId && t.State == "active")
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.State, "revoked").SetProperty(t => t.RevokedAt, DateTimeOffset.UtcNow));
        await transaction.CommitAsync();
    }

    public async Task<IntegrationTokenDto[]> Tokens(Guid participantId)
    {
        if (!await db.Participants.AnyAsync(p => p.Id == participantId && p.Kind == "agent"))
            throw new RuleViolation(404, "Agent not found.");
        return (await db.IntegrationTokens.AsNoTracking().Where(t => t.ParticipantId == participantId).OrderBy(t => t.CreatedAt).ThenBy(t => t.Id).ToArrayAsync()).Select(IntegrationTokenDto.From).ToArray();
    }
}
