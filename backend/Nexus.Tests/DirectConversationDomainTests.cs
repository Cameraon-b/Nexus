using Nexus.Domain;

namespace Nexus.Tests;

public class DirectConversationDomainTests
{
    [Fact]
    public void Factory_canonicalizes_postgres_uuid_order_and_rejects_empty_or_equal_ids()
    {
        var low = Guid.Parse("00000001-ffff-ffff-ffff-ffffffffffff");
        var high = Guid.Parse("80000000-0000-0000-0000-000000000000");
        foreach (var (a, b) in new[] { (low, high), (high, low) })
        {
            var c = Conversation.CreateDirect(a, b);
            Assert.Equal(low, c.DirectParticipantLowId);
            Assert.Equal(high, c.DirectParticipantHighId);
            Assert.Equal("direct", c.Kind);
            Assert.Equal("active", c.State);
            Assert.Equal(32, c.Id.Length);
            Assert.Null(c.CreatedByParticipantId);
            Assert.Null(c.ClientRequestId);
        }
        foreach (var (a, b) in new[] { (Guid.Empty, low), (low, Guid.Empty), (low, low) })
            Assert.Equal(400, Assert.Throws<RuleViolation>(() => Conversation.CreateDirect(a, b)).Status);
    }
}
