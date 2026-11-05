using Nexus.Domain;
namespace Nexus.Application;

public sealed record UserDto(Guid Id, string Email, string DisplayName, Guid ParticipantId, bool IsAdmin)
{
    public static UserDto From(Account account) => new(account.Id, account.Email, account.DisplayName, account.ParticipantId, account.IsAdmin);
}
public sealed record BootstrapRequest(string Email, string DisplayName, string Password);
public sealed record RegisterRequest(string Email, string DisplayName, string Password);
public sealed record LoginRequest(string Email, string Password);
public sealed record SessionResult(UserDto User, string Token, DateTimeOffset ExpiresAt);
public interface IIdentityStore
{
    Task<bool> RequiresBootstrap();
    Task<SessionResult> Bootstrap(BootstrapRequest request);
    Task<SessionResult> Register(RegisterRequest request);
    Task<SessionResult> Login(LoginRequest request);
    Task Logout(string? token);
    Task<UserDto?> Resolve(string? token);
}
