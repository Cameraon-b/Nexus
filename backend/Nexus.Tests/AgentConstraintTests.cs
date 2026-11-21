using System.Net.Http.Json;
using System.Text.Json;
using Npgsql;

namespace Nexus.Tests;

public class AgentConstraintTests
{
    [Theory]
    [InlineData("kind")]
    [InlineData("state")]
    [InlineData("availability")]
    [InlineData("name")]
    [InlineData("description")]
    [InlineData("token-state")]
    [InlineData("token-label")]
    [InlineData("token-hash")]
    [InlineData("token-human")]
    [InlineData("second-active")]
    [InlineData("resurrect")]
    [InlineData("owner-kind")]
    public async Task Database_rejects_invalid_agent_or_token_state(string mutation)
    {
        await using var w = await TestWorkspace.Create();
        var admin = await w.Bootstrap();
        var response = await w.Client.PostAsJsonAsync("/api/admin/agents", new { displayName = "Helper", tokenLabel = "Connector" });
        response.EnsureSuccessStatusCode();
        var result = await response.Content.ReadFromJsonAsync<JsonElement>();
        var id = result.GetProperty("agent").GetProperty("id").GetGuid();
        var tokenId = result.GetProperty("token").GetProperty("id").GetGuid();
        var humanId = admin.GetProperty("participantId").GetGuid();
        await using var db = new NpgsqlConnection(w.Connection);
        await db.OpenAsync();
        var sql = mutation switch
        {
            "kind" => $"UPDATE \"Participants\" SET \"Kind\"='robot' WHERE \"Id\"='{id}'",
            "state" => $"UPDATE \"Participants\" SET \"State\"='pending_setup' WHERE \"Id\"='{id}'",
            "availability" => $"UPDATE \"Participants\" SET \"Availability\"='pretend-online' WHERE \"Id\"='{id}'",
            "name" => $"UPDATE \"Participants\" SET \"Name\"='  ' WHERE \"Id\"='{id}'",
            "description" => $"UPDATE \"Participants\" SET \"Description\"=' untrimmed ' WHERE \"Id\"='{id}'",
            "token-state" => $"UPDATE \"IntegrationTokens\" SET \"State\"='expired' WHERE \"Id\"='{tokenId}'",
            "token-label" => $"UPDATE \"IntegrationTokens\" SET \"Label\"=' ' WHERE \"Id\"='{tokenId}'",
            "token-hash" => $"UPDATE \"IntegrationTokens\" SET \"TokenHash\"='raw-secret' WHERE \"Id\"='{tokenId}'",
            "token-human" => $"UPDATE \"IntegrationTokens\" SET \"ParticipantId\"='{humanId}' WHERE \"Id\"='{tokenId}'",
            "second-active" => $"INSERT INTO \"IntegrationTokens\" SELECT '{Guid.NewGuid()}', \"ParticipantId\", 'Second', repeat('A',64), 'active', now(), NULL, NULL FROM \"IntegrationTokens\" WHERE \"Id\"='{tokenId}'",
            "resurrect" => $"UPDATE \"IntegrationTokens\" SET \"State\"='revoked', \"RevokedAt\"=now() WHERE \"Id\"='{tokenId}'; UPDATE \"IntegrationTokens\" SET \"State\"='active', \"RevokedAt\"=NULL WHERE \"Id\"='{tokenId}'",
            _ => $"UPDATE \"Participants\" SET \"Kind\"='human' WHERE \"Id\"='{id}'"
        };
        await using var transaction = await db.BeginTransactionAsync();
        await using var command = new NpgsqlCommand(sql, db, transaction);
        var error = await Assert.ThrowsAsync<PostgresException>(async () => { await command.ExecuteNonQueryAsync(); await transaction.CommitAsync(); });
        Assert.Contains(error.SqlState, new[] { PostgresErrorCodes.CheckViolation, PostgresErrorCodes.UniqueViolation });
    }
}
