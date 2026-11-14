using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Nexus.Domain;
namespace Nexus.Infrastructure;

public sealed class NexusDb(DbContextOptions<NexusDb> options) : DbContext(options)
{
    public DbSet<Message> Messages => Set<Message>();
    public DbSet<Participant> Participants => Set<Participant>();
    public DbSet<Conversation> Conversations => Set<Conversation>();
    public DbSet<Membership> Memberships => Set<Membership>();
    public DbSet<Account> Accounts => Set<Account>();
    public DbSet<Session> Sessions => Set<Session>();
    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Message>().HasIndex(m => new { m.AuthorId, m.ClientRequestId }).IsUnique();
        b.Entity<Message>().HasIndex(m => new { m.ConversationId, m.CreatedAt, m.Id });
        b.Entity<Message>().HasOne<Participant>().WithMany().HasForeignKey(m => m.AuthorId);
        b.Entity<Message>().HasOne<Conversation>().WithMany().HasForeignKey(m => m.ConversationId);
        b.Entity<Message>().Property(m => m.Body).HasMaxLength(5000);
        b.Entity<Message>().Property(m => m.State).HasMaxLength(20);
        b.Entity<Account>().HasOne<Participant>().WithOne().HasForeignKey<Account>(a => a.ParticipantId);
        b.Entity<Participant>().Property(p => p.Name).HasMaxLength(100);
        b.Entity<Conversation>().Property(c => c.Id).HasMaxLength(40);
        b.Entity<Conversation>().Property(c => c.Title).HasMaxLength(80);
        b.Entity<Conversation>().Property(c => c.Description).HasMaxLength(160);
        b.Entity<Conversation>().Property(c => c.Kind).HasMaxLength(20);
        b.Entity<Conversation>().Property(c => c.State).HasMaxLength(20);
        b.Entity<Conversation>().HasOne<Participant>().WithMany().HasForeignKey(c => c.CreatedByParticipantId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<Conversation>().HasIndex(c => new { c.CreatedByParticipantId, c.ClientRequestId }).IsUnique().HasFilter("\"CreatedByParticipantId\" IS NOT NULL AND \"ClientRequestId\" IS NOT NULL");
        b.Entity<Conversation>().ToTable(t =>
        {
            t.HasCheckConstraint("CK_Conversations_Kind", "\"Kind\" IN ('main', 'topical')");
            t.HasCheckConstraint("CK_Conversations_State", "\"State\" = 'active'");
            t.HasCheckConstraint("CK_Conversations_TopicalCreator", "(\"Kind\" = 'main' AND \"CreatedByParticipantId\" IS NULL AND \"ClientRequestId\" IS NULL) OR (\"Kind\" = 'topical' AND \"CreatedByParticipantId\" IS NOT NULL AND \"ClientRequestId\" IS NOT NULL)");
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
