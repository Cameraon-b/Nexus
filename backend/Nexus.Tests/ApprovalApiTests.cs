using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Nexus.Infrastructure;

namespace Nexus.Tests;

public class ApprovalApiTests
{
    private static object Decision(Guid key, string outcome = "approved", string? finalBody = null, string? reason = null) => new { clientRequestId = key, outcome, finalBody, reason };
    private static string Route(Guid id) => $"/api/admin/approvals/{id}/decision";
    internal static async Task<Guid> Propose(TestWorkspace w, JsonElement agent, string conversation = "main", string body = "Private proposal")
    {
        using var bearer = IntegrationInboxTests.Bearer(w, agent);
        var response = await bearer.PostAsJsonAsync("/api/integrations/drafts", new { conversationId = conversation, body, clientRequestId = Guid.NewGuid() });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
    }
    private static NexusDb Db(TestWorkspace w) => new(new DbContextOptionsBuilder<NexusDb>().UseNpgsql(w.Connection).Options);

    [Fact]
    public async Task Exact_retry_changed_payload_terminal_conflict_and_one_agent_lineage()
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        var agent = await IntegrationInboxTests.Agent(w);
        var id = await Propose(w, agent);
        var key = Guid.NewGuid();
        var payload = Decision(key, "approved_with_edits", "Released wording", "Private review note");
        var first = await w.Client.PostAsJsonAsync(Route(id), payload);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        var json = await first.Content.ReadAsStringAsync();
        var retry = await w.Client.PostAsJsonAsync(Route(id), payload);
        Assert.Equal(HttpStatusCode.OK, retry.StatusCode);
        Assert.Equal(json, await retry.Content.ReadAsStringAsync());
        foreach (var changed in new[] { Decision(key, "approved_with_edits", "Different"), Decision(Guid.NewGuid(), "rejected"), Decision(key, "rejected") })
            Assert.Equal(HttpStatusCode.Conflict, (await w.Client.PostAsJsonAsync(Route(id), changed)).StatusCode);
        await using var db = Db(w);
        var message = Assert.Single(await db.Messages.Where(m => m.SourceDraftId == id).ToArrayAsync());
        Assert.Equal(agent.GetProperty("agent").GetProperty("id").GetGuid(), message.AuthorId);
        Assert.True(message.EditedBeforeRelease);
        Assert.Equal("Private proposal", (await db.MessageDrafts.SingleAsync(d => d.Id == id)).Body);
        Assert.Single(await db.ApprovalDecisions.Where(d => d.DraftId == id).ToArrayAsync());
        foreach (var path in new[] { "/api/workspace/home", "/api/conversations/main/messages" })
        {
            var ordinary = await w.Client.GetStringAsync(path);
            Assert.DoesNotContain("Private proposal", ordinary);
            Assert.DoesNotContain("Private review note", ordinary);
        }
    }

    [Theory]
    [InlineData("approved")]
    [InlineData("rejected")]
    public async Task Concurrent_decisions_converge_without_duplicate_publication(string other)
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        var id = await Propose(w, await IntegrationInboxTests.Agent(w));
        // A simultaneous start gate, not a timing sleep; each request gets a separate DbContext.
        var gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        async Task<HttpResponseMessage> Send(string outcome) { await gate.Task; return await w.Client.PostAsJsonAsync(Route(id), Decision(Guid.NewGuid(), outcome)); }
        var a = Send("approved"); var b = Send(other); gate.SetResult();
        var results = await Task.WhenAll(a, b);
        Assert.Single(results, r => r.StatusCode == HttpStatusCode.OK);
        Assert.Single(results, r => r.StatusCode == HttpStatusCode.Conflict);
        await using var db = Db(w);
        var decision = await db.ApprovalDecisions.SingleAsync(d => d.DraftId == id);
        Assert.Equal(decision.Outcome == "rejected" ? 0 : 1, await db.Messages.CountAsync(m => m.SourceDraftId == id));
    }

    [Theory]
    [InlineData("reviewer")]
    [InlineData("agent")]
    [InlineData("conversation")]
    [InlineData("access")]
    [InlineData("validation")]
    public async Task Current_state_or_validation_failure_rolls_back_every_mutation(string change)
    {
        await using var w = await TestWorkspace.Create();
        var admin = await w.Bootstrap();
        var agent = await IntegrationInboxTests.Agent(w);
        var aid = agent.GetProperty("agent").GetProperty("id").GetGuid();
        var id = await Propose(w, agent);
        await using (var db = Db(w))
        {
            if (change == "reviewer") await db.Accounts.Where(a => a.Id == admin.GetProperty("id").GetGuid()).ExecuteUpdateAsync(s => s.SetProperty(a => a.IsAdmin, false));
            if (change == "agent") await db.Participants.Where(p => p.Id == aid).ExecuteUpdateAsync(s => s.SetProperty(p => p.State, "inactive"));
            if (change == "conversation")
            {
                // Current schema only permits active conversations. Simulate a future or
                // out-of-band archived state in this disposable database only.
                await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"Conversations\" DROP CONSTRAINT \"CK_Conversations_State\"");
                await db.Conversations.Where(c => c.Id == "main").ExecuteUpdateAsync(s => s.SetProperty(c => c.State, "inactive"));
            }
            if (change == "access") await db.Memberships.Where(m => m.ParticipantId == aid && m.ConversationId == "main").ExecuteDeleteAsync();
        }
        var response = await w.Client.PostAsJsonAsync(Route(id), Decision(Guid.NewGuid(), change == "validation" ? "approved_with_edits" : "approved", change == "validation" ? " " : null));
        Assert.Equal(change == "reviewer" ? HttpStatusCode.Forbidden : change == "validation" ? HttpStatusCode.BadRequest : HttpStatusCode.Conflict, response.StatusCode);
        await using (var db = Db(w))
        {
            Assert.Equal("pending", (await db.MessageDrafts.SingleAsync(d => d.Id == id)).State);
            Assert.False(await db.ApprovalDecisions.AnyAsync(d => d.DraftId == id));
            Assert.False(await db.Messages.AnyAsync(m => m.SourceDraftId == id));
        }
        if (change is "agent" or "conversation" or "access")
            Assert.Equal(HttpStatusCode.OK, (await w.Client.PostAsJsonAsync(Route(id), Decision(Guid.NewGuid(), "rejected"))).StatusCode);
    }

    [Fact]
    public async Task Persistence_failure_after_release_insertion_rolls_back_and_returns_safe_problem()
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        var id = await Propose(w, await IntegrationInboxTests.Agent(w));
        await using (var db = Db(w))
            await db.Database.ExecuteSqlRawAsync("""
                CREATE FUNCTION fail_test_decision() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN RAISE EXCEPTION 'Test-only persistence fault' USING ERRCODE = '23514'; END $$;
                CREATE TRIGGER fail_test_decision BEFORE INSERT ON "ApprovalDecisions"
                    FOR EACH ROW EXECUTE FUNCTION fail_test_decision();
                """);
        var response = await w.Client.PostAsJsonAsync(Route(id), Decision(Guid.NewGuid()));
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        var problem = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("Test-only persistence fault", problem);
        Assert.DoesNotContain("Private proposal", problem);
        await using var verify = Db(w);
        Assert.Equal("pending", (await verify.MessageDrafts.SingleAsync(d => d.Id == id)).State);
        Assert.False(await verify.ApprovalDecisions.AnyAsync());
        Assert.False(await verify.Messages.AnyAsync(m => m.SourceDraftId == id));
    }

    [Fact]
    public async Task Reviewer_request_namespace_rejects_other_operations_and_drafts()
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        var agent = await IntegrationInboxTests.Agent(w);
        var first = await Propose(w, agent);
        var second = await Propose(w, agent);
        var key = Guid.NewGuid();
        (await w.Client.PostAsJsonAsync("/api/conversations/main/messages", new { body = "Human", clientRequestId = key })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Conflict, (await w.Client.PostAsJsonAsync(Route(first), Decision(key))).StatusCode);
        key = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.OK, (await w.Client.PostAsJsonAsync(Route(first), Decision(key))).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await w.Client.PostAsJsonAsync(Route(second), Decision(key))).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await w.Client.PostAsJsonAsync("/api/conversations/main/messages", new { body = "Reuse", clientRequestId = key })).StatusCode);
    }
}
