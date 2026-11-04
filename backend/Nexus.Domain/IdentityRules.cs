using System.Net.Mail;
namespace Nexus.Domain;

public static class IdentityRules
{
    public static void ValidateSetup(string? email, string? name, string? password)
    {
        if (string.IsNullOrWhiteSpace(email) || email.Trim().Length > 254 || !MailAddress.TryCreate(email.Trim(), out var parsed) || parsed.Address != email.Trim())
            throw new RuleViolation(400, "A valid email address is required.");
        if (string.IsNullOrWhiteSpace(name) || name.Trim().Length > 100)
            throw new RuleViolation(400, "Display name must be between 1 and 100 characters.");
        if (password is null || password.Length < 12 || password.Length > 128)
            throw new RuleViolation(400, "Password must be between 12 and 128 characters.");
    }
}
