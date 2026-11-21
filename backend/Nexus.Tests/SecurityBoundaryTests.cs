using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Npgsql;
namespace Nexus.Tests;

public class SecurityBoundaryTests
{
    [Theory]
    [InlineData("/api/auth/status")]
    [InlineData("/api/auth/csrf")]
    public async Task Foreign_host_is_rejected_before_setup(string path)
    {
        await using var w = await TestWorkspace.Create();
        using var client = w.Host.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions { BaseAddress = new Uri("http://untrusted.example") });
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync(path)).StatusCode);
    }

    [Fact]
    public async Task Production_cookies_are_secure_http_only_strict()
    {
        await using var w = await TestWorkspace.Create();
        using var host = new ApiHost(w.Connection, $"C:/Nexus/backend/.test-keys/{w.Name}", "Production");
        using var client = host.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });
        var csrf = await client.GetAsync("/api/auth/csrf");
        var csrfCookie = csrf.Headers.GetValues("Set-Cookie").Single();
        Assert.Contains("secure", csrfCookie.ToLowerInvariant());
        Assert.Contains("httponly", csrfCookie.ToLowerInvariant());
        Assert.Contains("samesite=strict", csrfCookie.ToLowerInvariant());
        var token = (await csrf.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("token").GetString();
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", token);
        var bootstrap = await client.PostAsJsonAsync("/api/auth/bootstrap", TestWorkspace.Credentials);
        bootstrap.EnsureSuccessStatusCode();
        var cookie = bootstrap.Headers.GetValues("Set-Cookie").Single(s => s.StartsWith("nexus.session="));
        Assert.Contains("secure", cookie.ToLowerInvariant());
        Assert.Contains("httponly", cookie.ToLowerInvariant());
        Assert.Contains("samesite=strict", cookie.ToLowerInvariant());
        Assert.Contains("expires=", cookie.ToLowerInvariant());

        await TestWorkspace.Csrf(client);
        var registration = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email = "production-cookie@example.test",
            displayName = "Production Cookie",
            password = "Production-cookie-passphrase!8"
        });
        registration.EnsureSuccessStatusCode();
        var registrationCookie = registration.Headers.GetValues("Set-Cookie").Single(s => s.StartsWith("nexus.session="));
        Assert.Contains("secure", registrationCookie.ToLowerInvariant());
        Assert.Contains("httponly", registrationCookie.ToLowerInvariant());
        Assert.Contains("samesite=strict", registrationCookie.ToLowerInvariant());
        Assert.Contains("expires=", registrationCookie.ToLowerInvariant());
    }

    [Fact]
    public async Task Unexpected_database_failure_does_not_expose_internal_details()
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        await using var db = new NpgsqlConnection(w.Connection);
        await db.OpenAsync();
        await using var command = new NpgsqlCommand("DROP TABLE \"Messages\" CASCADE", db);
        await command.ExecuteNonQueryAsync();
        var response = await w.Client.GetAsync("/api/conversations/main/messages");
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var body = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("Npgsql", body);
        Assert.DoesNotContain("Exception", body);
        Assert.DoesNotContain("Messages", body);
    }

    [Theory]
    [InlineData("Development")]
    [InlineData("Production")]
    public async Task Malformed_request_returns_safe_problem_details(string environment)
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        using var host = new ApiHost(w.Connection, $"C:/Nexus/backend/.test-keys/{w.Name}", environment);
        using var client = host.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });
        await TestWorkspace.Csrf(client);
        (await client.PostAsJsonAsync("/api/auth/login", TestWorkspace.Credentials)).EnsureSuccessStatusCode();
        await TestWorkspace.Csrf(client);
        var response = await client.PostAsync("/api/conversations/main/messages", new StringContent("{\"body\":\"hello\",\"clientRequestId\":\"not-a-uuid\"}", Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.DoesNotContain("Exception", await response.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData("/api/auth/login")]
    [InlineData("/api/auth/logout")]
    [InlineData("/api/conversations/main/messages")]
    [InlineData("/api/conversations/topical")]
    public async Task Unsafe_endpoints_require_csrf(string path)
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        w.Client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        Assert.Equal(HttpStatusCode.BadRequest, (await w.Client.PostAsJsonAsync(path, new { body = "hi", clientRequestId = Guid.NewGuid(), email = "admin@example.test", password = "Test-only-long-passphrase!7" })).StatusCode);
    }

    [Fact]
    public async Task Anonymous_post_with_valid_csrf_is_unauthorized()
    {
        await using var w = await TestWorkspace.Create();
        await TestWorkspace.Csrf(w.Client);
        Assert.Equal(HttpStatusCode.Unauthorized, (await w.Client.PostAsJsonAsync("/api/conversations/main/messages", new { body = "hi", clientRequestId = Guid.NewGuid() })).StatusCode);
    }

    [Fact]
    public async Task Expired_session_is_unauthorized()
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        await using var db = new NpgsqlConnection(w.Connection);
        await db.OpenAsync();
        await using var command = new NpgsqlCommand("UPDATE \"Sessions\" SET \"ExpiresAt\" = NOW() - INTERVAL '1 second'", db);
        await command.ExecuteNonQueryAsync();
        Assert.Equal(HttpStatusCode.Unauthorized, (await w.Client.GetAsync("/api/auth/me")).StatusCode);
    }
}
