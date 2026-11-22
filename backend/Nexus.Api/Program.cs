using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Nexus.Application;
using Nexus.Domain;
using Nexus.Infrastructure;

var builder = WebApplication.CreateBuilder(args);
builder.Services.Configure<RouteHandlerOptions>(o => o.ThrowOnBadRequest = true);
builder.Services.AddDbContext<NexusDb>(o => o.UseNpgsql(builder.Configuration.GetConnectionString("Nexus") ?? throw new InvalidOperationException("ConnectionStrings:Nexus is required.")));
builder.Services.AddScoped<IIdentityStore, IdentityStore>();
builder.Services.AddScoped<IWorkspaceStore, WorkspaceStore>();
builder.Services.AddScoped<AgentStore>();
builder.Services.AddScoped<IntegrationStore>();
builder.Services.AddScoped<IApprovalStore, ApprovalStore>();
builder.Services.AddScoped<IPasswordHasher<Account>, PasswordHasher<Account>>();
builder.Services.Configure<PasswordHasherOptions>(o => o.IterationCount = 210_000);
var keyPath = builder.Configuration["Nexus:DataProtectionPath"] ?? "C:/Nexus/.local/keys";
if (!Path.IsPathFullyQualified(keyPath)) throw new InvalidOperationException("Nexus:DataProtectionPath must be absolute.");
builder.Services.AddDataProtection().PersistKeysToFileSystem(new DirectoryInfo(keyPath)).SetApplicationName("Nexus");
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
await using (var scope = app.Services.CreateAsyncScope()) await scope.ServiceProvider.GetRequiredService<NexusDb>().Database.MigrateAsync();
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
app.MapGet("/api/auth/status", async (IIdentityStore store) => Results.Ok(new { requiresBootstrap = await store.RequiresBootstrap() }));
app.MapGet("/api/auth/csrf", (HttpContext context, IAntiforgery csrf) => Results.Ok(new { token = csrf.GetAndStoreTokens(context).RequestToken }));
app.MapPost("/api/auth/bootstrap", async (BootstrapRequest request, IIdentityStore store, HttpContext context) =>
{
    var result = await store.Bootstrap(request);
    context.Response.Cookies.Append("nexus.session", result.Token, new CookieOptions { HttpOnly = true, SameSite = SameSiteMode.Strict, Secure = !app.Environment.IsDevelopment(), Expires = result.ExpiresAt, Path = "/" });
    return Results.Ok(result.User);
}).RequireRateLimiting("auth");

app.MapPost("/api/auth/register", async (RegisterRequest request, IIdentityStore store, HttpContext context) =>
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

app.Run();
public partial class Program { }
internal sealed class IntegrationBearerOnly { }
