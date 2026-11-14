using System.Data;
using Microsoft.EntityFrameworkCore;
using Nexus.Application;
using Nexus.Domain;
namespace Nexus.Infrastructure;

public sealed class WorkspaceStore(NexusDb db) : IWorkspaceStore
{
    private const long PublicMembershipLock = 7843951002;

    // Global lock order for operations needing more than one lock:
    // workspace setup (IdentityStore) -> public membership -> author/client request.
    private Task AcquireAuthorRequestLock(Guid authorId, Guid clientRequestId)
    {
        var lockKey = authorId.ToString("N") + clientRequestId.ToString("N");
        return db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({lockKey}, 0))");
    }

    public async Task<MessageDto[]> Messages(string conversationId, Guid participantId)
    {
        await RequireMembership(conversationId, participantId);
        return await ReadMessages(conversationId);
    }

    public async Task<MessageDto> Post(string conversationId, Guid authorId, PostMessageRequest request)
    {
        await RequireMembership(conversationId, authorId);
        var message = Message.Deliver(conversationId, authorId, request.Body, request.ClientRequestId);
        await using var transaction = await db.Database.BeginTransactionAsync();
        await AcquireAuthorRequestLock(authorId, request.ClientRequestId);
        if (await db.Conversations.AnyAsync(c => c.CreatedByParticipantId == authorId && c.ClientRequestId == request.ClientRequestId))
            throw new RuleViolation(409, "clientRequestId was already used to create a conversation.");
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

    public async Task<CreateTopicalConversationResponse> CreateTopical(Guid creatorId, CreateTopicalConversationRequest request)
    {
        var creation = Conversation.CreateTopical(creatorId, request.Title, request.Description, request.OpeningMessage, request.ClientRequestId);
        await using var transaction = await db.Database.BeginTransactionAsync();
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock({PublicMembershipLock})");
        await AcquireAuthorRequestLock(creatorId, request.ClientRequestId);
        var existing = await db.Conversations.SingleOrDefaultAsync(c => c.CreatedByParticipantId == creatorId && c.ClientRequestId == request.ClientRequestId);
        if (existing is not null)
        {
            var opening = await db.Messages.SingleAsync(m => m.ConversationId == existing.Id && m.AuthorId == creatorId && m.ClientRequestId == request.ClientRequestId);
            existing.AssertSamePayload(request.Title, request.Description, request.OpeningMessage, opening.Body);
            var existingDto = await ConversationDtoFor(existing);
            await transaction.CommitAsync();
            return new(existingDto, MessageDto.From(opening));
        }
        if (await db.Messages.AnyAsync(m => m.AuthorId == creatorId && m.ClientRequestId == request.ClientRequestId))
            throw new RuleViolation(409, "clientRequestId was already used for a message.");

        var participantIds = await db.Participants.Where(p => p.State == "active").Select(p => p.Id).ToArrayAsync();
        db.Conversations.Add(creation.Conversation);
        db.Memberships.AddRange(participantIds.Select(id => new Membership { ConversationId = creation.Conversation.Id, ParticipantId = id }));
        db.Messages.Add(creation.OpeningMessage);
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return new(ToDto(creation.Conversation, participantIds), MessageDto.From(creation.OpeningMessage));
    }

    public async Task<HomeDto> Home(Guid participantId)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead);
        await db.Database.ExecuteSqlRawAsync("SET TRANSACTION READ ONLY");
        var participants = await db.Participants.AsNoTracking().OrderBy(p => p.Name).ToArrayAsync();
        var conversations = await db.Conversations.AsNoTracking()
            .Where(c => c.State == "active" && db.Memberships.Any(m => m.ConversationId == c.Id && m.ParticipantId == participantId))
            .OrderBy(c => c.Kind == "main" ? 0 : 1).ThenBy(c => c.CreatedAt).ThenBy(c => c.Id)
            .ToArrayAsync();
        var conversationIds = conversations.Select(c => c.Id).ToArray();
        var memberships = await db.Memberships.AsNoTracking().Where(m => conversationIds.Contains(m.ConversationId)).ToArrayAsync();
        var memberIds = memberships.GroupBy(m => m.ConversationId).ToDictionary(g => g.Key, g => g.Select(m => m.ParticipantId).ToArray());
        var conversationDtos = conversations.Select(c => ToDto(c, memberIds[c.Id])).ToArray();
        var main = conversationDtos.Single(c => c.Id == "main");
        var messages = await ReadMessages("main");
        await transaction.CommitAsync();
        return new(participants, main, messages, conversationDtos);
    }

    private async Task RequireMembership(string conversationId, Guid participantId)
    {
        if (!await db.Conversations.AsNoTracking().AnyAsync(c => c.Id == conversationId))
            throw new RuleViolation(404, "Conversation not found.");
        if (!await db.Memberships.AsNoTracking().AnyAsync(m => m.ConversationId == conversationId && m.ParticipantId == participantId))
            throw new RuleViolation(403, "Conversation membership is required.");
    }

    private async Task<MessageDto[]> ReadMessages(string conversationId) =>
        (await db.Messages.AsNoTracking().Where(m => m.ConversationId == conversationId).OrderBy(m => m.CreatedAt).ThenBy(m => m.Id).ToArrayAsync())
        .Select(MessageDto.From).ToArray();

    private async Task<ConversationDto> ConversationDtoFor(Conversation conversation)
    {
        var ids = await db.Memberships.AsNoTracking().Where(m => m.ConversationId == conversation.Id).Select(m => m.ParticipantId).ToArrayAsync();
        return ToDto(conversation, ids);
    }

    private static ConversationDto ToDto(Conversation conversation, Guid[] participantIds) =>
        new(conversation.Id, conversation.Title, conversation.Kind, conversation.State, participantIds, conversation.Description, conversation.CreatedAt);
}
