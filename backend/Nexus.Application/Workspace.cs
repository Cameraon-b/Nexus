using Nexus.Domain;
namespace Nexus.Application;

/// <summary>A joined conversation. Kind is main, topical, or direct; direct titles are viewer-specific.</summary>
public sealed record ConversationDto(
    string Id,
    string Title,
    string Kind,
    string State,
    Guid[] ParticipantIds,
    string Description,
    DateTimeOffset CreatedAt);
public sealed record HomeDto(Participant[] Participants, ConversationDto Conversation, MessageDto[] Messages, ConversationDto[] Conversations);
public sealed record CreateDirectConversationRequest(Guid ParticipantId);
public sealed record PostMessageRequest(string Body, Guid ClientRequestId);
public sealed record CreateTopicalConversationRequest(string Title, string Description, string OpeningMessage, Guid ClientRequestId);
public sealed record CreateTopicalConversationResponse(ConversationDto Conversation, MessageDto OpeningMessage);
public sealed record MessageDto(Guid Id, string ConversationId, Guid AuthorId, string Body, string State, DateTimeOffset CreatedAt)
{
    public static MessageDto From(Message m) => new(m.Id, m.ConversationId, m.AuthorId, m.Body, m.State, m.CreatedAt);
}
public interface IWorkspaceStore
{
    Task<ConversationDto> CreateDirect(Guid requesterId, CreateDirectConversationRequest request);
    Task<HomeDto> Home(Guid participantId);
    Task<MessageDto[]> Messages(string conversationId, Guid participantId);
    Task<MessageDto> Post(string conversationId, Guid authorId, PostMessageRequest request);
    Task<CreateTopicalConversationResponse> CreateTopical(Guid creatorId, CreateTopicalConversationRequest request);
}
