using System.Data.Common;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Nexus.Tests;

public class HomeSnapshotTests
{
    [Fact]
    public async Task Home_does_not_mix_participants_from_before_a_commit_with_messages_from_after_it()
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        var boundary = new PauseBeforeConversationQuery();
        using var homeHost = w.NewHost(boundary);
        using var homeClient = homeHost.CreateClient();
        await TestWorkspace.Csrf(homeClient);
        (await homeClient.PostAsJsonAsync("/api/auth/login", TestWorkspace.Credentials)).EnsureSuccessStatusCode();
        boundary.Arm();

        var homeRequest = homeClient.GetAsync("/api/workspace/home");
        await boundary.WaitUntilParticipantsWereRead();

        using var author = w.Host.CreateClient();
        await TestWorkspace.Csrf(author);
        var registration = await author.PostAsJsonAsync("/api/auth/register", new
        {
            email = "snapshot-author@example.test",
            displayName = "Snapshot Author",
            password = "Snapshot-author-passphrase!8"
        });
        registration.EnsureSuccessStatusCode();
        var registered = await registration.Content.ReadFromJsonAsync<JsonElement>();
        await TestWorkspace.Csrf(author);
        (await author.PostAsJsonAsync("/api/conversations/main/messages", new
        {
            body = "Committed between Home queries",
            clientRequestId = Guid.NewGuid()
        })).EnsureSuccessStatusCode();

        boundary.Release();
        var homeResponse = await homeRequest;
        homeResponse.EnsureSuccessStatusCode();
        var home = await homeResponse.Content.ReadFromJsonAsync<JsonElement>();
        var authorId = registered.GetProperty("participantId").GetGuid();
        var participantIds = home.GetProperty("participants").EnumerateArray().Select(p => p.GetProperty("id").GetGuid()).ToArray();
        var messageAuthorIds = home.GetProperty("messages").EnumerateArray().Select(m => m.GetProperty("authorId").GetGuid()).ToArray();

        Assert.DoesNotContain(authorId, participantIds);
        Assert.DoesNotContain(authorId, messageAuthorIds);
    }

    private sealed class PauseBeforeConversationQuery : DbCommandInterceptor
    {
        private readonly TaskCompletionSource reached = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly TaskCompletionSource released = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private volatile bool armed;
        private int paused;

        public void Arm() => armed = true;
        public Task WaitUntilParticipantsWereRead() => reached.Task.WaitAsync(TimeSpan.FromSeconds(10));
        public void Release() => released.TrySetResult();

        public override async ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
            DbCommand command,
            CommandEventData eventData,
            InterceptionResult<DbDataReader> result,
            CancellationToken cancellationToken = default)
        {
            if (armed && command.CommandText.Contains("FROM \"Conversations\"", StringComparison.Ordinal) && Interlocked.Exchange(ref paused, 1) == 0)
            {
                reached.TrySetResult();
                await released.Task.WaitAsync(cancellationToken);
            }

            return result;
        }
    }
}