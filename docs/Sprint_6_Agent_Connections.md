# Sprint 6 Development Log — Agent Connections and Pending Replies

## Sprint boundary

- **Goal:** connect external agents to Nexus as visible participants, let humans message them through the ordinary workspace, and accept agent replies as pending drafts without granting publishing authority.
- **Branch:** `sprint-6-agent-connections`
- **Base commit:** `6a60c93` (`docs: Add Nexus First Five Sprints documentation`)
- **Completion date:** November 21, 2026
- **Sprint commit:** the verified commit containing this document on the branch above.

Sprint 6 is the first real non-human participation slice. It deliberately ends at a pending draft. Approval, editing, rejection, delivery, and governance history remain Sprint 7 work.

## Delivered user journey

An active human administrator can open **Manage agents**, create an agent identity, and receive a cryptographically random integration token exactly once. The agent immediately appears as an `AGENT` participant with honest availability. Humans can select it in the normal Direct Message dialog and send messages into a persistent human-agent conversation.

A connector authenticates separately from human sessions, polls its authorized inbox, and proposes a reply. Nexus stores that reply as a pending draft. The administrator sees a count, but neither the admin list nor ordinary conversation APIs expose the draft body. Revoking the integration token immediately stops connector access.

The real workspace was migrated only after independent reviews and full disposable-database verification. Existing real data was preserved: 3 accounts, 3 human participants, 5 conversations, 13 memberships, and 13 delivered messages. The migration added four schema-history entries and no agent or draft sample data.

## Interface layer

### Manage Agents

`src/ManageAgents.tsx:20-129` implements the real administration surface. It owns four explicit view states: agent list, create form, one-time token reveal, and revoke/replace confirmation (`src/ManageAgents.tsx:9-18`).

The create form performs field-specific validation and removes stale accessibility state as values become valid (`src/ManageAgents.tsx:80-87`, `src/ManageAgents.tsx:122-126`). Invalid controls receive `aria-invalid`, associated error text, and first-invalid focus. Nested dialogs trap keyboard focus while the workspace beneath them is inert.

Raw tokens exist only in the reveal view. They are never placed in local storage, session storage, URL state, or metadata responses. Copy failure leaves the token visible for manual saving. Done and Escape clear the secret from component state before restoring focus (`src/ManageAgents.tsx:68-76`, `src/ManageAgents.tsx:124-126`).

The screen uses monotonic request generations so an older five-second poll cannot restore stale token or pending-count data after create, revoke, or replace (`src/ManageAgents.tsx:50-62`). A genuine replacement conflict refreshes authoritative metadata and rebinds the confirmation to the current token rather than repeatedly submitting an obsolete token ID (`src/ManageAgents.tsx:102-113`).

Session expiry is coordinated with one-time secrets. Operations that never produce a secret transition to sign-in as soon as they settle. Successful creation or replacement may retain the reveal long enough for the administrator to save the otherwise unrecoverable token (`src/ManageAgents.tsx:29-49`).

### Participant and DM presentation

The persistent workspace now understands human and agent participants through the shared participant type (`src/PersistentWorkspace.tsx:4-10`). Agent identity, availability, and stable UUID-based disambiguation are shown in selectors and conversation context (`src/PersistentWorkspace.tsx:202-208`).

Human-agent DMs use the existing Direct Message interaction rather than a separate task UI. Creation still posts only a stable participant UUID and retains Sprint 5’s retry, focus, cache-purge, and stale-response protections (`src/PersistentWorkspace.tsx:151-164`). Desktop and mobile context continue to derive people from the selected conversation’s canonical pair.

## API and application contracts

Human/admin endpoints continue to use database-backed session cookies and CSRF. Integration endpoints are a distinct route group marked bearer-only. The antiforgery exemption applies only to that explicit metadata marker, not to arbitrary requests (`backend/Nexus.Api/Program.cs:35-46`, `backend/Nexus.Api/Program.cs:147-157`).

Administrative routes support agent listing/creation, token metadata, replacement, and revocation (`backend/Nexus.Api/Program.cs:111-146`). Human workspace and conversation routes have an additional active-human filter, preventing malformed agent-linked accounts from using the human API (`backend/Nexus.Api/Program.cs:83-109`, `backend/Nexus.Api/Program.cs:159-167`).

The integration contracts are intentionally small:

- `GET /api/integrations/me`
- `GET /api/integrations/inbox`
- `GET /api/integrations/drafts`
- `POST /api/integrations/drafts`

Request and response records are defined in `backend/Nexus.Application/Agents.cs:5-19`. Draft authorship and token identity are never accepted from the connector request; the server derives them from the authenticated token.

## Domain and persistence

### Agent identity and tokens

Agent creation validates and trims identity data, generates 256 bits of random token material, stores only its SHA-256 hash, and atomically adds the new participant to Main and every active public Topic (`backend/Nexus.Infrastructure/AgentStore.cs:21-46`). It shares the public-membership advisory lock with registration and Topic creation so concurrent operations cannot leave missing public memberships.

Token replacement and revocation use the same participant-scoped integration fence as authenticated connector operations (`backend/Nexus.Infrastructure/AgentStore.cs:57-92`). Replacement is compare-and-swap: an obsolete expected token ID produces a conflict instead of silently rotating a newer token.

The database enforces one active token per participant, unique token hashes, bounded labels, hash format, and coherent active/revoked timestamps (`backend/Nexus.Infrastructure/NexusDb.cs:51-61`). Raw token material does not have a persistence column.

### Conversation authorization

`ConversationAccess` centralizes authorized conversation discovery for both humans and agents (`backend/Nexus.Infrastructure/ConversationAccess.cs:6-16`). Public rooms require explicit membership. Direct rooms use the canonical low/high participant columns and validate that both participants remain active and eligible, including at least one human. Arbitrary membership rows cannot grant access to a private conversation.

Human-agent Direct creation reuses the same unordered-pair uniqueness and pair-locking model as human-human DMs. Database triggers and constraints preserve exact pair membership and reject later participant changes that would invalidate an existing pair. Agent-agent and service DMs remain outside Sprint 6.

### Inbox polling

Integration authentication validates the strict Nexus bearer-token format, hashes it, resolves a single active token, acquires the participant integration fence, and rechecks both token and active-agent state inside the transaction (`backend/Nexus.Infrastructure/IntegrationStore.cs:20-39`). Successful activity updates availability and last-used time only after the requested operation succeeds.

Inbox polling returns delivered, non-self-authored messages from currently authorized conversations in deterministic `(CreatedAt, Id)` order (`backend/Nexus.Infrastructure/IntegrationStore.cs:69-100`). Page sizes are bounded. The continuation value is an opaque participant-scoped cursor rather than a replaceable-token cursor, so token rotation does not reset the agent’s place (`backend/Nexus.Domain/InboxCursor.cs:3-11`). A deleted or no-longer-visible boundary produces a generic invalid-cursor response instead of retaining inaccessible content.

### Pending drafts

A proposed reply is normalized and validated in the domain, including body length and nonempty request UUID (`backend/Nexus.Domain/MessageDraft.cs:17-29`). The integration store verifies current conversation access and optional source-message membership before writing (`backend/Nexus.Infrastructure/IntegrationStore.cs:45-65`).

The agent/request UUID lock is shared with delivered-message and Topic operation identities. Identical retries return the same pending draft; different payloads or cross-operation reuse return a deterministic conflict. The schema constrains drafts to `pending`, normalized nonempty bodies, valid UUIDs, and foreign keys to author, token, conversation, and optional source message (`backend/Nexus.Infrastructure/NexusDb.cs:19-33`). No Sprint 6 route converts a draft into a visible Message.

## Migrations and downgrade behavior

Sprint 6 adds four migrations:

1. `AgentIdentity`
2. `AgentConstraints`
3. `PendingAgentDrafts`
4. `ParticipantInboxCursors`

The upgrade preserves all existing human data. Downgrade removes cursors, drafts, human-agent Direct rows, tokens, agent public memberships, and agent participants in dependency order before restoring the pre-Sprint-6 constraints. Existing humans, public rooms, human-human DMs, and delivered messages remain intact. This path is exercised with real feature rows in `backend/Nexus.Tests/AgentMigrationTests.cs:11-93`.

## Security, concurrency, and failure handling

Key invariants proven in this sprint:

- Human sessions and integration tokens are separate authentication lifecycles.
- Human/admin unsafe requests still require CSRF.
- Bearer-only integration requests cannot use a human cookie as a substitute.
- Raw integration tokens are returned once, marked `no-store`, and never persisted.
- Revocation and replacement serialize against every authenticated integration operation.
- A request that resolved a token before revocation still fails after crossing the shared fence.
- Agent/public membership creation serializes with human registration and Topic creation.
- Direct privacy comes from the canonical pair, not mutable membership rows.
- Pending draft bodies never enter Home, message-history, or admin-agent-list responses.
- Client request UUIDs remain an author-scoped operation namespace across messages, Topics, and drafts.

The revocation fence and mixed-contention scenarios are covered in `backend/Nexus.Tests/IntegrationRaceTests.cs:13-82`. The complete live journey checks hashed storage, pending-only persistence, no delivered agent message, admin count-only visibility, ordinary-user privacy, and immediate revocation (`tests/live-s6-agents.spec.ts:5-49`).

## Independent verification

Hermes independently reproduced the final results after two Pi correction rounds and separate backend and frontend reviews:

- **Frontend unit:** 29 passed
- **Tooling:** 3 passed
- **PostgreSQL backend:** 147 passed, 0 skipped
- **Intercepted/prototype browser:** 99 passed
- **Live API/UI/database:** 28 passed
- **Production build:** passed
- **.NET format verification:** passed
- **EF model consistency:** no pending model changes
- **Git diff check:** passed
- **Source/secret/large-file audit:** 0 findings
- **Disposable databases:** none remaining
- **Fixed test listeners:** none remaining

Before migration, a validated custom-format backup was created at `.local/backups/nexus-pre-sprint6-20261121-021626.dump`. The backup and restore catalog are ignored from Git.

After migration, the real workspace returned HTTP 200 for `/` and `/demo`; unauthenticated integration/admin access returned 401; `.local/runtime.json` remained denied with 403. Real data counts remained unchanged, with 10 migrations and zero agent tokens, drafts, or cursors until the administrator intentionally creates them.

## Intentionally deferred

Sprint 6 does **not** implement:

- approving, editing, rejecting, or cancelling drafts;
- publishing agent-authored messages;
- approval decisions or message lineage;
- general capability or policy matrices;
- moderation workflows;
- agent-agent DMs;
- service participants;
- push connectors, webhooks, streaming, or delivery acknowledgements;
- action/tool execution;
- configuration of Hermes, OpenClaw, or any external connector outside Nexus.

The `/demo` prototype still contains simulated approval behavior for design reference. It is not evidence that the real workspace can approve agent output.

## Code-reading map

1. **HTTP boundaries:** `backend/Nexus.Api/Program.cs`
2. **Integration/admin DTOs:** `backend/Nexus.Application/Agents.cs`
3. **Agent and token administration:** `backend/Nexus.Infrastructure/AgentStore.cs`
4. **Bearer authentication, inbox, and draft submission:** `backend/Nexus.Infrastructure/IntegrationStore.cs`
5. **Shared conversation authorization:** `backend/Nexus.Infrastructure/ConversationAccess.cs`
6. **Draft rules:** `backend/Nexus.Domain/MessageDraft.cs`
7. **Schema constraints:** `backend/Nexus.Infrastructure/NexusDb.cs`
8. **Admin interface and one-time token lifecycle:** `src/ManageAgents.tsx`
9. **Participant/DM integration:** `src/PersistentWorkspace.tsx`
10. **Migration preservation and downgrade:** `backend/Nexus.Tests/AgentMigrationTests.cs`
11. **Revocation and mixed-contention races:** `backend/Nexus.Tests/IntegrationRaceTests.cs`
12. **Real three-context acceptance:** `tests/live-s6-agents.spec.ts`
