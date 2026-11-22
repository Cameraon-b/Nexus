using Nexus.Domain;

namespace Nexus.Application;

public sealed record ProposeDraftRequest(string ConversationId, string? Body, Guid ClientRequestId, Guid? SourceMessageId);
public sealed record DraftMetadata(Guid Id, string ConversationId, Guid ClientRequestId, Guid? SourceMessageId, string State, DateTimeOffset CreatedAt, DateTimeOffset? ResolvedAt = null, Guid? DeliveredMessageId = null)
{
    public static DraftMetadata From(MessageDraft draft, Guid? deliveredMessageId = null) => new(draft.Id, draft.ConversationId, draft.ClientRequestId, draft.SourceMessageId, draft.State, draft.CreatedAt, draft.ResolvedAt, deliveredMessageId);
}
public sealed record IntegrationInboxPage(MessageDto[] Messages, string? NextCursor);
public sealed record CreateAgentRequest(string? DisplayName, string? Description, string? TokenLabel);
public sealed record IntegrationTokenDto(Guid Id, string Label, string State, DateTimeOffset CreatedAt, DateTimeOffset? LastUsedAt, DateTimeOffset? RevokedAt)
{
    public static IntegrationTokenDto From(IntegrationToken token) => new(token.Id, token.Label, token.State, token.CreatedAt, token.LastUsedAt, token.RevokedAt);
}
public sealed record CreateAgentResponse(Participant Agent, IntegrationTokenDto Token, string RawToken);
public sealed record AgentSummary(Participant Agent, IntegrationTokenDto[] Tokens, int PendingCount);
public sealed record IssueIntegrationTokenRequest(string? Label, Guid? ExpectedTokenId);
public sealed record IssueIntegrationTokenResponse(IntegrationTokenDto Token, string RawToken);
