using System.Net;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Nexus.Infrastructure;

namespace Nexus.Tests;

public class ProductionHealthTests
{
    [Fact]
    public async Task Production_never_migrates_and_readiness_tracks_schema()
    {
        await using var w = await TestWorkspace.Create(startHost: false);
        using var host = new ApiHost(w.Connection, $"C:/Nexus/backend/.test-keys/{w.Name}", "Production");
        using var client = host.CreateClient();
        Assert.Equal("{\"status\":\"alive\"}", await client.GetStringAsync("/health/live"));
        var ready = await client.GetAsync("/health/ready");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, ready.StatusCode);
        Assert.Equal("{\"status\":\"unready\"}", await ready.Content.ReadAsStringAsync());
        using var scope = host.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<NexusDb>();
        Assert.Empty(await db.Database.GetAppliedMigrationsAsync());
        await db.Database.MigrateAsync();
        Assert.Equal("{\"status\":\"ready\"}", await client.GetStringAsync("/health/ready"));
        Assert.Empty(await db.Accounts.ToListAsync());
    }

    [Fact]
    public async Task Liveness_does_not_need_database_and_readiness_failure_is_narrow()
    {
        using var host = new ApiHost("Host=127.0.0.1;Port=1;Database=disposable_unavailable;Username=disposable;Timeout=1", environment: "Production");
        using var client = host.CreateClient();
        Assert.Equal("{\"status\":\"alive\"}", await client.GetStringAsync("/health/live"));
        var ready = await client.GetAsync("/health/ready");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, ready.StatusCode);
        Assert.Equal("{\"status\":\"unready\"}", await ready.Content.ReadAsStringAsync());
    }
}
