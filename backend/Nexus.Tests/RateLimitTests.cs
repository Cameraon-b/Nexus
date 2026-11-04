using System.Net;
using System.Net.Http.Json;
namespace Nexus.Tests;

public class RateLimitTests
{
    [Theory]
    [InlineData("/api/auth/login")]
    [InlineData("/api/auth/bootstrap")]
    public async Task Auth_attempts_are_limited_with_retry_after(string path)
    {
        await using var w = await TestWorkspace.Create();
        await TestWorkspace.Csrf(w.Client);
        HttpResponseMessage? response = null;
        for (var i = 0; i < 11; i++) response = await w.Client.PostAsJsonAsync(path, new { email = "invalid", displayName = "", password = "invalid" });
        Assert.Equal(HttpStatusCode.TooManyRequests, response!.StatusCode);
        Assert.True(response.Headers.RetryAfter?.Delta > TimeSpan.Zero);
    }
}
