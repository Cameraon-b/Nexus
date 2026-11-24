using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;

namespace Nexus.Tests;

public class ProductionConfigurationTests
{
    [Fact]
    public void Production_key_repository_is_created_at_startup_and_probe_is_removed()
    {
        var path = Path.Combine("C:/Nexus/backend/.test-keys", "probe-" + Guid.NewGuid().ToString("N"));
        try
        {
            using var host = new ApiHost(keys: path, environment: "Production");
            using var client = host.CreateClient();
            Assert.True(Directory.Exists(path));
            Assert.Empty(Directory.GetFiles(path, ".nexus-probe-*"));
        }
        finally { if (Directory.Exists(path)) Directory.Delete(path, true); }
    }

    [Fact]
    public void Unwritable_repository_fails_startup_without_file_contents()
    {
        var path = Path.Combine("C:/Nexus/backend/.test-keys", "blocked-" + Guid.NewGuid().ToString("N"));
        try
        {
            File.WriteAllText(path, "private-sentinel");
            using var host = new ApiHost(keys: path, environment: "Production");
            var error = Assert.ThrowsAny<Exception>(() => host.CreateClient());
            Assert.Contains("key repository", error.ToString());
            Assert.DoesNotContain("private-sentinel", error.ToString());
        }
        finally { File.Delete(path); }
    }

    [Theory]
    [InlineData(null)]
    [InlineData("relative/keys")]
    public void Required_production_key_path_is_validated_before_listening(string? path)
    {
        using var host = new ApiHost(environment: "Production").WithWebHostBuilder(b =>
            b.ConfigureAppConfiguration((_, c) => c.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Nexus:DataProtectionPath"] = path
            })));
        var error = Assert.ThrowsAny<Exception>(() => host.CreateClient());
        Assert.Contains("Nexus:DataProtectionPath", error.ToString());
    }
}
