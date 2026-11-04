using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Npgsql;

namespace Nexus.Tests;

public sealed class ApiHost(string? connection = null, string? keys = null, string environment = "Development") : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder) => builder.UseEnvironment(environment)
        .ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:Nexus"] = connection ?? "Host=127.0.0.1;Port=55432;Username=nexus;Database=nexus_test_placeholder",
            ["Nexus:DataProtectionPath"] = keys ?? "C:/Nexus/backend/.test-keys"
        }));
}

public class ApiTests
{
    [Fact]
    public async Task Bootstrap_creates_first_admin_with_durable_session()
    {
        await using var w = await TestWorkspace.Create();
        var status = await w.Client.GetAsync("/api/auth/status");
        Assert.Equal(HttpStatusCode.OK, status.StatusCode);
        Assert.True((await status.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("requiresBootstrap").GetBoolean());
        var user = await w.Bootstrap();
        Assert.Equal("admin@example.test", user.GetProperty("email").GetString());
        Assert.True(user.GetProperty("isAdmin").GetBoolean());
        Assert.NotEqual(user.GetProperty("id").GetString(), user.GetProperty("participantId").GetString());
        var me = await w.Client.GetFromJsonAsync<JsonElement>("/api/auth/me");
        Assert.Equal(user.GetProperty("id").GetString(), me.GetProperty("id").GetString());
        Assert.False((await w.Client.GetFromJsonAsync<JsonElement>("/api/auth/status")).GetProperty("requiresBootstrap").GetBoolean());
    }

    [Theory]
    [InlineData("/api/auth/me")]
    [InlineData("/api/workspace/home")]
    [InlineData("/api/conversations/main/messages")]
    public async Task Anonymous_reads_are_unauthorized(string path)
    {
        await using var workspace = await TestWorkspace.Create();
        var client = workspace.Client;
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(path)).StatusCode);
    }
}
