using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Nexus.Application;
using Nexus.Domain;
using Nexus.Infrastructure;

if (args.Contains("--healthcheck", StringComparer.Ordinal))
{
    try
    {
        using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(3) };
        using var request = new HttpRequestMessage(HttpMethod.Get, "http://127.0.0.1:8080/health/ready");
        request.Headers.Host = Environment.GetEnvironmentVariable("AllowedHosts")?.Split(';')[0] ?? "localhost";
        var response = await client.SendAsync(request);
        Environment.ExitCode = response.IsSuccessStatusCode ? 0 : 1;
    }
    catch { Environment.ExitCode = 1; }
    return;
}
var migrateOnly = args.Contains("--migrate-only", StringComparer.Ordinal);
var builder = WebApplication.CreateBuilder(args);
if (migrateOnly) builder.Logging.ClearProviders();
var passwordFile = builder.Configuration["Nexus:DatabasePasswordFile"];
if (passwordFile is not null)
{
    try
    {
        var password = File.ReadAllText(passwordFile).TrimEnd('\r', '\n');
        if (string.IsNullOrWhiteSpace(password)) throw new InvalidOperationException();
        builder.Configuration["ConnectionStrings:Nexus"] = new Npgsql.NpgsqlConnectionStringBuilder
        {
            Host = builder.Configuration["Nexus:DatabaseHost"] ?? "postgres",
            Database = "nexus",
            Username = "nexus",
            Password = password,
            // The file-secret bundle uses password authentication, not Kerberos.
            GssEncryptionMode = Npgsql.GssEncryptionMode.Disable,
            IncludeErrorDetail = false
        }.ConnectionString;
    }
    catch
    {
        Console.Error.WriteLine("Database secret is missing or invalid.");
        Environment.ExitCode = 1;
        return;
    }
}
builder.Services.Configure<RouteHandlerOptions>(o => o.ThrowOnBadRequest = true);
builder.Services.AddDbContext<NexusDb>(o => o.UseNpgsql(builder.Configuration.GetConnectionString("Nexus") ?? throw new InvalidOperationException("ConnectionStrings:Nexus is required.")));
builder.Services.AddScoped<IIdentityStore, IdentityStore>();
builder.Services.AddScoped<IWorkspaceStore, WorkspaceStore>();
builder.Services.AddScoped<AgentStore>();
builder.Services.AddScoped<IntegrationStore>();
builder.Services.AddScoped<IApprovalStore, ApprovalStore>();
builder.Services.AddScoped<IPasswordHasher<Account>, PasswordHasher<Account>>();
builder.Services.Configure<PasswordHasherOptions>(o => o.IterationCount = 210_000);
builder.Services.AddDataProtection().SetApplicationName("Nexus");
builder.Services.AddOptions<Microsoft.AspNetCore.DataProtection.KeyManagement.KeyManagementOptions>()
    .Configure<IConfiguration, Microsoft.Extensions.Hosting.IHostEnvironment>((options, configuration, environment) =>
    {
        var keyPath = configuration["Nexus:DataProtectionPath"]
            ?? (environment.IsDevelopment() ? "C:/Nexus/.local/keys" : throw new InvalidOperationException("Nexus:DataProtectionPath is required."));
        if (!Path.IsPathFullyQualified(keyPath)) throw new InvalidOperationException("Nexus:DataProtectionPath must be absolute.");
        options.XmlRepository = new Microsoft.AspNetCore.DataProtection.Repositories.FileSystemXmlRepository(
            new DirectoryInfo(keyPath), Microsoft.Extensions.Logging.Abstractions.NullLoggerFactory.Instance);
    });
builder.Services.AddAntiforgery(o => { o.HeaderName = "X-CSRF-TOKEN"; o.Cookie.Name = "nexus.csrf"; o.Cookie.SameSite = SameSiteMode.Strict; o.Cookie.HttpOnly = true; o.Cookie.SecurePolicy = builder.Environment.IsDevelopment() ? CookieSecurePolicy.None : CookieSecurePolicy.Always; });
builder.Services.AddRateLimiter(options =>
{
    options.AddPolicy("auth", context => RateLimitPartition.GetFixedWindowLimiter(context.Connection.RemoteIpAddress?.ToString() ?? "local", _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
    options.OnRejected = async (context, _) =>
    {
        context.HttpContext.Response.Headers.RetryAfter = "60";
        await Results.Problem(statusCode: 429, title: "Too many authentication attempts. Try again later.").ExecuteAsync(context.HttpContext);
    };
});
var app = builder.Build();
if (migrateOnly)
{
    try
    {
        await using var scope = app.Services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<NexusDb>().Database.MigrateAsync();
    }
    catch (Exception)
    {
        Console.Error.WriteLine("Migration failed. Check database configuration and availability.");
        Environment.ExitCode = 1;
    }
    return;
}
if (!app.Environment.IsDevelopment())
{
    var keyPath = app.Configuration["Nexus:DataProtectionPath"];
    if (keyPath is null || !Path.IsPathFullyQualified(keyPath))
        throw new InvalidOperationException("Nexus:DataProtectionPath must be absolute.");
    var probe = Path.Combine(keyPath, ".nexus-probe-" + Guid.NewGuid().ToString("N"));
    try
    {
        Directory.CreateDirectory(keyPath);
        using var stream = new FileStream(probe, FileMode.CreateNew, FileAccess.Write, FileShare.None, 1, FileOptions.DeleteOnClose);
    }
    catch { throw new InvalidOperationException("Data-protection key repository is unavailable."); }
    var hosts = app.Configuration["AllowedHosts"];
    if (string.IsNullOrWhiteSpace(hosts) || hosts.Split(';').Any(h => string.IsNullOrWhiteSpace(h) || h.Contains('*') || Uri.CheckHostName(h) == UriHostNameType.Unknown))
        throw new InvalidOperationException("AllowedHosts must contain explicit production hosts.");
    var proxies = app.Configuration["Nexus:TrustedProxies"];
    if (string.IsNullOrWhiteSpace(proxies)) throw new InvalidOperationException("Nexus:TrustedProxies is required.");
    var forwarding = new Microsoft.AspNetCore.Builder.ForwardedHeadersOptions
    {
        ForwardedHeaders = Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedFor | Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedProto,
        ForwardLimit = 2
    };
    forwarding.KnownProxies.Clear();
    forwarding.KnownIPNetworks.Clear();
    foreach (var entry in proxies.Split(';'))
    {
        if (System.Net.IPAddress.TryParse(entry, out var ip) && LocalProxy(ip, null)) forwarding.KnownProxies.Add(ip);
        else if (System.Net.IPNetwork.TryParse(entry, out var network) && LocalProxy(network.BaseAddress, network.PrefixLength)) forwarding.KnownIPNetworks.Add(network);
        else throw new InvalidOperationException("Nexus:TrustedProxies must contain valid IP addresses or non-global CIDR networks.");
    }
    app.UseForwardedHeaders(forwarding);
}
var registrationSetting = app.Configuration["Nexus:AllowPublicRegistration"];
if (registrationSetting is not null && !bool.TryParse(registrationSetting, out _))
    throw new InvalidOperationException("Nexus:AllowPublicRegistration must be true or false.");
var registrationEnabled = registrationSetting is null ? app.Environment.IsDevelopment() : bool.Parse(registrationSetting);
if (app.Environment.IsDevelopment())
    await using (var scope = app.Services.CreateAsyncScope()) await scope.ServiceProvider.GetRequiredService<NexusDb>().Database.MigrateAsync();
app.MapGet("/health/live", () => Results.Json(new { status = "alive" }));
app.MapGet("/health/ready", async (NexusDb db, HttpContext context) =>
{
    try
    {
        if (await db.Database.CanConnectAsync(context.RequestAborted)
            && !(await db.Database.GetPendingMigrationsAsync(context.RequestAborted)).Any())
            return Results.Json(new { status = "ready" });
    }
    catch (Exception) { /* Deliberately narrow health output; no provider diagnostics. */ }
    return Results.Json(new { status = "unready" }, statusCode: 503);
});
app.Use(async (context, next) =>
{
    try
    {
        if (context.GetEndpoint()?.Metadata.GetMetadata<IntegrationBearerOnly>() is null
            && (HttpMethods.IsPost(context.Request.Method) || HttpMethods.IsPut(context.Request.Method) || HttpMethods.IsPatch(context.Request.Method) || HttpMethods.IsDelete(context.Request.Method)))
            await context.RequestServices.GetRequiredService<IAntiforgery>().ValidateRequestAsync(context);
        await next(context);
    }
    catch (BadHttpRequestException) { await Results.Problem(statusCode: 400, title: "Invalid request body.").ExecuteAsync(context); }
    catch (AntiforgeryValidationException) { await Results.Problem(statusCode: 400, title: "Invalid CSRF token.").ExecuteAsync(context); }
    catch (RuleViolation e) { await Results.Problem(statusCode: e.Status, title: e.Message).ExecuteAsync(context); }
    catch (Exception e)
    {
        app.Logger.LogError(e, "Unhandled request failure. Trace {TraceId}", context.TraceIdentifier);
        await Results.Problem(statusCode: 500, title: "The request could not be completed.").ExecuteAsync(context);
    }
});
app.UseRateLimiter();
app.MapGet("/api/auth/status", async (IIdentityStore store) =>
{
    var requiresBootstrap = await store.RequiresBootstrap();
    return Results.Ok(new { requiresBootstrap, registrationAvailable = !requiresBootstrap && registrationEnabled });
});
app.MapGet("/api/auth/csrf", (HttpContext context, IAntiforgery csrf) => Results.Ok(new { token = csrf.GetAndStoreTokens(context).RequestToken }));
app.MapPost("/api/auth/bootstrap", async (BootstrapRequest request, IIdentityStore store, HttpContext context) =>
{
    var result = await store.Bootstrap(request);
    context.Response.Cookies.Append("nexus.session", result.Token, new CookieOptions { HttpOnly = true, SameSite = SameSiteMode.Strict, Secure = !app.Environment.IsDevelopment(), Expires = result.ExpiresAt, Path = "/" });
    return Results.Ok(result.User);
}).RequireRateLimiting("auth");

if (!registrationEnabled)
    app.MapPost("/api/auth/register", () => Results.Problem(statusCode: 403, title: "Public registration is unavailable.")).RequireRateLimiting("auth");
else app.MapPost("/api/auth/register", async (RegisterRequest request, IIdentityStore store, HttpContext context) =>
{
    var result = await store.Register(request);
    context.Response.Cookies.Append("nexus.session", result.Token, new CookieOptions { HttpOnly = true, SameSite = SameSiteMode.Strict, Secure = !app.Environment.IsDevelopment(), Expires = result.ExpiresAt, Path = "/" });
    return Results.Ok(result.User);
}).RequireRateLimiting("auth");

app.MapPost("/api/auth/login", async (LoginRequest request, IIdentityStore store, HttpContext context) =>
{
    var result = await store.Login(request);
    context.Response.Cookies.Append("nexus.session", result.Token, new CookieOptions { HttpOnly = true, SameSite = SameSiteMode.Strict, Secure = !app.Environment.IsDevelopment(), Expires = result.ExpiresAt, Path = "/" });
    return Results.Ok(result.User);
}).RequireRateLimiting("auth");
app.MapPost("/api/auth/logout", async (IIdentityStore store, HttpContext context) =>
{
    await store.Logout(context.Request.Cookies["nexus.session"]);
    context.Response.Cookies.Delete("nexus.session", new CookieOptions { Path = "/", HttpOnly = true, SameSite = SameSiteMode.Strict, Secure = !app.Environment.IsDevelopment() });
    return Results.NoContent();
});
app.MapGet("/api/auth/me", async (IIdentityStore store, HttpContext context) => await store.Resolve(context.Request.Cookies["nexus.session"]) is { } user ? Results.Ok(user) : Results.Unauthorized());
var humanWorkspace = app.MapGroup("/api/workspace").AddEndpointFilter(RequireHumanWorkspace);
var humanConversations = app.MapGroup("/api/conversations").AddEndpointFilter(RequireHumanWorkspace);
humanWorkspace.MapGet("/home", async (IIdentityStore identity, IWorkspaceStore workspace, HttpContext context) =>
{
    var user = await identity.Resolve(context.Request.Cookies["nexus.session"]);
    return user is null ? Results.Unauthorized() : Results.Ok(await workspace.Home(user.ParticipantId));
});
humanConversations.MapPost("/direct", async (CreateDirectConversationRequest request, IIdentityStore identity, IWorkspaceStore workspace, HttpContext context) =>
{
    var user = await identity.Resolve(context.Request.Cookies["nexus.session"]);
    return user is null ? Results.Unauthorized() : Results.Ok(await workspace.CreateDirect(user.ParticipantId, request));
});
humanConversations.MapPost("/topical", async (CreateTopicalConversationRequest request, IIdentityStore identity, IWorkspaceStore workspace, HttpContext context) =>
{
    var user = await identity.Resolve(context.Request.Cookies["nexus.session"]);
    return user is null ? Results.Unauthorized() : Results.Ok(await workspace.CreateTopical(user.ParticipantId, request));
});
humanConversations.MapGet("/{conversationId}/messages", async (string conversationId, IIdentityStore identity, IWorkspaceStore workspace, HttpContext context) =>
{
    var user = await identity.Resolve(context.Request.Cookies["nexus.session"]);
    return user is null ? Results.Unauthorized() : Results.Ok(await workspace.Messages(conversationId, user.ParticipantId));
});
humanConversations.MapPost("/{conversationId}/messages", async (string conversationId, PostMessageRequest request, IIdentityStore identity, IWorkspaceStore workspace, HttpContext context) =>
{
    var user = await identity.Resolve(context.Request.Cookies["nexus.session"]);
    return user is null ? Results.Unauthorized() : Results.Ok(await workspace.Post(conversationId, user.ParticipantId, request));
});

app.MapGet("/api/admin/agents", async (AgentStore agents, IIdentityStore identity, HttpContext context) =>
{
    var user = await identity.Resolve(context.Request.Cookies["nexus.session"]);
    await agents.RequireAdmin(user?.Id);
    return Results.Ok(await agents.List());
});
app.MapPost("/api/admin/agents", async (CreateAgentRequest request, AgentStore agents, IIdentityStore identity, HttpContext context) =>
{
    var user = await identity.Resolve(context.Request.Cookies["nexus.session"]);
    await agents.RequireAdmin(user?.Id);
    var result = await agents.Create(request);
    context.Response.Headers.CacheControl = "no-store";
    return Results.Ok(result);
});
app.MapGet("/api/admin/agents/{participantId:guid}/tokens", async (Guid participantId, AgentStore agents, IIdentityStore identity, HttpContext context) =>
{
    var user = await identity.Resolve(context.Request.Cookies["nexus.session"]);
    await agents.RequireAdmin(user?.Id);
    return Results.Ok(await agents.Tokens(participantId));
});

app.MapPost("/api/admin/agents/{participantId:guid}/tokens", async (Guid participantId, IssueIntegrationTokenRequest request, AgentStore agents, IIdentityStore identity, HttpContext context) =>
{
    var user = await identity.Resolve(context.Request.Cookies["nexus.session"]);
    await agents.RequireAdmin(user?.Id);
    var result = await agents.Replace(participantId, request);
    context.Response.Headers.CacheControl = "no-store";
    return Results.Ok(result);
});
app.MapPost("/api/admin/integration-tokens/{tokenId:guid}/revoke", async (Guid tokenId, AgentStore agents, IIdentityStore identity, HttpContext context) =>
{
    var user = await identity.Resolve(context.Request.Cookies["nexus.session"]);
    await agents.RequireAdmin(user?.Id);
    await agents.Revoke(tokenId);
    return Results.NoContent();
});
app.MapGet("/api/admin/approvals", async (string? status, string? after, int? limit, IApprovalStore approvals, HttpContext context) =>
{
    context.Response.Headers.CacheControl = "no-store";
    return Results.Ok(await approvals.List(context.Request.Cookies["nexus.session"], status, after, limit));
});
app.MapGet("/api/admin/approvals/{draftId:guid}", async (Guid draftId, IApprovalStore approvals, HttpContext context) =>
{
    context.Response.Headers.CacheControl = "no-store";
    return Results.Ok(await approvals.Detail(context.Request.Cookies["nexus.session"], draftId));
});
app.MapPost("/api/admin/approvals/{draftId:guid}/decision", async (Guid draftId, DecideDraftRequest request, IApprovalStore approvals, HttpContext context) =>
{
    context.Response.Headers.CacheControl = "no-store";
    return Results.Ok(await approvals.Decide(context.Request.Cookies["nexus.session"], draftId, request));
});
var integrationsApi = app.MapGroup("/api/integrations").WithMetadata(new IntegrationBearerOnly());
integrationsApi.MapPost("/drafts", async (ProposeDraftRequest request, IntegrationStore integrations, HttpContext context) =>
{
    context.Response.Headers.CacheControl = "no-store";
    return Results.Ok(await integrations.Propose(context.Request.Headers.Authorization.ToString(), request));
});
integrationsApi.MapGet("/drafts", async (IntegrationStore integrations, HttpContext context) =>
{
    context.Response.Headers.CacheControl = "no-store";
    return Results.Ok(await integrations.Drafts(context.Request.Headers.Authorization.ToString()));
});
integrationsApi.MapGet("/inbox", async (string? after, int? limit, IntegrationStore integrations, HttpContext context) =>
    Results.Ok(await integrations.Inbox(context.Request.Headers.Authorization.ToString(), after, limit)));
integrationsApi.MapGet("/me", async (IntegrationStore integrations, HttpContext context) =>
{
    return Results.Ok(await integrations.Me(context.Request.Headers.Authorization.ToString()));
});

async ValueTask<object?> RequireHumanWorkspace(EndpointFilterInvocationContext invocation, EndpointFilterDelegate next)
{
    var context = invocation.HttpContext;
    var user = await context.RequestServices.GetRequiredService<IIdentityStore>().Resolve(context.Request.Cookies["nexus.session"]);
    if (user is null) return Results.Unauthorized();
    var db = context.RequestServices.GetRequiredService<NexusDb>();
    if (!await db.Participants.AnyAsync(p => p.Id == user.ParticipantId && p.Kind == "human" && p.State == "active"))
        throw new RuleViolation(403, "Active human participant required.");
    return await next(invocation);
}

static bool LocalProxy(System.Net.IPAddress address, int? prefix)
{
    var ranges = new[] { "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.0/8", "169.254.0.0/16", "::1/128", "fc00::/7", "fe80::/10" };
    return ranges.Select(System.Net.IPNetwork.Parse).Any(n => n.BaseAddress.AddressFamily == address.AddressFamily && n.Contains(address) && (prefix is null || prefix >= n.PrefixLength));
}

app.Run();
public partial class Program { }
internal sealed class IntegrationBearerOnly { }
