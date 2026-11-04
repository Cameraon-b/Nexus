using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Npgsql;
namespace Nexus.Tests;

public class BootstrapTests
{
    [Theory]
    [InlineData("bad", "Admin", "Long-password-test!7")]
    [InlineData("admin@example.test", " ", "Long-password-test!7")]
    [InlineData("admin@example.test", "Admin", "short")]
    [InlineData(null, "Admin", "Long-password-test!7")]
    [InlineData("admin@example.test", "Admin", null)]
    public async Task Invalid_setup_is_rejected_without_creating_account(string? email, string name, string? password)
    {
        await using var w = await TestWorkspace.Create();
        await TestWorkspace.Csrf(w.Client);
        var response = await w.Client.PostAsJsonAsync("/api/auth/bootstrap", new { email, displayName = name, password });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.True((await w.Client.GetFromJsonAsync<JsonElement>("/api/auth/status")).GetProperty("requiresBootstrap").GetBoolean());
    }

    [Fact]
    public async Task Concurrent_bootstraps_create_exactly_one_admin_and_later_setup_is_conflict()
    {
        await using var w = await TestWorkspace.Create();
        using var otherHost = w.NewHost();
        using var other = otherHost.CreateClient();
        await TestWorkspace.Csrf(w.Client);
        await TestWorkspace.Csrf(other);
        var responses = await Task.WhenAll(
            w.Client.PostAsJsonAsync("/api/auth/bootstrap", TestWorkspace.Credentials),
            other.PostAsJsonAsync("/api/auth/bootstrap", new { email = "second@example.test", displayName = "Second", password = "A-long-test-password!8" }));
        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.OK);
        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.Conflict);
        await TestWorkspace.Csrf(w.Client);
        Assert.Equal(HttpStatusCode.Conflict, (await w.Client.PostAsJsonAsync("/api/auth/bootstrap", TestWorkspace.Credentials)).StatusCode);
        await using var db = new NpgsqlConnection(w.Connection);
        await db.OpenAsync();
        await using var cmd = new NpgsqlCommand("SELECT COUNT(*) FROM \"Accounts\"", db);
        Assert.Equal(1L, await cmd.ExecuteScalarAsync());
    }
}
