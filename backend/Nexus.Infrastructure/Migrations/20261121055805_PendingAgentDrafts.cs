using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexus.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class PendingAgentDrafts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "MessageDrafts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ConversationId = table.Column<string>(type: "character varying(40)", nullable: false),
                    AuthorId = table.Column<Guid>(type: "uuid", nullable: false),
                    SubmittedTokenId = table.Column<Guid>(type: "uuid", nullable: false),
                    ClientRequestId = table.Column<Guid>(type: "uuid", nullable: false),
                    SourceMessageId = table.Column<Guid>(type: "uuid", nullable: true),
                    Body = table.Column<string>(type: "character varying(5000)", maxLength: 5000, nullable: false),
                    State = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MessageDrafts", x => x.Id);
                    table.CheckConstraint("CK_MessageDrafts_Body", "length(btrim(\"Body\")) BETWEEN 1 AND 5000 AND \"Body\" = btrim(\"Body\")");
                    table.CheckConstraint("CK_MessageDrafts_Request", "\"ClientRequestId\" <> '00000000-0000-0000-0000-000000000000'::uuid");
                    table.CheckConstraint("CK_MessageDrafts_State", "\"State\" = 'pending'");
                    table.ForeignKey(
                        name: "FK_MessageDrafts_Conversations_ConversationId",
                        column: x => x.ConversationId,
                        principalTable: "Conversations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_MessageDrafts_IntegrationTokens_SubmittedTokenId",
                        column: x => x.SubmittedTokenId,
                        principalTable: "IntegrationTokens",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MessageDrafts_Messages_SourceMessageId",
                        column: x => x.SourceMessageId,
                        principalTable: "Messages",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MessageDrafts_Participants_AuthorId",
                        column: x => x.AuthorId,
                        principalTable: "Participants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_MessageDrafts_AuthorId_ClientRequestId",
                table: "MessageDrafts",
                columns: new[] { "AuthorId", "ClientRequestId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MessageDrafts_ConversationId",
                table: "MessageDrafts",
                column: "ConversationId");

            migrationBuilder.CreateIndex(
                name: "IX_MessageDrafts_SourceMessageId",
                table: "MessageDrafts",
                column: "SourceMessageId");

            migrationBuilder.CreateIndex(
                name: "IX_MessageDrafts_SubmittedTokenId",
                table: "MessageDrafts",
                column: "SubmittedTokenId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MessageDrafts");
        }
    }
}
