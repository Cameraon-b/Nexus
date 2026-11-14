namespace Nexus.Domain;

public sealed class Message
{
    public Guid Id { get; private set; } = Guid.NewGuid();
    public string ConversationId { get; private set; } = "main";
    public Guid AuthorId { get; private set; }
    public Guid ClientRequestId { get; private set; }
    public string Body { get; private set; } = "";
    public string State { get; private set; } = "delivered";
    public DateTimeOffset CreatedAt { get; private set; } = DateTimeOffset.UtcNow;
    private Message() { }
    public void AssertSamePayload(Message retry)
    {
        if (!string.Equals(ConversationId, retry.ConversationId, StringComparison.Ordinal)
            || !string.Equals(Body, retry.Body, StringComparison.Ordinal))
            throw new RuleViolation(409, "clientRequestId was already used with different message content.");
    }
    public static Message Deliver(Guid authorId, string? body, Guid clientRequestId) => Deliver("main", authorId, body, clientRequestId);
    public static Message Deliver(string conversationId, Guid authorId, string? body, Guid clientRequestId)
    {
        var trimmed = body?.Trim();
        if (string.IsNullOrEmpty(trimmed) || trimmed.Length > 5000)
            throw new RuleViolation(400, "Message body must be between 1 and 5000 characters.");
        if (clientRequestId == Guid.Empty) throw new RuleViolation(400, "A nonempty clientRequestId UUID is required.");
        return new() { ConversationId = conversationId, AuthorId = authorId, Body = trimmed, ClientRequestId = clientRequestId };
    }
}
