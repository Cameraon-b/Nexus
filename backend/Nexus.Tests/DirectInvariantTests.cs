using Microsoft.EntityFrameworkCore;
using Nexus.Infrastructure;
using Npgsql;

namespace Nexus.Tests;

public class DirectInvariantTests
{
    private const string A = "00000000-0000-0000-0000-000000000001";
    private const string B = "00000000-0000-0000-0000-000000000002";
    private const string C = "00000000-0000-0000-0000-000000000003";
    private static string Pair => $"""
        INSERT INTO "Conversations" ("Id","Title","Kind","State","Description","CreatedAt","DirectParticipantLowId","DirectParticipantHighId")
        VALUES ('dm','Private','direct','active','',now(),'{A}','{B}');
        INSERT INTO "Memberships" VALUES ('dm','{A}'),('dm','{B}');
        """;

    [Theory]
    [InlineData("extra")]
    [InlineData("missing")]
    [InlineData("nonpair")]
    [InlineData("inactive")]
    [InlineData("service")]
    [InlineData("agent-agent")]
    [InlineData("truncate")]
    public async Task Commit_rejects_invalid_direct_authorization(string mutation)
    {
        await using var w = await TestWorkspace.Create(false);
        await using var context = new NexusDb(new DbContextOptionsBuilder<NexusDb>().UseNpgsql(w.Connection).Options);
        await context.Database.MigrateAsync();
        await using var db = new NpgsqlConnection(w.Connection);
        await db.OpenAsync();
        await Exec(db, $"""
            INSERT INTO "Participants" ("Id","Name","Kind","State","Availability","IsAdmin") VALUES
            ('{A}','A','human','active','available',false),('{B}','B','human','active','available',false),('{C}','C','human','active','available',false);
            """);
        await Exec(db, "BEGIN;" + Pair + "COMMIT;");
        var sql = mutation switch
        {
            "extra" => $"INSERT INTO \"Memberships\" VALUES ('dm','{C}')",
            "missing" => $"DELETE FROM \"Memberships\" WHERE \"ConversationId\"='dm' AND \"ParticipantId\"='{B}'",
            "nonpair" => $"UPDATE \"Memberships\" SET \"ParticipantId\"='{C}' WHERE \"ConversationId\"='dm' AND \"ParticipantId\"='{B}'",
            "truncate" => "TRUNCATE TABLE \"Memberships\"",
            "inactive" => $"UPDATE \"Participants\" SET \"State\"='inactive' WHERE \"Id\"='{B}'",
            "agent-agent" => $"UPDATE \"Participants\" SET \"Kind\"='agent' WHERE \"Id\" IN ('{A}','{B}')",
            _ => $"UPDATE \"Participants\" SET \"Kind\"='service' WHERE \"Id\"='{B}'"
        };
        var error = await Assert.ThrowsAsync<PostgresException>(() => Exec(db, "BEGIN;" + sql + "; COMMIT;"));
        Assert.Equal(PostgresErrorCodes.CheckViolation, error.SqlState);
    }

    [Fact]
    public async Task Repeatable_read_cannot_deactivate_a_pair_created_after_its_snapshot()
    {
        await using var w = await TestWorkspace.Create(false);
        await using var context = new NexusDb(new DbContextOptionsBuilder<NexusDb>().UseNpgsql(w.Connection).Options);
        await context.Database.MigrateAsync();
        await using var db = new NpgsqlConnection(w.Connection);
        await db.OpenAsync();
        await Exec(db, $"""
            INSERT INTO "Participants" ("Id","Name","Kind","State","Availability","IsAdmin") VALUES
            ('{A}','A','human','active','available',false),('{B}','B','human','active','available',false);
            """);
        await using var stale = new NpgsqlConnection(w.Connection);
        await stale.OpenAsync();
        await Exec(stale, "BEGIN ISOLATION LEVEL REPEATABLE READ; SELECT count(*) FROM \"Conversations\";");
        await Exec(db, "BEGIN;" + Pair + "COMMIT;");
        var error = await Assert.ThrowsAsync<PostgresException>(() => Exec(stale,
            $"UPDATE \"Participants\" SET \"State\"='inactive' WHERE \"Id\"='{B}'; COMMIT;"));
        Assert.Contains(error.SqlState, new[] { PostgresErrorCodes.CheckViolation, PostgresErrorCodes.SerializationFailure });
    }

    [Fact]
    public async Task Downgrade_removes_private_data_and_preserves_public_identity_and_sessions()
    {
        await using var w = await TestWorkspace.Create();
        await w.Bootstrap();
        await using var context = new NexusDb(new DbContextOptionsBuilder<NexusDb>().UseNpgsql(w.Connection).Options);
        await using var db = new NpgsqlConnection(w.Connection);
        await db.OpenAsync();
        await Exec(db, $"""
            INSERT INTO "Participants" ("Id","Name","Kind","State","Availability","IsAdmin") VALUES
            ('{A}','A','human','active','available',false),('{B}','B','human','active','available',false);
            INSERT INTO "Conversations" ("Id","Title","Kind","State","Description","CreatedAt","CreatedByParticipantId","ClientRequestId")
            VALUES ('topic','Topic','topical','active','',now(),'{A}','{Guid.NewGuid()}');
            INSERT INTO "Memberships" VALUES ('topic','{A}');
            BEGIN;
            {Pair}
            INSERT INTO "Messages" ("Id","ConversationId","AuthorId","ClientRequestId","Body","State","CreatedAt") VALUES
            ('{Guid.NewGuid()}','dm','{A}','{Guid.NewGuid()}','private','delivered',now()),
            ('{Guid.NewGuid()}','topic','{A}','{Guid.NewGuid()}','public','delivered',now());
            COMMIT;
            """);
        var before = await PublicCounts(db);
        await context.Database.MigrateAsync("20261113044904_PublicTopicalConversations");
        Assert.Equal(before, await PublicCounts(db));
        await using var check = new NpgsqlCommand("SELECT count(*) FROM \"Conversations\" WHERE \"Id\"='dm'", db);
        Assert.Equal(0L, await check.ExecuteScalarAsync());
    }

    private static async Task<string> PublicCounts(NpgsqlConnection db)
    {
        await using var cmd = new NpgsqlCommand("""
            SELECT concat_ws(',',
            (SELECT count(*) FROM "Accounts"),(SELECT count(*) FROM "Participants"),(SELECT count(*) FROM "Sessions"),
            (SELECT count(*) FROM "Conversations" WHERE "Kind" IN ('main','topical')),
            (SELECT count(*) FROM "Memberships" WHERE "ConversationId" != 'dm'),
            (SELECT count(*) FROM "Messages" WHERE "ConversationId" != 'dm'))
            """, db);
        return (string)(await cmd.ExecuteScalarAsync())!;
    }
    private static async Task Exec(NpgsqlConnection db, string sql)
    {
        await using var cmd = new NpgsqlCommand(sql, db);
        await cmd.ExecuteNonQueryAsync();
    }
}
