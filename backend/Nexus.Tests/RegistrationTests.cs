using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Npgsql;

namespace Nexus.Tests;

public class RegistrationTests
{
    private static readonly object Registration = new
    {
        email = "  Human@Example.Test  ",
        displayName = "  Local Human  ",
        password = "Human-only-long-passphrase!8"
    };

    [Fact]
    public async Task Registration_creates_non_admin_human_main_membership_and_session()
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        using var client = w.Host.CreateClient();
        await TestWorkspace.Csrf(client);

        var response = await client.PostAsJsonAsync("/api/auth/register", Registration);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var user = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("human@example.test", user.GetProperty("email").GetString());
        Assert.Equal("Local Human", user.GetProperty("displayName").GetString());
        Assert.False(user.GetProperty("isAdmin").GetBoolean());
        var participantId = user.GetProperty("participantId").GetGuid();
        Assert.NotEqual(Guid.Empty, participantId);
        var cookie = response.Headers.GetValues("Set-Cookie").Single(s => s.StartsWith("nexus.session="));
        Assert.Contains("httponly", cookie.ToLowerInvariant());
        Assert.Contains("samesite=strict", cookie.ToLowerInvariant());
        Assert.Equal(user.GetProperty("id").GetGuid(), (await client.GetFromJsonAsync<JsonElement>("/api/auth/me")).GetProperty("id").GetGuid());

        await using var db = new NpgsqlConnection(w.Connection);
        await db.OpenAsync();
        await using var command = new NpgsqlCommand("""
            SELECT a."IsAdmin", p."Name", p."Kind", p."State", p."IsAdmin",
                   EXISTS (SELECT 1 FROM "Memberships" m WHERE m."ConversationId" = 'main' AND m."ParticipantId" = p."Id"),
                   EXISTS (SELECT 1 FROM "Sessions" s WHERE s."AccountId" = a."Id" AND s."RevokedAt" IS NULL)
            FROM "Accounts" a
            JOIN "Participants" p ON p."Id" = a."ParticipantId"
            WHERE a."Email" = 'human@example.test'
            """, db);
        await using var reader = await command.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        Assert.False(reader.GetBoolean(0));
        Assert.Equal("Local Human", reader.GetString(1));
        Assert.Equal("human", reader.GetString(2));
        Assert.Equal("active", reader.GetString(3));
        Assert.False(reader.GetBoolean(4));
        Assert.True(reader.GetBoolean(5));
        Assert.True(reader.GetBoolean(6));
        Assert.False(await reader.ReadAsync());
    }

    [Fact]
    public async Task Registration_before_bootstrap_is_conflict_and_creates_nothing()
    {
        await using var w = await TestWorkspace.Create();
        await TestWorkspace.Csrf(w.Client);

        var response = await w.Client.PostAsJsonAsync("/api/auth/register", Registration);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        await using var db = new NpgsqlConnection(w.Connection);
        await db.OpenAsync();
        foreach (var table in new[] { "Accounts", "Participants", "Memberships", "Sessions", "Conversations" })
        {
            await using var command = new NpgsqlCommand($"SELECT COUNT(*) FROM \"{table}\"", db);
            Assert.Equal(0L, await command.ExecuteScalarAsync());
        }
    }

    [Theory]
    [InlineData("bad", "Human", "Human-only-long-passphrase!8")]
    [InlineData("human@example.test", " ", "Human-only-long-passphrase!8")]
    [InlineData("human@example.test", "Human", "short")]
    [InlineData(null, "Human", "Human-only-long-passphrase!8")]
    [InlineData("human@example.test", "Human", null)]
    public async Task Invalid_registration_uses_setup_validation_without_creating_rows(string? email, string displayName, string? password)
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        using var client = w.Host.CreateClient();
        await TestWorkspace.Csrf(client);

        var response = await client.PostAsJsonAsync("/api/auth/register", new { email, displayName, password });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertWorkspaceCounts(w.Connection, 1);
    }

    [Fact]
    public async Task Normalized_duplicate_registration_is_conflict_without_orphan_rows()
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        using var first = w.Host.CreateClient();
        using var duplicate = w.Host.CreateClient();
        await TestWorkspace.Csrf(first);
        await TestWorkspace.Csrf(duplicate);
        (await first.PostAsJsonAsync("/api/auth/register", Registration)).EnsureSuccessStatusCode();

        var response = await duplicate.PostAsJsonAsync("/api/auth/register", new
        {
            email = " HUMAN@example.test ",
            displayName = "Duplicate",
            password = "Duplicate-long-passphrase!9"
        });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        await AssertWorkspaceCounts(w.Connection, 2);
    }

    [Fact]
    public async Task Concurrent_normalized_duplicate_registration_creates_exactly_one_complete_human()
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        using var host1 = w.NewHost();
        using var host2 = w.NewHost();
        using var first = host1.CreateClient();
        using var second = host2.CreateClient();
        await TestWorkspace.Csrf(first);
        await TestWorkspace.Csrf(second);

        var responses = await Task.WhenAll(
            first.PostAsJsonAsync("/api/auth/register", Registration),
            second.PostAsJsonAsync("/api/auth/register", new
            {
                email = "human@example.test",
                displayName = "Other Human",
                password = "Other-human-passphrase!9"
            }));

        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.OK);
        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.Conflict);
        await AssertWorkspaceCounts(w.Connection, 2);
    }

    [Fact]
    public async Task Bootstrap_racing_registration_keeps_one_first_admin_and_only_complete_accounts()
    {
        await using var w = await TestWorkspace.Create();
        using var bootstrapHost = w.NewHost();
        using var registrationHost = w.NewHost();
        using var bootstrap = bootstrapHost.CreateClient();
        using var registration = registrationHost.CreateClient();
        await TestWorkspace.Csrf(bootstrap);
        await TestWorkspace.Csrf(registration);

        var responses = await Task.WhenAll(
            bootstrap.PostAsJsonAsync("/api/auth/bootstrap", TestWorkspace.Credentials),
            registration.PostAsJsonAsync("/api/auth/register", Registration));

        Assert.Equal(HttpStatusCode.OK, responses[0].StatusCode);
        Assert.Contains(responses[1].StatusCode, new[] { HttpStatusCode.OK, HttpStatusCode.Conflict });

        await using var db = new NpgsqlConnection(w.Connection);
        await db.OpenAsync();
        await using var command = new NpgsqlCommand("""
            SELECT
                (SELECT COUNT(*) FROM "Accounts"),
                (SELECT COUNT(*) FROM "Accounts" WHERE "IsAdmin"),
                (SELECT COUNT(*) FROM "Participants"),
                (SELECT COUNT(*) FROM "Participants" WHERE "IsAdmin"),
                (SELECT COUNT(*) FROM "Conversations" WHERE "Id" = 'main'),
                (SELECT COUNT(*) FROM "Memberships"),
                (SELECT COUNT(*) FROM "Sessions"),
                (SELECT COUNT(*)
                   FROM "Accounts" a
                   LEFT JOIN "Participants" p ON p."Id" = a."ParticipantId"
                   LEFT JOIN "Memberships" m ON m."ParticipantId" = p."Id" AND m."ConversationId" = 'main'
                  WHERE p."Id" IS NULL OR m."ParticipantId" IS NULL)
            """, db);
        await using var reader = await command.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        var accounts = reader.GetInt64(0);
        Assert.Equal(responses[1].StatusCode == HttpStatusCode.OK ? 2L : 1L, accounts);
        Assert.Equal(1L, reader.GetInt64(1));
        Assert.Equal(accounts, reader.GetInt64(2));
        Assert.Equal(1L, reader.GetInt64(3));
        Assert.Equal(1L, reader.GetInt64(4));
        Assert.Equal(accounts, reader.GetInt64(5));
        Assert.Equal(accounts, reader.GetInt64(6));
        Assert.Equal(0L, reader.GetInt64(7));
    }

    private static async Task AssertWorkspaceCounts(string connection, long expected)
    {
        await using var db = new NpgsqlConnection(connection);
        await db.OpenAsync();
        foreach (var table in new[] { "Accounts", "Participants", "Memberships", "Sessions" })
        {
            await using var command = new NpgsqlCommand($"SELECT COUNT(*) FROM \"{table}\"", db);
            Assert.Equal(expected, await command.ExecuteScalarAsync());
        }
    }
}
