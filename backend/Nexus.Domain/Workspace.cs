namespace Nexus.Domain;

public sealed class Participant
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public string Kind { get; set; } = "human";
    public string State { get; set; } = "active";
    public string Availability { get; set; } = "available";
    public bool IsAdmin { get; set; }
}
public sealed class Conversation
{
    public string Id { get; set; } = "main";
    public string Title { get; set; } = "The Common Room";
    public string Kind { get; set; } = "main";
    public string State { get; set; } = "active";
    public string Description { get; set; } = "A shared space for everyone in the workspace.";
}
public sealed class Membership
{
    public string ConversationId { get; set; } = "main";
    public Guid ParticipantId { get; set; }
}
