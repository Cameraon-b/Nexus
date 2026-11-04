using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
namespace Nexus.Tests;

public class CsrfTests
{
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Setup_requires_matching_csrf_cookie_and_header(bool forged)
    {
        await using var w = await TestWorkspace.Create();
        if (forged) w.Client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", "forged");
        var response = await w.Client.PostAsJsonAsync("/api/auth/bootstrap", TestWorkspace.Credentials);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.True((await w.Client.GetFromJsonAsync<JsonElement>("/api/auth/status")).GetProperty("requiresBootstrap").GetBoolean());
    }
}
