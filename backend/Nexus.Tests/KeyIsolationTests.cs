using Microsoft.AspNetCore.DataProtection.KeyManagement;
using Microsoft.AspNetCore.DataProtection.Repositories;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace Nexus.Tests;

public class KeyIsolationTests
{
    [Fact]
    public async Task Cleanup_failure_is_reported_separately_without_replacing_original_failure()
    {
        var cleanupErrors = new WorkspaceCleanup();
        var primary = new InvalidOperationException("original test failure");
        var observed = await Assert.ThrowsAsync<InvalidOperationException>(async () =>
        {
            try { throw primary; }
            finally { await cleanupErrors.Capture(() => Task.FromException(new IOException("cleanup failure")), "simulated-owned-resource"); }
        });
        Assert.Same(primary, observed);
        var cleanup = Assert.Throws<AggregateException>(cleanupErrors.ThrowPending);
        Assert.Contains("simulated-owned-resource", cleanup.ToString());
        await cleanupErrors.Capture(() => Task.FromException(new IOException("only failure")), "simulated-only-failure");
        Assert.Throws<AggregateException>(cleanupErrors.Dispose);
    }

    [Fact]
    public async Task Workspace_disposal_removes_only_owned_keys_even_after_body_failure()
    {
        var protectedPath = "C:/Nexus/.local/keys";
        string Fingerprint() => string.Join("|", Directory.GetFiles(protectedPath).Order().Select(p => Path.GetFileName(p) + ":" + Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(File.ReadAllBytes(p)))));
        var before = Fingerprint();
        for (var i = 0; i < 2; i++)
        {
            await using var sibling = await TestWorkspace.Create();
            await TestWorkspace.Csrf(sibling.Client);
            var siblingFiles = Directory.GetFiles(sibling.KeyDirectory);
            var w = await TestWorkspace.Create();
            var path = $"C:/Nexus/backend/.test-keys/{w.Name}";
            try
            {
                await TestWorkspace.Csrf(w.Client);
                Assert.True(Directory.Exists(path));
                if (i == 1) throw new InvalidOperationException("simulated body failure");
            }
            catch (InvalidOperationException e) when (e.Message == "simulated body failure") { }
            finally { await w.DisposeAsync(); }
            Assert.False(Directory.Exists(path));
            Assert.Equal(siblingFiles, Directory.GetFiles(sibling.KeyDirectory));
        }
        Assert.Equal(before, Fingerprint());
    }

    [Fact]
    public void Factory_uses_only_its_explicit_test_key_directory()
    {
        var path = Path.GetFullPath("C:/Nexus/backend/.test-keys/isolation-contract");
        Assert.False(Directory.Exists(path));
        try
        {
            using var host = new ApiHost(keys: path, environment: "Production");
            var options = host.Services.GetRequiredService<IOptions<KeyManagementOptions>>().Value;
            var repository = Assert.IsType<FileSystemXmlRepository>(options.XmlRepository);
            Assert.Equal(path, repository.Directory.FullName);
        }
        finally
        {
            if (Directory.Exists(path)) Directory.Delete(path, recursive: true);
        }
        Assert.False(Directory.Exists(path));
    }
}
