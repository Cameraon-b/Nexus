# Nexus backend slice

ASP.NET Core / .NET 10 with PostgreSQL persistence. All projects target `net10.0`.

## Projects

- `Nexus.Api`: HTTP composition, CSRF, cookies, rate limiting, safe problem responses.
- `Nexus.Application`: use-case ports and transport-independent DTO contracts.
- `Nexus.Domain`: identity/message rules and account, participant, conversation, membership, message and session models.
- `Nexus.Infrastructure`: EF Core/Npgsql mappings, migrations, transactional implementations, Identity password hashing and opaque sessions.
- `Nexus.Tests`: real PostgreSQL integration tests through fresh ASP.NET hosts; no in-memory database provider.

## Sprint 7 — human-governed agent delivery

The real `/` workspace now provides an admin-only Review queue, contextual detail, unchanged/edited approval, rejection and bounded history. `/demo` remains a separate browser-local simulation. The `ApprovalGovernance` migration was reviewed, backed up, and applied to the real local `nexus` database; migration history advanced from 10 to 11 and protected data was preserved. See the [Sprint 7 migration and real-data preservation evidence](../docs/Sprint_7_Approval_Governance.md#migration-and-real-data-preservation) for the historical record; private content is not repeated here.

The `ApprovalGovernance` schema adds immutable `ApprovalDecision` records, terminal draft states/resolution time, and unique agent-message draft lineage with an edited-before-release flag. The draft's original proposal never changes. Decisions retain the separate reviewer, request UUID, final content, optional normalized private note (maximum **1000 characters**), resolution timestamp and delivered-message ID. Draft resolution time supports outcome display without copying the full audit record onto the draft; queue/history pagination uses immutable submission order.

Restrictive foreign keys and unique indexes enforce one decision/message per draft. Shape checks and deferred PostgreSQL constraint triggers require a coherent draft/decision/release at commit, including agent authorship, destination, final wording and edited status. Triggers prevent changing proposal fields, terminal drafts, decisions and released messages. Domain resolution is **not an authorization or transaction service**. `IApprovalStore`/`ApprovalStore` wraps it in cookie-resolved active-human-admin authorization, durable locks, current delivery checks and one atomic transaction. Rejection remains possible after delivery authorization disappears.

Up adds schema without updating existing drafts. Down drops governance guards/decisions, strips message lineage while retaining delivered messages, and deletes only terminal Sprint 7 drafts before restoring the pending-only constraint. Pre-existing pending drafts and their original fields are preserved. Downgrade intentionally loses governance history; take a backup before any independently approved deployment.

Decision lock order: sorted author/request advisory keys for reviewer and agent → durable draft row `FOR UPDATE` → reviewer account `FOR SHARE` → involved participants in PostgreSQL UUID order `FOR SHARE` → destination `FOR SHARE` → public author membership `FOR SHARE`. Reload and recheck after waiting. No setup/public-membership/direct-pair/integration-agent advisory lock is taken; token lifetime intentionally does not determine delivery eligibility. Existing direct creation also locks participants in UUID order before conversation writes. Row SHARE locks hold authority, current author/peer eligibility, destination and access stable until commit, including against noncooperating row writers. All writes (terminal draft, decision, agent-authored release) commit or roll back together. Deferred constraints enforce cross-row lineage.

Exact reviewer/request/payload retries return the persisted result, including PostgreSQL timestamp precision. Changed payload, a different terminal decision, or cross-operation UUID reuse conflicts with 409. Reviewer request IDs share the human message/topic namespace; release IDs also occupy the agent message namespace. Unique draft/decision/message indexes remain the final guard.

Focused verification uses disposable PostgreSQL only:

```text
npm run test:backend -- -c Release --filter FullyQualifiedName~Approval
```

Approval tests cover domain/persistence/migration Up/Down, API authority/CSRF/privacy, deterministic pagination, retries, same/opposite concurrent decisions, current-state races, rollback and minimal outcome/lineage DTOs. Intercepted browser tests cover desktop/mobile review, stale responses, confirmation/focus, validation, conflict reconciliation and expiry. `live-s7-approvals.spec.ts` exercises the three-context journey against disposable PostgreSQL/API5081/UI5176. Evidence and process deviations are in ignored `artifacts/s7/STATUS.md`.

### Approval HTTP contract

All routes require an active human admin cookie; bearer-only access is denied. All responses are `no-store`. Unsafe decisions retain CSRF.

| Method | Path | Contract |
|---|---|---|
| GET | `/api/admin/approvals?status=pending&after=&limit=25` | `{items:[{draft,agent,destination}],nextCursor,pendingCount}`; status `pending` (default) or `resolved`, limit 1–100 |
| GET | `/api/admin/approvals/{draftId}` | `{draft,agent,destination,recipients,sourceMessage,context,decision,reviewer}` |
| POST | `/api/admin/approvals/{draftId}/decision` | `{outcome,finalBody?,reason?,clientRequestId}` → immutable decision DTO |

Queue and history order ascending by immutable `(CreatedAt,Id)` with opaque UUID boundary handles. A cursor retains its submission position if a pending row resolves. Detail recipients use the canonical pair for DMs; context includes at most 20 recent delivered messages in the selected destination, plus the optional source. Governance visibility never grants ordinary conversation membership. Reviewer/private reason appear only in these admin contracts.

Outcomes are `approved`, `approved_with_edits`, `rejected`. Unchanged approval may omit finalBody; edits require different normalized wording of 1–5000 characters; rejection must omit finalBody. Private reason is optional, trimmed, maximum 1000 characters. Terminal decisions cannot be changed. Ordinary Message DTOs add only `approvedThroughReview` and `editedBeforeRelease` booleans, preserving agent authorship and existing fields. Edited timeline wording is **Admin-edited before release · agent-authored**. Pending/rejected proposals never enter Home/history.

## Start

Normal development startup uses checked-in migrations and is part of the established reviewed local workflow. Production migrations remain explicit and backup-gated, with independent review and deployment approval required. **Sprint-10 Round-14 technical/live acceptance is complete**: the single bounded final review passed with zero closure blockers; parent-owned final evidence records candidate `f785ae72cda0e1333194eff69c63022379920287acd402b77b93c0ecc86c440d` installed on Reeba/Nora, successful backup/pull/restore and verified exact teardown, with protected Reeba DB counts unchanged. See [the Sprint log](../docs/Sprint_10_Production_Trust_Recovery.md) for final 2026-11-25 CST / 2026-11-26 UTC evidence and the accepted nonblocking backlog item. This is the uncommitted operational tree, not an application upgrade: production images remain `909cadc9edf6ff8484b8859b0f17ac9b0184a1c0`. **Cameron acceptance and Git integration remain pending**; no Sprint 10 commit, merge or push, and GitHub remains untouched. Use uniquely named disposable test databases; disposable tests must never target real `nexus`.

Run from `C:/Nexus` with the parent's local CLI wrapper:

```text
node scripts/dotnet.mjs run --project backend/Nexus.Api --configuration Release --no-launch-profile
```

Required environment:

```text
ASPNETCORE_ENVIRONMENT=Development
ASPNETCORE_URLS=http://127.0.0.1:5080
ConnectionStrings__Nexus=<connectionString from C:/Nexus/.local/runtime.json>
Nexus__DataProtectionPath=C:/Nexus/.local/keys
```

Do not paste the connection string into committed source or logs. The app reads environment/configuration, not runtime.json itself. The parent launcher supplies the connection string. Data-protection paths must be absolute; Development defaults to `C:/Nexus/.local/keys`, while other environments require an explicit path. Test factories force guarded `backend/.test-keys` paths, never the real key directory. Development HTTP is only for local loopback. Outside Development, use HTTPS: both cookies become Secure.

Development startup applies checked-in EF migrations with `MigrateAsync`, never `EnsureCreated`. Production startup does not apply migrations: `/health/ready` returns 503 while migrations are pending or PostgreSQL is unavailable. It may listen while unready; deployment must gate traffic on readiness. No application rows or credentials are seeded. A clean database stays unbootstrapped until a person supplies credentials. Main, its first membership, participant, admin account and initial session are created together during bootstrap. Migration history is the only initial database data.

## Sprint 8 production backend contract

See the separate [production operations guide](../deployment/README.md) for images, Compose, file secrets, proxy topology, HTTPS acceptance, persistence and cleanup. Local verification is not authorization to deploy; independent review and a later deployment approval remain required. The UI consumes the narrow `registrationAvailable` boolean, fails closed for absent/malformed values and hides account creation when unavailable.

- `AllowedHosts`: explicit semicolon-separated production hostnames (e.g. `nexus.aether.lab`); missing/wildcard hosts fail startup. `Nexus__TrustedProxies`: explicit semicolon-separated IP addresses or valid non-global CIDRs; missing/invalid entries fail startup. Forwarded scheme/client address are processed before rate limiting only from these peers. Do not use broad trust as a topology workaround. Development forwarding/host behavior is unchanged.
- `Nexus__DatabasePasswordFile`: optional file-secret connection mode used by production Compose; requires a readable nonempty file, builds the internal `postgres`/`nexus` connection without exposing its password. `Nexus__DatabaseHost` can override the internal host. Missing/invalid secret fails with a generic non-sensitive message. This bundle uses password authentication, explicitly disabling optional GSS encryption negotiation; no database TLS or Kerberos authentication is claimed. Direct connection-string configuration remains available outside this bundle.
- `Nexus__DataProtectionPath`: required absolute persistent writable key directory outside Development. The bundle mounts its own `/keys` volume. Do not rotate/delete keys during updates; existing CSRF values must survive API restarts alongside sessions in PostgreSQL.
- `Nexus__AllowPublicRegistration`: absent means enabled in Development, disabled otherwise. Development configuration explicitly enables it. Only boolean `true`/`false` are valid; malformed/empty values fail startup. Explicit `true` enables additional registration in Production. Bootstrap remains available on a clean migrated database regardless of this setting. After bootstrap, disabled direct registration returns 403 ProblemDetails with title `Public registration is unavailable.`; CSRF remains required.
- `GET /health/live`: 200 `{"status":"alive"}`, independent of PostgreSQL.
- `GET /health/ready`: 200 `{"status":"ready"}` only with database connectivity and no pending migrations; otherwise 503 `{"status":"unready"}`. No database or application details are returned.
- `Nexus.Api --migrate-only` (or `dotnet Nexus.Api.dll --migrate-only` for published output): applies checked-in migrations and exits without an HTTP listener or application seed data. Repeat execution is safe. Failure exits nonzero with a generic error and suppresses provider logs. Supply the same database configuration as the API, using **only a disposable database during this sprint**. Never run this against the real development database.
- Normal Production startup never migrates; Development still migrates automatically. Existing cookie security and CSRF requirements are unchanged.

Focused checks: `node scripts/test-backend.mjs -c Release --filter "FullyQualifiedName~ProductionRegistrationTests|FullyQualifiedName~ProductionHealthTests|FullyQualifiedName~ProductionMigrationTests"`. Each creates its own disposable database (unavailable-database probes use loopback port 1). Migration process tests currently use the repository's Windows-local SDK paths, like the existing test harness. Real production-image migration and HTTPS acceptance run separately via `node scripts/test-production.mjs`; Linux-host harness execution has not been independently verified.

## HTTP contract

All JSON uses camelCase. Same-origin frontend proxy only; no permissive CORS policy.

| Method | Path | Request | Success |
|---|---|---|---|
| GET | `/api/auth/status` | — | `{requiresBootstrap:boolean,registrationAvailable:boolean}` |
| GET | `/api/auth/csrf` | — | `{token:string}` plus `nexus.csrf` cookie |
| POST | `/api/auth/bootstrap` | `{email,displayName,password}` | Admin User DTO and `nexus.session` cookie |
| POST | `/api/auth/register` | `{email,displayName,password}` | Non-admin User DTO and `nexus.session` cookie |
| POST | `/api/auth/login` | `{email,password}` | User DTO and `nexus.session` cookie |
| GET | `/api/auth/me` | Session cookie | User DTO |
| POST | `/api/auth/logout` | Session cookie | 204, stored session revoked and cookie deleted |
| GET | `/api/workspace/home` | Session cookie | Workspace Home DTO with Main compatibility fields plus all joined active public and direct conversations |
| POST | `/api/conversations/direct` | `{participantId:UUID}` and session cookie | Conversation DTO, HTTP 200; retry-safe by unordered pair |
| POST | `/api/conversations/topical` | `{title,description,openingMessage,clientRequestId:UUID}` and session cookie | `{conversation,openingMessage}`, HTTP 200 (also on identical retry) |
| GET | `/api/conversations/{id}/messages` | Session cookie | Message DTO array, chronological order; 404 unknown / 403 nonmember |
| POST | `/api/conversations/{id}/messages` | `{body,clientRequestId:UUID}` and session cookie | Message DTO, HTTP 200 (also on identical retry) |

Every human/admin unsafe request, including bootstrap/register/login/logout, requires the matching `nexus.csrf` cookie **and** `X-CSRF-TOKEN` request header from `/api/auth/csrf`. Fetch CSRF before bootstrap/register/login and after identity transitions. Missing/invalid CSRF is 400. Authentication is checked on every protected request against PostgreSQL. Anonymous access with valid CSRF is 401.

User DTO:

```text
{id:UUID,email:string,displayName:string,participantId:UUID,isAdmin:boolean}
```

Workspace Home DTO:

```text
{
  participants:[{id:UUID,name:string,description:string,kind:'human'|'agent',state:string,availability:'available'|'away'|'offline'|'unknown',isAdmin:boolean}],
  conversation:ConversationDto,
  messages:MessageDto[],
  conversations:ConversationDto[]
}
```

`conversation` and `messages` remain the Main conversation and Main messages for compatibility. `conversations` contains Main, joined active public Topics, and only the viewer's joined direct conversations. Direct titles use the other member's current display name and participantIds contains exactly the two members. A newly discovered DM does not change UI selection. Conversation DTO:

```text
{id:string,title:string,kind:'main'|'topical'|'direct',state:'active',participantIds:UUID[],description:string,createdAt:ISO8601}
```

Message DTO:

```text
{id:UUID,conversationId:string,authorId:UUID,body:string,state:'delivered',createdAt:ISO8601,approvedThroughReview:boolean,editedBeforeRelease:boolean}
```

Topical creation trims title, description, and opening message. Title is 1–80 characters, description 0–160, opening message 1–5000, and clientRequestId must be a nonzero UUID. Creation atomically writes the topical conversation, memberships for every active participant, and its opening message. Idempotency is per creator/clientRequestId: an identical normalized retry returns the original conversation and opening message, while changed content or reuse by the message endpoint returns 409. Registration joins the new human to Main and every active public topical conversation under the same transaction-level public-membership lock used by topical creation.

Direct creation takes only the target participantId; requester identity comes exclusively from the session. Empty UUID/self returns 400; unknown, inactive or service target returns a generic 404. The requester must be an active human; the target may be an active human or agent. Human workspace routes reject ineligible cookie callers with 403. A transaction writes one generated 32-character-ID conversation and exactly two memberships; retries and concurrent opposite-direction requests return the same row, without a client request UUID. Stored title/description are neutral; no topical creator/request identity is stored. A namespaced canonical-pair advisory lock serializes creation/reopen; eligible participant rows are update-locked in UUID order until commit. Canonical order compares normalized `N` hex strings, matching PostgreSQL UUID order. Nullable low/high participant columns have restricted-deletion foreign keys, a filtered unique pair index, and kind/shape checks rejecting missing, equal or reversed direct pairs and public pair columns. Deferred database constraint triggers enforce exactly the canonical pair's two memberships and eligibility at commit (two active humans, or one active human and one active agent), including kind/state updates. Availability-only updates do not run the pair validator; legacy membership corruption cannot authorize discovery/read/post because runtime checks independently use eligible canonical pairs. A pair write fence prevents stale repeatable-read snapshots from deactivating newly referenced participants; a statement trigger also prevents membership TRUNCATE from stranding direct pairs. Direct DTO participant IDs come from the canonical pair. Sprint 6 downgrade drops pending drafts/cursors and removes human-agent direct data before restoring the human-only validator, preserving human-human and public data. The earlier Direct migration downgrade deletes all remaining direct messages, memberships and conversations before removing direct-only schema; public and identity/session data are preserved. Registration never joins DMs. Nonmembers receive 403 for known direct history/send IDs with no message data; unknown IDs remain 404. Main and public Topics are unchanged.

The message author always comes from the resolved session's participant, never client input. Unknown fields such as client-supplied authorId are ignored. Body is trimmed and must contain 1–5000 UTF-16 code units. clientRequestId must be a nonzero UUID. Message idempotency is per author and request ID across conversations, with a database unique index and transaction-level advisory lock. Retrying the same conversation and normalized body returns the original message; changing either the conversation or normalized body returns 409.

Bootstrap and registration validate email, display name (1–100 trimmed characters), and password (12–128 characters). Email is trimmed/lowercased. Registration is available only after bootstrap and atomically creates a non-admin account, active human participant, memberships in Main and all active public topical conversations, and a session. Registration before bootstrap and normalized duplicate emails return 409. Shared PostgreSQL transaction/advisory locks preserve first-admin setup races, serialize public-conversation membership changes, and make concurrent duplicate registration deterministic without orphan rows. Operations needing multiple locks always acquire them in setup → public-membership → author/client-request order. Direct creation takes only its canonical-pair advisory lock, never setup/public-membership/author-request locks; message posting takes only author/request. No operation nests those advisory locks with the direct-pair lock. Passwords use ASP.NET Identity V3 hashing configured for 210,000 iterations. Session tokens are random 256-bit opaque values; only SHA-256 hashes are stored, with fixed seven-day expiry and revocation timestamp. Cookies are HttpOnly, SameSite=Strict, Path=/, Secure outside Development.

Bootstrap/register/login share a per-remote-IP fixed-window limit of 10 requests/minute per app host. Limit responses are 429 ProblemDetails with `Retry-After: 60`. Validation/CSRF are safe 400 ProblemDetails; wrong credentials are a generic 401 ProblemDetails; conflicts are 409 ProblemDetails. Unexpected failures return generic 500 ProblemDetails; server logs retain diagnostic details without enabled sensitive-data logging.

## Verify

PostgreSQL must be running and `.local/runtime.json` must contain `adminConnectionString`. Tests create independently named `nexus_test_<UUID>` databases using that administrative connection and drop only their own databases on completion. Test data-protection keys remain under `backend/.test-keys/` (gitignored), not the app key directory. Tests never reset or bootstrap the real `nexus` database.

```text
node scripts/dotnet.mjs build backend/Nexus.slnx --configuration Release
node scripts/test-backend.mjs
# Optional focused run: append --filter FullyQualifiedName~DirectConversation
node scripts/dotnet.mjs format backend/Nexus.slnx --no-restore --verify-no-changes
```

Sprint 6 verification: 147 real-PostgreSQL tests passed, none skipped; 29 frontend unit, 3 tooling, 58 intercepted/prototype browser and 28 disposable live tests passed. Exact commands, focused RED/GREEN and safety evidence are retained in ignored `artifacts/s6/STATUS.md`. Test-class parallelism is bounded to four to limit disposable-database DDL churn; concurrency within each race/contention test is unchanged. Use the local EF tool to run `migrations has-pending-model-changes --project backend/Nexus.Infrastructure --startup-project backend/Nexus.Infrastructure`. Migration acceptance upgrades the pre-Sprint-6 schema with preserved public data, creates real agent/token/human-agent-DM/draft/cursor rows, then downgrades while preserving public and human-human data. No real database migration was run.

## Sprint 6 — agents, integration inbox and pending drafts

The new migration chain adds participant descriptions, constrained kinds (`human`, `agent`, future `service`), states (`active`, `inactive`, `suspended`, `blocked`) and availability (`available`, `away`, `offline`, `unknown`), plus IntegrationTokens. No service or moderation workflows are implemented. Display names and descriptions are trimmed and bounded to 100/160 characters. Token labels are trimmed, required, and bounded to 100 characters. Database checks, a unique active-token-per-agent index, a unique fixed SHA-256 hash index, agent-owner validation and terminal-revocation trigger enforce the tested storage rules.

All `/api/admin/*` endpoints below require a session resolving to an account **and** participant that are both admin, with an active human participant. Unsafe endpoints retain cookie + CSRF requirements; bearer headers do not substitute for human authentication.

| Method | Path | Request | Success |
|---|---|---|---|
| GET | `/api/admin/agents` | — | `[{agent:Participant,tokens:TokenMetadata[],pendingCount:number}]` |
| POST | `/api/admin/agents` | `{displayName,description?,tokenLabel}` | `{agent,token:TokenMetadata,rawToken}` |
| GET | `/api/admin/agents/{participantId}/tokens` | — | `TokenMetadata[]`; unknown/non-agent 404 |
| POST | `/api/admin/agents/{participantId}/tokens` | `{label,expectedTokenId:UUID|null}` | `{token:TokenMetadata,rawToken}` |
| POST | `/api/admin/integration-tokens/{tokenId}/revoke` | empty body permitted | 204, including an already-revoked token; unknown 404 |
| GET | `/api/integrations/me` | `Authorization: Bearer nexus_int_<64 lowercase hex>` | authenticated agent Participant |
| GET | `/api/integrations/inbox?after=<cursor>&limit=50` | Bearer header only | `{messages:MessageDto[],nextCursor:string|null}` |
| POST | `/api/integrations/drafts` | Bearer header and `{conversationId,body,clientRequestId:UUID,sourceMessageId?:UUID}` | DraftMetadata, HTTP 200 including identical retry |
| GET | `/api/integrations/drafts` | Bearer header only | Own DraftMetadata array; no bodies/token metadata |

`Participant` includes `id,name,description,kind,state,availability,isAdmin`. `TokenMetadata` includes only `id,label,state,createdAt,lastUsedAt,revokedAt`. Raw tokens have 256 bits of cryptographic entropy; only uppercase hexadecimal SHA-256 hashes are persisted. Lists never return raw values or hashes. Creation/replacement responses are `no-store`; there is no token-recovery endpoint. A lost response requires explicit replacement, not raw-token replay. Replacement compares the currently active token ID to `expectedTokenId` under the agent lock; stale/retried requests return 409 without creating another token. Supply null only when there is no active token. Replacement atomically revokes the old token and creates the new one. Revocation is terminal.

Agent creation atomically joins Main and every existing active public Topic under the existing public-membership lock; future Topic creation already includes every active participant. Agents have no Account. They start active with unknown availability. Integration routes accept only a bearer header, not query/body token transport or a human cookie; malformed/unknown/revoked/ineligible tokens return generic 401 ProblemDetails. It updates LastUsedAt and availability only after revalidation under the same namespaced agent advisory lock used by replacement/revocation. No last-use update can race past a completed revocation. Availability is not aged offline; metadata is the only staleness signal implemented here.

Only explicitly mapped integration endpoints are CSRF-exempt; every integration operation still requires bearer authentication. This exemption is endpoint metadata, not a path-prefix bypass. Bearer-only callers cannot use human/admin endpoints. The authenticated transaction holds the namespaced agent lock through authorization, response materialization and persistence, rechecking token state after taking the revocation fence.

Inbox authorization requires current active eligibility and either a canonical own Direct pair or a Main/Topic membership. Arbitrary private memberships never grant access. Only delivered, nonself-authored Messages are returned, ordered by `(CreatedAt,Id)` with PostgreSQL UUID tie ordering. Default page size is 50, allowed range 1–100; invalid limits are 400. Opaque cursor handles are server-generated UUIDs persisted per participant/boundary-message with a unique index, making repeated next cursors deterministic and independent of token replacement. Each boundary is resolved again against current authorization; malformed, foreign, deleted or inaccessible boundaries return generic 400. A cursor is not an authorization grant. There is at most one cursor row per participant/message boundary; no acknowledgement protocol or retention/cleanup job is implemented.

Drafts trim body to the same 1–5000 UTF-16-unit limits and require a nonzero request UUID. Optional source must be delivered in the same currently visible conversation. Author, submitting token and pending state are server-derived. Drafts persist separately from Messages. DraftMetadata is `{id,conversationId,clientRequestId,sourceMessageId,state,createdAt,resolvedAt,deliveredMessageId}`; resolution fields are nullable. The own-draft listing includes terminal outcomes and delivered ID, never body, reviewer or private reason. Replacement tokens for the same participant retain this history; revoked tokens immediately lose access. Human Home/history never queries MessageDrafts; review bodies are restricted to admin approval routes. Same agent/request UUID and identical normalized conversation/body/source return the original draft even after token replacement; changed payload or collisions with Message/Topic operations are 409. Another agent has an independent UUID namespace. Concurrency uses the shared author/request lock and unique draft index.

Full advisory lock graph: setup → public-membership → author/request for human setup/public operations; Direct create/reopen takes only canonical-pair; human message sends take only author/request; agent creation takes public-membership only; token/auth/inbox/list operations take agent only; draft submission takes agent → author/request. No path acquires setup/public/pair after agent or agent after author/request. Pair participant-row fences remain UUID ordered. Mixed-contention and request/revocation boundary tests use disposable PostgreSQL and explicit completion gates.

Focused commands (each has retained RED then GREEN output under `artifacts/s6/`):

```text
node scripts/test-backend.mjs --filter FullyQualifiedName~AgentCreationTests
node scripts/test-backend.mjs --filter FullyQualifiedName~AgentConstraintTests
node scripts/test-backend.mjs --filter FullyQualifiedName~IntegrationTokenTests
node scripts/test-backend.mjs --filter FullyQualifiedName~One_time_token_responses
```

Additional focused suites: `HumanAgentDirectTests`, `IntegrationInboxTests`, `IntegrationDraftTests`, `IntegrationRaceTests` and `AgentMigrationTests`. The real admin UI provides accessible create/reveal/confirmation dialogs, metadata and pending counts; raw tokens are memory-only and removed on dismissal/reload. Disposable live acceptance covers admin browser creation, ordinary human agent DM, bearer polling/draft submission, direct PostgreSQL hash/pending/no-publication assertions, count-only admin visibility and immediate revocation. The existing human-human live journey remains included. No external connector was configured. Sprint 7 work has not applied migrations to the real `nexus` database.

## Scope and caveats

This is the local conversation/agent-boundary slice, not the full approved MVP. Open local registration, permanent Main, public Topics, human-human/human-agent DMs, integration inbox, pending drafts and admin-reviewed release/rejection are supported. Group/agent-agent DMs, message requests, unread counts, notifications, blocking/muting, attachments, edits/deletes, continuous presence, encryption features, invitations, password reset, MFA, external connector deployment, moderation, services and SignalR/webhooks are deferred. Human history and own draft-metadata reads currently return all rows; integration inbox and admin approval queue/history are paginated. No default account exists.

Local-prototype migration-at-startup requires schema privileges. Production rollout should separately apply reviewed migrations and restrict app DB privileges. Rate counters are process-local and reset on restart; a shared-IP reverse proxy shares the limit unless deliberately configured otherwise. There is no session-row cleanup job or sliding renewal. Protect runtime credentials and data-protection key files with filesystem permissions; key files are not explicitly encrypted at rest. Use TLS and an appropriately secured reverse proxy outside local development.
