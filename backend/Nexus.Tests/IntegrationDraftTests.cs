using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Npgsql;
using Microsoft.EntityFrameworkCore;

namespace Nexus.Tests;

public class IntegrationDraftTests
{
    [Fact]
    public async Task Pending_draft_is_retry_safe_server_derived_private_and_agent_namespaced()
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        var agent = await IntegrationInboxTests.Agent(w);
        var other = await IntegrationInboxTests.Agent(w, "Other");
        using var integration = IntegrationInboxTests.Bearer(w, agent);
        using var second = IntegrationInboxTests.Bearer(w, other);
        var aid = agent.GetProperty("agent").GetProperty("id").GetGuid();
        var own = await IntegrationInboxTests.Direct(w, aid);
        var source = await IntegrationInboxTests.Send(w, own, "Human input");
        var requestId = Guid.NewGuid();
        var payload = new { conversationId = own, body = "  Pending private proposal  ", clientRequestId = requestId, sourceMessageId = source.GetProperty("id").GetGuid(), authorId = Guid.NewGuid(), state = "delivered", submittedTokenId = Guid.NewGuid() };
        var responses = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => integration.PostAsJsonAsync("/api/integrations/drafts", payload)));
        foreach (var r in responses) Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        var results = await Task.WhenAll(responses.Select(r => r.Content.ReadFromJsonAsync<JsonElement>()));
        Assert.Single(results.Select(r => r.GetProperty("id").GetGuid()).Distinct());
        Assert.All(results, r => { Assert.Equal("pending", r.GetProperty("state").GetString()); Assert.DoesNotContain("body", r.ToString()); });
        Assert.Equal(HttpStatusCode.Conflict, (await integration.PostAsJsonAsync("/api/integrations/drafts", new { conversationId = own, body = "Changed", clientRequestId = requestId })).StatusCode);
        // The same semantic request remains the same draft after token replacement.
        var replacement = await w.Client.PostAsJsonAsync($"/api/admin/agents/{aid}/tokens", new { label = "Replacement", expectedTokenId = agent.GetProperty("token").GetProperty("id").GetGuid() });
        replacement.EnsureSuccessStatusCode();
        var issued = await replacement.Content.ReadFromJsonAsync<JsonElement>();
        integration.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", issued.GetProperty("rawToken").GetString());
        var retry = await integration.PostAsJsonAsync("/api/integrations/drafts", new { conversationId = own, body = "Pending private proposal", clientRequestId = requestId, payload.sourceMessageId });
        retry.EnsureSuccessStatusCode();
        Assert.Equal(results[0].GetProperty("id").GetGuid(), (await retry.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid());
        Assert.Equal(HttpStatusCode.OK, (await second.PostAsJsonAsync("/api/integrations/drafts", new { conversationId = "main", body = "Other proposal", clientRequestId = requestId })).StatusCode);
        Assert.DoesNotContain("proposal", await integration.GetStringAsync("/api/integrations/inbox"));
        var listing = await integration.GetStringAsync("/api/integrations/drafts");
        Assert.DoesNotContain("proposal", listing);
        Assert.DoesNotContain("token", listing, StringComparison.OrdinalIgnoreCase);
        Assert.Single(JsonDocument.Parse(listing).RootElement.EnumerateArray());
        foreach (var path in new[] { "/api/workspace/home", $"/api/conversations/{own}/messages" })
            Assert.DoesNotContain("proposal", await w.Client.GetStringAsync(path));
        var admins = await w.Client.GetFromJsonAsync<JsonElement>("/api/admin/agents");
        Assert.Equal(1, admins.EnumerateArray().Single(a => a.GetProperty("agent").GetProperty("id").GetGuid() == aid).GetProperty("pendingCount").GetInt32());
        Assert.DoesNotContain("proposal", admins.ToString());
        await using var db = new NpgsqlConnection(w.Connection);
        await db.OpenAsync();
        await using var command = new NpgsqlCommand("SELECT \"AuthorId\",\"SubmittedTokenId\",\"State\",\"Body\",(SELECT count(*) FROM \"Messages\" WHERE \"AuthorId\" = @agent) FROM \"MessageDrafts\" WHERE \"AuthorId\" = @agent", db);
        command.Parameters.AddWithValue("agent", aid);
        await using var reader = await command.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        Assert.Equal(aid, reader.GetGuid(0));
        Assert.Equal(agent.GetProperty("token").GetProperty("id").GetGuid(), reader.GetGuid(1));
        Assert.Equal("pending", reader.GetString(2));
        Assert.Equal("Pending private proposal", reader.GetString(3));
        Assert.Equal(0, reader.GetInt64(4));
        Assert.Equal(HttpStatusCode.Unauthorized, (await w.Client.PostAsJsonAsync("/api/integrations/drafts", payload)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await integration.PostAsJsonAsync("/api/admin/agents", new { displayName = "No", tokenLabel = "No" })).StatusCode);
        (await w.Client.PostAsJsonAsync($"/api/admin/integration-tokens/{issued.GetProperty("token").GetProperty("id").GetGuid()}/revoke", new { })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Unauthorized, (await integration.GetAsync("/api/integrations/drafts")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await integration.PostAsJsonAsync("/api/integrations/drafts", payload)).StatusCode);
    }

    [Fact]
    public async Task Draft_UUID_cannot_be_reused_by_message_or_topic_store_operations()
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        var agent = await IntegrationInboxTests.Agent(w);
        var aid = agent.GetProperty("agent").GetProperty("id").GetGuid();
        using var integration = IntegrationInboxTests.Bearer(w, agent);
        var requestId = Guid.NewGuid();
        (await integration.PostAsJsonAsync("/api/integrations/drafts", new { conversationId = "main", body = "Pending", clientRequestId = requestId })).EnsureSuccessStatusCode();
        await using var db = new Nexus.Infrastructure.NexusDb(new Microsoft.EntityFrameworkCore.DbContextOptionsBuilder<Nexus.Infrastructure.NexusDb>().UseNpgsql(w.Connection).Options);
        var store = new Nexus.Infrastructure.WorkspaceStore(db);
        var message = await Assert.ThrowsAsync<Nexus.Domain.RuleViolation>(() => store.Post("main", aid, new("No publication", requestId)));
        Assert.Equal(409, message.Status);
        var topic = await Assert.ThrowsAsync<Nexus.Domain.RuleViolation>(() => store.CreateTopical(aid, new("No topic", "", "No publication", requestId)));
        Assert.Equal(409, topic.Status);
    }

    [Fact]
    public async Task Draft_validation_visibility_sources_and_cross_operation_conflicts_fail_closed()
    {
        await using var w = await TestWorkspace.Create();
        var admin = await w.Bootstrap();
        var agent = await IntegrationInboxTests.Agent(w);
        var other = await IntegrationInboxTests.Agent(w, "Other");
        using var integration = IntegrationInboxTests.Bearer(w, agent);
        var own = await IntegrationInboxTests.Direct(w, agent.GetProperty("agent").GetProperty("id").GetGuid());
        var unrelated = await IntegrationInboxTests.Direct(w, other.GetProperty("agent").GetProperty("id").GetGuid());
        var source = await IntegrationInboxTests.Send(w, "main", "Source");
        foreach (var body in new[] { "", " ", new string('x', 5001) })
            Assert.Equal(HttpStatusCode.BadRequest, (await integration.PostAsJsonAsync("/api/integrations/drafts", new { conversationId = own, body, clientRequestId = Guid.NewGuid() })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await integration.PostAsJsonAsync("/api/integrations/drafts", new { conversationId = own, body = "Reply", clientRequestId = Guid.Empty })).StatusCode);
        foreach (var id in new[] { source.GetProperty("id").GetGuid(), Guid.NewGuid() })
            Assert.Equal(HttpStatusCode.BadRequest, (await integration.PostAsJsonAsync("/api/integrations/drafts", new { conversationId = own, body = "Reply", clientRequestId = Guid.NewGuid(), sourceMessageId = id })).StatusCode);
        foreach (var conversationId in new[] { unrelated, "unknown" })
            Assert.Equal(HttpStatusCode.Forbidden, (await integration.PostAsJsonAsync("/api/integrations/drafts", new { conversationId, body = "Reply", clientRequestId = Guid.NewGuid() })).StatusCode);
        // Exercise legacy cross-operation namespaces without enabling agent publication endpoints.
        var messageId = Guid.NewGuid();
        var topicId = Guid.NewGuid();
        await using var db = new NpgsqlConnection(w.Connection);
        await db.OpenAsync();
        await using (var seed = new NpgsqlCommand("""
            INSERT INTO "Messages" ("Id","ConversationId","AuthorId","Body","State","CreatedAt","ClientRequestId") VALUES (@id,'main',@agent,'Legacy','delivered',now(),@request);
            INSERT INTO "Conversations" ("Id","Title","Kind","State","Description","CreatedAt","CreatedByParticipantId","ClientRequestId") VALUES ('legacy-topic','Legacy','topical','active','',now(),@agent,@topic);
            """, db))
        {
            seed.Parameters.AddWithValue("id", Guid.NewGuid());
            seed.Parameters.AddWithValue("agent", agent.GetProperty("agent").GetProperty("id").GetGuid());
            seed.Parameters.AddWithValue("request", messageId);
            seed.Parameters.AddWithValue("topic", topicId);
            await seed.ExecuteNonQueryAsync();
        }
        foreach (var clientRequestId in new[] { messageId, topicId })
            Assert.Equal(HttpStatusCode.Conflict, (await integration.PostAsJsonAsync("/api/integrations/drafts", new { conversationId = own, body = "Reply", clientRequestId })).StatusCode);
    }
}
