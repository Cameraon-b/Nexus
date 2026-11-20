using Microsoft.EntityFrameworkCore;
using Nexus.Infrastructure;
using Npgsql;

namespace Nexus.Tests;

public class TopicalConversationMigrationTests
{
    [Fact]
    public async Task Migration_preserves_existing_main_data_and_installs_constraints_and_indexes()
    {
        await using var w = await TestWorkspace.Create(startHost: false);
        var options = new DbContextOptionsBuilder<NexusDb>().UseNpgsql(w.Connection).Options;
        await using (var context = new NexusDb(options))
            await context.Database.MigrateAsync("20261029235913_MessageIdempotency");

        var participantId = Guid.NewGuid();
        var messageId = Guid.NewGuid();
        var requestId = Guid.NewGuid();
        await using (var connection = new NpgsqlConnection(w.Connection))
        {
            await connection.OpenAsync();
            await using var seed = new NpgsqlCommand("""
                INSERT INTO "Participants" ("Id", "Name", "Kind", "State", "Availability", "IsAdmin")
                VALUES (@participant, 'Existing Human', 'human', 'active', 'available', false);
                INSERT INTO "Conversations" ("Id", "Title", "Kind", "State", "Description")
                VALUES ('main', 'The Common Room', 'main', 'active', 'Existing main data');
                INSERT INTO "Memberships" ("ConversationId", "ParticipantId") VALUES ('main', @participant);
                INSERT INTO "Messages" ("Id", "ConversationId", "AuthorId", "ClientRequestId", "Body", "State", "CreatedAt")
                VALUES (@message, 'main', @participant, @request, 'Existing message', 'delivered', '2026-01-01T00:00:00Z');
                """, connection);
            seed.Parameters.AddWithValue("participant", participantId);
            seed.Parameters.AddWithValue("message", messageId);
            seed.Parameters.AddWithValue("request", requestId);
            await seed.ExecuteNonQueryAsync();
        }

        w.Start();
        _ = await w.Client.GetAsync("/api/auth/status");

        await using var db = new NpgsqlConnection(w.Connection);
        await db.OpenAsync();
        await using var command = new NpgsqlCommand("""
            SELECT c."Description", c."CreatedAt", c."CreatedByParticipantId", c."ClientRequestId",
                   m."Body",
                   EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'IX_Conversations_CreatedByParticipantId_ClientRequestId'),
                   EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'IX_Messages_ConversationId_CreatedAt_Id'),
                   (SELECT COUNT(*) FROM pg_constraint WHERE conname LIKE 'CK_Conversations_%'),
                   (SELECT COUNT(*) FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261113044904_PublicTopicalConversations')
            FROM "Conversations" c
            JOIN "Messages" m ON m."ConversationId" = c."Id"
            WHERE c."Id" = 'main'
            """, db);
        await using var reader = await command.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        Assert.Equal("Existing main data", reader.GetString(0));
        Assert.True(reader.GetFieldValue<DateTimeOffset>(1) > DateTimeOffset.Parse("2020-01-01T00:00:00Z"));
        Assert.True(reader.IsDBNull(2));
        Assert.True(reader.IsDBNull(3));
        Assert.Equal("Existing message", reader.GetString(4));
        Assert.True(reader.GetBoolean(5));
        Assert.True(reader.GetBoolean(6));
        Assert.Equal(4L, reader.GetInt64(7));
        Assert.Equal(1L, reader.GetInt64(8));
    }
}
