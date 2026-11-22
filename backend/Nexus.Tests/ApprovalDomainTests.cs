using Nexus.Domain;

namespace Nexus.Tests;

public class ApprovalDomainTests
{
    private static MessageDraft Draft() => MessageDraft.Propose("main", Guid.NewGuid(), Guid.NewGuid(), "  Original proposal  ", Guid.NewGuid(), null);

    [Theory]
    [InlineData("approved", "Different", null, false, false)]
    [InlineData("approved_with_edits", "Original proposal", null, false, false)]
    [InlineData("approved_with_edits", null, null, false, false)]
    [InlineData("approved_with_edits", " ", null, false, false)]
    [InlineData("approved_with_edits", "oversized", null, false, false)]
    [InlineData("rejected", "Content", null, false, false)]
    [InlineData("rejected", null, "oversized", false, false)]
    [InlineData("approved", null, null, true, false)]
    [InlineData("rejected", null, null, true, false)]
    [InlineData("approved", null, null, false, true)]
    [InlineData("unknown", null, null, false, false)]
    public void Invalid_decisions_leave_draft_pending(string outcome, string? body, string? reason, bool emptyRequest, bool emptyReviewer)
    {
        var draft = Draft();
        if (body == "oversized") body = new string('x', 5001);
        if (reason == "oversized") reason = new string('x', 1001);
        var error = Assert.Throws<RuleViolation>(() => draft.Resolve(emptyReviewer ? Guid.Empty : Guid.NewGuid(), outcome, body, reason, emptyRequest ? Guid.Empty : Guid.NewGuid()));
        Assert.Equal(400, error.Status);
        Assert.Equal("pending", draft.State);
        Assert.Null(draft.ResolvedAt);
        Assert.Equal("Original proposal", draft.Body);
    }

    [Theory]
    [InlineData("approved")]
    [InlineData("approved_with_edits")]
    [InlineData("rejected")]
    public void Decision_retry_compares_normalized_payload_without_mutating_terminal_draft(string outcome)
    {
        var draft = Draft();
        var body = outcome == "approved_with_edits" ? "Edited" : null;
        var decision = draft.Resolve(Guid.NewGuid(), outcome, body, " note ", Guid.NewGuid());
        decision.AssertSamePayload(outcome, body is null ? null : " Edited ", "note");
        Assert.Equal(409, Assert.Throws<RuleViolation>(() => decision.AssertSamePayload(outcome, body, "Changed note")).Status);
        Assert.Equal(409, Assert.Throws<RuleViolation>(() => decision.AssertSamePayload("unknown", body, "note")).Status);
        Assert.Equal(409, Assert.Throws<RuleViolation>(() => draft.Resolve(Guid.NewGuid(), outcome, body, null, Guid.NewGuid())).Status);
    }

    [Fact]
    public void Rejected_retry_cannot_smuggle_even_blank_final_content()
    {
        var draft = Draft();
        var decision = draft.Resolve(Guid.NewGuid(), "rejected", null, null, Guid.NewGuid());
        Assert.Equal(409, Assert.Throws<RuleViolation>(() => decision.AssertSamePayload("rejected", " ", null)).Status);
    }

    [Fact]
    public void Rejection_has_no_message_or_final_body_and_is_terminal()
    {
        var draft = Draft();
        var decision = draft.Resolve(Guid.NewGuid(), "rejected", null, "  Not ready  ", Guid.NewGuid());
        Assert.Equal("rejected", draft.State);
        Assert.Equal("Original proposal", draft.Body);
        Assert.Equal("Not ready", decision.Reason);
        Assert.Null(decision.FinalBody);
        Assert.Null(decision.DeliveredMessageId);
        Assert.Null(decision.DeliveredMessage);
        Assert.Equal(409, Assert.Throws<RuleViolation>(() => draft.Resolve(Guid.NewGuid(), "approved", null, null, Guid.NewGuid())).Status);
    }

    [Fact]
    public void Edited_approval_keeps_original_and_marks_agent_message_before_release()
    {
        var draft = Draft();
        var decision = draft.Resolve(Guid.NewGuid(), "approved_with_edits", "  Final wording  ", null, Guid.NewGuid());
        Assert.Equal("Original proposal", draft.Body);
        Assert.Equal("approved_with_edits", draft.State);
        Assert.Equal("Final wording", decision.FinalBody);
        Assert.Equal("Final wording", decision.DeliveredMessage!.Body);
        Assert.True(decision.DeliveredMessage.EditedBeforeRelease);
        Assert.Equal(draft.AuthorId, decision.DeliveredMessage.AuthorId);
    }

    [Fact]
    public void Unchanged_approval_preserves_proposal_and_agent_authorship_with_separate_reviewer()
    {
        var draft = Draft();
        var reviewer = Guid.NewGuid();
        var request = Guid.NewGuid();
        var decision = draft.Resolve(reviewer, "approved", null, null, request);
        var message = Assert.IsType<Message>(decision.DeliveredMessage);
        Assert.Equal("Original proposal", draft.Body);
        Assert.Equal("approved", draft.State);
        Assert.Equal(draft.Id, decision.DraftId);
        Assert.Equal(reviewer, decision.ReviewerParticipantId);
        Assert.Equal(request, decision.ClientRequestId);
        Assert.Equal("Original proposal", decision.FinalBody);
        Assert.Equal(message.Id, decision.DeliveredMessageId);
        Assert.Equal(draft.Id, message.SourceDraftId);
        Assert.Equal(draft.AuthorId, message.AuthorId);
        Assert.Equal(draft.ConversationId, message.ConversationId);
        Assert.Equal(decision.FinalBody, message.Body);
        Assert.False(message.EditedBeforeRelease);
        Assert.Equal(decision.ResolvedAt, draft.ResolvedAt);
    }
}
