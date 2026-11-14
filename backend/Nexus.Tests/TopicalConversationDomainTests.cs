using Nexus.Domain;

namespace Nexus.Tests;

public class TopicalConversationDomainTests
{
    [Theory]
    [InlineData("T", "", "M")]
    [InlineData("  Topic  ", "  Description  ", "  Opening message  ")]
    [InlineData("xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", "", "M")]
    public void Topical_factory_accepts_boundaries_and_trims(string title, string description, string opening)
    {
        var creator = Guid.NewGuid();
        var requestId = Guid.NewGuid();

        var result = Conversation.CreateTopical(creator, title, description, opening, requestId);

        Assert.Equal(title.Trim(), result.Conversation.Title);
        Assert.Equal(description.Trim(), result.Conversation.Description);
        Assert.Equal("topical", result.Conversation.Kind);
        Assert.Equal("active", result.Conversation.State);
        Assert.Equal(creator, result.Conversation.CreatedByParticipantId);
        Assert.Equal(requestId, result.Conversation.ClientRequestId);
        Assert.Equal(32, result.Conversation.Id.Length);
        Assert.True(result.Conversation.CreatedAt <= DateTimeOffset.UtcNow);
        Assert.Equal(opening.Trim(), result.OpeningMessage.Body);
        Assert.Equal(result.Conversation.Id, result.OpeningMessage.ConversationId);
        Assert.Equal(creator, result.OpeningMessage.AuthorId);
        Assert.Equal(requestId, result.OpeningMessage.ClientRequestId);
    }

    [Fact]
    public void Topical_factory_accepts_maximum_description_and_opening_message()
    {
        var result = Conversation.CreateTopical(Guid.NewGuid(), new string('t', 80), new string('d', 160), new string('m', 5000), Guid.NewGuid());

        Assert.Equal(80, result.Conversation.Title.Length);
        Assert.Equal(160, result.Conversation.Description.Length);
        Assert.Equal(5000, result.OpeningMessage.Body.Length);
    }

    [Theory]
    [InlineData(null, "", "M")]
    [InlineData(" ", "", "M")]
    [InlineData("xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", "", "M")]
    [InlineData("T", "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", "M")]
    [InlineData("T", "", null)]
    [InlineData("T", "", " ")]
    public void Topical_factory_rejects_invalid_text(string? title, string? description, string? opening)
    {
        Assert.Equal(400, Assert.Throws<RuleViolation>(() => Conversation.CreateTopical(Guid.NewGuid(), title, description, opening, Guid.NewGuid())).Status);
    }

    [Fact]
    public void Topical_factory_rejects_empty_request_id()
    {
        Assert.Equal(400, Assert.Throws<RuleViolation>(() => Conversation.CreateTopical(Guid.NewGuid(), "Topic", "", "Opening", Guid.Empty)).Status);
    }
}
