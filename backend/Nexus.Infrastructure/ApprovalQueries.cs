using System.Data;
using Microsoft.EntityFrameworkCore;
using Nexus.Application;
using Nexus.Domain;

namespace Nexus.Infrastructure;

public sealed partial class ApprovalStore
{
    private async Task RequireReviewer(string? cookie)
    {
        var user = await identity.Resolve(cookie);
        await new AgentStore(db).RequireAdmin(user?.Id);
    }

    public async Task<ApprovalPage> List(string? sessionCookie, string? status, string? after, int? limit)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead);
        await db.Database.ExecuteSqlRawAsync("SET TRANSACTION READ ONLY");
        await RequireReviewer(sessionCookie);
        var resolved = status == "resolved";
        if (status is not (null or "pending" or "resolved")) throw new RuleViolation(400, "Invalid approval status.");
        var size = limit ?? 25;
        if (size is < 1 or > 100) throw new RuleViolation(400, "Limit must be between 1 and 100.");
        var query = db.MessageDrafts.AsNoTracking().Where(d => resolved ? d.State != "pending" : d.State == "pending");
        if (after is not null)
        {
            if (!Guid.TryParseExact(after, "N", out var id)) throw new RuleViolation(400, "Invalid approval cursor.");
            // A pending cursor may since have resolved; its immutable submission position
            // remains valid so concurrent resolutions never make pagination skip backwards.
            var boundary = await db.MessageDrafts.AsNoTracking().SingleOrDefaultAsync(d => d.Id == id)
                ?? throw new RuleViolation(400, "Invalid approval cursor.");
            query = query.Where(d => d.CreatedAt > boundary.CreatedAt || d.CreatedAt == boundary.CreatedAt && d.Id.CompareTo(id) > 0);
        }
        var rows = await query.OrderBy(d => d.CreatedAt).ThenBy(d => d.Id).Take(size + 1).ToArrayAsync();
        var items = new List<ApprovalItem>();
        foreach (var draft in rows.Take(size))
            items.Add(new(ApprovalDraft.From(draft), await db.Participants.AsNoTracking().SingleAsync(p => p.Id == draft.AuthorId), await Destination(draft.ConversationId)));
        var count = await db.MessageDrafts.CountAsync(d => d.State == "pending");
        await transaction.CommitAsync();
        return new(items.ToArray(), rows.Length > size ? rows[size - 1].Id.ToString("N") : null, count);
    }

    public async Task<ApprovalDetail> Detail(string? sessionCookie, Guid draftId)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead);
        await db.Database.ExecuteSqlRawAsync("SET TRANSACTION READ ONLY");
        await RequireReviewer(sessionCookie);
        var draft = await db.MessageDrafts.AsNoTracking().SingleOrDefaultAsync(d => d.Id == draftId)
            ?? throw new RuleViolation(404, "Draft not found.");
        var agent = await db.Participants.AsNoTracking().SingleAsync(p => p.Id == draft.AuthorId);
        var destination = await Destination(draft.ConversationId);
        var recipients = await db.Participants.AsNoTracking().Where(p => destination.ParticipantIds.Contains(p.Id)).OrderBy(p => p.Id).ToArrayAsync();
        var source = draft.SourceMessageId is { } sourceId ? await db.Messages.AsNoTracking().SingleOrDefaultAsync(m => m.Id == sourceId && m.ConversationId == draft.ConversationId && m.State == "delivered") : null;
        var recent = await db.Messages.AsNoTracking().Where(m => m.ConversationId == draft.ConversationId && m.State == "delivered").OrderByDescending(m => m.CreatedAt).ThenByDescending(m => m.Id).Take(20).ToArrayAsync();
        var decision = await db.ApprovalDecisions.AsNoTracking().SingleOrDefaultAsync(d => d.DraftId == draftId);
        var reviewer = decision is null ? null : await db.Participants.AsNoTracking().SingleAsync(p => p.Id == decision.ReviewerParticipantId);
        await transaction.CommitAsync();
        return new(ApprovalDraft.From(draft), agent, destination, recipients, source is null ? null : MessageDto.From(source), recent.Reverse().Select(MessageDto.From).ToArray(), decision is null ? null : ApprovalResult.From(decision), reviewer);
    }

    private async Task<ConversationDto> Destination(string id)
    {
        var c = await db.Conversations.AsNoTracking().SingleAsync(c => c.Id == id);
        var ids = c.Kind == "direct" ? new[] { c.DirectParticipantLowId!.Value, c.DirectParticipantHighId!.Value }
            : await db.Memberships.AsNoTracking().Where(m => m.ConversationId == id).OrderBy(m => m.ParticipantId).Select(m => m.ParticipantId).ToArrayAsync();
        return new(c.Id, c.Title, c.Kind, c.State, ids, c.Description, c.CreatedAt);
    }
}
