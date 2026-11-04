using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Npgsql;
namespace Nexus.Tests;

public class SessionTests
{
    [Fact]
    public async Task Logout_revokes_replayed_cookie_in_another_host()
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        var response = await w.Client.PostAsJsonAsync("/api/auth/login", TestWorkspace.Credentials);
        var cookie = response.Headers.GetValues("Set-Cookie").Single(s => s.StartsWith("nexus.session=")).Split(';')[0];
        await TestWorkspace.Csrf(w.Client);
        Assert.Equal(HttpStatusCode.NoContent, (await w.Client.PostAsJsonAsync("/api/auth/logout", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await w.Client.GetAsync("/api/auth/me")).StatusCode);
        using var host2 = w.NewHost();
        using var replay = host2.CreateClient();
        replay.DefaultRequestHeaders.Add("Cookie", cookie);
        Assert.Equal(HttpStatusCode.Unauthorized, (await replay.GetAsync("/api/auth/me")).StatusCode);
    }

    [Theory]
    [InlineData("admin@example.test", "wrong")]
    [InlineData("missing@example.test", "wrong")]
    public async Task Bad_credentials_are_generic_unauthorized(string email, string password)
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        using var client = w.Host.CreateClient();
        await TestWorkspace.Csrf(client);
        var response = await client.PostAsJsonAsync("/api/auth/login", new { email, password });
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("Invalid email or password.", (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("title").GetString());
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task Login_issues_session_valid_in_new_host_without_storing_raw_secrets()
    {
        await using var w = await TestWorkspace.Create();
        var user = await w.Bootstrap();
        using var client = w.Host.CreateClient();
        await TestWorkspace.Csrf(client);
        var response = await client.PostAsJsonAsync("/api/auth/login", TestWorkspace.Credentials);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var cookie = response.Headers.GetValues("Set-Cookie").Single(s => s.StartsWith("nexus.session="));
        Assert.Contains("httponly", cookie.ToLowerInvariant());
        Assert.Contains("samesite=strict", cookie.ToLowerInvariant());
        using var host2 = w.NewHost();
        using var client2 = host2.CreateClient();
        client2.DefaultRequestHeaders.Add("Cookie", cookie.Split(';')[0]);
        var me = await client2.GetFromJsonAsync<JsonElement>("/api/auth/me");
        Assert.Equal(user.GetProperty("id").GetString(), me.GetProperty("id").GetString());
        await using var db = new NpgsqlConnection(w.Connection);
        await db.OpenAsync();
        await using var cmd = new NpgsqlCommand("SELECT \"PasswordHash\" FROM \"Accounts\"", db);
        var hash = (string)(await cmd.ExecuteScalarAsync())!;
        Assert.DoesNotContain("Test-only", hash);
        Assert.True(Convert.FromBase64String(hash).Length > 32);
        cmd.CommandText = "SELECT \"TokenHash\" FROM \"Sessions\"";
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync()) Assert.DoesNotContain(reader.GetString(0), cookie);
    }
}
