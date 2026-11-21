# Nexus: The First Five Sprints

## An implementation guide from interface to database

**Prepared for Cameron Beck**  
**Repository state:** commit `01689da` (`main`, Sprint 5 direct messages)  
**Prepared:** November 20, 2026

---

## Purpose and scope

This document explains how Nexus evolved through its first five implementation sprints, how the major parts work internally, and how those internals relate to what you see and do in the interface.

The sprint numbering below is reconstructed from the repository history and the delivered feature sequence. The commits explicitly name Sprints 3–5 by feature, while the first two commits are both labelled `1st Commit!`. The most useful and technically consistent mapping is:

| Sprint | Repository milestone | Date | Main result |
|---|---|---:|---|
| 1 | `d68ea46` | Oct. 27, 2026 | Browser-local product prototype and interaction model |
| 2 | `996e6d9` | Nov. 3, 2026 | Real ASP.NET Core, EF Core and PostgreSQL foundation; first admin, sessions and persistent Main messaging |
| 3 | `438ed57` | Nov. 4, 2026 | Multiple human accounts collaborating in Main |
| 4 | `80d88b5` | Nov. 13, 2026 | Persistent public topical conversations |
| 5 | `01689da` | Nov. 19, 2026 | Persistent private one-to-one human direct conversations |

The document focuses on the real workspace at `/`. The original Sprint 1 prototype remains available at `/demo`, but it is intentionally separate from the real database-backed application.

---

# 1. The mental model: what Nexus is today

Nexus is a conversation-first local application with four cooperating layers:

1. **React interface** — displays authentication, participants, conversations, messages, drafts and connection state.
2. **Browser API client** — sends same-origin requests, carries the HttpOnly session cookie automatically, obtains CSRF tokens, and turns HTTP failures into useful UI errors.
3. **ASP.NET Core application** — authenticates every protected request, validates rules, coordinates transactions and exposes a small REST API.
4. **PostgreSQL database** — stores durable identity, session, participant, conversation, membership and message records, with constraints that protect important invariants.

A useful simplified request path is:

```text
Button or form in React
        ↓
WorkspaceApi in src/live-api.ts
        ↓
/api route in backend/Nexus.Api/Program.cs
        ↓
IdentityStore or WorkspaceStore
        ↓
EF Core entities and PostgreSQL transaction
        ↓
DTO returned to the browser
        ↓
React state is reconciled and the interface updates
```

The architecture deliberately treats the server and database as authoritative. The interface may update immediately after a successful request, but it periodically asks the server for a fresh snapshot and reconciles local state with that snapshot.

## 1.1 Real workspace versus prototype

The route decision is only a few lines of code:

```tsx
{window.location.pathname.replace(/\/$/, '') === '/demo'
  ? <App />
  : <LiveWorkspace />}
```

**Reference:** `src/main.tsx:8-11`

- `/demo` renders `App.tsx`, the browser-local prototype.
- Every other route, including `/`, renders `LiveWorkspace.tsx`, which connects to the API and database.

This separation matters. The prototype can demonstrate ideas such as agents, approval queues and governance before those capabilities are safe or persistent. The real workspace does not silently fall back to demo data when the API is unavailable.

---

# 2. Sprint 1 — establishing the product language

## 2.1 What Sprint 1 delivered

Sprint 1 created the first complete interaction model for Nexus as a browser-local React application. It established:

- the sage/dark visual identity;
- the Common Room as the default place;
- participants as first-class objects;
- main, topical and direct conversation shapes;
- agent drafts and human approval decisions;
- participant moderation and approval-policy concepts;
- unread state, search, navigation and responsive layouts;
- browser persistence through `localStorage`;
- unit tests for domain operations and Playwright tests for the interface.

This sprint was primarily a **product and domain prototype**, not yet a secure multi-user system.

## 2.2 The prototype state model

The central TypeScript model is `WorkspaceState`:

```ts
export interface WorkspaceState {
  participants: Participant[];
  conversations: Conversation[];
  messages: Message[];
  drafts: MessageDraft[];
  audit: AuditEvent[];
  readState?: ConversationReadState;
}
```

**Reference:** `src/domain.ts:66-73`

This model is important because it established the nouns that continue to shape Nexus:

- A **participant** is the visible identity in the collaborative space.
- A **conversation** is a container with a kind, state and participant list.
- A **message** is delivered content attached to a conversation and author.
- A **draft** represents agent output awaiting governance.
- An **audit event** describes a meaningful state change.

The real backend currently implements a narrower subset, but it uses the same conceptual language.

## 2.3 How the demo interface works

`App.tsx` starts with sample participants and conversations, including Cameron, Hermes, Nova, Mira and Uptime Kuma. It loads saved state from the browser under:

```ts
const STORAGE_KEY = 'nexus-prototype-state-v1';
```

**References:** `src/App.tsx:15`, `src/App.tsx:19-65`

React owns the complete workspace state:

```ts
const [state, setState] = useState<WorkspaceState>(loadState);
```

Whenever that state changes, an effect serializes it back into `localStorage`:

```ts
useEffect(() => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch { /* Keep the session usable if storage is unavailable. */ }
}, [state]);
```

**Reference:** `src/App.tsx:96-116`

### What this means in the interface

When you use `/demo`:

- messages and policy changes survive a refresh in that browser;
- the data does not belong to a real account;
- another browser or device does not share it;
- clearing browser storage removes it;
- the “current user” is a fixed demo identity, not authenticated identity.

That is why the demo can feel broad while still being clearly marked as sample behavior.

## 2.4 Domain operations are separate from presentation

Sprint 1 did not place all behavior directly inside React click handlers. Core transitions live in `src/domain.ts` as functions such as:

- `createMessage`;
- `createDraft`;
- `resolveDraft`;
- `createTopicalConversation`;
- `openDirectConversation`;
- `setParticipantState`;
- `getUnreadCount` and `markConversationRead`.

For example, `createMessage` checks whether the participant may speak, routes agent output through the draft path, validates the body and returns a new state rather than mutating the old state.

**Reference:** `src/domain.ts:93-117`

The React handler is therefore relatively simple:

```tsx
setState(createMessage(state, activeConversation.id, CURRENT_USER, composer));
```

**Reference:** `src/App.tsx:168-175`

This was a good early design choice. It made the prototype rules testable independently of the page layout and provided a conceptual starting point for later C# domain rules.

## 2.5 Approval and governance concepts

The prototype treats agent speech differently from human speech. When `createMessage` sees an agent author, it calls `createDraft`. An agent requiring approval produces a pending draft and an audit event instead of an immediately visible message.

**References:** `src/domain.ts:110-145`

A human administrator can then approve, approve with edits, or reject the draft. `resolveDraft` verifies that the reviewer is an active human administrator, records the resolution and, for an approval, creates the delivered message.

**Reference:** `src/domain.ts:148-178`

### Relationship to the current real interface

The wider governance interface you can explore in `/demo` is a **design probe**, not yet wired to the real server. The real workspace’s left rail still marks governance as coming next. Sprint 1 therefore functions as both a prototype and a backlog made visible.

## 2.6 Why Sprint 1 mattered

Sprint 1 answered “what should Nexus feel like?” before committing to infrastructure. It produced the vocabulary and interaction patterns used later, while allowing the persistent implementation to be narrower and more defensible.

---

# 3. Sprint 2 — replacing browser state with a real local system

## 3.1 What Sprint 2 delivered

Sprint 2 introduced the real system behind `/`:

- ASP.NET Core minimal API;
- layered backend projects for API, Application, Domain and Infrastructure;
- EF Core with PostgreSQL;
- checked-in database migrations;
- first-administrator bootstrap;
- login, logout and seven-day server-side sessions;
- CSRF protection and authentication rate limiting;
- persistent Main conversation and messages;
- retry-safe message posting;
- a launcher that starts PostgreSQL, API and Vite;
- real PostgreSQL integration tests and live browser tests.

This was the transition from “interactive design” to “durable local application.”

## 3.2 Backend project boundaries

The solution is divided into four production projects:

| Project | Responsibility |
|---|---|
| `Nexus.Api` | HTTP routes, cookies, CSRF, rate limits and safe error responses |
| `Nexus.Application` | DTOs and interfaces used across transport and persistence boundaries |
| `Nexus.Domain` | Identity, conversation and message rules plus persistent entity shapes |
| `Nexus.Infrastructure` | EF Core mappings, PostgreSQL transactions, password hashing and sessions |

**Reference:** `backend/README.md:5-11`

This separation is visible in the dependency flow. `Program.cs` knows about interfaces such as `IIdentityStore` and `IWorkspaceStore`; the infrastructure project supplies `IdentityStore` and `WorkspaceStore` implementations.

**Reference:** `backend/Nexus.Api/Program.cs:13-17`

## 3.3 Local startup and persistence

When you run `npm start`, `scripts/start.mjs` first runs setup, checks whether the API is already available, starts it if needed, then starts or reuses the Vite frontend.

**Reference:** `scripts/start.mjs:7-33`

PostgreSQL is provided by Docker Compose and is bound only to loopback:

```yaml
ports:
  - "127.0.0.1:55432:5432"
volumes:
  - ./.local/postgres:/var/lib/postgresql
```

**Reference:** `compose.yaml:9-12`

The database files therefore live under `C:\Nexus\.local\postgres`, while the container provides the PostgreSQL process.

The first setup generates a random PostgreSQL password and writes connection strings to `.local/runtime.json`. It refuses to regenerate credentials if database files already exist, because new credentials would make the retained database inaccessible.

**Reference:** `scripts/runtime.mjs:4-14`

### What this means in the interface

When you close and reopen Nexus, your real accounts and messages remain because PostgreSQL stays on disk. The application is no longer reconstructing your workspace from sample JavaScript objects.

## 3.4 First administrator bootstrap

The first page load asks the API whether setup is required:

```tsx
const status = await api.get<{requiresBootstrap:boolean}>('/auth/status');
```

**Reference:** `src/LiveWorkspace.tsx:22-33`

The API maps that to `IdentityStore.RequiresBootstrap`, which simply checks whether any accounts exist.

**References:** `backend/Nexus.Api/Program.cs:51`, `backend/Nexus.Infrastructure/IdentityStore.cs:11`

When you submit the first-run form, `IdentityStore.Bootstrap` performs a single transaction that:

1. validates the email, display name and password;
2. takes a PostgreSQL advisory lock so two simultaneous setup requests cannot both win;
3. verifies that no account already exists;
4. creates the administrator account and password hash;
5. creates the matching visible participant;
6. creates the permanent Main conversation;
7. creates Main membership;
8. issues a stored session;
9. commits everything together.

**Reference:** `backend/Nexus.Infrastructure/IdentityStore.cs:12-27`

This explains why creating the first account also causes you to appear in the Common Room: an account is the login identity, while a participant is the collaborative identity shown in Nexus.

## 3.5 Sessions, cookies and password handling

Passwords are hashed through ASP.NET Identity with 210,000 iterations.

**Reference:** `backend/Nexus.Api/Program.cs:16-17`

A successful authentication generates 32 random bytes, returns the raw token only to the cookie response, hashes it with SHA-256, and stores only that hash in PostgreSQL.

**Reference:** `backend/Nexus.Infrastructure/IdentityStore.cs:58-64,81`

The browser receives `nexus.session` as an HttpOnly, SameSite=Strict cookie. JavaScript cannot read the token; the browser includes it automatically on same-origin requests.

**References:** `backend/Nexus.Api/Program.cs:53-77`, `src/live-api.ts:20-32`

Each protected route resolves the cookie against PostgreSQL. Session expiry and revocation are therefore server-enforced, not merely browser conventions.

## 3.6 CSRF protection

Because authentication uses a cookie, unsafe requests need protection against cross-site request forgery. `WorkspaceApi.post` obtains a CSRF token when necessary and sends it in `X-CSRF-TOKEN`.

**Reference:** `src/live-api.ts:24-32`

The backend validates every POST, PUT, PATCH and DELETE request in middleware before the route runs.

**Reference:** `backend/Nexus.Api/Program.cs:33-49`

### What this means in the interface

You do not manually handle CSRF. The API client fetches and caches the token. After a login, registration or bootstrap transition, it clears and refreshes the token because the security context changed.

**Reference:** `src/live-api.ts:34-40`

## 3.7 Persistent messages and server-derived authorship

The interface sends only the message body and a client request ID. It does not send a trusted `authorId`.

The route resolves the authenticated session and passes its participant ID to the store:

```csharp
var user = await identity.Resolve(context.Request.Cookies["nexus.session"]);
return user is null
    ? Results.Unauthorized()
    : Results.Ok(await workspace.Post(conversationId, user.ParticipantId, request));
```

**Reference:** `backend/Nexus.Api/Program.cs:100-104`

This is a core security boundary: authorship comes from the session, not editable browser input.

## 3.8 Retry-safe message delivery

The composer generates a UUID for an intended message and retains it if delivery is uncertain.

**References:** `src/PersistentWorkspace.tsx:175-188`

On the server, `(AuthorId, ClientRequestId)` has a unique database index.

**Reference:** `backend/Nexus.Infrastructure/NexusDb.cs:16`

`WorkspaceStore.Post` also takes a transaction-level advisory lock for that author/request pair. If the same request is retried with identical content, the stored message is returned. If the UUID is reused with different content or another conversation, the server returns a conflict.

**Reference:** `backend/Nexus.Infrastructure/WorkspaceStore.cs:27-46`

### What this means in the interface

If the network fails after the server saved a message but before the browser received the response, pressing retry does not create a duplicate. The UI tells you that retry sends the same request.

## 3.9 Safe error responses

The backend converts invalid JSON, invalid CSRF, rule violations and unexpected failures into `ProblemDetails` responses. Unexpected exceptions are logged server-side, while the browser receives a generic message.

**Reference:** `backend/Nexus.Api/Program.cs:33-48`

The browser maps validation fields to form inputs and intentionally replaces server errors at status 500+ with a generic local-server message.

**Reference:** `src/live-api.ts:4-15`

This is why form errors can appear next to fields without exposing database details or stack traces.

---

# 4. Sprint 3 — making Main genuinely multi-human

## 4.1 What Sprint 3 delivered

Sprint 3 extended the single-administrator workspace into a local multi-human collaboration space:

- additional account registration after bootstrap;
- each account receives a visible human participant;
- each new participant joins Main automatically;
- the Home response contains all participants;
- messages from different signed-in humans share the same persistent Main history;
- registration and bootstrap races are deterministic and transactional;
- the interface gained a “Create account” mode beside sign-in.

## 4.2 Account and participant are related but distinct

The persistent identity model contains both:

```csharp
public sealed class Account {
    public Guid Id { get; set; }
    public string Email { get; set; }
    public string DisplayName { get; set; }
    public string PasswordHash { get; set; }
    public Guid ParticipantId { get; set; }
    public bool IsAdmin { get; set; }
}
```

**Reference:** `backend/Nexus.Domain/Identity.cs:3-11`

The account owns authentication facts. The participant owns collaborative facts such as name, kind, state, availability and administrative display status.

**Reference:** `backend/Nexus.Domain/Workspace.cs:3-11`

EF Core enforces a one-to-one relationship from account to participant and unique account email and participant ID indexes.

**Reference:** `backend/Nexus.Infrastructure/NexusDb.cs:22,44-47`

This split prepares Nexus for participant types that may not authenticate like a human account, such as future agents and services.

## 4.3 Registration is an atomic workspace operation

`IdentityStore.Register` takes the setup lock, verifies bootstrap is complete, rejects duplicate normalized email, takes the public-membership lock, creates the account and participant, discovers all active public conversations, adds membership rows and issues a session in one transaction.

**Reference:** `backend/Nexus.Infrastructure/IdentityStore.cs:28-49`

At Sprint 3, the public conversation set was Main. Sprint 4 later reused the same mechanism for Main plus every active Topic.

### What this means in the interface

After the first administrator exists, the authentication page displays both **Sign in** and **Create account**. A newly created user immediately enters the workspace and appears in the participant list without the administrator manually adding them.

**Reference:** `src/LiveWorkspace.tsx:52-70`

## 4.4 Shared Main snapshot

The Home endpoint resolves the session and asks `WorkspaceStore.Home` for a viewer-specific snapshot.

**Reference:** `backend/Nexus.Api/Program.cs:80-84`

The current implementation uses a read-only, repeatable-read PostgreSQL transaction. It loads participants, conversations visible to the viewer, memberships and Main messages, then returns them together.

**Reference:** `backend/Nexus.Infrastructure/WorkspaceStore.cs:98-117`

Repeatable read means the pieces of the snapshot are based on one consistent database view rather than potentially mixing before-and-after states from concurrent writes.

## 4.5 Polling and collaboration

The interface refreshes the Home snapshot every five seconds. A second browser can therefore register or post a message, and the first browser sees the change on a later poll.

**Reference:** `src/PersistentWorkspace.tsx:97-120`

Polling is intentionally temporary. PostgreSQL remains authoritative; the polling loop is simply the current delivery mechanism. SignalR or another realtime channel can later reduce latency without changing the persistence model.

## 4.6 Avoiding stale poll overwrites

A subtle frontend problem appears when a request and a poll overlap:

1. a poll starts;
2. you successfully send a message;
3. the earlier poll returns a snapshot that did not yet include the message;
4. a naive UI replaces local state and makes the sent message disappear temporarily.

Nexus avoids this by tracking revisions and merging messages by ID. A successful send increments the conversation revision and merges the returned server message. Poll results are merged rather than blindly replacing newer local state.

**References:** `src/PersistentWorkspace.tsx:17`, `src/PersistentWorkspace.tsx:83-90`, `src/PersistentWorkspace.tsx:175-188`

This is one of the main reasons the interface feels stable even though it currently polls.

---

# 5. Sprint 4 — persistent public Topics

## 5.1 What Sprint 4 delivered

Sprint 4 expanded the permanent Main conversation into multiple durable public conversations:

- public topical conversations;
- title, description and opening-message creation flow;
- all active humans join each new Topic atomically;
- new registrations join all existing public Topics;
- per-conversation message history;
- per-conversation composer drafts;
- Topics navigation and accessible creation dialog;
- retry-safe creation using `clientRequestId`;
- database migration, domain, API and UI coverage.

## 5.2 Conversation became a richer persistent entity

The `Conversation` entity now records:

- `Id`;
- `Title`;
- `Kind` (`main`, `topical`, later `direct`);
- `State`;
- `Description`;
- `CreatedAt`;
- topical creator and client-request identity;
- direct participant pair fields added in Sprint 5.

**Reference:** `backend/Nexus.Domain/Workspace.cs:12-24`

The topical factory validates and normalizes title, description and request ID, creates the conversation, and creates its opening message as one logical result.

**Reference:** `backend/Nexus.Domain/Workspace.cs:46-74`

## 5.3 Topic creation transaction

When you submit the New Topic dialog, the frontend trims the values, validates required fields, and keeps one request UUID for retries.

**Reference:** `src/PersistentWorkspace.tsx:157-173`

The server transaction then:

1. validates the topical conversation in the domain layer;
2. acquires the public-membership lock;
3. acquires the creator/request lock;
4. checks whether the request already created a Topic;
5. checks whether the UUID was already used for a message;
6. reads every active participant;
7. inserts the conversation;
8. inserts a membership for every active participant;
9. inserts the opening message;
10. commits.

**Reference:** `backend/Nexus.Infrastructure/WorkspaceStore.cs:48-73`

The public-membership lock is shared with registration. This prevents a race where a user registers while a Topic is created and accidentally belongs to one public object but not the other.

## 5.4 Database rules for Topics

The Sprint 4 migration added:

- length-limited conversation fields;
- `CreatedAt`;
- `CreatedByParticipantId`;
- `ClientRequestId`;
- a unique filtered index for creator/request retries;
- kind and state check constraints;
- a rule requiring topical creator/request data only for topical conversations;
- a chronological message index.

**Reference:** `backend/Nexus.Infrastructure/Migrations/20261113044904_PublicTopicalConversations.cs:18-117`

The model repeats those rules in EF configuration so the model and database schema describe the same intent.

**Reference:** `backend/Nexus.Infrastructure/NexusDb.cs:24-40`

## 5.5 Per-conversation UI state

Once multiple rooms exist, a single `composer` string is no longer enough. `PersistentWorkspace` stores dictionaries keyed by conversation ID:

```ts
const [messages, setMessages] = useState<Record<string, Message[]>>(...);
const [drafts, setDrafts] = useState<Record<string, string>>({});
const [sendErrors, setSendErrors] = useState<Record<string, string>>({});
const [sendingIds, setSendingIds] = useState<Record<string, boolean>>({});
```

**Reference:** `src/PersistentWorkspace.tsx:30-33`

### What this means in the interface

You can type part of a message in one Topic, move to Main or another Topic, and return without losing the draft. Sending and error states also remain attached to the correct room.

## 5.6 Conversation history loading

Main messages arrive in the Home snapshot for compatibility. For a selected non-Main conversation, the UI calls:

```text
GET /api/conversations/{conversationId}/messages
```

**References:** `src/PersistentWorkspace.tsx:83-96`, `backend/Nexus.Api/Program.cs:95-99`

Before returning messages, `WorkspaceStore.Messages` calls `RequireMembership`. Unknown conversations return 404; known conversations without membership return 403.

**Reference:** `backend/Nexus.Infrastructure/WorkspaceStore.cs:21-25,119-129`

## 5.7 Optimistic survival of a newly created Topic

A successful create response is enough to display the Topic immediately. However, an already-running Home poll may return a snapshot from before the creation committed. Nexus tracks locally successful creations by version and keeps them until a later authoritative snapshot observes them.

**Reference:** `src/PersistentWorkspace.tsx:26-29,100-115,165-171`

This is a careful middle ground:

- the server response is trusted because it represents a committed operation;
- an older poll is not allowed to erase that result;
- a later fresh snapshot becomes authoritative.

## 5.8 Accessible dialog behavior

The Topic dialog:

- moves focus to the title input;
- traps Tab navigation within the dialog;
- closes on Escape when no request is pending;
- marks the underlying workspace inert;
- returns focus to the trigger;
- moves focus to the composer after successful creation.

**Reference:** `src/PersistentWorkspace.tsx:122-142,157-173`

These details connect backend correctness to a usable interface rather than treating accessibility as separate polish.

---

# 6. Sprint 5 — persistent private direct conversations

## 6.1 What Sprint 5 delivered

Sprint 5 added durable one-to-one human Direct messages with a stronger privacy and integrity model than public Topics:

- New Message dialog with participant selection;
- exactly one conversation for each unordered human pair;
- retry and concurrent opposite-direction creation safety;
- viewer-specific display title based on the other participant’s current name;
- exactly two memberships;
- discovery, history and posting restricted to those two participants;
- registration never joins Direct messages;
- database constraints and deferred triggers protecting the pair shape;
- frontend cache purging if access is removed or denied;
- duplicate-name disambiguation in the interface.

## 6.2 Why Direct creation does not use a request UUID

A direct conversation is naturally identified by the two participants. The request contains only:

```csharp
public sealed record CreateDirectConversationRequest(Guid ParticipantId);
```

**Reference:** `backend/Nexus.Application/Workspace.cs:14`

The requester is derived from the authenticated session. The server canonicalizes the pair so `(A, B)` and `(B, A)` refer to the same durable object.

## 6.3 Canonical pair representation

`Conversation.CreateDirect` rejects empty or identical IDs, compares normalized UUID hex strings, and stores the lower and higher values in dedicated columns.

**Reference:** `backend/Nexus.Domain/Workspace.cs:23-40`

This gives the database a stable pair key independent of request direction.

EF Core creates a unique filtered index over the low/high pair and a check constraint requiring:

- public conversations to have no direct pair;
- direct conversations to have both pair values;
- low to be less than high.

**Reference:** `backend/Nexus.Infrastructure/NexusDb.cs:31-39`

## 6.4 Creation and concurrency control

`WorkspaceStore.CreateDirect`:

1. builds the canonical candidate pair;
2. starts a transaction;
3. takes a namespaced advisory lock derived from the pair;
4. row-locks both participants in UUID order;
5. verifies both are active humans;
6. looks for an existing conversation with that pair;
7. inserts the conversation and exactly two memberships only if absent;
8. returns the viewer-specific DTO;
9. commits.

**Reference:** `backend/Nexus.Infrastructure/WorkspaceStore.cs:75-96`

Two users opening each other at the same time therefore serialize on the same canonical lock and receive the same conversation rather than two competing DMs.

## 6.5 Database-enforced Direct invariants

Sprint 5 goes beyond application checks. The migration adds PostgreSQL functions and triggers that validate, at commit time, that every direct conversation:

- has exactly two membership rows;
- includes the stored low participant;
- includes the stored high participant;
- references two active human participants.

**Reference:** `backend/Nexus.Infrastructure/Migrations/20261120041404_DirectConversations.cs:77-124`

It also includes:

- a write fence to prevent stale repeatable-read participant updates from invalidating a newly created pair;
- deferred constraint triggers on conversations, memberships and participant changes;
- a statement-level TRUNCATE trigger so bulk membership deletion cannot bypass row triggers.

These are unusually defensive measures for a local prototype, but they establish an important principle: privacy-sensitive structure should not depend only on one API path behaving correctly.

## 6.6 Direct visibility and authorization

The Home query includes a direct conversation only if the viewer is one of its pair columns.

**Reference:** `backend/Nexus.Infrastructure/WorkspaceStore.cs:103-108`

History and message posting call `RequireMembership`. For direct conversations, authorization comes from the canonical pair fields rather than trusting a possibly malformed membership list.

**Reference:** `backend/Nexus.Infrastructure/WorkspaceStore.cs:119-129`

This creates three useful outcomes:

- unknown conversation ID → 404;
- known direct conversation but nonmember → 403;
- member → permitted history or posting.

The message body is never returned to the unauthorized caller.

## 6.7 Viewer-specific titles

The stored title is neutral (`Direct conversation`). When building a DTO, the server looks up the other participant’s current name and returns that as the title.

**Reference:** `backend/Nexus.Infrastructure/WorkspaceStore.cs:135-147`

The frontend also derives the label from participant data and disambiguates duplicate names with a participant-ID suffix.

**Reference:** `src/PersistentWorkspace.tsx:191-200`

### What this means in the interface

Your rail shows the person you are talking to, not a stale title captured when the DM was first created. If two people have the same display name, Nexus adds enough of the participant ID to tell them apart.

## 6.8 Direct creation in the interface

The New Message dialog sends only the selected participant ID:

```tsx
const conversation = await api.post<Conversation>(
  '/conversations/direct',
  {participantId: recipientId}
);
```

**Reference:** `src/PersistentWorkspace.tsx:143-155`

After success, the returned conversation is added to local state, selected, and the composer receives focus. Retrying is safe because the same participant pair reopens the existing conversation.

## 6.9 Authoritative removal and private cache purging

Private data requires careful frontend cleanup. `PersistentWorkspace` tracks known conversation IDs and defines `purge`, which removes a conversation from:

- conversation navigation;
- cached messages;
- per-room drafts;
- send errors;
- pending-send state;
- request intents and revision tracking;
- the current selection.

**Reference:** `src/PersistentWorkspace.tsx:54-81`

A Home snapshot is authoritative for conversations the user may discover. If a previously known conversation disappears from a fresh snapshot, the UI purges it. A 403 or 404 while loading or sending also triggers purge.

**References:** `src/PersistentWorkspace.tsx:83-120`, `src/PersistentWorkspace.tsx:175-188`

The lifetime/tombstone counters prevent a slow request started before removal from repopulating a later cache lifetime.

This is the frontend equivalent of least privilege: once the server says the user no longer has access, private cached state is actively discarded.

---

# 7. How common interface actions travel through the system

## 7.1 Opening Nexus

1. `npm start` checks local runtime configuration and PostgreSQL.
2. The API starts and applies checked-in EF migrations using `MigrateAsync`.
3. Vite serves the React application on port 5174.
4. `main.tsx` selects `LiveWorkspace` for `/`.
5. `LiveWorkspace` calls `/api/auth/status`.
6. If no account exists, the first-run form appears.
7. Otherwise it calls `/api/auth/me`; a missing or expired session shows sign-in.
8. An authenticated user receives `/api/workspace/home` and enters `PersistentWorkspace`.

**Key references:** `scripts/start.mjs:7-33`; `backend/Nexus.Api/Program.cs:31-32,51-52`; `src/LiveWorkspace.tsx:22-45`.

## 7.2 Signing in

1. The form calls `WorkspaceApi.authenticate('login', ...)`.
2. `post` obtains a CSRF token if necessary.
3. The request includes the CSRF header; the browser also stores/sends cookies.
4. `IdentityStore.Login` normalizes email and verifies the password hash.
5. `Issue` stores a hashed session token with seven-day expiry.
6. The API sets the HttpOnly cookie.
7. The browser clears its cached CSRF token and reloads identity/workspace state.

**Key references:** `src/live-api.ts:24-40`; `backend/Nexus.Infrastructure/IdentityStore.cs:50-73`; `backend/Nexus.Api/Program.cs:67-72`.

## 7.3 Sending a message

1. The current room’s draft is trimmed.
2. The UI creates or reuses a request UUID for that exact intended body.
3. The API resolves the session to a participant.
4. The store verifies conversation membership.
5. The domain validates body and UUID.
6. A PostgreSQL advisory lock serializes that author/request pair.
7. Identical retries return the existing row; conflicting reuse returns 409.
8. The committed message DTO returns to the UI.
9. React merges it by ID and clears the draft only if it still matches the submitted text.

**Key references:** `src/PersistentWorkspace.tsx:175-188`; `backend/Nexus.Api/Program.cs:100-104`; `backend/Nexus.Infrastructure/WorkspaceStore.cs:27-46`; `backend/Nexus.Domain/Message.cs:13-27`.

## 7.4 Creating a Topic

1. The dialog validates title and opening message.
2. The UI creates one request UUID and retains it through uncertain retries.
3. The server takes the public-membership and creator/request locks.
4. Conversation, all-human memberships and opening message are committed atomically.
5. The UI inserts and selects the returned Topic immediately.
6. Older polls are prevented from erasing it.
7. A later Home snapshot confirms the creation.

**Key references:** `src/PersistentWorkspace.tsx:157-173`; `backend/Nexus.Infrastructure/WorkspaceStore.cs:48-73`.

## 7.5 Opening a Direct conversation

1. You choose another participant in the New Message dialog.
2. The API derives your participant ID from the session.
3. The domain canonicalizes the pair.
4. The transaction serializes on the pair lock and verifies two active humans.
5. Existing conversation is returned or one conversation plus two memberships is inserted.
6. The UI selects it and loads its history.
7. Future Home snapshots reveal it only to the two participants.

**Key references:** `src/PersistentWorkspace.tsx:143-155`; `backend/Nexus.Infrastructure/WorkspaceStore.cs:75-96,98-117`.

---

# 8. The persistent data model

| Table/entity | Purpose | Important relationships or rules |
|---|---|---|
| `Accounts` | Login identity | Unique normalized email; one-to-one participant; password hash |
| `Participants` | Visible collaborative identity | Human kind and active state currently used by real UI |
| `Sessions` | Server-side login continuity | SHA-256 token hash, account FK, expiry, revocation |
| `Conversations` | Main, Topic or Direct container | Kind/state checks; topical creator/request uniqueness; canonical direct pair uniqueness |
| `Memberships` | Participant membership in conversations | Composite key `(ConversationId, ParticipantId)` |
| `Messages` | Durable conversation content | Conversation and author FKs; body limit; unique `(AuthorId, ClientRequestId)` |

**Reference:** `backend/Nexus.Infrastructure/NexusDb.cs:6-51`

## 8.1 Why memberships and direct-pair columns both exist

Public conversation membership is naturally a many-to-many relationship and is represented by `Memberships`.

Direct conversations also have two membership rows, but their privacy identity is additionally stored as the canonical low/high pair. This allows:

- one unique conversation per pair;
- fast viewer filtering;
- authorization independent of a corrupted membership list;
- database validation that memberships exactly match the pair.

This is purposeful duplication: one representation supports relational participation; the other protects pair identity and uniqueness.

---

# 9. Testing and verification strategy

Nexus uses several layers of tests because each catches a different class of error.

## 9.1 TypeScript unit tests

- `src/domain.test.ts` exercises the browser prototype’s domain transitions.
- `src/live-api.test.ts` exercises API-client error and request behavior.

These tests are fast but cannot prove cookies, PostgreSQL transactions or browser behavior.

## 9.2 Real PostgreSQL backend integration tests

`backend/Nexus.Tests` starts fresh ASP.NET hosts against uniquely named disposable `nexus_test_*` databases. It does not use an in-memory EF provider.

Coverage includes bootstrap, sessions, CSRF, rate limits, validation, idempotency, registration, Home snapshots, Topics, Direct messages, migration upgrades and database invariants.

**References:** `backend/README.md:94-105`; `backend/TDD.md:1-27`.

## 9.3 Browser UI tests

Intercepted Playwright tests check presentation, accessibility and difficult UI-state sequences without requiring every server path.

Examples include:

- dialog focus behavior;
- responsive navigation;
- stale-poll corrections;
- private conversation removal;
- duplicate participant names;
- retry messages.

## 9.4 Live browser/API/database tests

The live suite runs the real frontend, real API and a disposable PostgreSQL database on separate test ports. This proves the integrated path through:

- Vite proxying;
- cookies;
- CSRF;
- API routing;
- PostgreSQL persistence;
- browser rendering.

The test harness uses `nexus_ui_test_*` databases and must not modify the real `nexus` database.

**References:** `README.md:47-67`; `docs/local-development.md:3-11`.

## 9.5 Sprint 5 verification state

At the documented Sprint 5 handoff, the repository reports:

- 29 frontend unit tests;
- 95 real-PostgreSQL backend tests;
- 54 UI tests;
- 27 live-harness tests;
- successful frontend build;
- successful .NET formatting verification;
- no pending EF model changes.

**References:** `README.md:63-65`; `backend/README.md:94-105`.

---

# 10. Design decisions worth remembering

## 10.1 REST and PostgreSQL are authoritative

Polling is a refresh mechanism, not a source of truth. Successful writes come from committed server responses, and later snapshots reconcile discovery and access.

## 10.2 Authentication identity is not accepted from the browser

The server derives the acting participant from the session cookie. This protects message authorship and conversation creation.

## 10.3 Retries are designed, not ignored

Message and Topic operations retain client request IDs so uncertain outcomes can be retried safely. Direct conversations use the canonical participant pair as their natural idempotency key.

## 10.4 Important invariants exist in multiple layers

Validation appears in UI guidance, C# domain rules, store transactions, indexes, foreign keys, check constraints and—in the Direct slice—database triggers. Each layer protects against a different failure mode.

## 10.5 Private caches have a lifecycle

The browser does not merely hide removed Direct conversations. It purges their messages, drafts and pending state and prevents old requests from restoring them.

## 10.6 Local-first does not mean disposable

`.local/postgres`, runtime credentials and data-protection keys are real application state. Setup deliberately refuses unsafe credential regeneration, and tests use separately named databases.

---

# 11. What remains prototype-only or not yet implemented

As of Sprint 5, the real workspace does **not** yet implement:

- connected agent participants;
- server-backed approval governance;
- group or agent Direct messages;
- invitations or closed registration policy;
- unread counts and notifications;
- blocking or muting;
- attachments;
- message editing or deletion;
- presence;
- encryption features;
- Topic archiving;
- password recovery or MFA;
- pagination;
- SignalR/realtime delivery;
- Nora deployment and production hardening.

The `/demo` route can show several of these ideas, but its behavior must not be mistaken for server-backed functionality.

**References:** `README.md:17-30`; `backend/README.md:107-111`.

---

# 12. Practical code-reading map

For a focused tour, read in this order:

1. **`src/main.tsx`** — see the `/demo` versus real-workspace split.
2. **`src/LiveWorkspace.tsx`** — follow bootstrap, sign-in, registration and initial Home loading.
3. **`src/live-api.ts`** — understand cookies, CSRF and error decoding.
4. **`src/PersistentWorkspace.tsx`** — follow room navigation, polling, drafts, retries, reconciliation and cache purging.
5. **`backend/Nexus.Api/Program.cs`** — map HTTP paths to store calls and security middleware.
6. **`backend/Nexus.Application/*.cs`** — inspect the request/response contracts.
7. **`backend/Nexus.Domain/*.cs`** — inspect validation and entity rules.
8. **`backend/Nexus.Infrastructure/IdentityStore.cs`** — follow accounts, sessions and registration.
9. **`backend/Nexus.Infrastructure/WorkspaceStore.cs`** — follow messages, Home, Topics, Directs and authorization.
10. **`backend/Nexus.Infrastructure/NexusDb.cs`** — inspect indexes, relationships and constraints.
11. **`backend/Nexus.Infrastructure/Migrations/`** — see exactly how each database capability was introduced.
12. **`backend/Nexus.Tests/` and `tests/`** — read expected behavior as executable documentation.

---

# 13. Compact glossary

**Account** — Authentication record containing email, password hash and administrative status.

**Participant** — Identity visible inside conversations. A human account currently maps one-to-one to a human participant.

**Session** — Seven-day server-side login record identified by a hashed opaque token; the raw token lives only in the browser cookie.

**Main / Common Room** — Permanent public conversation created during first-administrator bootstrap.

**Topic** — Public focused conversation joined by every active human.

**Direct** — Private durable conversation identified by one unordered pair of active human participants.

**Membership** — Database row associating a participant with a conversation.

**DTO** — Deliberately shaped data sent over the API rather than exposing EF entities directly.

**CSRF token** — Request token required for unsafe cookie-authenticated HTTP methods.

**Client request ID** — Browser-generated UUID used to make message and Topic retries idempotent.

**Advisory lock** — PostgreSQL transaction lock based on a logical key, used to serialize setup, membership changes, retries and Direct-pair creation.

**Authoritative snapshot** — Server response used to reconcile participants and discoverable conversations.

**Tombstone/lifetime** — Frontend generation tracking that prevents an old private-data request from restoring a conversation after access was removed.

---

# Closing perspective

The first five Sprints form a clear progression:

1. **Sprint 1** defined the product language and explored the broader Nexus vision in a safe browser prototype.
2. **Sprint 2** created a durable, authenticated local application with a real database and persistent Main messaging.
3. **Sprint 3** turned Main into a shared multi-human space.
4. **Sprint 4** introduced durable public branching through Topics.
5. **Sprint 5** introduced private pairwise collaboration with stronger authorization and database invariants.

The interface remains intentionally calm, but the implementation underneath it is increasingly defensive: authenticated authorship, transactional creation, retry safety, consistent snapshots, database constraints, isolated tests and active removal of private cached state. Those mechanisms are what allow the visible experience—signing in, choosing a room, typing a message and seeing another participant—to remain simple.