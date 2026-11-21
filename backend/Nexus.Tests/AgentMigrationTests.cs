using Microsoft.EntityFrameworkCore;
using Nexus.Application;
using Nexus.Infrastructure;
using Npgsql;

namespace Nexus.Tests;

public class AgentMigrationTests
{
    [Fact]
    public async Task Upgrade_preserves_pre_sprint_data_and_downgrade_handles_real_agent_pair_token_draft_cursor_rows()
    {
        await using var w = await TestWorkspace.Create(false);
        var options = new DbContextOptionsBuilder<NexusDb>().UseNpgsql(w.Connection).Options;
        await using var context = new NexusDb(options);
        const string previous = "20261120041404_DirectConversations";
        await context.Database.MigrateAsync(previous);
        var humanId = Guid.NewGuid();
        var otherId = Guid.NewGuid();
        await using var db = new NpgsqlConnection(w.Connection);
        await db.OpenAsync();
        await using (var seed = new NpgsqlCommand("""
            INSERT INTO "Participants" ("Id","Name","Kind","State","Availability","IsAdmin") VALUES
            (@human,'Preserved','human','active','available',false),(@other,'Other','human','active','available',false);
            INSERT INTO "Conversations" ("Id","Title","Kind","State","Description","CreatedAt") VALUES ('main','Main','main','active','Preserved',now());
            INSERT INTO "Memberships" VALUES ('main',@human),('main',@other);
            INSERT INTO "Messages" ("Id","ConversationId","AuthorId","Body","State","CreatedAt","ClientRequestId") VALUES (@message,'main',@human,'Preserved body','delivered',now(),@request);
            """, db))
        {
            seed.Parameters.AddWithValue("human", humanId);
            seed.Parameters.AddWithValue("other", otherId);
            seed.Parameters.AddWithValue("message", Guid.NewGuid());
            seed.Parameters.AddWithValue("request", Guid.NewGuid());
            await seed.ExecuteNonQueryAsync();
        }
        await using (var topic = new NpgsqlCommand("""
            INSERT INTO "Conversations" ("Id","Title","Kind","State","Description","CreatedAt","CreatedByParticipantId","ClientRequestId") VALUES ('topic','Topic','topical','active','Preserved topic',now(),@human,gen_random_uuid());
            INSERT INTO "Conversations" ("Id","Title","Kind","State","Description","CreatedAt","DirectParticipantLowId","DirectParticipantHighId") VALUES ('human-dm','Private','direct','active','',now(),least(@human,@other),greatest(@human,@other));
            INSERT INTO "Memberships" VALUES ('topic',@human),('topic',@other),('human-dm',@human),('human-dm',@other);
            INSERT INTO "Messages" ("Id","ConversationId","AuthorId","Body","State","CreatedAt","ClientRequestId") VALUES (gen_random_uuid(),'human-dm',@human,'Preserved private','delivered',now(),gen_random_uuid());
            """, db))
        {
            topic.Parameters.AddWithValue("human", humanId);
            topic.Parameters.AddWithValue("other", otherId);
            await topic.ExecuteNonQueryAsync();
        }
        await context.Database.MigrateAsync();
        var workspace = new WorkspaceStore(context);
        var agents = new AgentStore(context);
        var created = await agents.Create(new("Helper", "Migration test", "Connector"));
        var pair = await workspace.CreateDirect(humanId, new(created.Agent.Id));
        var source = await workspace.Post(pair.Id, humanId, new("Queued", Guid.NewGuid()));
        var integrations = new IntegrationStore(context);
        var authorization = "Bearer " + created.RawToken;
        var draft = await integrations.Propose(authorization, new(pair.Id, "Pending", Guid.NewGuid(), source.Id));
        await integrations.Inbox(authorization, null, 1);
        Assert.Equal(1, await context.MessageDrafts.CountAsync());
        Assert.Equal(1, await context.InboxCursors.CountAsync());
        Assert.Equal("pending", draft.State);
        context.ChangeTracker.Clear();
        await context.Database.MigrateAsync(previous);
        await using var check = new NpgsqlCommand("""
            SELECT (SELECT count(*) FROM "__EFMigrationsHistory"),
                (SELECT count(*) FROM "Conversations" WHERE "Kind"='direct'),
                (SELECT count(*) FROM "Messages" WHERE "Body" IN ('Preserved body','Preserved private')),
                to_regclass('"MessageDrafts"') IS NULL,
                to_regclass('"IntegrationTokens"') IS NULL,
                to_regclass('"InboxCursors"') IS NULL,
                (SELECT count(*) FROM "Participants" WHERE "Kind"='agent'),
                (SELECT count(*) FROM "Memberships" WHERE "ParticipantId"=@agent),
                (SELECT count(*) FROM information_schema.columns WHERE table_name='Participants' AND column_name='Description'),
                (SELECT count(*) FROM "Participants" WHERE "Id" IN (@human,@other) AND "Kind"='human'),
                (SELECT count(*) FROM "Memberships" WHERE "ParticipantId" IN (@human,@other)),
                (SELECT count(*) FROM "Conversations" WHERE "Id" IN ('main','topic') AND "State"='active')
            """, db);
        check.Parameters.AddWithValue("agent", created.Agent.Id);
        check.Parameters.AddWithValue("human", humanId);
        check.Parameters.AddWithValue("other", otherId);
        await using var reader = await check.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        Assert.Equal(6, reader.GetInt64(0));
        Assert.Equal(1, reader.GetInt64(1));
        Assert.Equal(2, reader.GetInt64(2));
        Assert.True(reader.GetBoolean(3));
        Assert.True(reader.GetBoolean(4));
        Assert.True(reader.GetBoolean(5));
        Assert.Equal(0, reader.GetInt64(6));
        Assert.Equal(0, reader.GetInt64(7));
        Assert.Equal(0, reader.GetInt64(8));
        Assert.Equal(2, reader.GetInt64(9));
        Assert.Equal(6, reader.GetInt64(10));
        Assert.Equal(2, reader.GetInt64(11));
    }
}
