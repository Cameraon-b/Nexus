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
        if (HttpMethods.IsPost(context.Request.Method) || HttpMethods.IsPut(context.Request.Method) || HttpMethods.IsPatch(context.Request.Method) || HttpMethods.IsDelete(context.Request.Method))
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
app.MapGet("/api/workspace/home", async (IIdentityStore identity, IWorkspaceStore workspace, HttpContext context) =>
{
    var user = await identity.Resolve(context.Request.Cookies["nexus.session"]);
    return user is null ? Results.Unauthorized() : Results.Ok(await workspace.Home(user.ParticipantId));
});
app.MapPost("/api/conversations/direct", async (CreateDirectConversationRequest request, IIdentityStore identity, IWorkspaceStore workspace, HttpContext context) =>
{
    var user = await identity.Resolve(context.Request.Cookies["nexus.session"]);
    return user is null ? Results.Unauthorized() : Results.Ok(await workspace.CreateDirect(user.ParticipantId, request));
});
app.MapPost("/api/conversations/topical", async (CreateTopicalConversationRequest request, IIdentityStore identity, IWorkspaceStore workspace, HttpContext context) =>
{
    var user = await identity.Resolve(context.Request.Cookies["nexus.session"]);
    return user is null ? Results.Unauthorized() : Results.Ok(await workspace.CreateTopical(user.ParticipantId, request));
});
app.MapGet("/api/conversations/{conversationId}/messages", async (string conversationId, IIdentityStore identity, IWorkspaceStore workspace, HttpContext context) =>
{
    var user = await identity.Resolve(context.Request.Cookies["nexus.session"]);
    return user is null ? Results.Unauthorized() : Results.Ok(await workspace.Messages(conversationId, user.ParticipantId));
});
app.MapPost("/api/conversations/{conversationId}/messages", async (string conversationId, PostMessageRequest request, IIdentityStore identity, IWorkspaceStore workspace, HttpContext context) =>
{
    var user = await identity.Resolve(context.Request.Cookies["nexus.session"]);
    return user is null ? Results.Unauthorized() : Results.Ok(await workspace.Post(conversationId, user.ParticipantId, request));
});

app.Run();
public partial class Program { }
