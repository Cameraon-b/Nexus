namespace Nexus.Domain;

public sealed class RuleViolation(int status, string message) : Exception(message)
{
    public int Status { get; } = status;
}
