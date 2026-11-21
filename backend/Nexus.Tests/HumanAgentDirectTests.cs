using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Npgsql;

namespace Nexus.Tests;

public class HumanAgentDirectTests
{
    [Theory]
    [InlineData("agent", "active")]
    [InlineData("human", "inactive")]
    [InlineData("service", "active")]
    public async Task Ineligible_cookie_caller_cannot_use_human_workspace_routes(string kind, string state)
    {
        await using var w = await TestWorkspace.Create();
        var human = await w.Bootstrap();
        var agent = await IntegrationInboxTests.Agent(w);
        await using var db = new NpgsqlConnection(w.Connection);
        await db.OpenAsync();
        await using var corrupt = new NpgsqlCommand("UPDATE \"Participants\" SET \"Kind\"=@kind,\"State\"=@state WHERE \"Id\"=@id", db);
        corrupt.Parameters.AddWithValue("kind", kind);
        corrupt.Parameters.AddWithValue("state", state);
        corrupt.Parameters.AddWithValue("id", human.GetProperty("participantId").GetGuid());
        await corrupt.ExecuteNonQueryAsync();
        foreach (var response in new[] {
            await w.Client.GetAsync("/api/workspace/home"),
            await w.Client.GetAsync("/api/conversations/main/messages"),
            await w.Client.PostAsJsonAsync("/api/conversations/main/messages", new { body = "No", clientRequestId = Guid.NewGuid() }),
            await w.Client.PostAsJsonAsync("/api/conversations/topical", new { title = "No", openingMessage = "No", clientRequestId = Guid.NewGuid() }),
            await w.Client.PostAsJsonAsync("/api/conversations/direct", new { participantId = agent.GetProperty("agent").GetProperty("id").GetGuid() }) })
            Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        using var signingIn = w.Host.CreateClient();
        await TestWorkspace.Csrf(signingIn);
        Assert.Equal(HttpStatusCode.Unauthorized, (await signingIn.PostAsJsonAsync("/api/auth/login", TestWorkspace.Credentials)).StatusCode);
    }

    [Fact]
    public async Task Malformed_legacy_pair_never_authorizes_home_history_or_post()
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        var agent = await IntegrationInboxTests.Agent(w);
        var aid = agent.GetProperty("agent").GetProperty("id").GetGuid();
        var id = await IntegrationInboxTests.Direct(w, aid);
        await IntegrationInboxTests.Send(w, id, "Private malformed pair");
        await using var db = new NpgsqlConnection(w.Connection);
        await db.OpenAsync();
        await using var corrupt = new NpgsqlCommand("""
            ALTER TABLE "Participants" DISABLE TRIGGER direct_participant_authorization;
            UPDATE "Participants" SET "State" = 'inactive' WHERE "Id" = @id;
            SET CONSTRAINTS ALL IMMEDIATE;
            ALTER TABLE "Participants" ENABLE TRIGGER direct_participant_authorization;
            """, db);
        corrupt.Parameters.AddWithValue("id", aid);
        await corrupt.ExecuteNonQueryAsync();
        var home = await w.Client.GetFromJsonAsync<JsonElement>("/api/workspace/home");
        Assert.DoesNotContain(home.GetProperty("conversations").EnumerateArray(), c => c.GetProperty("id").GetString() == id);
        Assert.Equal(HttpStatusCode.Forbidden, (await w.Client.GetAsync($"/api/conversations/{id}/messages")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await w.Client.PostAsJsonAsync($"/api/conversations/{id}/messages", new { body = "No", clientRequestId = Guid.NewGuid() })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await w.Client.PostAsJsonAsync("/api/conversations/direct", new { participantId = aid })).StatusCode);
    }

    [Fact]
    public async Task Unknown_availability_agent_pair_converges_and_human_messages_persist()
    {
        await using var w = await TestWorkspace.Create();
        var human = await w.Bootstrap();
        var created = await w.Client.PostAsJsonAsync("/api/admin/agents", new { displayName = "Helper", tokenLabel = "Test" });
        created.EnsureSuccessStatusCode();
        var agent = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("agent");
        var aid = agent.GetProperty("id").GetGuid();
        Assert.Equal("unknown", agent.GetProperty("availability").GetString());
        var responses = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => w.Client.PostAsJsonAsync("/api/conversations/direct", new { participantId = aid })));
        foreach (var response in responses) Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var pairs = await Task.WhenAll(responses.Select(r => r.Content.ReadFromJsonAsync<JsonElement>()));
        var id = pairs[0].GetProperty("id").GetString();
        foreach (var pair in pairs)
        {
            Assert.Equal(id, pair.GetProperty("id").GetString());
            Assert.Equal(new[] { aid, human.GetProperty("participantId").GetGuid() }.Order(), pair.GetProperty("participantIds").EnumerateArray().Select(p => p.GetGuid()).Order());
        }
        var path = $"/api/conversations/{id}/messages";
        (await w.Client.PostAsJsonAsync(path, new { body = "Queued for unknown agent", clientRequestId = Guid.NewGuid() })).EnsureSuccessStatusCode();
        Assert.Contains("Queued for unknown agent", await w.Client.GetStringAsync(path));
        var home = await w.Client.GetFromJsonAsync<JsonElement>("/api/workspace/home");
        Assert.Contains(home.GetProperty("conversations").EnumerateArray(), c => c.GetProperty("id").GetString() == id);
        await using var db = new NpgsqlConnection(w.Connection);
        await db.OpenAsync();
        foreach (var change in new[] { "\"Kind\" = 'service'", "\"State\" = 'inactive'", "\"Kind\" = 'agent'" })
        {
            // Changing the human to agent must not turn this into an agent-agent pair.
            await using var cmd = new NpgsqlCommand($"UPDATE \"Participants\" SET {change} WHERE \"Id\" = @id", db);
            cmd.Parameters.AddWithValue("id", change == "\"Kind\" = 'agent'" ? human.GetProperty("participantId").GetGuid() : aid);
            var error = await Assert.ThrowsAsync<PostgresException>(() => cmd.ExecuteNonQueryAsync());
            Assert.Equal("23514", error.SqlState);
        }
    }
}
