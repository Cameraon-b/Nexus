using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Nexus.Domain;
namespace Nexus.Infrastructure;

public sealed class NexusDb(DbContextOptions<NexusDb> options) : DbContext(options)
{
    public DbSet<ApprovalDecision> ApprovalDecisions => Set<ApprovalDecision>();
    public DbSet<InboxCursor> InboxCursors => Set<InboxCursor>();
    public DbSet<MessageDraft> MessageDrafts => Set<MessageDraft>();
    public DbSet<Message> Messages => Set<Message>();
    public DbSet<Participant> Participants => Set<Participant>();
    public DbSet<Conversation> Conversations => Set<Conversation>();
    public DbSet<Membership> Memberships => Set<Membership>();
    public DbSet<Account> Accounts => Set<Account>();
    public DbSet<Session> Sessions => Set<Session>();
    public DbSet<IntegrationToken> IntegrationTokens => Set<IntegrationToken>();
    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<ApprovalDecision>().HasIndex(d => d.DraftId).IsUnique();
        b.Entity<ApprovalDecision>().HasIndex(d => new { d.ReviewerParticipantId, d.ClientRequestId }).IsUnique();
        b.Entity<ApprovalDecision>().HasIndex(d => d.DeliveredMessageId).IsUnique();
        b.Entity<ApprovalDecision>().HasOne<MessageDraft>().WithMany().HasForeignKey(d => d.DraftId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<ApprovalDecision>().HasOne<Participant>().WithMany().HasForeignKey(d => d.ReviewerParticipantId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<ApprovalDecision>().HasOne(d => d.DeliveredMessage).WithMany().HasForeignKey(d => d.DeliveredMessageId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<ApprovalDecision>().Property(d => d.Outcome).HasMaxLength(20);
        b.Entity<ApprovalDecision>().Property(d => d.FinalBody).HasMaxLength(5000);
        b.Entity<ApprovalDecision>().Property(d => d.Reason).HasMaxLength(ApprovalDecision.ReasonLimit);
        b.Entity<ApprovalDecision>().ToTable(t =>
        {
            t.HasCheckConstraint("CK_ApprovalDecisions_Shape", "(\"Outcome\" IN ('approved','approved_with_edits') AND \"FinalBody\" IS NOT NULL AND \"DeliveredMessageId\" IS NOT NULL) OR (\"Outcome\" = 'rejected' AND \"FinalBody\" IS NULL AND \"DeliveredMessageId\" IS NULL)");
            t.HasCheckConstraint("CK_ApprovalDecisions_Body", "\"FinalBody\" IS NULL OR (length(btrim(\"FinalBody\")) BETWEEN 1 AND 5000 AND \"FinalBody\" = btrim(\"FinalBody\"))");
            t.HasCheckConstraint("CK_ApprovalDecisions_Reason", "\"Reason\" IS NULL OR (length(btrim(\"Reason\")) BETWEEN 1 AND 1000 AND \"Reason\" = btrim(\"Reason\"))");
            t.HasCheckConstraint("CK_ApprovalDecisions_Request", "\"ClientRequestId\" <> '00000000-0000-0000-0000-000000000000'::uuid");
        });
        b.Entity<Message>().HasIndex(m => m.SourceDraftId).IsUnique();
        b.Entity<Message>().HasOne<MessageDraft>().WithMany().HasForeignKey(m => m.SourceDraftId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<Message>().ToTable(t => t.HasCheckConstraint("CK_Messages_EditedLineage", "NOT \"EditedBeforeRelease\" OR \"SourceDraftId\" IS NOT NULL"));
        b.Entity<InboxCursor>().HasIndex(c => new { c.ParticipantId, c.MessageId }).IsUnique();
        b.Entity<InboxCursor>().HasOne<Participant>().WithMany().HasForeignKey(c => c.ParticipantId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<MessageDraft>().HasIndex(d => new { d.AuthorId, d.ClientRequestId }).IsUnique();
        b.Entity<MessageDraft>().HasOne<Participant>().WithMany().HasForeignKey(d => d.AuthorId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<MessageDraft>().HasOne<IntegrationToken>().WithMany().HasForeignKey(d => d.SubmittedTokenId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<MessageDraft>().HasOne<Conversation>().WithMany().HasForeignKey(d => d.ConversationId);
        b.Entity<MessageDraft>().HasOne<Message>().WithMany().HasForeignKey(d => d.SourceMessageId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<MessageDraft>().Property(d => d.Body).HasMaxLength(5000);
        b.Entity<MessageDraft>().Property(d => d.State).HasMaxLength(20);
        b.Entity<MessageDraft>().ToTable(t =>
        {
            t.HasCheckConstraint("CK_MessageDrafts_State", "(\"State\" = 'pending' AND \"ResolvedAt\" IS NULL) OR (\"State\" IN ('approved','approved_with_edits','rejected') AND \"ResolvedAt\" IS NOT NULL)");
            t.HasCheckConstraint("CK_MessageDrafts_Body", "length(btrim(\"Body\")) BETWEEN 1 AND 5000 AND \"Body\" = btrim(\"Body\")");
            t.HasCheckConstraint("CK_MessageDrafts_Request", "\"ClientRequestId\" <> '00000000-0000-0000-0000-000000000000'::uuid");
        });
        b.Entity<Message>().HasIndex(m => new { m.AuthorId, m.ClientRequestId }).IsUnique();
        b.Entity<Message>().HasIndex(m => new { m.ConversationId, m.CreatedAt, m.Id });
        b.Entity<Message>().HasOne<Participant>().WithMany().HasForeignKey(m => m.AuthorId);
        b.Entity<Message>().HasOne<Conversation>().WithMany().HasForeignKey(m => m.ConversationId);
        b.Entity<Message>().Property(m => m.Body).HasMaxLength(5000);
        b.Entity<Message>().Property(m => m.State).HasMaxLength(20);
        b.Entity<Account>().HasOne<Participant>().WithOne().HasForeignKey<Account>(a => a.ParticipantId);
        b.Entity<Participant>().Property(p => p.Name).HasMaxLength(100);
        b.Entity<Participant>().Property(p => p.Description).HasMaxLength(160);
        b.Entity<Participant>().ToTable(t =>
        {
            t.HasCheckConstraint("CK_Participants_Kind", "\"Kind\" IN ('human', 'agent', 'service')");
            t.HasCheckConstraint("CK_Participants_State", "\"State\" IN ('active', 'inactive', 'suspended', 'blocked')");
            t.HasCheckConstraint("CK_Participants_Availability", "\"Availability\" IN ('available', 'away', 'offline', 'unknown')");
            t.HasCheckConstraint("CK_Participants_Name", "length(btrim(\"Name\")) BETWEEN 1 AND 100 AND \"Name\" = btrim(\"Name\")");
            t.HasCheckConstraint("CK_Participants_Description", "\"Description\" = btrim(\"Description\")");
        });
        b.Entity<IntegrationToken>().HasOne<Participant>().WithMany().HasForeignKey(t => t.ParticipantId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<IntegrationToken>().Property(t => t.Label).HasMaxLength(100);
        b.Entity<IntegrationToken>().Property(t => t.TokenHash).HasMaxLength(64);
        b.Entity<IntegrationToken>().HasIndex(t => t.TokenHash).IsUnique();
        b.Entity<IntegrationToken>().HasIndex(t => t.ParticipantId).IsUnique().HasFilter("\"State\" = 'active'");
        b.Entity<IntegrationToken>().ToTable(t =>
        {
            t.HasCheckConstraint("CK_IntegrationTokens_State", "(\"State\" = 'active' AND \"RevokedAt\" IS NULL) OR (\"State\" = 'revoked' AND \"RevokedAt\" IS NOT NULL)");
            t.HasCheckConstraint("CK_IntegrationTokens_Label", "length(btrim(\"Label\")) BETWEEN 1 AND 100 AND \"Label\" = btrim(\"Label\")");
            t.HasCheckConstraint("CK_IntegrationTokens_Hash", "\"TokenHash\" ~ '^[0-9A-F]{64}$'");
        });
        b.Entity<Conversation>().Property(c => c.Id).HasMaxLength(40);
        b.Entity<Conversation>().Property(c => c.Title).HasMaxLength(80);
        b.Entity<Conversation>().Property(c => c.Description).HasMaxLength(160);
        b.Entity<Conversation>().Property(c => c.Kind).HasMaxLength(20);
        b.Entity<Conversation>().Property(c => c.State).HasMaxLength(20);
        b.Entity<Conversation>().HasOne<Participant>().WithMany().HasForeignKey(c => c.CreatedByParticipantId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<Conversation>().HasIndex(c => new { c.CreatedByParticipantId, c.ClientRequestId }).IsUnique().HasFilter("\"CreatedByParticipantId\" IS NOT NULL AND \"ClientRequestId\" IS NOT NULL");
        b.Entity<Conversation>().HasOne<Participant>().WithMany().HasForeignKey(c => c.DirectParticipantLowId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<Conversation>().HasOne<Participant>().WithMany().HasForeignKey(c => c.DirectParticipantHighId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<Conversation>().HasIndex(c => new { c.DirectParticipantLowId, c.DirectParticipantHighId }).IsUnique().HasFilter("\"DirectParticipantLowId\" IS NOT NULL AND \"DirectParticipantHighId\" IS NOT NULL");
        b.Entity<Conversation>().ToTable(t =>
        {
            t.HasCheckConstraint("CK_Conversations_Kind", "\"Kind\" IN ('main', 'topical', 'direct')");
            t.HasCheckConstraint("CK_Conversations_State", "\"State\" = 'active'");
            t.HasCheckConstraint("CK_Conversations_TopicalCreator", "(\"Kind\" IN ('main', 'direct') AND \"CreatedByParticipantId\" IS NULL AND \"ClientRequestId\" IS NULL) OR (\"Kind\" = 'topical' AND \"CreatedByParticipantId\" IS NOT NULL AND \"ClientRequestId\" IS NOT NULL)");
            t.HasCheckConstraint("CK_Conversations_DirectPair", "(\"Kind\" IN ('main', 'topical') AND \"DirectParticipantLowId\" IS NULL AND \"DirectParticipantHighId\" IS NULL) OR (\"Kind\" = 'direct' AND \"DirectParticipantLowId\" IS NOT NULL AND \"DirectParticipantHighId\" IS NOT NULL AND \"DirectParticipantLowId\" < \"DirectParticipantHighId\")");
        });
        b.Entity<Membership>().HasKey(m => new { m.ConversationId, m.ParticipantId });
        b.Entity<Membership>().HasOne<Conversation>().WithMany().HasForeignKey(m => m.ConversationId);
        b.Entity<Membership>().HasOne<Participant>().WithMany().HasForeignKey(m => m.ParticipantId);
        b.Entity<Account>().HasIndex(a => a.Email).IsUnique();
        b.Entity<Account>().HasIndex(a => a.ParticipantId).IsUnique();
        b.Entity<Account>().Property(a => a.Email).HasMaxLength(254);
        b.Entity<Account>().Property(a => a.DisplayName).HasMaxLength(100);
        b.Entity<Session>().HasKey(s => s.TokenHash);
        b.Entity<Session>().Property(s => s.TokenHash).HasMaxLength(64);
        b.Entity<Session>().HasOne<Account>().WithMany().HasForeignKey(s => s.AccountId);
    }
}
public sealed class DesignTimeDb : IDesignTimeDbContextFactory<NexusDb>
{
    public NexusDb CreateDbContext(string[] args) => new(new DbContextOptionsBuilder<NexusDb>()
        .UseNpgsql("Host=127.0.0.1;Database=nexus_design_only").Options);
}
