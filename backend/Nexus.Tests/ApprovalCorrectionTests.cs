using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Nexus.Domain;
using Nexus.Infrastructure;
using Npgsql;

namespace Nexus.Tests;

public class ApprovalCorrectionTests
{
    [Theory]
    [InlineData("draft", "rejected", true)]
    [InlineData("draft", "rejected", false)]
    [InlineData("message", "rejected", true)]
    [InlineData("message", "rejected", false)]
    [InlineData("conversation", "rejected", true)]
    [InlineData("conversation", "rejected", false)]
    [InlineData("draft", "approved", true)]
    [InlineData("draft", "approved", false)]
    [InlineData("message", "approved", true)]
    [InlineData("conversation", "approved", true)]
    public async Task Agent_namespace_is_reserved_only_by_release(string operation, string outcome, bool agentFirst)
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        var agent = await IntegrationInboxTests.Agent(w);
        var aid = agent.GetProperty("agent").GetProperty("id").GetGuid();
        var id = await ApprovalApiTests.Propose(w, agent);
        var key = Guid.NewGuid();
        using var bearer = IntegrationInboxTests.Bearer(w, agent);
        async Task AgentOperation()
        {
            if (operation == "draft")
            {
                var response = await bearer.PostAsJsonAsync("/api/integrations/drafts", new { conversationId = "main", body = "Another proposal", clientRequestId = key });
                Assert.Equal(!agentFirst && outcome == "approved" ? HttpStatusCode.Conflict : HttpStatusCode.OK, response.StatusCode);
            }
            else
            {
                await using var db = new NexusDb(new DbContextOptionsBuilder<NexusDb>().UseNpgsql(w.Connection).Options);
                await using var tx = await db.Database.BeginTransactionAsync();
                var fence = aid.ToString("N") + key.ToString("N");
                await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({fence}, 0))");
                if (operation == "message") db.Messages.Add(Message.Deliver(aid, "Existing message", key));
                else
                {
                    var created = Conversation.CreateTopical(aid, "Agent topic", "", "Opening", key);
                    db.Conversations.Add(created.Conversation);
                    db.Messages.Add(created.OpeningMessage);
                }
                await db.SaveChangesAsync();
                await tx.CommitAsync();
            }
        }
        if (agentFirst) await AgentOperation();
        var payload = new { outcome, clientRequestId = key };
        var decision = await w.Client.PostAsJsonAsync($"/api/admin/approvals/{id}/decision", payload);
        Assert.Equal(agentFirst && outcome == "approved" ? HttpStatusCode.Conflict : HttpStatusCode.OK, decision.StatusCode);
        if (!agentFirst) await AgentOperation();
        if (decision.IsSuccessStatusCode)
        {
            var retry = await w.Client.PostAsJsonAsync($"/api/admin/approvals/{id}/decision", payload);
            Assert.Equal(await decision.Content.ReadAsStringAsync(), await retry.Content.ReadAsStringAsync());
        }
        await using var verify = new NexusDb(new DbContextOptionsBuilder<NexusDb>().UseNpgsql(w.Connection).Options);
        Assert.Equal(outcome == "approved" && !agentFirst ? 1 : 0, await verify.Messages.CountAsync(m => m.SourceDraftId == id));
    }

    [Theory]
    [InlineData(true, false)]
    [InlineData(false, false)]
    [InlineData(true, true)]
    [InlineData(false, true)]
    public async Task Rejection_still_reserves_reviewer_namespace(bool humanFirst, bool topic)
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        var id = await ApprovalApiTests.Propose(w, await IntegrationInboxTests.Agent(w));
        var key = Guid.NewGuid();
        Task<HttpResponseMessage> Human() => topic
            ? w.Client.PostAsJsonAsync("/api/conversations/topical", new { title = "Human topic", openingMessage = "Opening", clientRequestId = key })
            : w.Client.PostAsJsonAsync("/api/conversations/main/messages", new { body = "Human operation", clientRequestId = key });
        if (humanFirst) (await Human()).EnsureSuccessStatusCode();
        Assert.Equal(humanFirst ? HttpStatusCode.Conflict : HttpStatusCode.OK, (await w.Client.PostAsJsonAsync($"/api/admin/approvals/{id}/decision", new { outcome = "rejected", clientRequestId = key })).StatusCode);
        if (!humanFirst) Assert.Equal(HttpStatusCode.Conflict, (await Human()).StatusCode);
    }

    [Theory]
    [InlineData("rejected")]
    [InlineData("approved")]
    public async Task Only_release_waits_on_durable_agent_operation_fence(string outcome)
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        var agent = await IntegrationInboxTests.Agent(w);
        var id = await ApprovalApiTests.Propose(w, agent);
        var key = Guid.NewGuid();
        var fence = agent.GetProperty("agent").GetProperty("id").GetGuid().ToString("N") + key.ToString("N");
        await using var connection = new NpgsqlConnection(w.Connection);
        await connection.OpenAsync();
        await using var tx = await connection.BeginTransactionAsync();
        await using (var command = new NpgsqlCommand("SELECT pg_advisory_xact_lock(hashtextextended(@key, 0))", connection, tx))
        {
            command.Parameters.AddWithValue("key", fence);
            await command.ExecuteNonQueryAsync();
        }
        var request = w.Client.PostAsJsonAsync($"/api/admin/approvals/{id}/decision", new { outcome, clientRequestId = key });
        try
        {
            if (outcome == "rejected") Assert.Equal(HttpStatusCode.OK, (await request.WaitAsync(TimeSpan.FromSeconds(8))).StatusCode);
            else
            {
                // Observe a real blocked advisory lock, not elapsed time or a scheduling assumption.
                using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(8));
                await using var observer = new NpgsqlConnection(w.Connection);
                await observer.OpenAsync(timeout.Token);
                await using var waiting = new NpgsqlCommand("SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND NOT granted AND objid::bigint = (hashtextextended(@key, 0) & 4294967295) AND classid::bigint = ((hashtextextended(@key, 0) >> 32) & 4294967295))", observer);
                waiting.Parameters.AddWithValue("key", fence);
                while (!(bool)(await waiting.ExecuteScalarAsync(timeout.Token))!) await Task.Yield();
                Assert.False(request.IsCompleted);
            }
        }
        finally { await tx.RollbackAsync(); }
        Assert.Equal(HttpStatusCode.OK, (await request).StatusCode);
    }

    [Fact]
    public async Task Review_json_has_no_token_provenance()
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        var id = await ApprovalApiTests.Propose(w, await IntegrationInboxTests.Agent(w));
        foreach (var path in new[] { "/api/admin/approvals", $"/api/admin/approvals/{id}" })
        {
            var json = await w.Client.GetStringAsync(path);
            Assert.DoesNotContain("submittedTokenId", json, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("token", json, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task Integration_metadata_and_terminal_replay_are_not_cacheable_and_remain_bearer_only()
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        var agent = await IntegrationInboxTests.Agent(w);
        using var bearer = IntegrationInboxTests.Bearer(w, agent);
        var payload = new { conversationId = "main", body = "Proposal", clientRequestId = Guid.NewGuid() };
        var first = await bearer.PostAsJsonAsync("/api/integrations/drafts", payload);
        first.EnsureSuccessStatusCode();
        Assert.True(first.Headers.CacheControl?.NoStore);
        var id = (await first.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        (await w.Client.PostAsJsonAsync($"/api/admin/approvals/{id}/decision", new { outcome = "approved", clientRequestId = Guid.NewGuid() })).EnsureSuccessStatusCode();
        Assert.True((await bearer.PostAsJsonAsync("/api/integrations/drafts", payload)).Headers.CacheControl?.NoStore);
        Assert.True((await bearer.GetAsync("/api/integrations/drafts")).Headers.CacheControl?.NoStore);
        Assert.Equal(HttpStatusCode.Unauthorized, (await w.Client.GetAsync("/api/integrations/drafts")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await w.Client.PostAsJsonAsync("/api/integrations/drafts", payload)).StatusCode);
    }
}
