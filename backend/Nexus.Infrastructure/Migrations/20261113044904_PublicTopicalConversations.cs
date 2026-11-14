using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexus.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class PublicTopicalConversations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Messages_ConversationId",
                table: "Messages");

            migrationBuilder.AlterColumn<string>(
                name: "State",
                table: "Messages",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AlterColumn<string>(
                name: "Title",
                table: "Conversations",
                type: "character varying(80)",
                maxLength: 80,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AlterColumn<string>(
                name: "State",
                table: "Conversations",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AlterColumn<string>(
                name: "Kind",
                table: "Conversations",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AlterColumn<string>(
                name: "Description",
                table: "Conversations",
                type: "character varying(160)",
                maxLength: 160,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AddColumn<Guid>(
                name: "ClientRequestId",
                table: "Conversations",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "CreatedAt",
                table: "Conversations",
                type: "timestamp with time zone",
                nullable: false,
                defaultValueSql: "CURRENT_TIMESTAMP");

            migrationBuilder.Sql("ALTER TABLE \"Conversations\" ALTER COLUMN \"CreatedAt\" DROP DEFAULT");

            migrationBuilder.AddColumn<Guid>(
                name: "CreatedByParticipantId",
                table: "Conversations",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Messages_ConversationId_CreatedAt_Id",
                table: "Messages",
                columns: new[] { "ConversationId", "CreatedAt", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_Conversations_CreatedByParticipantId_ClientRequestId",
                table: "Conversations",
                columns: new[] { "CreatedByParticipantId", "ClientRequestId" },
                unique: true,
                filter: "\"CreatedByParticipantId\" IS NOT NULL AND \"ClientRequestId\" IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Conversations_Kind",
                table: "Conversations",
                sql: "\"Kind\" IN ('main', 'topical')");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Conversations_State",
                table: "Conversations",
                sql: "\"State\" = 'active'");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Conversations_TopicalCreator",
                table: "Conversations",
                sql: "(\"Kind\" = 'main' AND \"CreatedByParticipantId\" IS NULL AND \"ClientRequestId\" IS NULL) OR (\"Kind\" = 'topical' AND \"CreatedByParticipantId\" IS NOT NULL AND \"ClientRequestId\" IS NOT NULL)");

            migrationBuilder.AddForeignKey(
                name: "FK_Conversations_Participants_CreatedByParticipantId",
                table: "Conversations",
                column: "CreatedByParticipantId",
                principalTable: "Participants",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Conversations_Participants_CreatedByParticipantId",
                table: "Conversations");

            migrationBuilder.DropIndex(
                name: "IX_Messages_ConversationId_CreatedAt_Id",
                table: "Messages");

            migrationBuilder.DropIndex(
                name: "IX_Conversations_CreatedByParticipantId_ClientRequestId",
                table: "Conversations");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Conversations_Kind",
                table: "Conversations");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Conversations_State",
                table: "Conversations");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Conversations_TopicalCreator",
                table: "Conversations");

            migrationBuilder.DropColumn(
                name: "ClientRequestId",
                table: "Conversations");

            migrationBuilder.DropColumn(
                name: "CreatedAt",
                table: "Conversations");

            migrationBuilder.DropColumn(
                name: "CreatedByParticipantId",
                table: "Conversations");

            migrationBuilder.AlterColumn<string>(
                name: "State",
                table: "Messages",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(20)",
                oldMaxLength: 20);

            migrationBuilder.AlterColumn<string>(
                name: "Title",
                table: "Conversations",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(80)",
                oldMaxLength: 80);

            migrationBuilder.AlterColumn<string>(
                name: "State",
                table: "Conversations",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(20)",
                oldMaxLength: 20);

            migrationBuilder.AlterColumn<string>(
                name: "Kind",
                table: "Conversations",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(20)",
                oldMaxLength: 20);

            migrationBuilder.AlterColumn<string>(
                name: "Description",
                table: "Conversations",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(160)",
                oldMaxLength: 160);

            migrationBuilder.CreateIndex(
                name: "IX_Messages_ConversationId",
                table: "Messages",
                column: "ConversationId");
        }
    }
}
