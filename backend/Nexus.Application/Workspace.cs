using Nexus.Domain;
namespace Nexus.Application;

public sealed record ConversationDto(string Id, string Title, string Kind, string State, Guid[] ParticipantIds, string Description);
public sealed record HomeDto(Participant[] Participants, ConversationDto Conversation, MessageDto[] Messages);
public sealed record PostMessageRequest(string Body, Guid ClientRequestId);
public sealed record MessageDto(Guid Id, string ConversationId, Guid AuthorId, string Body, string State, DateTimeOffset CreatedAt)
{
    public static MessageDto From(Message m) => new(m.Id, m.ConversationId, m.AuthorId, m.Body, m.State, m.CreatedAt);
}
public interface IWorkspaceStore
{
    Task<HomeDto> Home();
    Task<MessageDto[]> Messages();
    Task<MessageDto> Post(Guid authorId, PostMessageRequest request);
}
