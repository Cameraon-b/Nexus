using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexus.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ApprovalGovernance : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_MessageDrafts_State",
                table: "MessageDrafts");

            migrationBuilder.AddColumn<bool>(
                name: "EditedBeforeRelease",
                table: "Messages",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<Guid>(
                name: "SourceDraftId",
                table: "Messages",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ResolvedAt",
                table: "MessageDrafts",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ApprovalDecisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DraftId = table.Column<Guid>(type: "uuid", nullable: false),
                    ReviewerParticipantId = table.Column<Guid>(type: "uuid", nullable: false),
                    Outcome = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    FinalBody = table.Column<string>(type: "character varying(5000)", maxLength: 5000, nullable: true),
                    Reason = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    ClientRequestId = table.Column<Guid>(type: "uuid", nullable: false),
                    ResolvedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    DeliveredMessageId = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ApprovalDecisions", x => x.Id);
                    table.CheckConstraint("CK_ApprovalDecisions_Body", "\"FinalBody\" IS NULL OR (length(btrim(\"FinalBody\")) BETWEEN 1 AND 5000 AND \"FinalBody\" = btrim(\"FinalBody\"))");
                    table.CheckConstraint("CK_ApprovalDecisions_Reason", "\"Reason\" IS NULL OR (length(btrim(\"Reason\")) BETWEEN 1 AND 1000 AND \"Reason\" = btrim(\"Reason\"))");
                    table.CheckConstraint("CK_ApprovalDecisions_Request", "\"ClientRequestId\" <> '00000000-0000-0000-0000-000000000000'::uuid");
                    table.CheckConstraint("CK_ApprovalDecisions_Shape", "(\"Outcome\" IN ('approved','approved_with_edits') AND \"FinalBody\" IS NOT NULL AND \"DeliveredMessageId\" IS NOT NULL) OR (\"Outcome\" = 'rejected' AND \"FinalBody\" IS NULL AND \"DeliveredMessageId\" IS NULL)");
                    table.ForeignKey(
                        name: "FK_ApprovalDecisions_MessageDrafts_DraftId",
                        column: x => x.DraftId,
                        principalTable: "MessageDrafts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ApprovalDecisions_Messages_DeliveredMessageId",
                        column: x => x.DeliveredMessageId,
                        principalTable: "Messages",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ApprovalDecisions_Participants_ReviewerParticipantId",
                        column: x => x.ReviewerParticipantId,
                        principalTable: "Participants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Messages_SourceDraftId",
                table: "Messages",
                column: "SourceDraftId",
                unique: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_Messages_EditedLineage",
                table: "Messages",
                sql: "NOT \"EditedBeforeRelease\" OR \"SourceDraftId\" IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "CK_MessageDrafts_State",
                table: "MessageDrafts",
                sql: "(\"State\" = 'pending' AND \"ResolvedAt\" IS NULL) OR (\"State\" IN ('approved','approved_with_edits','rejected') AND \"ResolvedAt\" IS NOT NULL)");

            migrationBuilder.CreateIndex(
                name: "IX_ApprovalDecisions_DeliveredMessageId",
                table: "ApprovalDecisions",
                column: "DeliveredMessageId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ApprovalDecisions_DraftId",
                table: "ApprovalDecisions",
                column: "DraftId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ApprovalDecisions_ReviewerParticipantId_ClientRequestId",
                table: "ApprovalDecisions",
                columns: new[] { "ReviewerParticipantId", "ClientRequestId" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_Messages_MessageDrafts_SourceDraftId",
                table: "Messages",
                column: "SourceDraftId",
                principalTable: "MessageDrafts",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
            migrationBuilder.Sql(ApprovalGovernanceSql.Up);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(ApprovalGovernanceSql.Down);
            migrationBuilder.DropForeignKey(
                name: "FK_Messages_MessageDrafts_SourceDraftId",
                table: "Messages");

            migrationBuilder.DropTable(
                name: "ApprovalDecisions");

            migrationBuilder.DropIndex(
                name: "IX_Messages_SourceDraftId",
                table: "Messages");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Messages_EditedLineage",
                table: "Messages");

            migrationBuilder.DropCheckConstraint(
                name: "CK_MessageDrafts_State",
                table: "MessageDrafts");

            migrationBuilder.DropColumn(
                name: "EditedBeforeRelease",
                table: "Messages");

            migrationBuilder.DropColumn(
                name: "SourceDraftId",
                table: "Messages");

            migrationBuilder.DropColumn(
                name: "ResolvedAt",
                table: "MessageDrafts");

            // Preserve delivered messages as Sprint 6 messages without lineage.
            // Remove terminal feature drafts rather than resurrecting them as pending.
            migrationBuilder.Sql("DELETE FROM \"MessageDrafts\" WHERE \"State\" <> 'pending';");
            migrationBuilder.AddCheckConstraint(
                name: "CK_MessageDrafts_State",
                table: "MessageDrafts",
                sql: "\"State\" = 'pending'");
        }
    }
}
