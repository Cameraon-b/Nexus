using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
namespace Nexus.Tests;

public class ConversationTests
{
    [Fact]
    public async Task Posted_message_persists_with_session_author_ignoring_spoofed_author()
    {
        await using var w = await TestWorkspace.Create();
        var user = await w.Bootstrap();
        var response = await w.Client.PostAsJsonAsync("/api/conversations/main/messages", new { body = "  Hello Common Room  ", clientRequestId = Guid.NewGuid(), authorId = Guid.NewGuid() });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var message = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(user.GetProperty("participantId").GetString(), message.GetProperty("authorId").GetString());
        Assert.Equal("Hello Common Room", message.GetProperty("body").GetString());
        Assert.Equal("delivered", message.GetProperty("state").GetString());
        Assert.Equal("main", message.GetProperty("conversationId").GetString());
        Assert.True(message.GetProperty("createdAt").TryGetDateTimeOffset(out _));
        using var host2 = w.NewHost();
        using var client2 = host2.CreateClient();
        await TestWorkspace.Csrf(client2);
        (await client2.PostAsJsonAsync("/api/auth/login", TestWorkspace.Credentials)).EnsureSuccessStatusCode();
        var stored = Assert.Single((await client2.GetFromJsonAsync<JsonElement>("/api/conversations/main/messages")).EnumerateArray());
        Assert.Equal(message.GetProperty("id").GetString(), stored.GetProperty("id").GetString());
        var home = await client2.GetFromJsonAsync<JsonElement>("/api/workspace/home");
        Assert.Equal(stored.GetProperty("id").GetString(), Assert.Single(home.GetProperty("messages").EnumerateArray()).GetProperty("id").GetString());
    }

    [Fact]
    public async Task Workspace_contains_admin_participant_in_persistent_main_conversation()
    {
        await using var w = await TestWorkspace.Create();
        var user = await w.Bootstrap();
        var response = await w.Client.GetAsync("/api/workspace/home");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var home = await response.Content.ReadFromJsonAsync<JsonElement>();
        var participant = Assert.Single(home.GetProperty("participants").EnumerateArray());
        Assert.Equal(user.GetProperty("participantId").GetString(), participant.GetProperty("id").GetString());
        Assert.Equal("human", participant.GetProperty("kind").GetString());
        Assert.Equal("active", participant.GetProperty("state").GetString());
        Assert.Equal("available", participant.GetProperty("availability").GetString());
        Assert.True(participant.GetProperty("isAdmin").GetBoolean());
        Assert.Equal("main", home.GetProperty("conversation").GetProperty("id").GetString());
        Assert.Equal("The Common Room", home.GetProperty("conversation").GetProperty("title").GetString());
        Assert.Equal(participant.GetProperty("id").GetString(), Assert.Single(home.GetProperty("conversation").GetProperty("participantIds").EnumerateArray()).GetString());
        Assert.Empty(home.GetProperty("messages").EnumerateArray());
        Assert.Empty((await w.Client.GetFromJsonAsync<JsonElement>("/api/conversations/main/messages")).EnumerateArray());
    }
}
