using Microsoft.EntityFrameworkCore;
using Nexus.Domain;

namespace Nexus.Infrastructure;

internal static class ConversationAccess
{
    internal static IQueryable<Conversation> For(NexusDb db, Guid participantId) => db.Conversations.AsNoTracking().Where(c =>
        c.State == "active" && db.Participants.Any(p => p.Id == participantId && p.State == "active" && (p.Kind == "human" || p.Kind == "agent")) &&
        (c.Kind == "direct"
            ? (c.DirectParticipantLowId == participantId || c.DirectParticipantHighId == participantId)
                && c.DirectParticipantLowId != null && c.DirectParticipantHighId != null && c.DirectParticipantLowId.Value.CompareTo(c.DirectParticipantHighId.Value) < 0
                && db.Participants.Count(p => (p.Id == c.DirectParticipantLowId || p.Id == c.DirectParticipantHighId) && p.State == "active" && (p.Kind == "human" || p.Kind == "agent")) == 2
                && db.Participants.Any(p => (p.Id == c.DirectParticipantLowId || p.Id == c.DirectParticipantHighId) && p.Kind == "human")
            : (c.Kind == "main" || c.Kind == "topical") && db.Memberships.Any(m => m.ConversationId == c.Id && m.ParticipantId == participantId)));
}
