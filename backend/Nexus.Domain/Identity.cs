namespace Nexus.Domain;

public sealed class Account
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Email { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public Guid ParticipantId { get; set; } = Guid.NewGuid();
    public bool IsAdmin { get; set; }
}

public sealed class Session
{
    public string TokenHash { get; set; } = "";
    public Guid AccountId { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }
}
