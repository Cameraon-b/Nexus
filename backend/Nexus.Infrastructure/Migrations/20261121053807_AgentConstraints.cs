using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexus.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AgentConstraints : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                CREATE OR REPLACE FUNCTION nexus_check_direct_authorization() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN
                    PERFORM "Id" FROM "Conversations" WHERE "Kind" = 'direct' ORDER BY "Id" FOR UPDATE;
                    IF EXISTS (
                        SELECT 1 FROM "Conversations" c WHERE c."Kind" = 'direct' AND (
                            (SELECT count(*) FROM "Memberships" m WHERE m."ConversationId" = c."Id") <> 2
                            OR NOT EXISTS (SELECT 1 FROM "Memberships" m WHERE m."ConversationId" = c."Id" AND m."ParticipantId" = c."DirectParticipantLowId")
                            OR NOT EXISTS (SELECT 1 FROM "Memberships" m WHERE m."ConversationId" = c."Id" AND m."ParticipantId" = c."DirectParticipantHighId")
                            OR (SELECT count(*) FROM "Participants" p WHERE p."Id" IN (c."DirectParticipantLowId", c."DirectParticipantHighId") AND p."Kind" IN ('human', 'agent') AND p."State" = 'active') <> 2
                            OR NOT EXISTS (SELECT 1 FROM "Participants" p WHERE p."Id" IN (c."DirectParticipantLowId", c."DirectParticipantHighId") AND p."Kind" = 'human'))
                    ) THEN
                        RAISE EXCEPTION 'Direct conversations require an eligible active pair including a human' USING ERRCODE = '23514';
                    END IF;
                    RETURN NULL;
                END $$;
                DROP TRIGGER direct_participant_authorization ON "Participants";
                CREATE CONSTRAINT TRIGGER direct_participant_authorization
                    AFTER UPDATE OF "Kind", "State" OR DELETE ON "Participants"
                    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION nexus_check_direct_authorization();
                CREATE FUNCTION nexus_check_token_owner() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN
                    IF EXISTS (SELECT 1 FROM "IntegrationTokens" t JOIN "Participants" p ON p."Id" = t."ParticipantId" WHERE p."Kind" <> 'agent') THEN
                        RAISE EXCEPTION 'Integration tokens require agent ownership' USING ERRCODE = '23514';
                    END IF;
                    RETURN NULL;
                END $$;
                CREATE CONSTRAINT TRIGGER integration_token_owner AFTER INSERT OR UPDATE ON "IntegrationTokens"
                    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION nexus_check_token_owner();
                CREATE CONSTRAINT TRIGGER integration_participant_kind AFTER UPDATE ON "Participants"
                    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION nexus_check_token_owner();
                CREATE FUNCTION nexus_terminal_token_revocation() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN
                    IF OLD."State" = 'revoked' AND NEW IS DISTINCT FROM OLD THEN
                        RAISE EXCEPTION 'Revoked integration tokens are immutable' USING ERRCODE = '23514';
                    END IF;
                    RETURN NEW;
                END $$;
                CREATE TRIGGER integration_token_terminal BEFORE UPDATE ON "IntegrationTokens"
                    FOR EACH ROW EXECUTE FUNCTION nexus_terminal_token_revocation();
                """);
            migrationBuilder.DropIndex(
                name: "IX_IntegrationTokens_ParticipantId",
                table: "IntegrationTokens");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Participants_Availability",
                table: "Participants",
                sql: "\"Availability\" IN ('available', 'away', 'offline', 'unknown')");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Participants_Description",
                table: "Participants",
                sql: "\"Description\" = btrim(\"Description\")");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Participants_Kind",
                table: "Participants",
                sql: "\"Kind\" IN ('human', 'agent', 'service')");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Participants_Name",
                table: "Participants",
                sql: "length(btrim(\"Name\")) BETWEEN 1 AND 100 AND \"Name\" = btrim(\"Name\")");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Participants_State",
                table: "Participants",
                sql: "\"State\" IN ('active', 'inactive', 'suspended', 'blocked')");

            migrationBuilder.CreateIndex(
                name: "IX_IntegrationTokens_ParticipantId",
                table: "IntegrationTokens",
                column: "ParticipantId",
                unique: true,
                filter: "\"State\" = 'active'");

            migrationBuilder.CreateIndex(
                name: "IX_IntegrationTokens_TokenHash",
                table: "IntegrationTokens",
                column: "TokenHash",
                unique: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_IntegrationTokens_Hash",
                table: "IntegrationTokens",
                sql: "\"TokenHash\" ~ '^[0-9A-F]{64}$'");

            migrationBuilder.AddCheckConstraint(
                name: "CK_IntegrationTokens_Label",
                table: "IntegrationTokens",
                sql: "length(btrim(\"Label\")) BETWEEN 1 AND 100 AND \"Label\" = btrim(\"Label\")");

            migrationBuilder.AddCheckConstraint(
                name: "CK_IntegrationTokens_State",
                table: "IntegrationTokens",
                sql: "(\"State\" = 'active' AND \"RevokedAt\" IS NULL) OR (\"State\" = 'revoked' AND \"RevokedAt\" IS NOT NULL)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                -- Remove only agent pairs before restoring the human-only invariant.
                DELETE FROM "Messages" WHERE "ConversationId" IN (SELECT c."Id" FROM "Conversations" c JOIN "Participants" p ON p."Id" IN (c."DirectParticipantLowId", c."DirectParticipantHighId") WHERE c."Kind" = 'direct' AND p."Kind" = 'agent');
                DELETE FROM "Memberships" WHERE "ConversationId" IN (SELECT c."Id" FROM "Conversations" c JOIN "Participants" p ON p."Id" IN (c."DirectParticipantLowId", c."DirectParticipantHighId") WHERE c."Kind" = 'direct' AND p."Kind" = 'agent');
                DELETE FROM "Conversations" c USING "Participants" p WHERE c."Kind" = 'direct' AND p."Id" IN (c."DirectParticipantLowId", c."DirectParticipantHighId") AND p."Kind" = 'agent';
                CREATE OR REPLACE FUNCTION nexus_check_direct_authorization() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN
                    PERFORM "Id" FROM "Conversations" WHERE "Kind" = 'direct' ORDER BY "Id" FOR UPDATE;
                    IF EXISTS (SELECT 1 FROM "Conversations" c WHERE c."Kind" = 'direct' AND (
                        (SELECT count(*) FROM "Memberships" m WHERE m."ConversationId" = c."Id") <> 2
                        OR NOT EXISTS (SELECT 1 FROM "Memberships" m WHERE m."ConversationId" = c."Id" AND m."ParticipantId" = c."DirectParticipantLowId")
                        OR NOT EXISTS (SELECT 1 FROM "Memberships" m WHERE m."ConversationId" = c."Id" AND m."ParticipantId" = c."DirectParticipantHighId")
                        OR (SELECT count(*) FROM "Participants" p WHERE p."Id" IN (c."DirectParticipantLowId", c."DirectParticipantHighId") AND p."Kind" = 'human' AND p."State" = 'active') <> 2)) THEN
                        RAISE EXCEPTION 'Direct conversations require exactly their two active human participants' USING ERRCODE = '23514';
                    END IF;
                    RETURN NULL;
                END $$;
                DROP TRIGGER direct_participant_authorization ON "Participants";
                CREATE CONSTRAINT TRIGGER direct_participant_authorization
                    AFTER UPDATE OR DELETE ON "Participants"
                    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION nexus_check_direct_authorization();
                DROP TRIGGER integration_token_owner ON "IntegrationTokens";
                DROP TRIGGER integration_participant_kind ON "Participants";
                DROP TRIGGER integration_token_terminal ON "IntegrationTokens";
                DROP FUNCTION nexus_check_token_owner();
                DROP FUNCTION nexus_terminal_token_revocation();
                """);
            migrationBuilder.DropCheckConstraint(
                name: "CK_Participants_Availability",
                table: "Participants");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Participants_Description",
                table: "Participants");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Participants_Kind",
                table: "Participants");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Participants_Name",
                table: "Participants");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Participants_State",
                table: "Participants");

            migrationBuilder.DropIndex(
                name: "IX_IntegrationTokens_ParticipantId",
                table: "IntegrationTokens");

            migrationBuilder.DropIndex(
                name: "IX_IntegrationTokens_TokenHash",
                table: "IntegrationTokens");

            migrationBuilder.DropCheckConstraint(
                name: "CK_IntegrationTokens_Hash",
                table: "IntegrationTokens");

            migrationBuilder.DropCheckConstraint(
                name: "CK_IntegrationTokens_Label",
                table: "IntegrationTokens");

            migrationBuilder.DropCheckConstraint(
                name: "CK_IntegrationTokens_State",
                table: "IntegrationTokens");

            migrationBuilder.CreateIndex(
                name: "IX_IntegrationTokens_ParticipantId",
                table: "IntegrationTokens",
                column: "ParticipantId");
        }
    }
}
