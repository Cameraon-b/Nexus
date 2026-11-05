using System.Data;
using Microsoft.EntityFrameworkCore;
using Nexus.Application;
using Nexus.Domain;
namespace Nexus.Infrastructure;

public sealed class WorkspaceStore(NexusDb db) : IWorkspaceStore
{
    public async Task<MessageDto[]> Messages() => (await db.Messages.AsNoTracking().Where(m => m.ConversationId == "main").OrderBy(m => m.CreatedAt).ThenBy(m => m.Id).ToArrayAsync()).Select(MessageDto.From).ToArray();
    public async Task<MessageDto> Post(Guid authorId, PostMessageRequest request)
    {
        var message = Message.Deliver(authorId, request.Body, request.ClientRequestId);
        await using var transaction = await db.Database.BeginTransactionAsync();
        var lockKey = authorId.ToString("N") + request.ClientRequestId.ToString("N");
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({lockKey}, 0))");
        var existing = await db.Messages.SingleOrDefaultAsync(m => m.AuthorId == authorId && m.ClientRequestId == request.ClientRequestId);
        if (existing is not null)
        {
            existing.AssertSamePayload(message);
            await transaction.CommitAsync();
            return MessageDto.From(existing);
        }
        db.Messages.Add(message);
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return MessageDto.From(message);
    }
    public async Task<HomeDto> Home()
    {
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead);
        await db.Database.ExecuteSqlRawAsync("SET TRANSACTION READ ONLY");
        var participants = await db.Participants.AsNoTracking().OrderBy(p => p.Name).ToArrayAsync();
        var main = await db.Conversations.AsNoTracking().SingleAsync(c => c.Id == "main");
        var ids = await db.Memberships.AsNoTracking().Where(m => m.ConversationId == "main").Select(m => m.ParticipantId).ToArrayAsync();
        var messages = await Messages();
        await transaction.CommitAsync();
        return new(participants, new(main.Id, main.Title, main.Kind, main.State, ids, main.Description), messages);
    }
}
