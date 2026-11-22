using System.Data.Common;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Nexus.Infrastructure;

namespace Nexus.Tests;

public class ApprovalRaceTests
{
    [Theory]
    [InlineData("reviewer")]
    [InlineData("agent")]
    [InlineData("access")]
    public async Task State_change_after_cookie_resolution_before_delivery_locks_wins(string change)
    {
        await using var w = await TestWorkspace.Create();
        var admin = await w.Bootstrap();
        var agent = await IntegrationInboxTests.Agent(w);
        var id = await ApprovalApiTests.Propose(w, agent);
        var pause = new BeforeParticipants();
        using var host = w.NewHost(pause);
        using var client = host.CreateClient();
        await TestWorkspace.Csrf(client);
        (await client.PostAsJsonAsync("/api/auth/login", TestWorkspace.Credentials)).EnsureSuccessStatusCode();
        await TestWorkspace.Csrf(client);
        pause.Armed = true;
        var request = client.PostAsJsonAsync($"/api/admin/approvals/{id}/decision", new { outcome = "approved", clientRequestId = Guid.NewGuid() });
        try
        {
            await pause.Reached.Task.WaitAsync(TimeSpan.FromSeconds(15));
            await using var db = new NexusDb(new DbContextOptionsBuilder<NexusDb>().UseNpgsql(w.Connection).Options);
            var aid = agent.GetProperty("agent").GetProperty("id").GetGuid();
            if (change == "reviewer") await db.Participants.Where(p => p.Id == admin.GetProperty("participantId").GetGuid()).ExecuteUpdateAsync(s => s.SetProperty(p => p.IsAdmin, false));
            if (change == "agent") await db.Participants.Where(p => p.Id == aid).ExecuteUpdateAsync(s => s.SetProperty(p => p.State, "inactive"));
            if (change == "access") await db.Memberships.Where(m => m.ParticipantId == aid && m.ConversationId == "main").ExecuteDeleteAsync();
        }
        finally { pause.Release.TrySetResult(); }
        Assert.Equal(change == "reviewer" ? HttpStatusCode.Forbidden : HttpStatusCode.Conflict, (await request).StatusCode);
        await using var verify = new NexusDb(new DbContextOptionsBuilder<NexusDb>().UseNpgsql(w.Connection).Options);
        Assert.Equal("pending", (await verify.MessageDrafts.SingleAsync(d => d.Id == id)).State);
        Assert.False(await verify.ApprovalDecisions.AnyAsync());
        Assert.False(await verify.Messages.AnyAsync(m => m.SourceDraftId == id));
    }

    [Fact]
    public async Task Concurrent_exact_retries_return_identical_persisted_result()
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        var id = await ApprovalApiTests.Propose(w, await IntegrationInboxTests.Agent(w));
        var payload = new { outcome = "approved", clientRequestId = Guid.NewGuid() };
        var responses = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => w.Client.PostAsJsonAsync($"/api/admin/approvals/{id}/decision", payload)));
        foreach (var response in responses) Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Single((await Task.WhenAll(responses.Select(r => r.Content.ReadAsStringAsync()))).Distinct());
    }

    [Fact]
    public async Task Response_materialization_failure_rolls_back_before_commit()
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        var id = await ApprovalApiTests.Propose(w, await IntegrationInboxTests.Agent(w));
        using var host = w.NewHost(new FailDecisionReload());
        using var client = host.CreateClient();
        await TestWorkspace.Csrf(client);
        (await client.PostAsJsonAsync("/api/auth/login", TestWorkspace.Credentials)).EnsureSuccessStatusCode();
        await TestWorkspace.Csrf(client);
        var response = await client.PostAsJsonAsync($"/api/admin/approvals/{id}/decision", new { outcome = "approved", clientRequestId = Guid.NewGuid() });
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        await using var db = new NexusDb(new DbContextOptionsBuilder<NexusDb>().UseNpgsql(w.Connection).Options);
        Assert.Equal("pending", (await db.MessageDrafts.SingleAsync(d => d.Id == id)).State);
        Assert.False(await db.ApprovalDecisions.AnyAsync());
        Assert.False(await db.Messages.AnyAsync(m => m.SourceDraftId == id));
    }

    private sealed class FailDecisionReload : DbCommandInterceptor
    {
        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result, CancellationToken cancellationToken = default)
        {
            if (command.CommandText.Contains("FROM \"ApprovalDecisions\"", StringComparison.Ordinal) && command.CommandText.Contains("WHERE a.\"Id\" =", StringComparison.Ordinal))
                throw new InvalidOperationException("Test-only response materialization failure");
            return ValueTask.FromResult(result);
        }
    }

    private sealed class BeforeParticipants : DbCommandInterceptor
    {
        public bool Armed;
        public TaskCompletionSource Reached { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Release { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public override async ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result, CancellationToken cancellationToken = default)
        {
            if (Armed && command.CommandText.Contains("FROM \"Participants\"", StringComparison.Ordinal) && command.CommandText.Contains("FOR SHARE", StringComparison.Ordinal))
            {
                Reached.TrySetResult();
                await Release.Task.WaitAsync(cancellationToken);
            }
            return result;
        }
    }
}
