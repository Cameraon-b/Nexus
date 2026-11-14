using System.Data.Common;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Npgsql;

namespace Nexus.Tests;

public class TopicalConversationApiTests
{
    private static readonly object Human = new
    {
        email = "human@example.test",
        displayName = "Local Human",
        password = "Human-only-long-passphrase!8"
    };

    [Fact]
    public async Task Create_is_atomic_idempotent_and_additive_in_home()
    {
        await using var w = await TestWorkspace.Create();
        var admin = await w.Bootstrap();
        using var secondHost = w.NewHost();
        using var second = secondHost.CreateClient();
        await TestWorkspace.Csrf(second);
        var humanResponse = await second.PostAsJsonAsync("/api/auth/register", Human);
        humanResponse.EnsureSuccessStatusCode();
        var human = await humanResponse.Content.ReadFromJsonAsync<JsonElement>();
        await TestWorkspace.Csrf(second);

        var requestId = Guid.NewGuid();
        var payload = new { title = "  Product Ideas  ", description = "  Focused proposals  ", openingMessage = "  Start here  ", clientRequestId = requestId };
        var responses = await Task.WhenAll(
            w.Client.PostAsJsonAsync("/api/conversations/topical", payload),
            w.Client.PostAsJsonAsync("/api/conversations/topical", payload));

        foreach (var response in responses) Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var first = await responses[0].Content.ReadFromJsonAsync<JsonElement>();
        var retry = await responses[1].Content.ReadFromJsonAsync<JsonElement>();
        var conversation = first.GetProperty("conversation");
        var opening = first.GetProperty("openingMessage");
        Assert.Equal(conversation.GetProperty("id").GetString(), retry.GetProperty("conversation").GetProperty("id").GetString());
        Assert.Equal(opening.GetProperty("id").GetString(), retry.GetProperty("openingMessage").GetProperty("id").GetString());
        Assert.Equal("Product Ideas", conversation.GetProperty("title").GetString());
        Assert.Equal("Focused proposals", conversation.GetProperty("description").GetString());
        Assert.Equal("topical", conversation.GetProperty("kind").GetString());
        Assert.Equal("active", conversation.GetProperty("state").GetString());
        Assert.Equal(32, conversation.GetProperty("id").GetString()!.Length);
        Assert.True(conversation.GetProperty("createdAt").TryGetDateTimeOffset(out _));
        var participantIds = conversation.GetProperty("participantIds").EnumerateArray().Select(x => x.GetGuid()).Order().ToArray();
        Assert.Equal(new[] { admin.GetProperty("participantId").GetGuid(), human.GetProperty("participantId").GetGuid() }.Order().ToArray(), participantIds);
        Assert.Equal("Start here", opening.GetProperty("body").GetString());
        Assert.Equal(conversation.GetProperty("id").GetString(), opening.GetProperty("conversationId").GetString());

        var home = await w.Client.GetFromJsonAsync<JsonElement>("/api/workspace/home");
        Assert.Equal("main", home.GetProperty("conversation").GetProperty("id").GetString());
        Assert.Empty(home.GetProperty("messages").EnumerateArray());
        var listed = home.GetProperty("conversations").EnumerateArray().ToArray();
        Assert.Equal(2, listed.Length);
        Assert.Contains(listed, item => item.GetProperty("id").GetString() == conversation.GetProperty("id").GetString());

        await using var db = new NpgsqlConnection(w.Connection);
        await db.OpenAsync();
        await using var command = new NpgsqlCommand("""
            SELECT
              (SELECT COUNT(*) FROM "Conversations" WHERE "Kind" = 'topical'),
              (SELECT COUNT(*) FROM "Memberships" WHERE "ConversationId" <> 'main'),
              (SELECT COUNT(*) FROM "Messages" WHERE "ConversationId" <> 'main')
            """, db);
        await using var reader = await command.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        Assert.Equal(1L, reader.GetInt64(0));
        Assert.Equal(2L, reader.GetInt64(1));
        Assert.Equal(1L, reader.GetInt64(2));
    }

    [Fact]
    public async Task Changed_topical_retry_is_conflict_without_partial_rows()
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        var requestId = Guid.NewGuid();
        (await w.Client.PostAsJsonAsync("/api/conversations/topical", new { title = "Topic", description = "One", openingMessage = "Opening", clientRequestId = requestId })).EnsureSuccessStatusCode();

        var changed = await w.Client.PostAsJsonAsync("/api/conversations/topical", new { title = "Topic", description = "Two", openingMessage = "Opening", clientRequestId = requestId });

        Assert.Equal(HttpStatusCode.Conflict, changed.StatusCode);
        var home = await w.Client.GetFromJsonAsync<JsonElement>("/api/workspace/home");
        Assert.Equal(2, home.GetProperty("conversations").GetArrayLength());
    }

    [Fact]
    public async Task Topical_creation_request_id_cannot_be_reused_as_same_opening_message_retry()
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        var requestId = Guid.NewGuid();
        var createdResponse = await w.Client.PostAsJsonAsync("/api/conversations/topical", new
        {
            title = "Topic",
            description = "",
            openingMessage = "Same body",
            clientRequestId = requestId
        });
        createdResponse.EnsureSuccessStatusCode();
        var created = await createdResponse.Content.ReadFromJsonAsync<JsonElement>();
        var conversationId = created.GetProperty("conversation").GetProperty("id").GetString()!;
        var openingId = created.GetProperty("openingMessage").GetProperty("id").GetGuid();

        var reused = await w.Client.PostAsJsonAsync($"/api/conversations/{conversationId}/messages", new
        {
            body = "Same body",
            clientRequestId = requestId
        });

        Assert.Equal(HttpStatusCode.Conflict, reused.StatusCode);
        var messages = await w.Client.GetFromJsonAsync<JsonElement>($"/api/conversations/{conversationId}/messages");
        var onlyMessage = Assert.Single(messages.EnumerateArray());
        Assert.Equal(openingId, onlyMessage.GetProperty("id").GetGuid());
    }

    [Theory]
    [InlineData("", "", "Opening", true)]
    [InlineData(" ", "", "Opening", true)]
    [InlineData("81", "", "Opening", true)]
    [InlineData("Topic", "161", "Opening", true)]
    [InlineData("Topic", "", "", true)]
    [InlineData("Topic", "", "5001", true)]
    [InlineData("Topic", "", "Opening", false)]
    public async Task Invalid_topical_request_is_bad_request_without_rows(string title, string description, string opening, bool nonemptyRequestId)
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        title = title == "81" ? new string('t', 81) : title;
        description = description == "161" ? new string('d', 161) : description;
        opening = opening == "5001" ? new string('m', 5001) : opening;

        var response = await w.Client.PostAsJsonAsync("/api/conversations/topical", new { title, description, openingMessage = opening, clientRequestId = nonemptyRequestId ? Guid.NewGuid() : Guid.Empty });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var home = await w.Client.GetFromJsonAsync<JsonElement>("/api/workspace/home");
        Assert.Single(home.GetProperty("conversations").EnumerateArray());
    }

    [Fact]
    public async Task Generic_messages_require_membership_distinguish_unknown_and_reject_cross_conversation_request_reuse()
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        var first = await CreateTopic(w.Client, "First");
        var second = await CreateTopic(w.Client, "Second");
        var firstId = first.GetProperty("conversation").GetProperty("id").GetString()!;
        var secondId = second.GetProperty("conversation").GetProperty("id").GetString()!;
        var requestId = Guid.NewGuid();

        var posted = await w.Client.PostAsJsonAsync($"/api/conversations/{firstId}/messages", new { body = "  Follow-up  ", clientRequestId = requestId, authorId = Guid.NewGuid() });
        Assert.Equal(HttpStatusCode.OK, posted.StatusCode);
        var message = await posted.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(firstId, message.GetProperty("conversationId").GetString());
        Assert.Equal("Follow-up", message.GetProperty("body").GetString());
        var read = await w.Client.GetFromJsonAsync<JsonElement>($"/api/conversations/{firstId}/messages");
        Assert.Equal(2, read.GetArrayLength());

        var reused = await w.Client.PostAsJsonAsync($"/api/conversations/{secondId}/messages", new { body = "Follow-up", clientRequestId = requestId });
        Assert.Equal(HttpStatusCode.Conflict, reused.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await w.Client.GetAsync($"/api/conversations/{Guid.NewGuid():N}/messages")).StatusCode);

        await using var db = new NpgsqlConnection(w.Connection);
        await db.OpenAsync();
        await using (var command = new NpgsqlCommand("DELETE FROM \"Memberships\" WHERE \"ConversationId\" = @id", db))
        {
            command.Parameters.AddWithValue("id", firstId);
            await command.ExecuteNonQueryAsync();
        }
        Assert.Equal(HttpStatusCode.Forbidden, (await w.Client.GetAsync($"/api/conversations/{firstId}/messages")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await w.Client.PostAsJsonAsync($"/api/conversations/{firstId}/messages", new { body = "No access", clientRequestId = Guid.NewGuid() })).StatusCode);
    }

    [Fact]
    public async Task Registration_joins_main_and_all_existing_active_public_topics()
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        var first = await CreateTopic(w.Client, "First");
        var second = await CreateTopic(w.Client, "Second");
        using var human = w.Host.CreateClient();
        await TestWorkspace.Csrf(human);
        (await human.PostAsJsonAsync("/api/auth/register", Human)).EnsureSuccessStatusCode();

        var home = await human.GetFromJsonAsync<JsonElement>("/api/workspace/home");
        Assert.Equal(3, home.GetProperty("conversations").GetArrayLength());
        foreach (var topic in new[] { first, second })
        {
            var id = topic.GetProperty("conversation").GetProperty("id").GetString();
            Assert.Equal(HttpStatusCode.OK, (await human.GetAsync($"/api/conversations/{id}/messages")).StatusCode);
        }
    }

    [Fact]
    public async Task Registration_racing_topical_creation_never_misses_membership()
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        using var creatorHost = w.NewHost();
        using var registrationHost = w.NewHost();
        using var creator = creatorHost.CreateClient();
        using var human = registrationHost.CreateClient();
        await TestWorkspace.Csrf(creator);
        await TestWorkspace.Csrf(human);
        (await creator.PostAsJsonAsync("/api/auth/login", TestWorkspace.Credentials)).EnsureSuccessStatusCode();
        await TestWorkspace.Csrf(creator);

        var responses = await Task.WhenAll(
            creator.PostAsJsonAsync("/api/conversations/topical", new { title = "Racing Topic", description = "", openingMessage = "Opening", clientRequestId = Guid.NewGuid() }),
            human.PostAsJsonAsync("/api/auth/register", Human));

        foreach (var response in responses) response.EnsureSuccessStatusCode();
        var topic = await responses[0].Content.ReadFromJsonAsync<JsonElement>();
        var id = topic.GetProperty("conversation").GetProperty("id").GetString();
        Assert.Equal(HttpStatusCode.OK, (await human.GetAsync($"/api/conversations/{id}/messages")).StatusCode);
    }

    [Fact]
    public async Task Message_post_racing_topical_creation_with_same_request_id_has_one_success_and_one_conflict()
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        var boundary = new SynchronizeMessageIdempotencyReads();
        using var messageHost = w.NewHost(boundary);
        using var topicalHost = w.NewHost(boundary);
        using var messageClient = messageHost.CreateClient();
        using var topicalClient = topicalHost.CreateClient();
        foreach (var client in new[] { messageClient, topicalClient })
        {
            await TestWorkspace.Csrf(client);
            (await client.PostAsJsonAsync("/api/auth/login", TestWorkspace.Credentials)).EnsureSuccessStatusCode();
            await TestWorkspace.Csrf(client);
        }

        boundary.Arm();
        var requestId = Guid.NewGuid();
        var responses = await Task.WhenAll(
            messageClient.PostAsJsonAsync("/api/conversations/main/messages", new { body = "Ordinary message", clientRequestId = requestId }),
            topicalClient.PostAsJsonAsync("/api/conversations/topical", new { title = "Racing topic", description = "", openingMessage = "Opening message", clientRequestId = requestId }));

        Assert.Equal(new[] { HttpStatusCode.OK, HttpStatusCode.Conflict }, responses.Select(r => r.StatusCode).Order().ToArray());
        await using var db = new NpgsqlConnection(w.Connection);
        await db.OpenAsync();
        await using var command = new NpgsqlCommand("""
            SELECT
              (SELECT COUNT(*) FROM "Messages" WHERE "AuthorId" = @author AND "ClientRequestId" = @request),
              (SELECT COUNT(*) FROM "Conversations" WHERE "CreatedByParticipantId" = @author AND "ClientRequestId" = @request),
              (SELECT COUNT(*) FROM "Memberships" WHERE "ConversationId" IN (
                  SELECT "Id" FROM "Conversations" WHERE "CreatedByParticipantId" = @author AND "ClientRequestId" = @request))
            """, db);
        var me = await w.Client.GetFromJsonAsync<JsonElement>("/api/auth/me");
        command.Parameters.AddWithValue("author", me.GetProperty("participantId").GetGuid());
        command.Parameters.AddWithValue("request", requestId);
        await using var reader = await command.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        Assert.Equal(1L, reader.GetInt64(0));
        var conversationCount = reader.GetInt64(1);
        var membershipCount = reader.GetInt64(2);
        Assert.True((conversationCount, membershipCount) is (0, 0) or (1, 1));
    }

    [Fact]
    public async Task Topical_conversation_and_messages_persist_across_restart()
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        var created = await CreateTopic(w.Client, "Durable");
        var id = created.GetProperty("conversation").GetProperty("id").GetString()!;
        (await w.Client.PostAsJsonAsync($"/api/conversations/{id}/messages", new { body = "Persist me", clientRequestId = Guid.NewGuid() })).EnsureSuccessStatusCode();

        using var host2 = w.NewHost();
        using var client2 = host2.CreateClient();
        await TestWorkspace.Csrf(client2);
        (await client2.PostAsJsonAsync("/api/auth/login", TestWorkspace.Credentials)).EnsureSuccessStatusCode();
        var messages = await client2.GetFromJsonAsync<JsonElement>($"/api/conversations/{id}/messages");
        Assert.Equal(2, messages.GetArrayLength());
        var home = await client2.GetFromJsonAsync<JsonElement>("/api/workspace/home");
        Assert.Contains(home.GetProperty("conversations").EnumerateArray(), c => c.GetProperty("id").GetString() == id);
    }

    private static async Task<JsonElement> CreateTopic(HttpClient client, string title)
    {
        var response = await client.PostAsJsonAsync("/api/conversations/topical", new { title, description = "", openingMessage = $"Opening {title}", clientRequestId = Guid.NewGuid() });
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }

    private sealed class SynchronizeMessageIdempotencyReads : DbCommandInterceptor
    {
        private readonly TaskCompletionSource bothLocksReached = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly TaskCompletionSource bothReached = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private volatile bool armed;
        private int locksReached;
        private int reached;

        public void Arm() => armed = true;

        public override async ValueTask<InterceptionResult<int>> NonQueryExecutingAsync(
            DbCommand command,
            CommandEventData eventData,
            InterceptionResult<int> result,
            CancellationToken cancellationToken = default)
        {
            if (armed
                && command.CommandText.Contains("pg_advisory_xact_lock", StringComparison.Ordinal)
                && Interlocked.Increment(ref locksReached) <= 2)
            {
                if (Volatile.Read(ref locksReached) == 2) bothLocksReached.TrySetResult();
                await bothLocksReached.Task.WaitAsync(TimeSpan.FromSeconds(10), cancellationToken);
            }

            return result;
        }

        public override async ValueTask<DbDataReader> ReaderExecutedAsync(
            DbCommand command,
            CommandExecutedEventData eventData,
            DbDataReader result,
            CancellationToken cancellationToken = default)
        {
            if (armed
                && command.CommandText.Contains("FROM \"Messages\"", StringComparison.Ordinal)
                && command.CommandText.Contains("\"AuthorId\"", StringComparison.Ordinal)
                && command.CommandText.Contains("\"ClientRequestId\"", StringComparison.Ordinal)
                && Interlocked.Increment(ref reached) <= 2)
            {
                if (Volatile.Read(ref reached) == 2) bothReached.TrySetResult();
                await Task.WhenAny(bothReached.Task, Task.Delay(TimeSpan.FromMilliseconds(500), cancellationToken));
            }

            return result;
        }
    }
}
