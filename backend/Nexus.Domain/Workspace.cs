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
    public string Id { get; private set; } = "main";
    public string Title { get; private set; } = "The Common Room";
    public string Kind { get; private set; } = "main";
    public string State { get; private set; } = "active";
    public string Description { get; private set; } = "A shared space for everyone in the workspace.";
    public DateTimeOffset CreatedAt { get; private set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedByParticipantId { get; private set; }
    public Guid? ClientRequestId { get; private set; }

    private Conversation() { }

    public static Conversation CreateMain() => new();

    public static TopicalConversationCreation CreateTopical(
        Guid creatorId,
        string? title,
        string? description,
        string? openingMessage,
        Guid clientRequestId)
    {
        var normalizedTitle = title?.Trim();
        var normalizedDescription = description?.Trim() ?? "";
        if (string.IsNullOrEmpty(normalizedTitle) || normalizedTitle.Length > 80)
            throw new RuleViolation(400, "Conversation title must be between 1 and 80 characters.");
        if (normalizedDescription.Length > 160)
            throw new RuleViolation(400, "Conversation description must be at most 160 characters.");
        if (clientRequestId == Guid.Empty)
            throw new RuleViolation(400, "A nonempty clientRequestId UUID is required.");

        var conversation = new Conversation
        {
            Id = Guid.NewGuid().ToString("N"),
            Title = normalizedTitle,
            Description = normalizedDescription,
            Kind = "topical",
            State = "active",
            CreatedByParticipantId = creatorId,
            ClientRequestId = clientRequestId
        };
        var message = Message.Deliver(conversation.Id, creatorId, openingMessage, clientRequestId);
        return new(conversation, message);
    }

    public void AssertSamePayload(string? title, string? description, string? openingMessage, string storedOpeningMessage)
    {
        var normalizedTitle = title?.Trim();
        var normalizedDescription = description?.Trim() ?? "";
        var normalizedOpening = openingMessage?.Trim();
        if (!string.Equals(Title, normalizedTitle, StringComparison.Ordinal)
            || !string.Equals(Description, normalizedDescription, StringComparison.Ordinal)
            || !string.Equals(storedOpeningMessage, normalizedOpening, StringComparison.Ordinal))
            throw new RuleViolation(409, "clientRequestId was already used with different conversation content.");
    }
}

public sealed record TopicalConversationCreation(Conversation Conversation, Message OpeningMessage);
public sealed class Membership
{
    public string ConversationId { get; set; } = "main";
    public Guid ParticipantId { get; set; }
}
