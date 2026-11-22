using Microsoft.EntityFrameworkCore;
using Nexus.Application;
using Nexus.Domain;

namespace Nexus.Infrastructure;

public sealed partial class ApprovalStore(NexusDb db, IIdentityStore identity) : IApprovalStore
{
    // No token/agent fence: a token's lifetime is deliberately not delivery authority.
    // Lock order: sorted author/request advisory keys (reviewer; also agent for release), durable
    // draft row FOR UPDATE, account FOR SHARE, sorted participant rows FOR SHARE,
    // conversation FOR SHARE, public membership FOR SHARE. Never acquire setup,
    // public-membership, direct-pair, or integration-agent advisory locks here.
    // Direct creation also locks participants in UUID order before conversation writes.
    // SHARE row locks prevent state/authority/access changes until commit, including
    // writers that do not cooperate with advisory locks. Rejection skips delivery locks.
    public async Task<ApprovalResult> Decide(string? sessionCookie, Guid draftId, DecideDraftRequest request)
    {
        await using var transaction = await db.Database.BeginTransactionAsync();
        var user = await identity.Resolve(sessionCookie) ?? throw new RuleViolation(401, "Authentication required.");
        await new AgentStore(db).RequireAdmin(user.Id);
        if (request.ClientRequestId == Guid.Empty) throw new RuleViolation(400, "A nonempty clientRequestId UUID is required.");
        var candidate = await db.MessageDrafts.AsNoTracking().SingleOrDefaultAsync(d => d.Id == draftId)
            ?? throw new RuleViolation(404, "Draft not found.");
        var operationAuthors = request.Outcome == "rejected" ? new[] { user.ParticipantId } : new[] { user.ParticipantId, candidate.AuthorId };
        var keys = operationAuthors.Select(id => id.ToString("N") + request.ClientRequestId.ToString("N")).Distinct().Order().ToArray();
        foreach (var key in keys)
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({key}, 0))");
        // Always materialize afresh after waiting, never resolve the pre-lock snapshot.
        var draft = (await db.MessageDrafts.FromSqlInterpolated($"SELECT * FROM \"MessageDrafts\" WHERE \"Id\" = {draftId} FOR UPDATE").ToArrayAsync()).Single();
        var account = (await db.Accounts.FromSqlInterpolated($"SELECT * FROM \"Accounts\" WHERE \"Id\" = {user.Id} FOR SHARE").AsNoTracking().ToArrayAsync()).SingleOrDefault();
        var conversation = await db.Conversations.AsNoTracking().SingleAsync(c => c.Id == draft.ConversationId);
        var ids = new[] { user.ParticipantId, draft.AuthorId }.Concat(request.Outcome == "rejected" ? [] : new[] { conversation.DirectParticipantLowId, conversation.DirectParticipantHighId }.OfType<Guid>()).Distinct().ToArray();
        var participants = await db.Participants.FromSqlInterpolated($"SELECT * FROM \"Participants\" WHERE \"Id\" = ANY({ids}) ORDER BY \"Id\" FOR SHARE").AsNoTracking().ToArrayAsync();
        var reviewer = participants.SingleOrDefault(p => p.Id == user.ParticipantId);
        if (account is null || !account.IsAdmin || account.ParticipantId != user.ParticipantId || reviewer is not { IsAdmin: true, Kind: "human", State: "active" })
            throw new RuleViolation(403, "Active human administrator required.");
        var prior = await db.ApprovalDecisions.AsNoTracking().SingleOrDefaultAsync(d => d.ReviewerParticipantId == user.ParticipantId && d.ClientRequestId == request.ClientRequestId);
        if (prior is not null)
        {
            if (prior.DraftId != draftId) throw new RuleViolation(409, "clientRequestId was already used for another decision.");
            prior.AssertSamePayload(request.Outcome, request.FinalBody, request.Reason);
            await transaction.CommitAsync();
            return ApprovalResult.From(prior);
        }
        if (draft.State != "pending") throw new RuleViolation(409, "Draft already resolved. Refresh its authoritative state.");
        // The reviewer request namespace is shared with human message/topic operations;
        // the release also occupies the agent's message request namespace.
        foreach (var id in operationAuthors.Distinct())
            if (await db.Messages.AnyAsync(m => m.AuthorId == id && m.ClientRequestId == request.ClientRequestId)
                || await db.MessageDrafts.AnyAsync(d => d.AuthorId == id && d.ClientRequestId == request.ClientRequestId)
                || await db.Conversations.AnyAsync(c => c.CreatedByParticipantId == id && c.ClientRequestId == request.ClientRequestId))
                throw new RuleViolation(409, "clientRequestId was already used for another operation.");
        if (request.Outcome != "rejected")
        {
            var locked = (await db.Conversations.FromSqlInterpolated($"SELECT * FROM \"Conversations\" WHERE \"Id\" = {draft.ConversationId} FOR SHARE").AsNoTracking().ToArrayAsync()).Single();
            if (locked.DirectParticipantLowId != conversation.DirectParticipantLowId || locked.DirectParticipantHighId != conversation.DirectParticipantHighId)
                throw new RuleViolation(409, "Destination changed. Refresh before deciding.");
            await db.Memberships.FromSqlInterpolated($"SELECT * FROM \"Memberships\" WHERE \"ConversationId\" = {draft.ConversationId} AND \"ParticipantId\" = {draft.AuthorId} FOR SHARE").AsNoTracking().ToArrayAsync();
            if (!participants.Any(p => p.Id == draft.AuthorId && p.Kind == "agent" && p.State == "active")
                || !await ConversationAccess.For(db, draft.AuthorId).AnyAsync(c => c.Id == draft.ConversationId))
                throw new RuleViolation(409, "Draft can no longer be delivered. Rejection remains available.");
        }
        var decision = draft.Resolve(user.ParticipantId, request.Outcome, request.FinalBody, request.Reason, request.ClientRequestId);
        db.ApprovalDecisions.Add(decision);
        await db.SaveChangesAsync();
        // PostgreSQL timestamps have microsecond precision; first responses and retries
        // must use the same persisted representation, not pre-save CLR ticks.
        // Materialize before commit so a read failure cannot leave a partial result.
        await db.Entry(decision).ReloadAsync();
        var result = ApprovalResult.From(decision);
        await transaction.CommitAsync();
        return result;
    }
}
