namespace Nexus.Infrastructure.Migrations;

// Cross-row invariants are deferred so EF can insert the message, decision and
// terminal draft in its FK-safe order within a single transaction.
internal static class ApprovalGovernanceSql
{
    internal const string Up = """
        CREATE FUNCTION nexus_approval_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            IF TG_TABLE_NAME = 'ApprovalDecisions' THEN
                RAISE EXCEPTION 'Approval decisions are immutable' USING ERRCODE = '23514';
            ELSIF TG_TABLE_NAME = 'MessageDrafts' THEN
                IF TG_OP = 'DELETE' THEN
                    RAISE EXCEPTION 'Draft proposals are immutable' USING ERRCODE = '23514';
                END IF;
                IF (to_jsonb(NEW) - 'State' - 'ResolvedAt') IS DISTINCT FROM (to_jsonb(OLD) - 'State' - 'ResolvedAt')
                   OR (OLD."State" <> 'pending' AND NEW IS DISTINCT FROM OLD) THEN
                    RAISE EXCEPTION 'Draft proposals and terminal states are immutable' USING ERRCODE = '23514';
                END IF;
            ELSE
                IF TG_OP = 'DELETE' THEN
                    IF OLD."SourceDraftId" IS NOT NULL THEN
                        RAISE EXCEPTION 'Released messages are immutable' USING ERRCODE = '23514';
                    END IF;
                    RETURN OLD;
                END IF;
                IF (OLD."SourceDraftId" IS NOT NULL AND NEW IS DISTINCT FROM OLD)
                   OR NEW."SourceDraftId" IS DISTINCT FROM OLD."SourceDraftId" THEN
                    RAISE EXCEPTION 'Released messages are immutable' USING ERRCODE = '23514';
                END IF;
            END IF;
            RETURN NEW;
        END $$;
        CREATE TRIGGER nexus_draft_immutable BEFORE UPDATE OR DELETE ON "MessageDrafts"
            FOR EACH ROW EXECUTE FUNCTION nexus_approval_immutable();
        CREATE TRIGGER nexus_decision_immutable BEFORE UPDATE OR DELETE ON "ApprovalDecisions"
            FOR EACH ROW EXECUTE FUNCTION nexus_approval_immutable();
        CREATE TRIGGER nexus_release_immutable BEFORE UPDATE OR DELETE ON "Messages"
            FOR EACH ROW EXECUTE FUNCTION nexus_approval_immutable();

        CREATE FUNCTION nexus_approval_coherent() RETURNS trigger LANGUAGE plpgsql AS $$
        DECLARE
            target uuid;
            draft "MessageDrafts"%ROWTYPE;
            decision "ApprovalDecisions"%ROWTYPE;
            message "Messages"%ROWTYPE;
        BEGIN
            IF TG_TABLE_NAME = 'MessageDrafts' THEN target := NEW."Id";
            ELSIF TG_TABLE_NAME = 'ApprovalDecisions' THEN target := NEW."DraftId";
            ELSE target := NEW."SourceDraftId";
            END IF;
            IF target IS NULL THEN RETURN NULL; END IF;
            SELECT * INTO STRICT draft FROM "MessageDrafts" WHERE "Id" = target;
            SELECT * INTO decision FROM "ApprovalDecisions" WHERE "DraftId" = target;
            SELECT * INTO message FROM "Messages" WHERE "SourceDraftId" = target;
            IF draft."State" = 'pending' THEN
                IF decision."Id" IS NOT NULL OR message."Id" IS NOT NULL THEN
                    RAISE EXCEPTION 'Pending draft cannot have a decision or release' USING ERRCODE = '23514';
                END IF;
            ELSE
                IF decision."Id" IS NULL OR decision."Outcome" <> draft."State"
                   OR decision."ResolvedAt" <> draft."ResolvedAt" THEN
                    RAISE EXCEPTION 'Terminal draft requires matching decision' USING ERRCODE = '23514';
                END IF;
                IF decision."Outcome" = 'rejected' THEN
                    IF message."Id" IS NOT NULL THEN
                        RAISE EXCEPTION 'Rejection cannot release a message' USING ERRCODE = '23514';
                    END IF;
                ELSE
                    IF message."Id" IS NULL OR message."Id" <> decision."DeliveredMessageId"
                       OR message."AuthorId" <> draft."AuthorId" OR message."ConversationId" <> draft."ConversationId"
                       OR message."Body" <> decision."FinalBody" OR message."State" <> 'delivered'
                       OR message."EditedBeforeRelease" <> (decision."Outcome" = 'approved_with_edits')
                       OR (decision."Outcome" = 'approved' AND decision."FinalBody" <> draft."Body")
                       OR (decision."Outcome" = 'approved_with_edits' AND decision."FinalBody" = draft."Body") THEN
                        RAISE EXCEPTION 'Release must match proposal, decision and agent lineage' USING ERRCODE = '23514';
                    END IF;
                END IF;
            END IF;
            RETURN NULL;
        END $$;
        CREATE CONSTRAINT TRIGGER nexus_draft_coherent AFTER INSERT OR UPDATE ON "MessageDrafts"
            DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION nexus_approval_coherent();
        CREATE CONSTRAINT TRIGGER nexus_decision_coherent AFTER INSERT ON "ApprovalDecisions"
            DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION nexus_approval_coherent();
        CREATE CONSTRAINT TRIGGER nexus_release_coherent AFTER INSERT OR UPDATE ON "Messages"
            DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION nexus_approval_coherent();
        """;

    internal const string Down = """
        DROP TRIGGER nexus_draft_coherent ON "MessageDrafts";
        DROP TRIGGER nexus_decision_coherent ON "ApprovalDecisions";
        DROP TRIGGER nexus_release_coherent ON "Messages";
        DROP FUNCTION nexus_approval_coherent();
        DROP TRIGGER nexus_draft_immutable ON "MessageDrafts";
        DROP TRIGGER nexus_decision_immutable ON "ApprovalDecisions";
        DROP TRIGGER nexus_release_immutable ON "Messages";
        DROP FUNCTION nexus_approval_immutable();
        """;
}
