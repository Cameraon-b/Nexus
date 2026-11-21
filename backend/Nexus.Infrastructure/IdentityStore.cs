using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Nexus.Application;
using Nexus.Domain;
namespace Nexus.Infrastructure;

public sealed class IdentityStore(NexusDb db, IPasswordHasher<Account> hasher) : IIdentityStore
{
    public async Task<bool> RequiresBootstrap() => !await db.Accounts.AnyAsync();
    public async Task<SessionResult> Bootstrap(BootstrapRequest request)
    {
        IdentityRules.ValidateSetup(request.Email, request.DisplayName, request.Password);
        await using var transaction = await db.Database.BeginTransactionAsync();
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(7843951001)");
        if (await db.Accounts.AnyAsync()) throw new RuleViolation(409, "Workspace setup is already complete.");
        var account = new Account { Email = IdentityRules.NormalizeEmail(request.Email)!, DisplayName = request.DisplayName.Trim(), IsAdmin = true };
        account.PasswordHash = hasher.HashPassword(account, request.Password);
        db.Participants.Add(new Participant { Id = account.ParticipantId, Name = account.DisplayName, IsAdmin = true });
        db.Conversations.Add(Conversation.CreateMain());
        db.Memberships.Add(new Membership { ParticipantId = account.ParticipantId });
        db.Accounts.Add(account);
        var result = await Issue(account);
        await transaction.CommitAsync();
        return result;
    }
    public async Task<SessionResult> Register(RegisterRequest request)
    {
        IdentityRules.ValidateSetup(request.Email, request.DisplayName, request.Password);
        var email = IdentityRules.NormalizeEmail(request.Email)!;
        await using var transaction = await db.Database.BeginTransactionAsync();
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(7843951001)");
        if (!await db.Accounts.AnyAsync()) throw new RuleViolation(409, "Workspace setup must be completed before registration.");
        if (await db.Accounts.AnyAsync(a => a.Email == email)) throw new RuleViolation(409, "An account with that email already exists.");
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(7843951002)");
        var account = new Account { Email = email, DisplayName = request.DisplayName.Trim() };
        account.PasswordHash = hasher.HashPassword(account, request.Password);
        db.Participants.Add(new Participant { Id = account.ParticipantId, Name = account.DisplayName });
        var publicConversationIds = await db.Conversations
            .Where(c => c.State == "active" && (c.Kind == "main" || c.Kind == "topical"))
            .Select(c => c.Id)
            .ToArrayAsync();
        db.Memberships.AddRange(publicConversationIds.Select(id => new Membership { ConversationId = id, ParticipantId = account.ParticipantId }));
        db.Accounts.Add(account);
        var result = await Issue(account);
        await transaction.CommitAsync();
        return result;
    }
    public async Task<SessionResult> Login(LoginRequest request)
    {
        var email = IdentityRules.NormalizeEmail(request.Email);
        var account = await db.Accounts.SingleOrDefaultAsync(a => a.Email == email);
        if (account is null || request.Password is null || request.Password.Length > 128 || hasher.VerifyHashedPassword(account, account.PasswordHash, request.Password) == PasswordVerificationResult.Failed)
            throw new RuleViolation(401, "Invalid email or password.");
        if (!await db.Participants.AnyAsync(p => p.Id == account.ParticipantId && p.Kind == "human" && p.State == "active"))
            throw new RuleViolation(401, "Invalid email or password.");
        return await Issue(account);
    }
    private async Task<SessionResult> Issue(Account account)
    {
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        var expires = DateTimeOffset.UtcNow.AddDays(7);
        db.Sessions.Add(new Session { TokenHash = Hash(token), AccountId = account.Id, ExpiresAt = expires });
        await db.SaveChangesAsync();
        return new(UserDto.From(account), token, expires);
    }
    public async Task<UserDto?> Resolve(string? token)
    {
        if (string.IsNullOrEmpty(token) || token.Length != 64) return null;
        var hash = Hash(token);
        var session = await db.Sessions.AsNoTracking().SingleOrDefaultAsync(s => s.TokenHash == hash && s.RevokedAt == null && s.ExpiresAt > DateTimeOffset.UtcNow);
        if (session is null) return null;
        var account = await db.Accounts.AsNoTracking().SingleAsync(a => a.Id == session.AccountId);
        return UserDto.From(account);
    }
    public async Task Logout(string? token)
    {
        if (await Resolve(token) is null) throw new RuleViolation(401, "Authentication required.");
        var hash = Hash(token!);
        await db.Sessions.Where(s => s.TokenHash == hash).ExecuteUpdateAsync(s => s.SetProperty(x => x.RevokedAt, DateTimeOffset.UtcNow));
    }
    private static string Hash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}
