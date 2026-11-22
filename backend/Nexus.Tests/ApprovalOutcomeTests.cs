using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace Nexus.Tests;

public class ApprovalOutcomeTests
{
    [Fact]
    public async Task Agent_terminal_metadata_survives_replacement_is_private_and_revokes_immediately()
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        var agent = await IntegrationInboxTests.Agent(w);
        var other = await IntegrationInboxTests.Agent(w, "Unrelated");
        var id = await ApprovalApiTests.Propose(w, agent);
        using var bearer = IntegrationInboxTests.Bearer(w, agent);
        using var unrelated = IntegrationInboxTests.Bearer(w, other);
        var pending = await bearer.GetFromJsonAsync<JsonElement>("/api/integrations/drafts");
        Assert.Equal(JsonValueKind.Null, pending[0].GetProperty("resolvedAt").ValueKind);
        Assert.Equal(JsonValueKind.Null, pending[0].GetProperty("deliveredMessageId").ValueKind);
        var decision = await w.Client.PostAsJsonAsync($"/api/admin/approvals/{id}/decision", new { outcome = "approved", reason = "Private reviewer note", clientRequestId = Guid.NewGuid() });
        decision.EnsureSuccessStatusCode();
        var result = await decision.Content.ReadFromJsonAsync<JsonElement>();
        var replacement = await w.Client.PostAsJsonAsync($"/api/admin/agents/{agent.GetProperty("agent").GetProperty("id").GetGuid()}/tokens", new { label = "Replacement", expectedTokenId = agent.GetProperty("token").GetProperty("id").GetGuid() });
        replacement.EnsureSuccessStatusCode();
        var issued = await replacement.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(HttpStatusCode.Unauthorized, (await bearer.GetAsync("/api/integrations/drafts")).StatusCode);
        bearer.DefaultRequestHeaders.Authorization = new("Bearer", issued.GetProperty("rawToken").GetString());
        var listing = await bearer.GetStringAsync("/api/integrations/drafts");
        var terminal = JsonDocument.Parse(listing).RootElement[0];
        Assert.Equal("approved", terminal.GetProperty("state").GetString());
        Assert.Equal(result.GetProperty("resolvedAt").GetString(), terminal.GetProperty("resolvedAt").GetString());
        Assert.Equal(result.GetProperty("deliveredMessageId").GetGuid(), terminal.GetProperty("deliveredMessageId").GetGuid());
        var replay = await bearer.PostAsJsonAsync("/api/integrations/drafts", new { conversationId = "main", body = "Private proposal", clientRequestId = pending[0].GetProperty("clientRequestId").GetGuid() });
        replay.EnsureSuccessStatusCode();
        var replayMetadata = await replay.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(terminal.GetProperty("deliveredMessageId").GetGuid(), replayMetadata.GetProperty("deliveredMessageId").GetGuid());
        foreach (var forbidden in new[] { "reviewer", "reason", "Private", "body", "token" }) Assert.DoesNotContain(forbidden, listing, StringComparison.OrdinalIgnoreCase);
        Assert.Equal("[]", await unrelated.GetStringAsync("/api/integrations/drafts"));
        (await w.Client.PostAsJsonAsync($"/api/admin/integration-tokens/{issued.GetProperty("token").GetProperty("id").GetGuid()}/revoke", new { })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Unauthorized, (await bearer.GetAsync("/api/integrations/drafts")).StatusCode);
    }

    [Fact]
    public async Task Ordinary_lineage_is_minimal_and_pending_rejected_bodies_never_publish()
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        var agent = await IntegrationInboxTests.Agent(w);
        var approved = await ApprovalApiTests.Propose(w, agent, body: "Original hidden proposal");
        var rejected = await ApprovalApiTests.Propose(w, agent, body: "Rejected hidden proposal");
        await ApprovalApiTests.Propose(w, agent, body: "Pending hidden proposal");
        (await w.Client.PostAsJsonAsync($"/api/admin/approvals/{approved}/decision", new { outcome = "approved_with_edits", finalBody = "Released", reason = "Private reason", clientRequestId = Guid.NewGuid() })).EnsureSuccessStatusCode();
        (await w.Client.PostAsJsonAsync($"/api/admin/approvals/{rejected}/decision", new { outcome = "rejected", clientRequestId = Guid.NewGuid() })).EnsureSuccessStatusCode();
        foreach (var path in new[] { "/api/workspace/home", "/api/conversations/main/messages" })
        {
            var json = await w.Client.GetStringAsync(path);
            foreach (var hidden in new[] { "hidden proposal", "Private reason", "reviewer", "finalBody" }) Assert.DoesNotContain(hidden, json, StringComparison.OrdinalIgnoreCase);
            var root = JsonDocument.Parse(json).RootElement;
            var messages = root.ValueKind == JsonValueKind.Array ? root : root.GetProperty("messages");
            var released = Assert.Single(messages.EnumerateArray(), m => m.GetProperty("body").GetString() == "Released");
            Assert.True(released.GetProperty("approvedThroughReview").GetBoolean());
            Assert.True(released.GetProperty("editedBeforeRelease").GetBoolean());
            Assert.Equal(agent.GetProperty("agent").GetProperty("id").GetGuid(), released.GetProperty("authorId").GetGuid());
        }
    }
}
