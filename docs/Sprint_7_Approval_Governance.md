# Sprint 7 Development Log — Approval Governance and Draft Delivery

## Sprint boundary

- **Goal:** turn real agent-originated pending drafts into a human-governed communication path with contextual review, editing, approval, rejection, exactly-once publication, truthful authorship, and durable history.
- **Branch:** `sprint-7-approval-governance`
- **Base commit:** `d6499e2f8b168cdde92020ed6f30c992e0093f8c` (`[verified] add agent connections and pending drafts`)
- **Completion date:** November 22, 2026
- **Sprint commit:** the verified commit containing this document on the branch above.

Sprint 7 completes the product loop that Sprint 6 deliberately stopped before publication. An external agent can still only propose a draft. An active human administrator now reviews that proposal in context and makes one final decision. Approval creates one ordinary delivered message authored by the agent; rejection creates no conversation message.

The scope remains message-specific. Sprint 7 does not add arbitrary tool execution, generalized policy workflows, delegated reviewers, or automatic agent publishing.

## Delivered user journey

1. A human sends an authorized agent a message through a normal Nexus conversation.
2. The connector polls its authorized inbox and submits a pending draft.
3. The administrator sees the Review Queue count and opens the draft.
4. Nexus shows the original proposal, agent identity, stable draft and destination identities, recipients, source message, and up to 20 recent delivered context messages.
5. The administrator approves unchanged, edits and approves, or rejects with an optional private reason.
6. Approval atomically records the decision, resolves the draft, and publishes exactly one agent-authored message.
7. Rejection records durable history but publishes nothing.
8. The agent can poll its own narrow terminal status without receiving reviewer identity, private notes, or other agents' information.

Mira's real Sprint 6 draft was preserved through migration as pending. Sprint 7 did not automatically approve, edit, reject, expose, or delete it. It now appears naturally in the real Review Queue for human action.

## Interface layer

### Review Queue entry point

The real workspace now gives active administrators a Review Queue navigation item with a live pending count. Its accessible name announces the singular/plural count or that the queue is caught up. Ordinary human users neither render the control nor request approval data (`src/PersistentWorkspace.tsx:37-46`, `src/PersistentWorkspace.tsx:221`).

The Review Queue is a dedicated governance surface rather than an expansion of Manage Agents. Manage Agents continues to own identity and integration-token administration; Review Queue owns proposal content and decisions.

### Queue, detail, and history

`src/ReviewQueue.tsx:28-112` implements the real API-backed review experience:

- pending and resolved-history views;
- deterministic cursor-paged lists;
- desktop list/detail presentation;
- mobile list-to-detail navigation with Back;
- immutable original proposal and editable final wording;
- approve unchanged, approve with edits, and reject confirmation;
- optional private rejection reason;
- resolved history showing original/final wording, reviewer, time, and delivered message identifier;
- queue, loading, conflict, retry, session-expiry, and empty states.

Names are never treated as identity. Queue items, headings, recipients, reviewers, drafts, and destinations include stable IDs, so duplicate display names and same-titled private conversations remain distinguishable (`src/ReviewQueue.tsx:5-16`, `src/ReviewQueue.tsx:101-106`).

The detail view presents source and recent context with scoped author identity and semantic timestamps. It uses only participants returned for that selected governed destination rather than consulting a workspace-wide private-data cache (`src/ReviewQueue.tsx:14-16`, `src/ReviewQueue.tsx:103-104`).

### Polling and stale-response safety

The queue stores cursor-keyed batches rather than one replaceable list. A five-second first-page refresh replaces only its own batch, preserving explicitly loaded later pages, their selections, and deterministic ordering. Tombstones remove drafts known to be terminal without allowing old queue responses to resurrect them (`src/ReviewQueue.tsx:29-58`).

Queue and detail requests have independent abort controllers and monotonic generations. Switching tabs, selecting another draft, resolving an item, signing out, or closing the surface invalidates obsolete work. A decision conflict retrieves the authoritative terminal detail and reconciles the queue instead of guessing (`src/ReviewQueue.tsx:60-94`).

Detail failures have their own recovery path. Retrying a detail request preserves the selected draft and returns focus to its heading when successful (`src/ReviewQueue.tsx:60-66`, `src/ReviewQueue.tsx:102`).

### Accessibility and modal behavior

The review surface provides labelled dialogs, semantic navigation, live status/error regions, associated final-body errors, keyboard-complete operation, logical focus restoration, and guarded pending operations. The reject confirmation traps focus, inerts the review surface, blocks Escape while its write is pending, and restores focus to the Reject button on cancellation (`src/ReviewQueue.tsx:20-27`, `src/ReviewQueue.tsx:59`, `src/ReviewQueue.tsx:95-111`).

Session expiry clears private review state and returns to authentication. No proposal body, approval state, credential, or CSRF value is written to local storage.

### Conversation presentation

Ordinary message DTOs expose only two presentation facts: whether a message came through review and whether it was edited before release (`backend/Nexus.Application/Workspace.cs:18-21`). They do not expose reviewer identity, private reason, or the original rejected/edited proposal.

The timeline preserves the agent as the visible author and shows restrained truth indicators:

- **Approved through review · agent-authored** for unchanged release;
- **Admin-edited before release · agent-authored** when wording changed.

Pending and rejected content remains absent from Home and conversation-history responses.

## Application and API contracts

### Approval contracts

Purpose-built application records prevent persistence-shaped data from leaking into review responses (`backend/Nexus.Application/Approvals.cs:5-22`). `ApprovalDraft` contains only the review contract: stable IDs, source linkage, immutable body, state, and timestamps. The submitting integration-token ID is not serialized.

The administrator API is:

- `GET /api/admin/approvals?status=pending|resolved&after=<cursor>&limit=<1-100>`
- `GET /api/admin/approvals/{draftId}`
- `POST /api/admin/approvals/{draftId}/decision`

All approval responses are `Cache-Control: no-store`. Unsafe decisions remain under the existing cookie-session and CSRF boundary (`backend/Nexus.Api/Program.cs:148-162`). Integration bearer tokens cannot use these routes.

### Narrow integration outcomes

`GET /api/integrations/drafts` now returns each authenticated agent's own draft state, resolution time, and delivered message ID where applicable. A replacement token for the same participant retains that participant's history; a revoked token immediately loses access. The response excludes body, reviewer identity, and private reason.

Both integration draft proposal and draft listing responses are explicitly non-cacheable (`backend/Nexus.Api/Program.cs:163-173`).

### Contextual approval reads

Pending and resolved lists run in read-only repeatable-read transactions, validate bounded cursor pagination, and sort by immutable `(CreatedAt, Id)` (`backend/Nexus.Infrastructure/ApprovalQueries.cs:16-42`).

Detail returns only the selected governed artifact: agent, destination, canonical recipients, optional source message, up to 20 recent delivered messages, decision, and reviewer (`backend/Nexus.Infrastructure/ApprovalQueries.cs:44-60`). This narrow administrator view does not add the administrator to the conversation or broaden ordinary DM membership.

## Domain and persistence

### Immutable proposal and final decision

`MessageDraft` preserves the connector's original proposal and now supports one transition from `pending` to `approved`, `approved_with_edits`, or `rejected`. Resolution time is recorded, while a domain retry against a terminal draft is rejected (`backend/Nexus.Domain/MessageDraft.cs:3-41`).

`ApprovalDecision` is the first-class governance record (`backend/Nexus.Domain/ApprovalDecision.cs:3-58`). It stores:

- draft and reviewer identity;
- terminal outcome;
- final delivered wording for approved outcomes;
- optional private review note, bounded to 1,000 characters;
- reviewer decision request UUID;
- resolution time;
- delivered message linkage when applicable.

An unchanged approval releases the original body. An edited approval must actually change it. Rejection cannot smuggle final content. The original draft body is never overwritten (`backend/Nexus.Domain/ApprovalDecision.cs:22-56`).

### Message lineage and authorship

Approved messages receive a unique source-draft relationship and an edited-before-release flag. Message creation still validates normalized nonempty content and uses the draft's agent participant as author (`backend/Nexus.Domain/Message.cs:3-37`).

Database uniqueness allows at most one decision and one delivered message per draft. Deferred PostgreSQL consistency guards verify at commit that terminal draft state, decision outcome, final body, delivered-message author/destination, and lineage agree. Immutable-history triggers prevent later rewriting of proposals, decisions, or governed lineage (`backend/Nexus.Infrastructure/NexusDb.cs`, `backend/Nexus.Infrastructure/Migrations/ApprovalGovernanceSql.cs`).

## Atomic decisions, retries, and concurrency

`ApprovalStore.Decide` performs the decision in one transaction (`backend/Nexus.Infrastructure/ApprovalStore.cs:17-73`):

1. Resolve the cookie session and require an active human administrator.
2. Validate the decision request UUID.
3. Acquire deterministic advisory operation fences.
4. Lock and reload the draft after waiting.
5. Share-lock reviewer/account, participant, conversation, and applicable membership state.
6. Recheck reviewer authority and current delivery authorization.
7. Detect exact retries and cross-operation UUID conflicts.
8. Create the decision and, for approval, the agent-authored message.
9. Persist and materialize the response before commit.
10. Commit all state together.

Approval locks both the reviewer and agent operation namespaces because it creates a reviewer decision and an agent-authored message. Rejection locks only the reviewer namespace because it creates no agent operation. This avoids order-dependent UUID behavior while preserving cross-operation retry safety (`backend/Nexus.Infrastructure/ApprovalStore.cs:25-28`, `backend/Nexus.Infrastructure/ApprovalStore.cs:47-53`).

Token lifetime is deliberately not delivery authority. Revoking a token stops future connector access but does not erase an already-submitted proposal. Approval nevertheless rechecks that the agent remains active and currently authorized for the destination. If delivery is no longer valid, approval fails closed while rejection remains available (`backend/Nexus.Infrastructure/ApprovalStore.cs:54-62`).

Concurrent exact retries return the same persisted result. Competing independent decisions produce one success and one conflict. Failures during validation, authorization, persistence, or response materialization leave no partial decision or message.

## Migration and real-data preservation

Migration `20261122043002_ApprovalGovernance` adds approval decisions, terminal draft state, resolution timestamps, message lineage, uniqueness, check constraints, immutable-history guards, and deferred consistency checks.

Upgrade does not modify existing pending drafts. Downgrade removes Sprint 7 governance history and terminal-only draft state in dependency order, strips lineage unsupported by Sprint 6, and retains preexisting pending drafts and supported Sprint 6 identities, tokens, memberships, conversations, and delivered messages. Disposable PostgreSQL tests exercise Sprint 6 → Sprint 7 → Sprint 6 → Sprint 7 after approved, edited, and rejected feature rows exist.

Before real migration, a validated custom-format backup was created:

`C:\Nexus\.local\backups\nexus-pre-sprint7-20261122-003716.dump`

- Size: 38,086 bytes
- SHA-256: `1599fdf5737429df76a56633a2cc16f028674fb1241ffb3d20a0cf00e638f657`
- `pg_restore -l`: passed

The migration was applied through normal Nexus startup. Real migration history advanced from 10 to 11. Data remained:

- 3 accounts
- 4 participants, including 1 agent
- 5 conversations
- 13 delivered messages
- 1 integration token
- 1 pending draft
- 0 approval decisions

The pending draft remained `pending` with no resolution timestamp. Nexus returned HTTP 200 for `/` and `/demo`; unauthenticated admin and integration boundaries returned 401; `.local/runtime.json` remained denied with 403.

## Independent review and corrections

Separate backend/security/data and frontend/privacy/accessibility reviewers inspected the complete implementation.

The first backend review found an order-dependent rejection UUID namespace. The correction made rejection reviewer-only while retaining reviewer+agent fencing for releases, with both operation orderings tested (`backend/Nexus.Tests/ApprovalCorrectionTests.cs:13-88`). The review also prompted narrow approval DTOs and `no-store` integration metadata.

The first frontend review found ambiguous duplicate-name targets and first-page polling that discarded loaded later pages. The correction added full stable identity labels and cursor-keyed batches. It also added scoped context authors/timestamps, accessible pending counts, independent detail retry, and unchanged-release marker coverage.

Fresh backend and frontend re-reviews passed with no remaining security, authorization, concurrency, migration, privacy, accessibility, pagination, or state-lifecycle blocker.

## Independently verified results

Hermes independently reproduced:

- **PostgreSQL backend:** 205 passed, 0 skipped
- **Frontend unit:** 29 passed
- **Tooling:** 4 passed
- **Intercepted browser/UI:** 117 passed
- **Live API/UI/database:** 29 passed
- **Production build:** passed
- **.NET format verification:** passed
- **EF model consistency:** no pending changes
- **Git diff check:** passed
- **Disposable databases:** 0 remaining
- **Isolated listeners on 5081/5175/5176:** 0 remaining
- **New large files:** 0
- **Credential audit:** only explicit disposable test fixture passwords/tokens matched; no real credential or tracked secret finding
- **Real-data count preservation:** exact baseline retained before migration; only migration history advanced afterward

The first independent full browser run encountered one transient five-second startup timeout in an older Manage Agents test. The screenshot showed the correct workspace rendered immediately afterward. The exact test then passed 10 consecutive focused repetitions, and the complete 117-test browser suite passed on rerun. No production or test change was made for that transient event.

The live three-context acceptance is implemented in `tests/live-s7-approvals.spec.ts:3-45`. It proves human DM → agent inbox → pending proposal → contextual admin review → unchanged and edited releases → rejection, ordinary-user privacy, exact retry, conflicting decision, concurrent approve/reject, token replacement continuity, and immediate revocation.

## Intentionally deferred

Sprint 7 does **not** implement:

- approval bypass or automatic agent publishing;
- a policy DSL or generalized capability matrix;
- arbitrary tool/action approval;
- agent-created Topics;
- agent-to-agent DMs;
- attachments;
- delegated, quorum, or multi-stage review;
- scheduled or batch release;
- draft withdrawal/resubmission;
- webhooks, push delivery, or streaming;
- external SaaS connectors;
- generalized moderation workflows;
- a generalized audit-event engine;
- message editing after delivery.

## Code-reading map

1. **HTTP boundaries:** `backend/Nexus.Api/Program.cs`
2. **Approval contracts:** `backend/Nexus.Application/Approvals.cs`
3. **Message presentation contract:** `backend/Nexus.Application/Workspace.cs`
4. **Decision transaction and lock ordering:** `backend/Nexus.Infrastructure/ApprovalStore.cs`
5. **Queue/detail reads:** `backend/Nexus.Infrastructure/ApprovalQueries.cs`
6. **Agent terminal outcomes:** `backend/Nexus.Infrastructure/IntegrationStore.cs`
7. **Approval domain rules:** `backend/Nexus.Domain/ApprovalDecision.cs`
8. **Draft lifecycle:** `backend/Nexus.Domain/MessageDraft.cs`
9. **Message lineage:** `backend/Nexus.Domain/Message.cs`
10. **Schema and relational constraints:** `backend/Nexus.Infrastructure/NexusDb.cs`
11. **Migration SQL guards:** `backend/Nexus.Infrastructure/Migrations/ApprovalGovernanceSql.cs`
12. **Real Review Queue:** `src/ReviewQueue.tsx`
13. **Workspace navigation and timeline markers:** `src/PersistentWorkspace.tsx`
14. **Backend decision/API/race coverage:** `backend/Nexus.Tests/ApprovalApiTests.cs`, `ApprovalRaceTests.cs`, `ApprovalCorrectionTests.cs`
15. **Browser state/accessibility coverage:** `tests/approvals-ui.spec.ts`
16. **Live governed journey:** `tests/live-s7-approvals.spec.ts`
