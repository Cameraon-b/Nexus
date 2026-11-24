using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Npgsql;

namespace Nexus.Tests;

public sealed class TestWorkspace : IAsyncDisposable
{
    public string Name { get; } = "nexus_test_" + Guid.NewGuid().ToString("N");
    public string Connection { get; private set; } = "";
    public string KeyDirectory => $"C:/Nexus/backend/.test-keys/{Name}";
    private string admin = "";
    private readonly List<ApiHost> hosts = [];
    public ApiHost Host { get; private set; } = null!;
    public HttpClient Client { get; private set; } = null!;
    public static readonly object Credentials = new { email = "admin@example.test", displayName = "Test Admin", password = "Test-only-long-passphrase!7" };
    public static async Task<TestWorkspace> Create(bool startHost = true)
    {
        var workspace = new TestWorkspace();
        using var config = JsonDocument.Parse(await File.ReadAllTextAsync("C:/Nexus/.local/runtime.json"));
        workspace.admin = config.RootElement.GetProperty("adminConnectionString").GetString()!;
        await using var conn = new NpgsqlConnection(workspace.admin);
        await conn.OpenAsync();
        await using var command = new NpgsqlCommand($"CREATE DATABASE {workspace.Name}", conn);
        await command.ExecuteNonQueryAsync();
        workspace.Connection = new NpgsqlConnectionStringBuilder(workspace.admin) { Database = workspace.Name }.ConnectionString;
        try { if (startHost) workspace.Start(); }
        catch
        {
            try { await workspace.DisposeAsync(); }
            catch { Console.Error.WriteLine("Test workspace cleanup also failed after startup failure."); }
            throw;
        }
        return workspace;
    }
    public void Start()
    {
        Host = NewHost();
        Client = Host.CreateClient();
    }
    public ApiHost NewHost(DbCommandInterceptor? interceptor = null)
    {
        var host = new ApiHost(Connection, KeyDirectory, interceptor: interceptor);
        lock (hosts) hosts.Add(host);
        return host;
    }
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
        await WorkspaceCleanup.Shared.Capture(() => { Client?.Dispose(); return Task.CompletedTask; }, Name + " client");
        ApiHost[] ownedHosts;
        lock (hosts) { ownedHosts = hosts.ToArray(); hosts.Clear(); }
        foreach (var host in ownedHosts)
            await WorkspaceCleanup.Shared.Capture(async () => await host.DisposeAsync(), Name + " host");
        await WorkspaceCleanup.Shared.Capture(async () =>
        {
            NpgsqlConnection.ClearAllPools();
            if (!Name.StartsWith("nexus_test_", StringComparison.Ordinal)) throw new InvalidOperationException("Unsafe test name");
            await using var conn = new NpgsqlConnection(admin);
            await conn.OpenAsync();
            await using var command = new NpgsqlCommand($"DROP DATABASE {Name} WITH (FORCE)", conn);
            await command.ExecuteNonQueryAsync();
        }, Name + " database");
        await WorkspaceCleanup.Shared.Capture(() =>
        {
            // Only this instance's UUID directory, never a root, sibling or historical run.
            if (Directory.Exists(KeyDirectory)) Directory.Delete(KeyDirectory, true);
            return Task.CompletedTask;
        }, KeyDirectory);
    }
}
