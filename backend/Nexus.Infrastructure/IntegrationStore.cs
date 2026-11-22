using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Nexus.Application;
using Nexus.Domain;

namespace Nexus.Infrastructure;

public sealed class IntegrationStore(NexusDb db)
{
    // Integration operations hold the agent fence through response materialization
    // and persistence. Revocation/replacement use the same fence. Draft writes may
    // next take author/request, never public-membership or direct-pair locks.
    internal static Task AcquireAgentLock(NexusDb db, Guid participantId)
    {
        var key = "integration-agent:" + participantId.ToString("N");
        return db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({key}, 0))");
    }

    private async Task<T> Authenticated<T>(string? authorization, Func<Participant, IntegrationToken, Task<T>> operation)
    {
        const string prefix = "Bearer nexus_int_";
        if (authorization is null || !authorization.StartsWith(prefix, StringComparison.Ordinal) || authorization.Length != prefix.Length + 64
            || authorization[prefix.Length..].Any(c => c is not (>= '0' and <= '9') and not (>= 'a' and <= 'f')))
            throw new RuleViolation(401, "Integration authentication required.");
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(authorization[7..])));
        var candidates = await db.IntegrationTokens.AsNoTracking().Where(t => t.TokenHash == hash).Take(2).ToArrayAsync();
        if (candidates.Length != 1) throw new RuleViolation(401, "Integration authentication required.");
        await using var transaction = await db.Database.BeginTransactionAsync();
        await AcquireAgentLock(db, candidates[0].ParticipantId);
        var token = await db.IntegrationTokens.SingleOrDefaultAsync(t => t.Id == candidates[0].Id && t.TokenHash == hash && t.State == "active" && t.RevokedAt == null);
        var agent = token is null ? null : await db.Participants.SingleOrDefaultAsync(p => p.Id == token.ParticipantId && p.Kind == "agent" && p.State == "active");
        if (agent is null) throw new RuleViolation(401, "Integration authentication required.");
        var result = await operation(agent, token!);
        agent.Availability = "available";
        token!.LastUsedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return result;
    }

    public Task<DraftMetadata[]> Drafts(string? authorization) => Authenticated(authorization, async (agent, _) =>
        await (from draft in db.MessageDrafts.AsNoTracking()
               where draft.AuthorId == agent.Id
               join decision in db.ApprovalDecisions.AsNoTracking() on draft.Id equals decision.DraftId into decisions
               from decision in decisions.DefaultIfEmpty()
               orderby draft.CreatedAt, draft.Id
               select new DraftMetadata(draft.Id, draft.ConversationId, draft.ClientRequestId, draft.SourceMessageId, draft.State, draft.CreatedAt, draft.ResolvedAt, decision == null ? null : decision.DeliveredMessageId)).ToArrayAsync());

    public Task<DraftMetadata> Propose(string? authorization, ProposeDraftRequest request) => Authenticated(authorization, async (agent, token) =>
    {
        var draft = MessageDraft.Propose(request.ConversationId, agent.Id, token.Id, request.Body, request.ClientRequestId, request.SourceMessageId);
        if (!await ConversationAccess.For(db, agent.Id).AnyAsync(c => c.Id == request.ConversationId))
            throw new RuleViolation(403, "Conversation access required.");
        if (request.SourceMessageId is { } source && !await db.Messages.AnyAsync(m => m.Id == source && m.ConversationId == request.ConversationId && m.State == "delivered"))
            throw new RuleViolation(400, "Source must be a delivered message in the target conversation.");
        var key = agent.Id.ToString("N") + request.ClientRequestId.ToString("N");
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({key}, 0))");
        if (await db.Messages.AnyAsync(m => m.AuthorId == agent.Id && m.ClientRequestId == request.ClientRequestId)
            || await db.Conversations.AnyAsync(c => c.CreatedByParticipantId == agent.Id && c.ClientRequestId == request.ClientRequestId))
            throw new RuleViolation(409, "clientRequestId was already used for another operation.");
        var existing = await db.MessageDrafts.SingleOrDefaultAsync(d => d.AuthorId == agent.Id && d.ClientRequestId == request.ClientRequestId);
        if (existing is not null)
        {
            existing.AssertSamePayload(draft);
            var deliveredId = await db.ApprovalDecisions.AsNoTracking().Where(d => d.DraftId == existing.Id).Select(d => d.DeliveredMessageId).SingleOrDefaultAsync();
            return DraftMetadata.From(existing, deliveredId);
        }
        db.MessageDrafts.Add(draft);
        return DraftMetadata.From(draft);
    });

    public Task<Participant> Me(string? authorization) => Authenticated(authorization, (agent, _) => Task.FromResult(agent));

    public Task<IntegrationInboxPage> Inbox(string? authorization, string? after, int? limit) => Authenticated(authorization, async (agent, _) =>
    {
        var size = limit ?? 50;
        if (size < 1 || size > 100) throw new RuleViolation(400, "Limit must be between 1 and 100.");
        var visible = db.Messages.AsNoTracking().Where(m => m.State == "delivered" && m.AuthorId != agent.Id
            && ConversationAccess.For(db, agent.Id).Any(c => c.Id == m.ConversationId));
        if (after is not null)
        {
            if (!Guid.TryParseExact(after, "N", out var handle)) throw new RuleViolation(400, "Invalid inbox cursor.");
            var cursor = await db.InboxCursors.AsNoTracking().SingleOrDefaultAsync(c => c.Id == handle && c.ParticipantId == agent.Id);
            if (cursor is null) throw new RuleViolation(400, "Invalid inbox cursor.");
            var id = cursor.MessageId;
            var boundary = await visible.SingleOrDefaultAsync(m => m.Id == id);
            if (boundary is null) throw new RuleViolation(400, "Invalid inbox cursor.");
            visible = visible.Where(m => m.CreatedAt > boundary.CreatedAt || (m.CreatedAt == boundary.CreatedAt && m.Id.CompareTo(id) > 0));
        }
        var rows = await visible.OrderBy(m => m.CreatedAt).ThenBy(m => m.Id).Take(size + 1).ToArrayAsync();
        var page = rows.Take(size).ToArray();
        string? next = null;
        if (rows.Length > size)
        {
            var boundaryId = page[^1].Id;
            var cursor = await db.InboxCursors.SingleOrDefaultAsync(c => c.ParticipantId == agent.Id && c.MessageId == boundaryId);
            if (cursor is null)
            {
                cursor = new InboxCursor { ParticipantId = agent.Id, MessageId = boundaryId };
                db.InboxCursors.Add(cursor);
            }
            next = cursor.Id.ToString("N");
        }
        return new IntegrationInboxPage(page.Select(MessageDto.From).ToArray(), next);
    });
}
