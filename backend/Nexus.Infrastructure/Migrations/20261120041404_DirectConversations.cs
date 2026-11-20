using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexus.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class DirectConversations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_Conversations_Kind",
                table: "Conversations");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Conversations_TopicalCreator",
                table: "Conversations");

            migrationBuilder.AddColumn<Guid>(
                name: "DirectParticipantHighId",
                table: "Conversations",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "DirectParticipantLowId",
                table: "Conversations",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Conversations_DirectParticipantHighId",
                table: "Conversations",
                column: "DirectParticipantHighId");

            migrationBuilder.CreateIndex(
                name: "IX_Conversations_DirectParticipantLowId_DirectParticipantHighId",
                table: "Conversations",
                columns: new[] { "DirectParticipantLowId", "DirectParticipantHighId" },
                unique: true,
                filter: "\"DirectParticipantLowId\" IS NOT NULL AND \"DirectParticipantHighId\" IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Conversations_DirectPair",
                table: "Conversations",
                sql: "(\"Kind\" IN ('main', 'topical') AND \"DirectParticipantLowId\" IS NULL AND \"DirectParticipantHighId\" IS NULL) OR (\"Kind\" = 'direct' AND \"DirectParticipantLowId\" IS NOT NULL AND \"DirectParticipantHighId\" IS NOT NULL AND \"DirectParticipantLowId\" < \"DirectParticipantHighId\")");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Conversations_Kind",
                table: "Conversations",
                sql: "\"Kind\" IN ('main', 'topical', 'direct')");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Conversations_TopicalCreator",
                table: "Conversations",
                sql: "(\"Kind\" IN ('main', 'direct') AND \"CreatedByParticipantId\" IS NULL AND \"ClientRequestId\" IS NULL) OR (\"Kind\" = 'topical' AND \"CreatedByParticipantId\" IS NOT NULL AND \"ClientRequestId\" IS NOT NULL)");

            migrationBuilder.AddForeignKey(
                name: "FK_Conversations_Participants_DirectParticipantHighId",
                table: "Conversations",
                column: "DirectParticipantHighId",
                principalTable: "Participants",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Conversations_Participants_DirectParticipantLowId",
                table: "Conversations",
                column: "DirectParticipantLowId",
                principalTable: "Participants",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.Sql("""
                -- A write fence, not only a row lock: even repeatable-read participant
                -- updates with an older snapshot must conflict with a newly created pair.
                CREATE FUNCTION nexus_fence_direct_pair() RETURNS trigger LANGUAGE plpgsql AS $$
                DECLARE participant_id uuid;
                BEGIN
                    IF NEW."Kind" = 'direct' THEN
                        FOR participant_id IN SELECT p."Id" FROM "Participants" p
                            WHERE p."Id" IN (NEW."DirectParticipantLowId", NEW."DirectParticipantHighId") ORDER BY p."Id"
                        LOOP
                            UPDATE "Participants" SET "Id" = "Id" WHERE "Id" = participant_id;
                        END LOOP;
                    END IF;
                    RETURN NEW;
                END $$;
                CREATE TRIGGER direct_pair_fence BEFORE INSERT OR UPDATE ON "Conversations"
                    FOR EACH ROW EXECUTE FUNCTION nexus_fence_direct_pair();
                CREATE FUNCTION nexus_check_direct_authorization() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN
                    -- Serialize membership validators before reading their final shape.
                    PERFORM "Id" FROM "Conversations" WHERE "Kind" = 'direct' ORDER BY "Id" FOR UPDATE;
                    IF EXISTS (
                        SELECT 1 FROM "Conversations" c
                        WHERE c."Kind" = 'direct' AND (
                            (SELECT count(*) FROM "Memberships" m WHERE m."ConversationId" = c."Id") <> 2
                            OR NOT EXISTS (SELECT 1 FROM "Memberships" m WHERE m."ConversationId" = c."Id" AND m."ParticipantId" = c."DirectParticipantLowId")
                            OR NOT EXISTS (SELECT 1 FROM "Memberships" m WHERE m."ConversationId" = c."Id" AND m."ParticipantId" = c."DirectParticipantHighId")
                            OR (SELECT count(*) FROM "Participants" p WHERE p."Id" IN (c."DirectParticipantLowId", c."DirectParticipantHighId")
                                AND p."Kind" = 'human' AND p."State" = 'active') <> 2)
                    ) THEN
                        RAISE EXCEPTION 'Direct conversations require exactly their two active human participants'
                            USING ERRCODE = '23514';
                    END IF;
                    RETURN NULL;
                END $$;
                CREATE CONSTRAINT TRIGGER direct_conversation_authorization
                    AFTER INSERT OR UPDATE OR DELETE ON "Conversations"
                    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION nexus_check_direct_authorization();
                CREATE CONSTRAINT TRIGGER direct_membership_authorization
                    AFTER INSERT OR UPDATE OR DELETE ON "Memberships"
                    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION nexus_check_direct_authorization();
                -- TRUNCATE bypasses row triggers; reject it if it would strand a pair.
                CREATE TRIGGER direct_membership_truncate_authorization AFTER TRUNCATE ON "Memberships"
                    FOR EACH STATEMENT EXECUTE FUNCTION nexus_check_direct_authorization();
                CREATE CONSTRAINT TRIGGER direct_participant_authorization
                    AFTER UPDATE OR DELETE ON "Participants"
                    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION nexus_check_direct_authorization();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // The old schema cannot represent private conversations. Only their data is lost.
            migrationBuilder.Sql("""
                DELETE FROM "Messages" WHERE "ConversationId" IN (SELECT "Id" FROM "Conversations" WHERE "Kind" = 'direct');
                DELETE FROM "Memberships" WHERE "ConversationId" IN (SELECT "Id" FROM "Conversations" WHERE "Kind" = 'direct');
                DELETE FROM "Conversations" WHERE "Kind" = 'direct';
                SET CONSTRAINTS ALL IMMEDIATE;
                DROP TRIGGER direct_conversation_authorization ON "Conversations";
                DROP TRIGGER direct_membership_authorization ON "Memberships";
                DROP TRIGGER direct_membership_truncate_authorization ON "Memberships";
                DROP TRIGGER direct_participant_authorization ON "Participants";
                DROP TRIGGER direct_pair_fence ON "Conversations";
                DROP FUNCTION nexus_fence_direct_pair();
                DROP FUNCTION nexus_check_direct_authorization();
                """);

            migrationBuilder.DropForeignKey(
                name: "FK_Conversations_Participants_DirectParticipantHighId",
                table: "Conversations");

            migrationBuilder.DropForeignKey(
                name: "FK_Conversations_Participants_DirectParticipantLowId",
                table: "Conversations");

            migrationBuilder.DropIndex(
                name: "IX_Conversations_DirectParticipantHighId",
                table: "Conversations");

            migrationBuilder.DropIndex(
                name: "IX_Conversations_DirectParticipantLowId_DirectParticipantHighId",
                table: "Conversations");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Conversations_DirectPair",
                table: "Conversations");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Conversations_Kind",
                table: "Conversations");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Conversations_TopicalCreator",
                table: "Conversations");

            migrationBuilder.DropColumn(
                name: "DirectParticipantHighId",
                table: "Conversations");

            migrationBuilder.DropColumn(
                name: "DirectParticipantLowId",
                table: "Conversations");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Conversations_Kind",
                table: "Conversations",
                sql: "\"Kind\" IN ('main', 'topical')");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Conversations_TopicalCreator",
                table: "Conversations",
                sql: "(\"Kind\" = 'main' AND \"CreatedByParticipantId\" IS NULL AND \"ClientRequestId\" IS NULL) OR (\"Kind\" = 'topical' AND \"CreatedByParticipantId\" IS NOT NULL AND \"ClientRequestId\" IS NOT NULL)");
        }
    }
}
