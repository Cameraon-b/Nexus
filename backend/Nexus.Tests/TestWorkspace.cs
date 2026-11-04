using System.Net.Http.Json;
using System.Text.Json;
using Npgsql;

namespace Nexus.Tests;

public sealed class TestWorkspace : IAsyncDisposable
{
    public string Name { get; } = "nexus_test_" + Guid.NewGuid().ToString("N");
    public string Connection { get; private set; } = "";
    private string admin = "";
    public ApiHost Host { get; private set; } = null!;
    public HttpClient Client { get; private set; } = null!;
    public static readonly object Credentials = new { email = "admin@example.test", displayName = "Test Admin", password = "Test-only-long-passphrase!7" };
    public static async Task<TestWorkspace> Create()
    {
        var workspace = new TestWorkspace();
        using var config = JsonDocument.Parse(await File.ReadAllTextAsync("C:/Nexus/.local/runtime.json"));
        workspace.admin = config.RootElement.GetProperty("adminConnectionString").GetString()!;
        await using var conn = new NpgsqlConnection(workspace.admin);
        await conn.OpenAsync();
        await using var command = new NpgsqlCommand($"CREATE DATABASE {workspace.Name}", conn);
        await command.ExecuteNonQueryAsync();
        workspace.Connection = new NpgsqlConnectionStringBuilder(workspace.admin) { Database = workspace.Name }.ConnectionString;
        workspace.Host = workspace.NewHost();
        workspace.Client = workspace.Host.CreateClient();
        return workspace;
    }
    public ApiHost NewHost() => new(Connection, $"C:/Nexus/backend/.test-keys/{Name}");
    public static async Task Csrf(HttpClient client)
    {
        var json = await client.GetFromJsonAsync<JsonElement>("/api/auth/csrf");
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", json.GetProperty("token").GetString());
    }
    public async Task<JsonElement> Bootstrap()
    {
        await Csrf(Client);
        var response = await Client.PostAsJsonAsync("/api/auth/bootstrap", Credentials);
        response.EnsureSuccessStatusCode();
        await Csrf(Client);
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }
    public async ValueTask DisposeAsync()
    {
        Client.Dispose();
        await Host.DisposeAsync();
        NpgsqlConnection.ClearAllPools();
        await using var conn = new NpgsqlConnection(admin);
        await conn.OpenAsync();
        if (!Name.StartsWith("nexus_test_", StringComparison.Ordinal)) throw new InvalidOperationException("Unsafe test name");
        await using var command = new NpgsqlCommand($"DROP DATABASE {Name} WITH (FORCE)", conn);
        await command.ExecuteNonQueryAsync();
    }
}
