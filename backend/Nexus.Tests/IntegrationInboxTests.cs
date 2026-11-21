using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Npgsql;

namespace Nexus.Tests;

public class IntegrationInboxTests
{
    internal static async Task<JsonElement> Agent(TestWorkspace w, string name = "Helper")
    {
        var response = await w.Client.PostAsJsonAsync("/api/admin/agents", new { displayName = name, tokenLabel = "Test" });
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }
    internal static HttpClient Bearer(TestWorkspace w, JsonElement agent)
    {
        var client = w.Host.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", agent.GetProperty("rawToken").GetString());
        return client;
    }
    internal static async Task<string> Direct(TestWorkspace w, Guid id)
    {
        var response = await w.Client.PostAsJsonAsync("/api/conversations/direct", new { participantId = id });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetString()!;
    }
    internal static async Task<JsonElement> Send(TestWorkspace w, string conversation, string body)
    {
        var response = await w.Client.PostAsJsonAsync($"/api/conversations/{conversation}/messages", new { body, clientRequestId = Guid.NewGuid() });
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }

    [Fact]
    public async Task Default_and_maximum_page_sizes_are_bounded_without_losing_boundary_messages()
    {
        await using var w = await TestWorkspace.Create();
        var human = await w.Bootstrap();
        var agent = await Agent(w);
        using var integration = Bearer(w, agent);
        await using var db = new NpgsqlConnection(w.Connection);
        await db.OpenAsync();
        await using var seed = new NpgsqlCommand("""
            INSERT INTO "Messages" ("Id","ConversationId","AuthorId","Body","State","CreatedAt","ClientRequestId")
            SELECT gen_random_uuid(),'main',@human,'Bounded input','delivered','2026-01-01'::timestamptz + n * interval '1 microsecond',gen_random_uuid()
            FROM generate_series(1,101) n
            """, db);
        seed.Parameters.AddWithValue("human", human.GetProperty("participantId").GetGuid());
        await seed.ExecuteNonQueryAsync();
        var defaults = await integration.GetFromJsonAsync<JsonElement>("/api/integrations/inbox");
        Assert.Equal(50, defaults.GetProperty("messages").GetArrayLength());
        var maximum = await integration.GetFromJsonAsync<JsonElement>("/api/integrations/inbox?limit=100");
        Assert.Equal(100, maximum.GetProperty("messages").GetArrayLength());
        var cursor = maximum.GetProperty("nextCursor").GetString()!;
        var tail = await integration.GetFromJsonAsync<JsonElement>("/api/integrations/inbox?limit=100&after=" + cursor);
        Assert.Single(tail.GetProperty("messages").EnumerateArray());
        Assert.Equal(JsonValueKind.Null, tail.GetProperty("nextCursor").ValueKind);
    }

    [Fact]
    public async Task Inbox_is_bearer_only_authorized_delivered_nonself_and_stably_paginated()
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        var agent = await Agent(w);
        var other = await Agent(w, "Other");
        var aid = agent.GetProperty("agent").GetProperty("id").GetGuid();
        using var integration = Bearer(w, agent);
        var own = await Direct(w, aid);
        var unrelated = await Direct(w, other.GetProperty("agent").GetProperty("id").GetGuid());
        var main = await Send(w, "main", "Main input");
        var dm = await Send(w, own, "Own DM input");
        await Send(w, unrelated, "Unrelated private secret");
        var topicResponse = await w.Client.PostAsJsonAsync("/api/conversations/topical", new { title = "Public", openingMessage = "Topic input", clientRequestId = Guid.NewGuid() });
        topicResponse.EnsureSuccessStatusCode();
        await using var db = new NpgsqlConnection(w.Connection);
        await db.OpenAsync();
        // Equal and adjacent microsecond timestamps; self-authored and non-delivered rows must never escape.
        await using (var seed = new NpgsqlCommand("""
            UPDATE "Messages" SET "CreatedAt" = '2026-01-01T00:00:00Z';
            UPDATE "Messages" SET "CreatedAt" = "CreatedAt" + interval '1 microsecond' WHERE "Id" = @id;
            INSERT INTO "Messages" ("Id","ConversationId","AuthorId","Body","State","CreatedAt","ClientRequestId") VALUES
            (@self,'main',@agent,'Self authored','delivered','2026-01-01',@request),
            (@draft,'main',@agent,'Not delivered','draft','2026-01-01',@request2);
            ALTER TABLE "Memberships" DISABLE TRIGGER direct_membership_authorization;
            INSERT INTO "Memberships" VALUES (@unrelated,@agent);
            ALTER TABLE "Memberships" ENABLE TRIGGER direct_membership_authorization;
            """, db))
        {
            seed.Parameters.AddWithValue("id", dm.GetProperty("id").GetGuid());
            seed.Parameters.AddWithValue("agent", aid);
            seed.Parameters.AddWithValue("self", Guid.NewGuid());
            seed.Parameters.AddWithValue("draft", Guid.NewGuid());
            seed.Parameters.AddWithValue("request", Guid.NewGuid());
            seed.Parameters.AddWithValue("request2", Guid.NewGuid());
            seed.Parameters.AddWithValue("unrelated", unrelated);
            await seed.ExecuteNonQueryAsync();
        }
        var seen = new List<JsonElement>();
        string? cursor = null;
        do
        {
            var page = await integration.GetFromJsonAsync<JsonElement>("/api/integrations/inbox?limit=1" + (cursor is null ? "" : "&after=" + Uri.EscapeDataString(cursor)));
            Assert.Single(page.GetProperty("messages").EnumerateArray());
            seen.AddRange(page.GetProperty("messages").EnumerateArray());
            cursor = page.GetProperty("nextCursor").GetString();
        } while (cursor is not null && seen.Count < 10);
        Assert.Equal(3, seen.Count);
        Assert.Equal(3, seen.Select(m => m.GetProperty("id").GetGuid()).Distinct().Count());
        Assert.Equal(dm.GetProperty("id").GetGuid(), seen.Last().GetProperty("id").GetGuid());
        Assert.DoesNotContain(seen, m => m.GetProperty("body").GetString()!.Contains("secret"));
        foreach (var query in new[] { "after=garbage", "limit=0", "limit=101", "limit=oops" })
            Assert.Equal(HttpStatusCode.BadRequest, (await integration.GetAsync("/api/integrations/inbox?" + query)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await w.Client.GetAsync("/api/integrations/inbox")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await integration.GetAsync("/api/workspace/home")).StatusCode);
        var first = await integration.GetFromJsonAsync<JsonElement>("/api/integrations/inbox?limit=1");
        var issued = first.GetProperty("nextCursor").GetString()!;
        var repeated = await integration.GetFromJsonAsync<JsonElement>("/api/integrations/inbox?limit=1");
        Assert.Equal(issued, repeated.GetProperty("nextCursor").GetString());
        var replacement = await w.Client.PostAsJsonAsync($"/api/admin/agents/{aid}/tokens", new { label = "Replacement", expectedTokenId = agent.GetProperty("token").GetProperty("id").GetGuid() });
        replacement.EnsureSuccessStatusCode();
        var replaced = await replacement.Content.ReadFromJsonAsync<JsonElement>();
        integration.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", replaced.GetProperty("rawToken").GetString());
        var continued = await integration.GetFromJsonAsync<JsonElement>("/api/integrations/inbox?limit=1");
        Assert.Equal(issued, continued.GetProperty("nextCursor").GetString());
        using var second = Bearer(w, other);
        Assert.Equal(HttpStatusCode.BadRequest, (await second.GetAsync("/api/integrations/inbox?after=" + Uri.EscapeDataString(issued))).StatusCode);
        await using (var delete = new NpgsqlCommand("DELETE FROM \"Messages\" WHERE \"Id\" = @id", db))
        {
            delete.Parameters.AddWithValue("id", first.GetProperty("messages")[0].GetProperty("id").GetGuid());
            await delete.ExecuteNonQueryAsync();
        }
        Assert.Equal(HttpStatusCode.BadRequest, (await integration.GetAsync("/api/integrations/inbox?after=" + Uri.EscapeDataString(issued))).StatusCode);
        (await w.Client.PostAsJsonAsync($"/api/admin/integration-tokens/{replaced.GetProperty("token").GetProperty("id").GetGuid()}/revoke", new { })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Unauthorized, (await integration.GetAsync("/api/integrations/inbox")).StatusCode);
    }
}
