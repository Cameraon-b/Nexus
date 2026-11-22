namespace Nexus.Domain;

public sealed class ApprovalDecision
{
    public Guid Id { get; private set; } = Guid.NewGuid();
    public Guid DraftId { get; private set; }
    public Guid ReviewerParticipantId { get; private set; }
    public string Outcome { get; private set; } = "";
    public string? FinalBody { get; private set; }
    public string? Reason { get; private set; }
    public Guid ClientRequestId { get; private set; }
    public DateTimeOffset ResolvedAt { get; private set; } = DateTimeOffset.UtcNow;
    public Guid? DeliveredMessageId { get; private set; }
    public Message? DeliveredMessage { get; private set; }

    private ApprovalDecision() { }

    // Optional private review note; deliberately modest and never an ordinary message field.
    public const int ReasonLimit = 1000;
    private static string? NormalizeOptional(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    public void AssertSamePayload(string outcome, string? finalBody, string? reason)
    {
        // An unchanged approval may omit finalBody or explicitly repeat the released body.
        var expectedBody = outcome == "approved" && finalBody is null ? FinalBody : NormalizeOptional(finalBody);
        if ((outcome == "rejected" && finalBody is not null)
            || Outcome != outcome || FinalBody != expectedBody || Reason != NormalizeOptional(reason))
            throw new RuleViolation(409, "clientRequestId was already used with different decision content.");
    }

    internal static ApprovalDecision Create(MessageDraft draft, Guid reviewer, string outcome, string? finalBody, string? reason, Guid requestId)
    {
        if (outcome is not ("approved" or "approved_with_edits" or "rejected")) throw new RuleViolation(400, "Invalid approval outcome.");
        if (reviewer == Guid.Empty) throw new RuleViolation(400, "A reviewer is required.");
        if (requestId == Guid.Empty) throw new RuleViolation(400, "A nonempty clientRequestId UUID is required.");
        var normalizedBody = NormalizeOptional(finalBody);
        var normalizedReason = NormalizeOptional(reason);
        if (normalizedReason?.Length > ReasonLimit) throw new RuleViolation(400, "Review note must not exceed 1000 characters.");
        if (outcome == "rejected" && finalBody is not null)
            throw new RuleViolation(400, "Rejection cannot include final content.");
        if (outcome == "approved" && finalBody is not null && normalizedBody != draft.Body)
            throw new RuleViolation(400, "Use approved_with_edits when changing wording.");
        if (outcome == "approved_with_edits" && normalizedBody == draft.Body)
            throw new RuleViolation(400, "Edited approval must change the proposal.");
        var message = outcome == "rejected" ? null : Message.Release(draft, outcome == "approved" ? draft.Body : finalBody ?? "", requestId, outcome == "approved_with_edits");
        return new ApprovalDecision
        {
            DraftId = draft.Id,
            ReviewerParticipantId = reviewer,
            Outcome = outcome,
            FinalBody = message?.Body,
            Reason = normalizedReason,
            ClientRequestId = requestId,
            DeliveredMessage = message,
            DeliveredMessageId = message?.Id
        };
    }
}
