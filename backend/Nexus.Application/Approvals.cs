using Nexus.Domain;

namespace Nexus.Application;

public sealed record DecideDraftRequest(string Outcome, string? FinalBody, string? Reason, Guid ClientRequestId);
public sealed record ApprovalResult(Guid Id, Guid DraftId, Guid ReviewerParticipantId, string Outcome, string? FinalBody, string? Reason, Guid ClientRequestId, DateTimeOffset ResolvedAt, Guid? DeliveredMessageId)
{
    public static ApprovalResult From(ApprovalDecision d) => new(d.Id, d.DraftId, d.ReviewerParticipantId, d.Outcome, d.FinalBody, d.Reason, d.ClientRequestId, d.ResolvedAt, d.DeliveredMessageId);
}
public sealed record ApprovalDraft(Guid Id, string ConversationId, Guid AuthorId, Guid? SourceMessageId, string Body, string State, DateTimeOffset CreatedAt, DateTimeOffset? ResolvedAt)
{
    public static ApprovalDraft From(MessageDraft d) => new(d.Id, d.ConversationId, d.AuthorId, d.SourceMessageId, d.Body, d.State, d.CreatedAt, d.ResolvedAt);
}
public sealed record ApprovalItem(ApprovalDraft Draft, Participant Agent, ConversationDto Destination);
public sealed record ApprovalPage(ApprovalItem[] Items, string? NextCursor, int PendingCount);
public sealed record ApprovalDetail(ApprovalDraft Draft, Participant Agent, ConversationDto Destination, Participant[] Recipients, MessageDto? SourceMessage, MessageDto[] Context, ApprovalResult? Decision, Participant? Reviewer);
public interface IApprovalStore
{
    Task<ApprovalPage> List(string? sessionCookie, string? status, string? after, int? limit);
    Task<ApprovalDetail> Detail(string? sessionCookie, Guid draftId);
    Task<ApprovalResult> Decide(string? sessionCookie, Guid draftId, DecideDraftRequest request);
}
