using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;

namespace Nexus.Tests;

public class ProductionRegistrationTests
{
    private static WebApplicationFactory<Program> Host(TestWorkspace w, string? policy) =>
        new ApiHost(w.Connection, $"C:/Nexus/backend/.test-keys/{w.Name}", "Production")
            .WithWebHostBuilder(b => b.ConfigureAppConfiguration((_, c) => c.AddInMemoryCollection(
                new Dictionary<string, string?> { ["Nexus:AllowPublicRegistration"] = policy })));

    [Theory]
    [InlineData(null, false)]
    [InlineData("false", false)]
    [InlineData("true", true)]
    public async Task Production_registration_policy_is_explicit_and_defaults_closed(string? policy, bool allowed)
    {
        await using var w = await TestWorkspace.Create();
        using var host = Host(w, policy);
        using var client = host.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });
        var status = await client.GetFromJsonAsync<JsonElement>("/api/auth/status");
        Assert.True(status.GetProperty("requiresBootstrap").GetBoolean());
        await TestWorkspace.Csrf(client);
        (await client.PostAsJsonAsync("/api/auth/bootstrap", TestWorkspace.Credentials)).EnsureSuccessStatusCode();
        status = await client.GetFromJsonAsync<JsonElement>("/api/auth/status");
        Assert.False(status.GetProperty("requiresBootstrap").GetBoolean());
        Assert.Equal(allowed, status.GetProperty("registrationAvailable").GetBoolean());
        await TestWorkspace.Csrf(client);
        var response = await client.PostAsJsonAsync("/api/auth/register", new { email = "other@example.test", displayName = "Other", password = "Disposable-long-password!9" });
        Assert.Equal(allowed ? HttpStatusCode.OK : HttpStatusCode.Forbidden, response.StatusCode);
        if (!allowed) Assert.Equal("Public registration is unavailable.", (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("title").GetString());
    }

    [Theory]
    [InlineData("false", "{", "application/json", 403)]
    [InlineData("false", "", "application/json", 403)]
    [InlineData("false", "wrong", "text/plain", 403)]
    [InlineData("true", "{", "application/json", 400)]
    [InlineData("true", "", "application/json", 400)]
    [InlineData("true", "wrong", "text/plain", 415)]
    public async Task Registration_body_binding_respects_policy(string policy, string body, string contentType, int expected)
    {
        await using var w = await TestWorkspace.Create();
        using var host = Host(w, policy);
        using var client = host.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });
        await TestWorkspace.Csrf(client);
        using var response = await client.PostAsync("/api/auth/register", new StringContent(body, System.Text.Encoding.UTF8, contentType));
        Assert.Equal(expected, (int)response.StatusCode);
    }

    [Theory]
    [InlineData("")]
    [InlineData("yes")]
    [InlineData("1")]
    public async Task Malformed_policy_fails_startup(string policy)
    {
        await using var w = await TestWorkspace.Create();
        using var host = Host(w, policy);
        var error = Assert.Throws<InvalidOperationException>(() => host.CreateClient());
        Assert.Contains("AllowPublicRegistration", error.Message);
    }

    [Fact]
    public async Task Development_registration_remains_available()
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        var status = await w.Client.GetFromJsonAsync<JsonElement>("/api/auth/status");
        Assert.True(status.GetProperty("registrationAvailable").GetBoolean());
        (await w.Client.PostAsJsonAsync("/api/auth/register", new { email = "other@example.test", displayName = "Other", password = "Disposable-long-password!9" })).EnsureSuccessStatusCode();
    }
}
