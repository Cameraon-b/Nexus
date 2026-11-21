using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexus.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AgentIdentity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Description",
                table: "Participants",
                type: "character varying(160)",
                maxLength: 160,
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateTable(
                name: "IntegrationTokens",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ParticipantId = table.Column<Guid>(type: "uuid", nullable: false),
                    Label = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    TokenHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    State = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    LastUsedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    RevokedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_IntegrationTokens", x => x.Id);
                    table.ForeignKey(
                        name: "FK_IntegrationTokens_Participants_ParticipantId",
                        column: x => x.ParticipantId,
                        principalTable: "Participants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_IntegrationTokens_ParticipantId",
                table: "IntegrationTokens",
                column: "ParticipantId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "IntegrationTokens");

            // Later Down paths have removed drafts, cursors and agent direct pairs.
            // Tokens must be gone before deleting their owners; public memberships
            // must be gone before deleting participants. Human data is untouched.
            migrationBuilder.Sql("""
                DELETE FROM "Memberships" WHERE "ParticipantId" IN (SELECT "Id" FROM "Participants" WHERE "Kind" = 'agent');
                DELETE FROM "Participants" WHERE "Kind" = 'agent';
                SET CONSTRAINTS ALL IMMEDIATE;
                """);

            migrationBuilder.DropColumn(
                name: "Description",
                table: "Participants");
        }
    }
}
