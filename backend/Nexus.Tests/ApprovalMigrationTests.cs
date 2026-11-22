using Microsoft.EntityFrameworkCore;
using Nexus.Domain;
using Nexus.Infrastructure;
using Npgsql;

namespace Nexus.Tests;

public class ApprovalMigrationTests
{
    [Fact]
    public async Task Upgrade_keeps_existing_pending_row_exactly_and_downgrade_keeps_it_after_all_outcomes()
    {
        await using var w = await TestWorkspace.Create(false);
        var options = new DbContextOptionsBuilder<NexusDb>().UseNpgsql(w.Connection).Options;
        await using var db = new NexusDb(options);
        const string previous = "20261121060535_ParticipantInboxCursors";
        await db.Database.MigrateAsync(previous);
        var pending = Guid.NewGuid();
        var agent = Guid.NewGuid();
        var human = Guid.NewGuid();
        var token = Guid.NewGuid();
        await using var connection = new NpgsqlConnection(w.Connection);
        await connection.OpenAsync();
        await using (var seed = new NpgsqlCommand("""
            INSERT INTO "Participants" ("Id","Name","Kind","State","Availability","IsAdmin","Description") VALUES
                (@human,'Reviewer','human','active','available',true,''),(@agent,'Agent','agent','active','unknown',false,'');
            INSERT INTO "Accounts" ("Id","Email","DisplayName","PasswordHash","ParticipantId","IsAdmin") VALUES
                (gen_random_uuid(),'migration@example.test','Reviewer','test-only-not-a-password-hash',@human,true);
            INSERT INTO "Conversations" ("Id","Title","Kind","State","Description","CreatedAt") VALUES ('main','Main','main','active','',now());
            INSERT INTO "Memberships" VALUES ('main',@human),('main',@agent);
            INSERT INTO "IntegrationTokens" ("Id","ParticipantId","Label","TokenHash","State","CreatedAt") VALUES
                (@token,@agent,'Test only',repeat('A',64),'active',now());
            INSERT INTO "Messages" ("Id","ConversationId","AuthorId","Body","State","CreatedAt","ClientRequestId") VALUES
                (gen_random_uuid(),'main',@human,'Preserved human message','delivered',now(),gen_random_uuid());
            INSERT INTO "MessageDrafts" ("Id","ConversationId","AuthorId","SubmittedTokenId","ClientRequestId","SourceMessageId","Body","State","CreatedAt") VALUES
                (@draft,'main',@agent,@token,gen_random_uuid(),(SELECT "Id" FROM "Messages" LIMIT 1),'Preserved pending proposal','pending',now());
            """, connection))
        {
            seed.Parameters.AddWithValue("human", human);
            seed.Parameters.AddWithValue("agent", agent);
            seed.Parameters.AddWithValue("token", token);
            seed.Parameters.AddWithValue("draft", pending);
            await seed.ExecuteNonQueryAsync();
        }
        async Task<string> Snapshot(bool upgraded)
        {
            var sql = upgraded
                ? "SELECT (to_jsonb(d) - 'ResolvedAt')::text FROM \"MessageDrafts\" d WHERE \"Id\"=@id"
                : "SELECT to_jsonb(d)::text FROM \"MessageDrafts\" d WHERE \"Id\"=@id";
            await using var command = new NpgsqlCommand(sql, connection);
            command.Parameters.AddWithValue("id", pending);
            return (string)(await command.ExecuteScalarAsync())!;
        }
        var before = await Snapshot(false);
        await db.Database.MigrateAsync();
        Assert.Equal(before, await Snapshot(true));
        Assert.Null((await db.MessageDrafts.SingleAsync()).ResolvedAt);
        foreach (var outcome in new[] { "approved", "approved_with_edits", "rejected" })
        {
            var draft = MessageDraft.Propose("main", agent, token, "Feature proposal", Guid.NewGuid(), null);
            db.MessageDrafts.Add(draft);
            await db.SaveChangesAsync();
            await using var tx = await db.Database.BeginTransactionAsync();
            db.ApprovalDecisions.Add(draft.Resolve(human, outcome, outcome == "approved_with_edits" ? "Feature final" : null, "Private note", Guid.NewGuid()));
            await db.SaveChangesAsync();
            await tx.CommitAsync();
        }
        db.ChangeTracker.Clear();
        await db.Database.MigrateAsync(previous);
        Assert.Equal(before, await Snapshot(false));
        await using (var check = new NpgsqlCommand("""
            SELECT (SELECT count(*) FROM "MessageDrafts"),
                (SELECT count(*) FROM "Messages"),
                (SELECT count(*) FROM "Participants"),
                (SELECT count(*) FROM "Accounts"),
                (SELECT count(*) FROM "IntegrationTokens"),
                (SELECT count(*) FROM "Memberships"),
                (SELECT count(*) FROM "__EFMigrationsHistory"),
                to_regclass('"ApprovalDecisions"') IS NULL
            """, connection))
        await using (var reader = await check.ExecuteReaderAsync())
        {
            Assert.True(await reader.ReadAsync());
            Assert.Equal(1, reader.GetInt64(0));
            Assert.Equal(3, reader.GetInt64(1));
            Assert.Equal(2, reader.GetInt64(2));
            Assert.Equal(1, reader.GetInt64(3));
            Assert.Equal(1, reader.GetInt64(4));
            Assert.Equal(2, reader.GetInt64(5));
            Assert.Equal(10, reader.GetInt64(6));
            Assert.True(reader.GetBoolean(7));
        }
        await db.Database.MigrateAsync();
        Assert.Equal(before, await Snapshot(true));
        Assert.Empty(await db.ApprovalDecisions.ToArrayAsync());
        Assert.All(await db.Messages.ToArrayAsync(), m => { Assert.Null(m.SourceDraftId); Assert.False(m.EditedBeforeRelease); });
    }
}
