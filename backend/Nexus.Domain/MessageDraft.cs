namespace Nexus.Domain;

public sealed class MessageDraft
{
    public Guid Id { get; private set; } = Guid.NewGuid();
    public string ConversationId { get; private set; } = "";
    public Guid AuthorId { get; private set; }
    public Guid SubmittedTokenId { get; private set; }
    public Guid ClientRequestId { get; private set; }
    public Guid? SourceMessageId { get; private set; }
    public string Body { get; private set; } = "";
    public string State { get; private set; } = "pending";
    public DateTimeOffset CreatedAt { get; private set; } = DateTimeOffset.UtcNow;

    private MessageDraft() { }

    public static MessageDraft Propose(string conversationId, Guid authorId, Guid tokenId, string? body, Guid requestId, Guid? sourceId)
    {
        var normalized = body?.Trim();
        if (string.IsNullOrEmpty(normalized) || normalized.Length > 5000)
            throw new RuleViolation(400, "Message body must be between 1 and 5000 characters.");
        if (requestId == Guid.Empty) throw new RuleViolation(400, "A nonempty clientRequestId UUID is required.");
        return new MessageDraft { ConversationId = conversationId, AuthorId = authorId, SubmittedTokenId = tokenId, ClientRequestId = requestId, SourceMessageId = sourceId, Body = normalized };
    }

    public void AssertSamePayload(MessageDraft candidate)
    {
        if (ConversationId != candidate.ConversationId || Body != candidate.Body || SourceMessageId != candidate.SourceMessageId)
            throw new RuleViolation(409, "clientRequestId was already used with different draft content.");
    }
}
