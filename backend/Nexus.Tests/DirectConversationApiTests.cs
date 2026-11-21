using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Npgsql;

namespace Nexus.Tests;

public class DirectConversationApiTests
{
    private static async Task<JsonElement> Register(HttpClient client, string name)
    {
        await TestWorkspace.Csrf(client);
        var response = await client.PostAsJsonAsync("/api/auth/register", new { email = $"{name}@example.test", displayName = name, password = "Human-only-long-passphrase!8" });
        response.EnsureSuccessStatusCode();
        await TestWorkspace.Csrf(client);
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }

    [Fact]
    public async Task Private_history_discovery_registration_and_message_retry_survive_fresh_host()
    {
        await using var w = await TestWorkspace.Create();
        var a = await w.Bootstrap();
        using var b = w.Host.CreateClient();
        var human = await Register(b, "Bee");
        var response = await w.Client.PostAsJsonAsync("/api/conversations/direct", new { participantId = human.GetProperty("participantId").GetGuid() });
        response.EnsureSuccessStatusCode();
        var id = (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetString();
        var path = $"/api/conversations/{id}/messages";
        var request = new { body = "Private durable body", clientRequestId = Guid.NewGuid(), authorId = Guid.NewGuid() };
        var sent = await w.Client.PostAsJsonAsync(path, request);
        sent.EnsureSuccessStatusCode();
        var original = await sent.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(a.GetProperty("participantId").GetGuid(), original.GetProperty("authorId").GetGuid());
        (await b.PostAsJsonAsync(path, new { body = "Private reply", clientRequestId = Guid.NewGuid() })).EnsureSuccessStatusCode();
        foreach (var client in new[] { w.Client, b })
        {
            var home = await client.GetFromJsonAsync<JsonElement>("/api/workspace/home");
            Assert.Equal("main", home.GetProperty("conversation").GetProperty("id").GetString());
            Assert.Contains(home.GetProperty("conversations").EnumerateArray(), c => c.GetProperty("id").GetString() == id);
            Assert.Equal(2, (await client.GetFromJsonAsync<JsonElement>(path)).GetArrayLength());
        }
        using var c = w.Host.CreateClient();
        await Register(c, "Cee");
        var thirdHome = await c.GetFromJsonAsync<JsonElement>("/api/workspace/home");
        Assert.Single(thirdHome.GetProperty("conversations").EnumerateArray());
        foreach (var denied in new[] { await c.GetAsync(path), await c.PostAsJsonAsync(path, new { body = "No", clientRequestId = Guid.NewGuid() }) })
        {
            Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
            Assert.DoesNotContain("Private", await denied.Content.ReadAsStringAsync());
        }
        Assert.Equal(HttpStatusCode.NotFound, (await c.GetAsync("/api/conversations/unknown/messages")).StatusCode);
        using var host = w.NewHost();
        using var fresh = host.CreateClient();
        await TestWorkspace.Csrf(fresh);
        (await fresh.PostAsJsonAsync("/api/auth/login", TestWorkspace.Credentials)).EnsureSuccessStatusCode();
        await TestWorkspace.Csrf(fresh);
        Assert.Equal(2, (await fresh.GetFromJsonAsync<JsonElement>(path)).GetArrayLength());
        var retry = await fresh.PostAsJsonAsync(path, request);
        Assert.Equal(original.GetProperty("id").GetGuid(), (await retry.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid());
        Assert.Equal(HttpStatusCode.Conflict, (await fresh.PostAsJsonAsync("/api/conversations/main/messages", request)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await fresh.PostAsJsonAsync(path, new { body = "Changed", request.clientRequestId })).StatusCode);
        await using var db = new NpgsqlConnection(w.Connection);
        await db.OpenAsync();
        await using var rename = new NpgsqlCommand("UPDATE \"Participants\" SET \"Name\" = 'Bee renamed' WHERE \"Id\" = @id", db);
        rename.Parameters.AddWithValue("id", human.GetProperty("participantId").GetGuid());
        await rename.ExecuteNonQueryAsync();
        var renamed = await fresh.GetFromJsonAsync<JsonElement>("/api/workspace/home");
        Assert.Equal("Bee renamed", renamed.GetProperty("conversations").EnumerateArray().Single(item => item.GetProperty("id").GetString() == id).GetProperty("title").GetString());
    }

    [Fact]
    public async Task Reopen_DTO_uses_canonical_pair_even_if_legacy_memberships_are_corrupt()
    {
        await using var w = await TestWorkspace.Create();
        var a = await w.Bootstrap();
        using var b = w.Host.CreateClient();
        var human = await Register(b, "Bee");
        using var c = w.Host.CreateClient();
        var unrelated = await Register(c, "Cee");
        var bid = human.GetProperty("participantId").GetGuid();
        var response = await w.Client.PostAsJsonAsync("/api/conversations/direct", new { participantId = bid });
        response.EnsureSuccessStatusCode();
        var id = (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetString();
        await using var db = new NpgsqlConnection(w.Connection);
        await db.OpenAsync();
        // Simulate legacy corruption while the enforcement trigger is deliberately disabled.
        await using var corrupt = new NpgsqlCommand("""
            ALTER TABLE "Memberships" DISABLE TRIGGER direct_membership_authorization;
            INSERT INTO "Memberships" VALUES (@id,@participant);
            ALTER TABLE "Memberships" ENABLE TRIGGER direct_membership_authorization;
            """, db);
        corrupt.Parameters.AddWithValue("id", id!);
        corrupt.Parameters.AddWithValue("participant", unrelated.GetProperty("participantId").GetGuid());
        await corrupt.ExecuteNonQueryAsync();
        var path = $"/api/conversations/{id}/messages";
        (await w.Client.PostAsJsonAsync(path, new { body = "Private corruption secret", clientRequestId = Guid.NewGuid() })).EnsureSuccessStatusCode();
        var thirdHome = await c.GetFromJsonAsync<JsonElement>("/api/workspace/home");
        Assert.DoesNotContain(thirdHome.GetProperty("conversations").EnumerateArray(), item => item.GetProperty("id").GetString() == id);
        foreach (var denied in new[] { await c.GetAsync(path), await c.PostAsJsonAsync(path, new { body = "No", clientRequestId = Guid.NewGuid() }) })
        {
            Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
            Assert.DoesNotContain("Private corruption secret", await denied.Content.ReadAsStringAsync());
        }
        var pair = new[] { a.GetProperty("participantId").GetGuid(), bid }.Order().ToArray();
        foreach (var client in new[] { w.Client, b })
        {
            var home = await client.GetFromJsonAsync<JsonElement>("/api/workspace/home");
            var direct = home.GetProperty("conversations").EnumerateArray().Single(item => item.GetProperty("id").GetString() == id);
            Assert.Equal(pair, direct.GetProperty("participantIds").EnumerateArray().Select(p => p.GetGuid()));
            Assert.Contains("Private corruption secret", await client.GetStringAsync(path));
            (await client.PostAsJsonAsync(path, new { body = "Canonical reply", clientRequestId = Guid.NewGuid() })).EnsureSuccessStatusCode();
        }
        var reopened = await w.Client.PostAsJsonAsync("/api/conversations/direct", new { participantId = bid });
        reopened.EnsureSuccessStatusCode();
        var dto = await reopened.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(new[] { a.GetProperty("participantId").GetGuid(), bid }.Order(),
            dto.GetProperty("participantIds").EnumerateArray().Select(p => p.GetGuid()).Order());
    }

    [Fact]
    public async Task Invalid_targets_are_private_and_never_leave_partial_rows()
    {
        await using var w = await TestWorkspace.Create();
        var a = await w.Bootstrap();
        var aid = a.GetProperty("participantId").GetGuid();
        await using var db = new NpgsqlConnection(w.Connection);
        await db.OpenAsync();
        foreach (var (kind, state) in new[] { ("human", "inactive"), ("service", "active"), ("agent", "inactive") })
        {
            var id = Guid.NewGuid();
            await using var seed = new NpgsqlCommand("INSERT INTO \"Participants\" (\"Id\",\"Name\",\"Kind\",\"State\",\"Availability\",\"IsAdmin\") VALUES (@id,'Secret target',@kind,@state,'available',false)", db);
            seed.Parameters.AddWithValue("id", id);
            seed.Parameters.AddWithValue("kind", kind);
            seed.Parameters.AddWithValue("state", state);
            await seed.ExecuteNonQueryAsync();
            var response = await w.Client.PostAsJsonAsync("/api/conversations/direct", new { participantId = id });
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
            Assert.DoesNotContain("Secret target", await response.Content.ReadAsStringAsync());
        }
        foreach (var id in new[] { Guid.Empty, aid, Guid.NewGuid() })
        {
            var response = await w.Client.PostAsJsonAsync("/api/conversations/direct", new { participantId = id });
            Assert.Equal(id == Guid.Empty || id == aid ? HttpStatusCode.BadRequest : HttpStatusCode.NotFound, response.StatusCode);
            Assert.Equal("application/problem+json", response.Content.Headers.ContentType!.MediaType);
        }
        using var anonymous = w.Host.CreateClient();
        await TestWorkspace.Csrf(anonymous);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PostAsJsonAsync("/api/conversations/direct", new { participantId = aid })).StatusCode);
        w.Client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        Assert.Equal(HttpStatusCode.BadRequest, (await w.Client.PostAsJsonAsync("/api/conversations/direct", new { participantId = aid })).StatusCode);
        await using var count = new NpgsqlCommand("SELECT COUNT(*) FROM \"Conversations\" WHERE \"Kind\" = 'direct'", db);
        Assert.Equal(0L, await count.ExecuteScalarAsync());
    }

    [Fact]
    public async Task Create_reopens_by_pair_with_viewer_title_and_two_durable_memberships_even_under_concurrency()
    {
        await using var w = await TestWorkspace.Create();
        var a = await w.Bootstrap();
        using var host = w.NewHost();
        using var b = host.CreateClient();
        var human = await Register(b, "Bee");
        var aid = a.GetProperty("participantId").GetGuid();
        var bid = human.GetProperty("participantId").GetGuid();
        var responses = await Task.WhenAll(
            w.Client.PostAsJsonAsync("/api/conversations/direct", new { participantId = bid }),
            b.PostAsJsonAsync("/api/conversations/direct", new { participantId = aid }),
            w.Client.PostAsJsonAsync("/api/conversations/direct", new { participantId = bid }));
        foreach (var response in responses) Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var results = await Task.WhenAll(responses.Select(r => r.Content.ReadFromJsonAsync<JsonElement>()));
        var id = results[0].GetProperty("id").GetString();
        foreach (var c in results)
        {
            Assert.Equal(id, c.GetProperty("id").GetString());
            Assert.Equal("direct", c.GetProperty("kind").GetString());
            Assert.Equal("active", c.GetProperty("state").GetString());
            Assert.Equal(new[] { aid, bid }.Order(), c.GetProperty("participantIds").EnumerateArray().Select(p => p.GetGuid()).Order());
        }
        Assert.Equal("Bee", results[0].GetProperty("title").GetString());
        Assert.Equal("Test Admin", results[1].GetProperty("title").GetString());
        var again = await w.Client.PostAsJsonAsync("/api/conversations/direct", new { participantId = bid });
        Assert.Equal(id, (await again.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetString());
        using var freshHost = w.NewHost();
        using var fresh = freshHost.CreateClient();
        await TestWorkspace.Csrf(fresh);
        (await fresh.PostAsJsonAsync("/api/auth/login", TestWorkspace.Credentials)).EnsureSuccessStatusCode();
        var home = await fresh.GetFromJsonAsync<JsonElement>("/api/workspace/home");
        Assert.Contains(home.GetProperty("conversations").EnumerateArray(), c => c.GetProperty("id").GetString() == id);
        await using var db = new NpgsqlConnection(w.Connection);
        await db.OpenAsync();
        await using var cmd = new NpgsqlCommand("""
            SELECT (SELECT COUNT(*) FROM "Conversations" WHERE "Kind" = 'direct'),
            (SELECT COUNT(*) FROM "Memberships" WHERE "ConversationId" <> 'main')
            """, db);
        await using var reader = await cmd.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        Assert.Equal(1, reader.GetInt64(0));
        Assert.Equal(2, reader.GetInt64(1));
    }
}
