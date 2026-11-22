using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Nexus.Infrastructure;

namespace Nexus.Tests;

public class ApprovalContextTests
{
    [Fact]
    public async Task Cookie_admin_only_csrf_safe_problems_and_no_private_membership_broadening()
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        var agent = await IntegrationInboxTests.Agent(w);
        using var ordinary = w.Host.CreateClient();
        await TestWorkspace.Csrf(ordinary);
        var registration = await ordinary.PostAsJsonAsync("/api/auth/register", new { email = "member@example.test", displayName = "Member", password = "Test-only-long-passphrase!8" });
        registration.EnsureSuccessStatusCode();
        await TestWorkspace.Csrf(ordinary);
        var direct = await ordinary.PostAsJsonAsync("/api/conversations/direct", new { participantId = agent.GetProperty("agent").GetProperty("id").GetGuid() });
        direct.EnsureSuccessStatusCode();
        var cid = (await direct.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetString()!;
        var source = await ordinary.PostAsJsonAsync($"/api/conversations/{cid}/messages", new { body = "Narrow source context", clientRequestId = Guid.NewGuid() });
        source.EnsureSuccessStatusCode();
        var id = await ApprovalApiTests.Propose(w, agent, cid);
        var paths = new[] { "/api/admin/approvals", $"/api/admin/approvals/{id}" };
        using var anonymous = w.Host.CreateClient();
        using var bearer = IntegrationInboxTests.Bearer(w, agent);
        foreach (var path in paths)
        {
            foreach (var (client, status) in new[] { (anonymous, HttpStatusCode.Unauthorized), (ordinary, HttpStatusCode.Forbidden), (bearer, HttpStatusCode.Unauthorized) })
            {
                var denied = await client.GetAsync(path);
                Assert.Equal(status, denied.StatusCode);
                Assert.Equal("application/problem+json", denied.Content.Headers.ContentType?.MediaType);
                var problem = await denied.Content.ReadAsStringAsync();
                Assert.DoesNotContain("Private proposal", problem);
                Assert.DoesNotContain("Npgsql", problem);
            }
        }
        Assert.Equal(HttpStatusCode.BadRequest, (await anonymous.PostAsJsonAsync($"/api/admin/approvals/{id}/decision", new { outcome = "rejected", clientRequestId = Guid.NewGuid() })).StatusCode);
        await TestWorkspace.Csrf(anonymous);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PostAsJsonAsync($"/api/admin/approvals/{id}/decision", new { outcome = "rejected", clientRequestId = Guid.NewGuid() })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await ordinary.PostAsJsonAsync($"/api/admin/approvals/{id}/decision", new { outcome = "rejected", clientRequestId = Guid.NewGuid() })).StatusCode);
        var detailResponse = await w.Client.GetAsync(paths[1]);
        Assert.Equal(HttpStatusCode.OK, detailResponse.StatusCode);
        Assert.Equal("no-store", detailResponse.Headers.CacheControl?.ToString());
        var detail = await detailResponse.Content.ReadAsStringAsync();
        Assert.Contains("Private proposal", detail);
        Assert.Contains("Narrow source context", detail);
        Assert.DoesNotContain("tokenHash", detail);
        Assert.DoesNotContain(cid, await w.Client.GetStringAsync("/api/workspace/home"));
        Assert.Equal(HttpStatusCode.Forbidden, (await w.Client.GetAsync($"/api/conversations/{cid}/messages")).StatusCode);
        // A formerly eligible cookie is not sufficient after participant deactivation.
        await using var db = new NexusDb(new DbContextOptionsBuilder<NexusDb>().UseNpgsql(w.Connection).Options);
        var adminId = (await db.Accounts.SingleAsync(a => a.IsAdmin)).ParticipantId;
        await db.Participants.Where(p => p.Id == adminId).ExecuteUpdateAsync(s => s.SetProperty(p => p.State, "inactive"));
        foreach (var path in paths) Assert.Equal(HttpStatusCode.Forbidden, (await w.Client.GetAsync(path)).StatusCode);
    }

    [Fact]
    public async Task Queue_history_are_bounded_deterministic_and_have_terminal_detail()
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        var agent = await IntegrationInboxTests.Agent(w);
        var ids = new[] { await ApprovalApiTests.Propose(w, agent), await ApprovalApiTests.Propose(w, agent), await ApprovalApiTests.Propose(w, agent) };
        var first = await w.Client.GetFromJsonAsync<JsonElement>("/api/admin/approvals?limit=2");
        Assert.Equal(3, first.GetProperty("pendingCount").GetInt32());
        Assert.Equal(2, first.GetProperty("items").GetArrayLength());
        var cursor = first.GetProperty("nextCursor").GetString();
        Assert.NotNull(cursor);
        var second = await w.Client.GetFromJsonAsync<JsonElement>($"/api/admin/approvals?limit=2&after={cursor}");
        Assert.Single(second.GetProperty("items").EnumerateArray());
        Assert.Equal(ids.Order(), first.GetProperty("items").EnumerateArray().Concat(second.GetProperty("items").EnumerateArray()).Select(i => i.GetProperty("draft").GetProperty("id").GetGuid()).Order());
        foreach (var query in new[] { "limit=0", "limit=101", "status=unknown", "after=bad" })
            Assert.Equal(HttpStatusCode.BadRequest, (await w.Client.GetAsync($"/api/admin/approvals?{query}")).StatusCode);
        (await w.Client.PostAsJsonAsync($"/api/admin/approvals/{ids[0]}/decision", new { outcome = "rejected", reason = "Private reason", clientRequestId = Guid.NewGuid() })).EnsureSuccessStatusCode();
        var history = await w.Client.GetFromJsonAsync<JsonElement>("/api/admin/approvals?status=resolved");
        Assert.Single(history.GetProperty("items").EnumerateArray());
        var detail = await w.Client.GetStringAsync($"/api/admin/approvals/{ids[0]}");
        Assert.Contains("Private reason", detail);
        Assert.Contains("reviewer", detail);
        Assert.DoesNotContain("Private proposal", await w.Client.GetStringAsync("/api/conversations/main/messages"));
    }
}
