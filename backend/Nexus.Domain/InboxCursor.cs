namespace Nexus.Domain;

// Opaque server-issued handle, scoped to a participant, not a replaceable token.
// Boundary messages deliberately have no FK: deleted/inaccessible boundaries
// resolve to a generic invalid-cursor response instead of retaining content.
public sealed class InboxCursor
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ParticipantId { get; set; }
    public Guid MessageId { get; set; }
}
