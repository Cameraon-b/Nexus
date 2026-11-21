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
    // Direct create/reopen takes ONLY its namespaced canonical-pair lock, never
    // any of the above locks; message sends take ONLY author/client request.
    // Agent creation takes public membership only. Integration authentication,
    // token replacement and revocation take their namespaced agent lock only
    // (then row writes). Draft submission takes agent -> author/client request;
    // no operation takes these in reverse or takes public/pair locks after agent.
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
        if (await db.MessageDrafts.AnyAsync(d => d.AuthorId == authorId && d.ClientRequestId == request.ClientRequestId))
            throw new RuleViolation(409, "clientRequestId was already used for a draft.");
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
        if (await db.MessageDrafts.AnyAsync(d => d.AuthorId == creatorId && d.ClientRequestId == request.ClientRequestId))
            throw new RuleViolation(409, "clientRequestId was already used for a draft.");
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

    public async Task<ConversationDto> CreateDirect(Guid requesterId, CreateDirectConversationRequest request)
    {
        var candidate = Conversation.CreateDirect(requesterId, request.ParticipantId);
        await using var transaction = await db.Database.BeginTransactionAsync();
        var key = "direct:" + candidate.DirectParticipantLowId!.Value.ToString("N") + candidate.DirectParticipantHighId!.Value.ToString("N");
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({key}, 0))");
        // Lock in UUID order before the database's pair write fence (no lock upgrades).
        var eligible = await db.Participants.FromSqlInterpolated($"SELECT * FROM \"Participants\" WHERE \"Id\" IN ({requesterId}, {request.ParticipantId}) AND \"Kind\" IN ('human', 'agent') AND \"State\" = 'active' ORDER BY \"Id\" FOR UPDATE").ToArrayAsync();
        if (eligible.Length != 2 || eligible.Single(p => p.Id == requesterId).Kind != "human")
            throw new RuleViolation(404, "Participant not found.");
        var conversation = await db.Conversations.SingleOrDefaultAsync(c => c.DirectParticipantLowId == candidate.DirectParticipantLowId && c.DirectParticipantHighId == candidate.DirectParticipantHighId);
        if (conversation is null)
        {
            conversation = candidate;
            db.Conversations.Add(conversation);
            db.Memberships.AddRange(new[] { requesterId, request.ParticipantId }.Select(id => new Membership { ConversationId = conversation.Id, ParticipantId = id }));
            await db.SaveChangesAsync();
        }
        var dto = await ConversationDtoFor(conversation, requesterId);
        await transaction.CommitAsync();
        return dto;
    }

    public async Task<HomeDto> Home(Guid participantId)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead);
        await db.Database.ExecuteSqlRawAsync("SET TRANSACTION READ ONLY");
        var participants = await db.Participants.AsNoTracking().OrderBy(p => p.Name).ToArrayAsync();
        var conversations = await ConversationAccess.For(db, participantId)
            .OrderBy(c => c.Kind == "main" ? 0 : 1).ThenBy(c => c.CreatedAt).ThenBy(c => c.Id)
            .ToArrayAsync();
        var conversationIds = conversations.Select(c => c.Id).ToArray();
        var memberships = await db.Memberships.AsNoTracking().Where(m => conversationIds.Contains(m.ConversationId)).ToArrayAsync();
        var memberIds = memberships.GroupBy(m => m.ConversationId).ToDictionary(g => g.Key, g => g.Select(m => m.ParticipantId).ToArray());
        var conversationDtos = conversations.Select(c => ToDto(c, c.Kind == "direct" ? new[] { c.DirectParticipantLowId!.Value, c.DirectParticipantHighId!.Value } : memberIds[c.Id], c.Kind == "direct" ? participants.Single(p => p.Id == (c.DirectParticipantLowId == participantId ? c.DirectParticipantHighId : c.DirectParticipantLowId)).Name : null)).ToArray();
        var main = conversationDtos.Single(c => c.Id == "main");
        var messages = await ReadMessages("main");
        await transaction.CommitAsync();
        return new(participants, main, messages, conversationDtos);
    }

    private async Task RequireMembership(string conversationId, Guid participantId)
    {
        var conversation = await db.Conversations.AsNoTracking().SingleOrDefaultAsync(c => c.Id == conversationId);
        if (conversation is null)
            throw new RuleViolation(404, "Conversation not found.");
        var authorized = await ConversationAccess.For(db, participantId).AnyAsync(c => c.Id == conversationId);
        if (!authorized)
            throw new RuleViolation(403, "Conversation membership is required.");
    }

    private async Task<MessageDto[]> ReadMessages(string conversationId) =>
        (await db.Messages.AsNoTracking().Where(m => m.ConversationId == conversationId).OrderBy(m => m.CreatedAt).ThenBy(m => m.Id).ToArrayAsync())
        .Select(MessageDto.From).ToArray();

    private async Task<ConversationDto> ConversationDtoFor(Conversation conversation, Guid? viewerId = null)
    {
        var ids = conversation.Kind == "direct"
            ? new[] { conversation.DirectParticipantLowId!.Value, conversation.DirectParticipantHighId!.Value }
            : await db.Memberships.AsNoTracking().Where(m => m.ConversationId == conversation.Id).Select(m => m.ParticipantId).ToArrayAsync();
        var title = conversation.Kind == "direct"
            ? await db.Participants.Where(p => p.Id == (conversation.DirectParticipantLowId == viewerId ? conversation.DirectParticipantHighId : conversation.DirectParticipantLowId)).Select(p => p.Name).SingleAsync()
            : null;
        return ToDto(conversation, ids, title);
    }

    private static ConversationDto ToDto(Conversation conversation, Guid[] participantIds, string? title = null) =>
        new(conversation.Id, title ?? conversation.Title, conversation.Kind, conversation.State, participantIds, conversation.Description, conversation.CreatedAt);
}
