using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Nexus.Infrastructure;
using Npgsql;

namespace Nexus.Tests;

public class AgentCreationTests
{
    [Fact]
    public async Task Admin_creates_visible_agent_with_public_membership_and_hash_only_token()
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        var topic = await w.Client.PostAsJsonAsync("/api/conversations/topical", new { title = "Before agent", openingMessage = "Hello", clientRequestId = Guid.NewGuid() });
        topic.EnsureSuccessStatusCode();
        var response = await w.Client.PostAsJsonAsync("/api/admin/agents", new { displayName = "  Helper  ", description = "  Test integration  ", tokenLabel = "  Connector  " });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var result = await response.Content.ReadFromJsonAsync<JsonElement>();
        var agent = result.GetProperty("agent");
        var id = agent.GetProperty("id").GetGuid();
        Assert.NotEqual(Guid.Empty, id);
        Assert.Equal("Helper", agent.GetProperty("name").GetString());
        Assert.Equal("Test integration", agent.GetProperty("description").GetString());
        Assert.Equal("agent", agent.GetProperty("kind").GetString());
        Assert.Equal("active", agent.GetProperty("state").GetString());
        Assert.Equal("unknown", agent.GetProperty("availability").GetString());
        Assert.False(agent.GetProperty("isAdmin").GetBoolean());
        var raw = result.GetProperty("rawToken").GetString()!;
        Assert.Matches("^nexus_int_[0-9a-f]{64}$", raw);
        var metadata = result.GetProperty("token");
        Assert.Equal("Connector", metadata.GetProperty("label").GetString());
        Assert.Equal("active", metadata.GetProperty("state").GetString());
        await using var db = new NexusDb(new DbContextOptionsBuilder<NexusDb>().UseNpgsql(w.Connection).Options);
        Assert.False(await db.Accounts.AnyAsync(a => a.ParticipantId == id));
        Assert.Equal(2, await db.Memberships.CountAsync(m => m.ParticipantId == id));
        await using var connection = new NpgsqlConnection(w.Connection);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand("SELECT row_to_json(t)::text FROM \"IntegrationTokens\" t", connection);
        var stored = (string)(await command.ExecuteScalarAsync())!;
        Assert.DoesNotContain(raw, stored);
        Assert.Contains(Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(raw))), stored);
        var listing = await w.Client.GetAsync("/api/admin/agents");
        listing.EnsureSuccessStatusCode();
        Assert.DoesNotContain(raw, await listing.Content.ReadAsStringAsync());
        var tokens = await w.Client.GetAsync($"/api/admin/agents/{id}/tokens");
        tokens.EnsureSuccessStatusCode();
        var tokenJson = await tokens.Content.ReadAsStringAsync();
        Assert.DoesNotContain(raw, tokenJson);
        Assert.DoesNotContain("hash", tokenJson, StringComparison.OrdinalIgnoreCase);
        var home = await w.Client.GetFromJsonAsync<JsonElement>("/api/workspace/home");
        Assert.Contains(home.GetProperty("participants").EnumerateArray(), p => p.GetProperty("id").GetGuid() == id);
        var future = await w.Client.PostAsJsonAsync("/api/conversations/topical", new { title = "After agent", openingMessage = "Hi", clientRequestId = Guid.NewGuid() });
        future.EnsureSuccessStatusCode();
        Assert.Equal(3, await db.Memberships.CountAsync(m => m.ParticipantId == id));
    }

    [Theory]
    [InlineData("", "", "Connector")]
    [InlineData(" ", "", "Connector")]
    [InlineData("valid", "", " ")]
    [InlineData("long-name", "", "Connector")]
    [InlineData("valid", "long-description", "Connector")]
    [InlineData("valid", "", "long-label")]
    public async Task Invalid_creation_is_atomic(string name, string description, string label)
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        if (name == "long-name") name = new string('n', 101);
        if (description == "long-description") description = new string('d', 161);
        if (label == "long-label") label = new string('l', 101);
        var response = await w.Client.PostAsJsonAsync("/api/admin/agents", new { displayName = name, description, tokenLabel = label });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await using var db = new NexusDb(new DbContextOptionsBuilder<NexusDb>().UseNpgsql(w.Connection).Options);
        Assert.Equal(1, await db.Participants.CountAsync());
    }

    [Theory]
    [InlineData("anonymous", HttpStatusCode.Unauthorized)]
    [InlineData("ordinary", HttpStatusCode.Forbidden)]
    [InlineData("inactive", HttpStatusCode.Forbidden)]
    [InlineData("agent", HttpStatusCode.Forbidden)]
    [InlineData("forged", HttpStatusCode.Forbidden)]
    public async Task Creation_and_listing_require_active_human_admin(string caller, HttpStatusCode expected)
    {
        await using var w = await TestWorkspace.Create();
        var admin = await w.Bootstrap();
        using var client = caller == "anonymous" ? w.Host.CreateClient() : w.Client;
        if (caller == "ordinary" || caller == "forged")
        {
            var registration = await client.PostAsJsonAsync("/api/auth/register", new { email = "person@example.test", displayName = "Person", password = "Test-only-long-passphrase!7" });
            registration.EnsureSuccessStatusCode();
            if (caller == "forged")
            {
                var user = await registration.Content.ReadFromJsonAsync<JsonElement>();
                await using var db = new NexusDb(new DbContextOptionsBuilder<NexusDb>().UseNpgsql(w.Connection).Options);
                await db.Participants.Where(p => p.Id == user.GetProperty("participantId").GetGuid()).ExecuteUpdateAsync(s => s.SetProperty(p => p.IsAdmin, true));
            }
        }
        if (caller == "inactive" || caller == "agent")
        {
            await using var db = new NexusDb(new DbContextOptionsBuilder<NexusDb>().UseNpgsql(w.Connection).Options);
            var id = admin.GetProperty("participantId").GetGuid();
            if (caller == "inactive") await db.Participants.Where(p => p.Id == id).ExecuteUpdateAsync(s => s.SetProperty(p => p.State, "inactive"));
            else await db.Participants.Where(p => p.Id == id).ExecuteUpdateAsync(s => s.SetProperty(p => p.Kind, "agent"));
        }
        await TestWorkspace.Csrf(client);
        var response = await client.PostAsJsonAsync("/api/admin/agents", new { displayName = "Helper", tokenLabel = "Connector", isAdmin = true });
        Assert.Equal(expected, response.StatusCode);
        Assert.Equal(expected, (await client.GetAsync("/api/admin/agents")).StatusCode);
        Assert.Equal(expected, (await client.GetAsync($"/api/admin/agents/{Guid.NewGuid()}/tokens")).StatusCode);
    }

    [Fact]
    public async Task Agent_creation_requires_csrf_even_with_admin_cookie()
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        w.Client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        Assert.Equal(HttpStatusCode.BadRequest, (await w.Client.PostAsJsonAsync("/api/admin/agents", new { displayName = "Helper", tokenLabel = "Connector" })).StatusCode);
    }
}
