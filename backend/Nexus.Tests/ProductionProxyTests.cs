using System.Net;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;

namespace Nexus.Tests;

public class ProductionProxyTests
{
    private static Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactory<Program> Host(string? proxies = "10.24.0.0/24", string? hosts = "nexus.aether.lab") =>
        new ApiHost(environment: "Production").WithWebHostBuilder(b => b.ConfigureAppConfiguration((_, c) => c.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["AllowedHosts"] = hosts,
            ["Nexus:TrustedProxies"] = proxies
        })));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("not-an-ip")]
    [InlineData("0.0.0.0/0")]
    [InlineData("128.0.0.0/1")]
    [InlineData("8.8.8.8")]
    [InlineData("10.0.0.0/7")]
    [InlineData("172.16.0.0/11")]
    [InlineData("192.168.0.0/15")]
    [InlineData("192.0.2.1")]
    [InlineData("0.0.0.0")]
    [InlineData("224.0.0.1")]
    [InlineData("::")]
    [InlineData("::/1")]
    [InlineData("2001:db8::/32")]
    [InlineData("2606:4700:4700::1111")]
    [InlineData("fc00::/6")]
    [InlineData("fe80::/9")]
    [InlineData("ff00::/8")]
    public void Invalid_proxy_configuration_is_rejected(string? value)
    {
        using var host = Host(value);
        Assert.ThrowsAny<Exception>(() => host.CreateClient());
    }

    [Theory]
    [InlineData("10.0.0.0/8")]
    [InlineData("172.16.0.0/12")]
    [InlineData("192.168.0.0/16")]
    [InlineData("127.0.0.1")]
    [InlineData("169.254.0.0/16")]
    [InlineData("::1")]
    [InlineData("fc00::/7")]
    [InlineData("fe80::/10")]
    public void Local_proxy_boundaries_are_accepted(string value)
    {
        using var host = Host(value);
        using var client = host.CreateClient();
    }

    [Theory]
    [InlineData(null)]
    [InlineData("*")]
    public void Production_requires_explicit_hosts(string? value)
    {
        using var host = Host(hosts: value);
        Assert.ThrowsAny<Exception>(() => host.CreateClient());
    }

    [Fact]
    public async Task Hosts_and_forwarding_are_enforced_at_pipeline_boundary()
    {
        using var host = Host();
        using var client = host.CreateClient();
        foreach (var (remote, expected, scheme) in new[] { ("10.24.0.8", "198.51.100.7", "https"), ("10.25.0.8", "10.25.0.8", "http") })
        {
            var result = await host.Server.SendAsync(c =>
            {
                c.Connection.RemoteIpAddress = IPAddress.Parse(remote);
                c.Request.Host = new HostString("nexus.aether.lab");
                c.Request.Path = "/health/live";
                c.Request.Headers["X-Forwarded-For"] = "198.51.100.7";
                c.Request.Headers["X-Forwarded-Proto"] = "https";
            });
            Assert.Equal(200, result.Response.StatusCode);
            Assert.Equal(expected, result.Connection.RemoteIpAddress!.ToString());
            Assert.Equal(scheme, result.Request.Scheme);
        }
        client.DefaultRequestHeaders.Host = "unexpected.example";
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/health/live")).StatusCode);
        client.DefaultRequestHeaders.Host = "nexus.aether.lab";
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health/live")).StatusCode);
    }
}
