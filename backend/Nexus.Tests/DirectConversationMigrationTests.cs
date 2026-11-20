using Microsoft.EntityFrameworkCore;
using Nexus.Infrastructure;
using Npgsql;

namespace Nexus.Tests;

public class DirectConversationMigrationTests
{
    [Fact]
    public async Task Upgrade_preserves_public_data_and_enforces_direct_pair_shape_uniqueness_and_foreign_keys()
    {
        await using var w = await TestWorkspace.Create(false);
        await using var context = new NexusDb(new DbContextOptionsBuilder<NexusDb>().UseNpgsql(w.Connection).Options);
        await context.Database.MigrateAsync("20261113044904_PublicTopicalConversations");
        await using var db = new NpgsqlConnection(w.Connection);
        await db.OpenAsync();
        async Task Exec(string sql) { await using var cmd = new NpgsqlCommand(sql, db); await cmd.ExecuteNonQueryAsync(); }
        const string low = "00000000-0000-0000-0000-000000000001";
        const string high = "ffffffff-ffff-ffff-ffff-ffffffffffff";
        await Exec($"""
            INSERT INTO "Participants" ("Id","Name","Kind","State","Availability","IsAdmin") VALUES
            ('{low}','A','human','active','available',false),('{high}','B','human','active','available',false);
            INSERT INTO "Conversations" ("Id","Title","Kind","State","Description","CreatedAt","CreatedByParticipantId","ClientRequestId") VALUES
            ('main','Main','main','active','preserved',now(),NULL,NULL),
            ('topic','Topic','topical','active','preserved topic',now(),'{low}','{Guid.NewGuid()}');
            INSERT INTO "Memberships" VALUES ('main','{low}'),('topic','{low}');
            INSERT INTO "Messages" ("Id","ConversationId","AuthorId","ClientRequestId","Body","State","CreatedAt")
            VALUES ('{Guid.NewGuid()}','topic','{low}','{Guid.NewGuid()}','preserved message','delivered',now());
            """);
        await context.Database.MigrateAsync();
        string Insert(string id, string kind, string a, string b) => $"""
            INSERT INTO "Conversations" ("Id","Title","Kind","State","Description","CreatedAt","DirectParticipantLowId","DirectParticipantHighId")
            VALUES ('{id}','Neutral','{kind}','active','',now(),{a},{b})
            """;
        await Exec("BEGIN;" + Insert("direct", "direct", $"'{low}'", $"'{high}'") + $"; INSERT INTO \"Memberships\" VALUES ('direct','{low}'),('direct','{high}'); COMMIT;");
        foreach (var sql in new[] {
            Insert("duplicate", "direct", $"'{low}'", $"'{high}'"),
            Insert("reversed", "direct", $"'{high}'", $"'{low}'"),
            Insert("equal", "direct", $"'{low}'", $"'{low}'"),
            Insert("missing", "direct", "NULL", $"'{high}'"),
            Insert("publicpair", "main", $"'{low}'", $"'{high}'"),
            Insert("unknown", "direct", $"'{low}'", $"'{Guid.NewGuid()}'"),
            $"DELETE FROM \"Participants\" WHERE \"Id\" = '{high}'" })
            await Assert.ThrowsAsync<PostgresException>(() => Exec(sql));
        await using var check = new NpgsqlCommand("""
            SELECT (SELECT COUNT(*) FROM "Conversations"),
            (SELECT "Body" FROM "Messages"),
            (SELECT COUNT(*) FROM pg_constraint WHERE conname LIKE 'FK_Conversations_Participants_Direct%'),
            (SELECT COUNT(*) FROM pg_indexes WHERE indexname = 'IX_Conversations_DirectParticipantLowId_DirectParticipantHighId')
            """, db);
        await using var reader = await check.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        Assert.Equal(3, reader.GetInt64(0));
        Assert.Equal("preserved message", reader.GetString(1));
        Assert.Equal(2, reader.GetInt64(2));
        Assert.Equal(1, reader.GetInt64(3));
    }
}
