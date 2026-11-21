using System.Data.Common;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Npgsql;

namespace Nexus.Tests;

public class IntegrationRaceTests
{
    [Theory]
    [InlineData("me")]
    [InlineData("inbox")]
    [InlineData("drafts")]
    [InlineData("propose")]
    public async Task Revocation_wins_against_request_with_previously_resolved_token(string operation)
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        var created = await IntegrationInboxTests.Agent(w);
        var boundary = new PauseBeforeAgentFence();
        using var host = w.NewHost(boundary);
        using var client = host.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", created.GetProperty("rawToken").GetString());
        boundary.Armed = true;
        var request = operation == "propose"
            ? client.PostAsJsonAsync("/api/integrations/drafts", new { conversationId = "main", body = "Must not persist", clientRequestId = Guid.NewGuid() })
            : client.GetAsync("/api/integrations/" + operation);
        try
        {
            await boundary.Reached.Task.WaitAsync(TimeSpan.FromSeconds(15));
            (await w.Client.PostAsJsonAsync($"/api/admin/integration-tokens/{created.GetProperty("token").GetProperty("id").GetGuid()}/revoke", new { })).EnsureSuccessStatusCode();
        }
        finally { boundary.Release.TrySetResult(); }
        var response = await request;
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.DoesNotContain("Must not persist", await response.Content.ReadAsStringAsync());
        await using var db = new NpgsqlConnection(w.Connection);
        await db.OpenAsync();
        await using var check = new NpgsqlCommand("SELECT (SELECT count(*) FROM \"MessageDrafts\"), (SELECT \"LastUsedAt\" IS NULL FROM \"IntegrationTokens\")", db);
        await using var reader = await check.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        Assert.Equal(0, reader.GetInt64(0));
        Assert.True(reader.GetBoolean(1));
    }

    [Fact]
    public async Task Mixed_public_pair_token_message_and_draft_contention_converges()
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        var agent = await IntegrationInboxTests.Agent(w);
        using var integration = IntegrationInboxTests.Bearer(w, agent);
        using var registering = w.Host.CreateClient();
        await TestWorkspace.Csrf(registering);
        var pair = IntegrationInboxTests.Direct(w, agent.GetProperty("agent").GetProperty("id").GetGuid());
        var registration = registering.PostAsJsonAsync("/api/auth/register", new { email = "mixed@example.test", displayName = "Mixed", password = "Mixed-contention-test-password!8" });
        var topic = w.Client.PostAsJsonAsync("/api/conversations/topical", new { title = "Mixed", openingMessage = "Public", clientRequestId = Guid.NewGuid() });
        var creation = IntegrationInboxTests.Agent(w, "Concurrent agent");
        var send = IntegrationInboxTests.Send(w, "main", "Concurrent send");
        var draft = integration.PostAsJsonAsync("/api/integrations/drafts", new { conversationId = "main", body = "Pending under contention", clientRequestId = Guid.NewGuid() });
        var replace = w.Client.PostAsJsonAsync($"/api/admin/agents/{agent.GetProperty("agent").GetProperty("id").GetGuid()}/tokens", new { label = "New", expectedTokenId = agent.GetProperty("token").GetProperty("id").GetGuid() });
        await Task.WhenAll(pair, registration, topic, creation, send, draft, replace).WaitAsync(TimeSpan.FromSeconds(30));
        (await registration).EnsureSuccessStatusCode();
        (await topic).EnsureSuccessStatusCode();
        var replaced = await replace;
        replaced.EnsureSuccessStatusCode();
        Assert.Contains((await draft).StatusCode, new[] { HttpStatusCode.OK, HttpStatusCode.Unauthorized });
        var issued = await replaced.Content.ReadFromJsonAsync<JsonElement>();
        integration.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", issued.GetProperty("rawToken").GetString());
        (await integration.PostAsJsonAsync("/api/integrations/drafts", new { conversationId = await pair, body = "Pending after contention", clientRequestId = Guid.NewGuid() })).EnsureSuccessStatusCode();
        await using var db = new NpgsqlConnection(w.Connection);
        await db.OpenAsync();
        await using var check = new NpgsqlCommand("""
            SELECT count(*) FROM "Participants" p CROSS JOIN "Conversations" c
            WHERE p."State"='active' AND c."Kind" IN ('main','topical')
            AND NOT EXISTS (SELECT 1 FROM "Memberships" m WHERE m."ParticipantId"=p."Id" AND m."ConversationId"=c."Id")
            """, db);
        Assert.Equal(0L, await check.ExecuteScalarAsync());
    }

    private sealed class PauseBeforeAgentFence : DbCommandInterceptor
    {
        public bool Armed;
        public TaskCompletionSource Reached { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Release { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private int paused;
        public override async ValueTask<InterceptionResult<int>> NonQueryExecutingAsync(DbCommand command, CommandEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
        {
            if (Armed && command.CommandText.Contains("pg_advisory_xact_lock", StringComparison.Ordinal) && Interlocked.Exchange(ref paused, 1) == 0)
            {
                Reached.TrySetResult();
                await Release.Task.WaitAsync(cancellationToken);
            }
            return result;
        }
    }
}
