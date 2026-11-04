using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
namespace Nexus.Tests;

public class MessageValidationTests
{
    [Theory]
    [InlineData(1)]
    [InlineData(5000)]
    public async Task Boundary_length_message_is_accepted(int length)
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        var response = await w.Client.PostAsJsonAsync("/api/conversations/main/messages", new { body = new string('x', length), clientRequestId = Guid.NewGuid() });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(length, (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("body").GetString()!.Length);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   \r\n ")]
    [InlineData("oversized")]
    public async Task Invalid_body_is_bad_request_without_persisting(string? body)
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        if (body == "oversized") body = new string('x', 5001);
        var response = await w.Client.PostAsJsonAsync("/api/conversations/main/messages", new { body, clientRequestId = Guid.NewGuid() });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.Empty((await w.Client.GetFromJsonAsync<JsonElement>("/api/conversations/main/messages")).EnumerateArray());
    }
    [Fact]
    public async Task Missing_client_request_id_is_bad_request()
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        Assert.Equal(HttpStatusCode.BadRequest, (await w.Client.PostAsJsonAsync("/api/conversations/main/messages", new { body = "Hello" })).StatusCode);
    }
}
