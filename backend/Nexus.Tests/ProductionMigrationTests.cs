using System.Diagnostics;
using Microsoft.EntityFrameworkCore;
using Nexus.Infrastructure;

namespace Nexus.Tests;

public class ProductionMigrationTests
{
    private static async Task<(int Code, string Output)> Migrate(string connection, string keys)
    {
        var start = new ProcessStartInfo("C:/Nexus/.tools/dotnet/dotnet.exe")
        {
            WorkingDirectory = "C:/Nexus/backend/Nexus.Api",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false
        };
        var configuration = new DirectoryInfo(AppContext.BaseDirectory).Parent!.Name;
        start.ArgumentList.Add($"bin/{configuration}/net10.0/Nexus.Api.dll");
        start.ArgumentList.Add("--migrate-only");
        start.Environment["ASPNETCORE_ENVIRONMENT"] = "Production";
        start.Environment["ConnectionStrings__Nexus"] = connection;
        start.Environment["Nexus__DataProtectionPath"] = keys;
        using var process = Process.Start(start)!;
        var output = process.StandardOutput.ReadToEndAsync();
        var error = process.StandardError.ReadToEndAsync();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        try { await process.WaitForExitAsync(timeout.Token); }
        catch (OperationCanceledException) { process.Kill(entireProcessTree: true); throw new InvalidOperationException("Migration operation failed to exit without a listener."); }
        return (process.ExitCode, await output + await error);
    }

    [Fact]
    public async Task Migration_only_is_repeatable_exits_without_listening_and_creates_no_feature_data()
    {
        await using var w = await TestWorkspace.Create(startHost: false);
        for (var i = 0; i < 2; i++)
        {
            var result = await Migrate(w.Connection, $"C:/Nexus/backend/.test-keys/{w.Name}");
            Assert.Equal(0, result.Code);
            Assert.DoesNotContain("Now listening", result.Output);
        }
        await using var db = new NexusDb(new DbContextOptionsBuilder<NexusDb>().UseNpgsql(w.Connection).Options);
        Assert.Empty(await db.Database.GetPendingMigrationsAsync());
        Assert.Empty(await db.Accounts.ToListAsync());
        Assert.Empty(await db.Participants.ToListAsync());
        Assert.Empty(await db.Conversations.ToListAsync());
        Assert.Empty(await db.Messages.ToListAsync());
    }

    [Fact]
    public async Task Migration_failure_is_nonzero_and_safe()
    {
        var result = await Migrate("Host=127.0.0.1;Port=1;Database=disposable_internal;Username=disposable;Timeout=1", "C:/Nexus/backend/.test-keys/migrate-failure");
        Assert.NotEqual(0, result.Code);
        Assert.Equal("Migration failed. Check database configuration and availability.", result.Output.Trim());
    }
}
