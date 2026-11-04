using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
namespace Nexus.Tests;

public class IdempotencyTests
{
    [Fact]
    public async Task Concurrent_retry_returns_one_message_and_conflicting_payload_is_rejected()
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        using var host2 = w.NewHost();
        using var client2 = host2.CreateClient();
        await TestWorkspace.Csrf(client2);
        (await client2.PostAsJsonAsync("/api/auth/login", TestWorkspace.Credentials)).EnsureSuccessStatusCode();
        await TestWorkspace.Csrf(client2);
        var id = Guid.NewGuid();
        var payload = new { body = "Send once", clientRequestId = id };
        var responses = await Task.WhenAll(w.Client.PostAsJsonAsync("/api/conversations/main/messages", payload), client2.PostAsJsonAsync("/api/conversations/main/messages", payload));
        foreach (var response in responses) Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var a = await responses[0].Content.ReadFromJsonAsync<JsonElement>();
        var b = await responses[1].Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(a.GetProperty("id").GetString(), b.GetProperty("id").GetString());
        Assert.Single((await w.Client.GetFromJsonAsync<JsonElement>("/api/conversations/main/messages")).EnumerateArray());
        var conflicting = await w.Client.PostAsJsonAsync("/api/conversations/main/messages", new { body = "Changed payload", clientRequestId = id });
        Assert.Equal(HttpStatusCode.Conflict, conflicting.StatusCode);
        Assert.Single((await w.Client.GetFromJsonAsync<JsonElement>("/api/conversations/main/messages")).EnumerateArray());
    }
}
