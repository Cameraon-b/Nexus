using Microsoft.EntityFrameworkCore;
using Nexus.Domain;
using Nexus.Infrastructure;
using Npgsql;

namespace Nexus.Tests;

public class ApprovalPersistenceTests
{
    [Fact]
    public async Task Deferred_invariants_roll_back_partial_resolution_and_orphan_release()
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        var issued = await IntegrationInboxTests.Agent(w);
        var options = new DbContextOptionsBuilder<NexusDb>().UseNpgsql(w.Connection).Options;
        await using var db = new NexusDb(options);
        var agent = issued.GetProperty("agent").GetProperty("id").GetGuid();
        var draft = MessageDraft.Propose("main", agent, issued.GetProperty("token").GetProperty("id").GetGuid(), "Pending original", Guid.NewGuid(), null);
        db.MessageDrafts.Add(draft);
        await db.SaveChangesAsync();
        await using var connection = new NpgsqlConnection(w.Connection);
        await connection.OpenAsync();
        foreach (var sql in new[]
        {
            "UPDATE \"MessageDrafts\" SET \"State\"='approved', \"ResolvedAt\"=now() WHERE \"Id\"=@draft",
            "INSERT INTO \"Messages\" (\"Id\",\"ConversationId\",\"AuthorId\",\"Body\",\"State\",\"CreatedAt\",\"ClientRequestId\",\"SourceDraftId\",\"EditedBeforeRelease\") VALUES (gen_random_uuid(),'main',@agent,'Orphan','delivered',now(),gen_random_uuid(),@draft,false)"
        })
        {
            await using var tx = await connection.BeginTransactionAsync();
            await using var command = new NpgsqlCommand(sql, connection, tx);
            command.Parameters.AddWithValue("draft", draft.Id);
            command.Parameters.AddWithValue("agent", agent);
            await command.ExecuteNonQueryAsync(); // Intentionally legal until COMMIT.
            var error = await Assert.ThrowsAsync<PostgresException>(() => tx.CommitAsync());
            Assert.Equal(PostgresErrorCodes.CheckViolation, error.SqlState);
        }
        db.ChangeTracker.Clear();
        Assert.Equal("pending", (await db.MessageDrafts.SingleAsync()).State);
        Assert.Equal("Pending original", (await db.MessageDrafts.SingleAsync()).Body);
        Assert.Empty(await db.ApprovalDecisions.ToArrayAsync());
        Assert.Empty(await db.Messages.Where(m => m.AuthorId == agent).ToArrayAsync());
    }

    [Fact]
    public async Task Decisions_round_trip_with_unique_lineage_and_database_shape_guards()
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        var issued = await IntegrationInboxTests.Agent(w);
        var options = new DbContextOptionsBuilder<NexusDb>().UseNpgsql(w.Connection).Options;
        await using var db = new NexusDb(options);
        var agent = issued.GetProperty("agent").GetProperty("id").GetGuid();
        var reviewer = await db.Participants.SingleAsync(p => p.IsAdmin);
        var token = issued.GetProperty("token").GetProperty("id").GetGuid();
        foreach (var outcome in new[] { "approved", "approved_with_edits", "rejected" })
        {
            var draft = MessageDraft.Propose("main", agent, token, "Original", Guid.NewGuid(), null);
            db.MessageDrafts.Add(draft);
            await db.SaveChangesAsync();
            await using (var tx = await db.Database.BeginTransactionAsync())
            {
                var decision = draft.Resolve(reviewer.Id, outcome, outcome == "approved_with_edits" ? "Final" : null, "Private note", Guid.NewGuid());
                db.ApprovalDecisions.Add(decision);
                await db.SaveChangesAsync();
                await tx.CommitAsync();
            }
        }
        db.ChangeTracker.Clear();
        Assert.Equal(3, await db.ApprovalDecisions.CountAsync());
        Assert.Equal(2, await db.Messages.CountAsync(m => m.SourceDraftId != null));
        Assert.All(await db.MessageDrafts.ToArrayAsync(), d => { Assert.Equal("Original", d.Body); Assert.NotNull(d.ResolvedAt); });
        var edited = await db.ApprovalDecisions.Include(d => d.DeliveredMessage).SingleAsync(d => d.Outcome == "approved_with_edits");
        Assert.Equal("Final", edited.DeliveredMessage!.Body);
        Assert.True(edited.DeliveredMessage.EditedBeforeRelease);
        Assert.Equal(agent, edited.DeliveredMessage.AuthorId);
        await using var connection = new NpgsqlConnection(w.Connection);
        await connection.OpenAsync();
        foreach (var sql in new[]
        {
            "UPDATE \"MessageDrafts\" SET \"Body\"='Changed'",
            "UPDATE \"ApprovalDecisions\" SET \"Reason\"='Changed'",
            "UPDATE \"Messages\" SET \"SourceDraftId\"=NULL WHERE \"SourceDraftId\" IS NOT NULL",
            "UPDATE \"MessageDrafts\" SET \"State\"='pending', \"ResolvedAt\"=NULL",
            "DELETE FROM \"ApprovalDecisions\"",
            "UPDATE \"ApprovalDecisions\" SET \"DeliveredMessageId\"=NULL WHERE \"Outcome\"='approved'"
        })
        {
            await using var command = new NpgsqlCommand(sql, connection);
            await Assert.ThrowsAsync<PostgresException>(() => command.ExecuteNonQueryAsync());
        }
    }
}
