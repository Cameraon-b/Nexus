using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Nexus.Infrastructure;

namespace Nexus.Tests;

public class IntegrationTokenTests
{
    private static async Task<JsonElement> Create(TestWorkspace w)
    {
        var response = await w.Client.PostAsJsonAsync("/api/admin/agents", new { displayName = "Connector", tokenLabel = "Initial" });
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }

    [Fact]
    public async Task Bearer_activity_is_separate_updates_availability_and_revocation_is_immediate()
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        var creation = await Create(w);
        var id = creation.GetProperty("agent").GetProperty("id").GetGuid();
        var tokenId = creation.GetProperty("token").GetProperty("id").GetGuid();
        using var connector = w.Host.CreateClient();
        connector.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", creation.GetProperty("rawToken").GetString());
        var me = await connector.GetAsync("/api/integrations/me");
        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
        var body = await me.Content.ReadAsStringAsync();
        Assert.DoesNotContain("token", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("hash", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("email", body, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(id, (await me.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid());
        Assert.Equal(HttpStatusCode.Unauthorized, (await connector.GetAsync("/api/workspace/home")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await connector.GetAsync("/api/admin/agents")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await w.Client.GetAsync("/api/integrations/me")).StatusCode);
        await using var db = new NexusDb(new DbContextOptionsBuilder<NexusDb>().UseNpgsql(w.Connection).Options);
        Assert.Equal("available", (await db.Participants.AsNoTracking().SingleAsync(p => p.Id == id)).Availability);
        var lastUsed = (await db.IntegrationTokens.AsNoTracking().SingleAsync(t => t.Id == tokenId)).LastUsedAt;
        Assert.NotNull(lastUsed);
        var revoke = await w.Client.PostAsJsonAsync($"/api/admin/integration-tokens/{tokenId}/revoke", new { });
        Assert.Equal(HttpStatusCode.NoContent, revoke.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await w.Client.PostAsJsonAsync($"/api/admin/integration-tokens/{tokenId}/revoke", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await connector.GetAsync("/api/integrations/me")).StatusCode);
        var stored = await db.IntegrationTokens.AsNoTracking().SingleAsync(t => t.Id == tokenId);
        Assert.Equal("revoked", stored.State);
        Assert.NotNull(stored.RevokedAt);
        Assert.Equal(lastUsed, stored.LastUsedAt);
    }

    [Fact]
    public async Task Replacement_is_compare_and_swap_race_safe_and_does_not_reveal_old_token()
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        var creation = await Create(w);
        var id = creation.GetProperty("agent").GetProperty("id").GetGuid();
        var old = creation.GetProperty("token").GetProperty("id").GetGuid();
        var responses = await Task.WhenAll(Enumerable.Range(0, 6).Select(_ => w.Client.PostAsJsonAsync($"/api/admin/agents/{id}/tokens", new { label = "Replacement", expectedTokenId = old })));
        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.OK);
        Assert.Equal(5, responses.Count(r => r.StatusCode == HttpStatusCode.Conflict));
        var replacement = await responses.Single(r => r.IsSuccessStatusCode).Content.ReadFromJsonAsync<JsonElement>();
        var raw = replacement.GetProperty("rawToken").GetString();
        Assert.NotEqual(creation.GetProperty("rawToken").GetString(), raw);
        using var connector = w.Host.CreateClient();
        connector.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", raw);
        Assert.Equal(HttpStatusCode.OK, (await connector.GetAsync("/api/integrations/me")).StatusCode);
        connector.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", creation.GetProperty("rawToken").GetString());
        Assert.Equal(HttpStatusCode.Unauthorized, (await connector.GetAsync("/api/integrations/me")).StatusCode);
        await using var db = new NexusDb(new DbContextOptionsBuilder<NexusDb>().UseNpgsql(w.Connection).Options);
        Assert.Equal(1, await db.IntegrationTokens.CountAsync(t => t.ParticipantId == id && t.State == "active"));
        Assert.Equal(1, await db.IntegrationTokens.CountAsync(t => t.ParticipantId == id && t.State == "revoked"));
    }

    [Theory]
    [InlineData("query")]
    [InlineData("unknown")]
    [InlineData("malformed")]
    [InlineData("inactive")]
    [InlineData("suspended")]
    [InlineData("blocked")]
    public async Task Invalid_integration_authentication_fails_closed_without_last_used(string scenario)
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        var creation = await Create(w);
        var id = creation.GetProperty("agent").GetProperty("id").GetGuid();
        var raw = creation.GetProperty("rawToken").GetString()!;
        await using var db = new NexusDb(new DbContextOptionsBuilder<NexusDb>().UseNpgsql(w.Connection).Options);
        if (scenario is "inactive" or "suspended" or "blocked")
            await db.Participants.Where(p => p.Id == id).ExecuteUpdateAsync(s => s.SetProperty(p => p.State, scenario));
        using var connector = w.Host.CreateClient();
        if (scenario != "query") connector.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", scenario == "unknown" ? "nexus_int_" + new string('a', 64) : scenario == "malformed" ? "oops" : raw);
        var response = await connector.GetAsync("/api/integrations/me" + (scenario == "query" ? "?token=" + raw : ""));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.DoesNotContain(raw, await response.Content.ReadAsStringAsync());
        Assert.Null((await db.IntegrationTokens.SingleAsync(t => t.ParticipantId == id)).LastUsedAt);
    }

    [Fact]
    public async Task One_time_token_responses_are_not_cacheable()
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        var response = await w.Client.PostAsJsonAsync("/api/admin/agents", new { displayName = "Helper", tokenLabel = "Initial" });
        response.EnsureSuccessStatusCode();
        Assert.True(response.Headers.CacheControl?.NoStore);
        var creation = await response.Content.ReadFromJsonAsync<JsonElement>();
        var id = creation.GetProperty("agent").GetProperty("id").GetGuid();
        var tokenId = creation.GetProperty("token").GetProperty("id").GetGuid();
        var replaced = await w.Client.PostAsJsonAsync($"/api/admin/agents/{id}/tokens", new { label = "New", expectedTokenId = tokenId });
        replaced.EnsureSuccessStatusCode();
        Assert.True(replaced.Headers.CacheControl?.NoStore);
    }

    [Fact]
    public async Task Revoke_and_replace_require_admin_and_csrf()
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        var creation = await Create(w);
        var id = creation.GetProperty("agent").GetProperty("id").GetGuid();
        var tokenId = creation.GetProperty("token").GetProperty("id").GetGuid();
        w.Client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        Assert.Equal(HttpStatusCode.BadRequest, (await w.Client.PostAsJsonAsync($"/api/admin/agents/{id}/tokens", new { label = "New", expectedTokenId = tokenId })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await w.Client.PostAsJsonAsync($"/api/admin/integration-tokens/{tokenId}/revoke", new { })).StatusCode);
        await TestWorkspace.Csrf(w.Client);
        var registered = await w.Client.PostAsJsonAsync("/api/auth/register", new { email = "ordinary@example.test", displayName = "Person", password = "Test-only-long-passphrase!7" });
        registered.EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Forbidden, (await w.Client.PostAsJsonAsync($"/api/admin/agents/{id}/tokens", new { label = "New", expectedTokenId = tokenId })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await w.Client.PostAsJsonAsync($"/api/admin/integration-tokens/{tokenId}/revoke", new { })).StatusCode);
    }
}
