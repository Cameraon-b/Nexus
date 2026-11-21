# Nexus — a conversation-first local workspace

Nexus now has a real **ASP.NET Core / EF Core / PostgreSQL** foundation behind the React interface. The original sample prototype remains separate at `/demo`.

## Open and use

From `C:\Nexus`, run `npm start`, or double-click **Start Nexus.cmd** with Docker Desktop running.

- Workspace: **http://127.0.0.1:5174/**
- Sample prototype: **http://127.0.0.1:5174/demo**
- API: loopback port **5080**; PostgreSQL: loopback port **55432**

On first visit, create your own administrator account (display name, email, password of 12–128 characters). No default account or test credentials are installed in your actual workspace. After setup, another local user can choose **Create account** on the sign-in screen. Each account becomes a visible human participant and joins the Common Room automatically. Messages and identities are stored in PostgreSQL, not browser localStorage. Setup closes atomically after the first account is created.

`npm start` brings up PostgreSQL, builds the API, starts missing services, and reuses an existing Nexus frontend. Ctrl+C stops API/UI processes owned by that launcher. PostgreSQL stays running to preserve your workspace. To stop only the database, run `docker stop nexus-postgres-1`; the launcher starts it again later.

## Implemented in this slice

- First-admin setup, additional local human registration, sign-in, sign-out and seven-day server-side sessions
- HttpOnly cookies, CSRF protection, password hashing, authentication rate limits
- A shared persistent Main conversation, public Topics, and private one-to-one human–human and human–agent Direct messages with server-derived authorship
- Topic creation with title, description, opening message, active-human/agent membership, retry-safe IDs, and per-conversation drafts
- Retry-safe message IDs, validation, five-second participant/conversation/message polling and connection-error states
- Responsive, keyboard-accessible Topics and Direct messages navigation with accessible creation dialogs
- Direct creation/reopen via `POST /api/conversations/direct` with only `{participantId}`: the same eligible unordered pair always returns one durable conversation (no request UUID)
- Conversation DTO kinds are `main`, `topical`, and `direct`; direct titles show the other person's current name. Duplicate names are disambiguated in the UI with participant-ID suffixes. Only the two members can discover/read/post; later registration joins only public conversations
- Successful home snapshots reconcile authoritatively; removed/denied conversations lose their private caches and selection. Locally successful creates survive stale polls until observed by a later snapshot
- The prototype's sage/dark shell, participant-first layout and mobile treatment

**Still to build:** invitations or closed registration policy, group and agent–agent DMs, message requests, unread counts, notifications, blocking/muting, attachments, edits/deletes, presence, encryption features, topic archiving, production connector installations, approval/release governance backed by the server, password recovery, and deployment on Nora. Governance remains marked as coming next. `/demo` still offers broader sample flows for design iteration; nothing there is connected to the real database. Registration is intended only for this loopback local-development workspace; this is not a hardened production/LAN release.

## Sprint 6 — agent connections and pending replies

Workspace admins can **Manage agents**: create an agent, copy its one-time integration token, inspect metadata and pending counts, and explicitly confirm token replacement or revocation. Raw tokens exist only in the reveal dialog's memory, never browser storage, and cannot be recovered after dismissal/reload. Tokens use a `nexus_int_` prefix and 256 random bits; PostgreSQL stores SHA-256 hashes only. Creation/replacement responses are `no-store`.

Active agents appear in ordinary Direct Message recipients with AGENT labels, honest availability and duplicate-name disambiguation. Unknown/offline availability does not prevent durable human messages. New agents join Main and active public Topics, including future Topics. Successful bearer activity marks availability `available` and records last use; no offline-aging scheduler is implemented, so availability is not a continuous-presence guarantee.

The bearer-only integration API supports `/me`, bounded chronological `/inbox` polling with participant-scoped server cursors, and retry-safe pending `/drafts`. Cookies never authenticate integration requests; bearer tokens never authenticate human/admin routes. Human/admin writes retain CSRF. Drafts never become delivered messages in Sprint 6: ordinary Home/history receives no draft content, and admins see counts only. Revocation blocks subsequent integration requests immediately. See `backend/README.md` for contracts.

**Deferred:** approval/release/rejection, automatic publishing, agent–agent DMs, services and moderation workflows, webhooks, external connector installation and production hardening. `/demo` remains browser-local sample functionality. The real database has not been migrated and no Hermes/OpenClaw installation has been configured; migrations and the reference connector acceptance journey run only against disposable databases.

## Local data and secrets

- `.local/postgres/`: PostgreSQL data, bind-mounted from C:\Nexus
- `.local/runtime.json`: randomly generated database credentials; never commit or share
- `.local/keys/`: ASP.NET data-protection keys
- `.tools/dotnet/`: project-local pinned .NET SDK
- `.cache/`: NuGet, temporary and tool caches
- `.browsers/`: local Chromium downloads for browser testing

These paths and .NET bin/obj/test reports are Git-ignored. Vite denies requests for private local directories, including through `/@fs/`. Docker image layers are stored in Docker's managed storage, as authorized. No global .NET SDK installation is required on this machine.

**Do not delete `.local` to reset the demo.** Its database is real. Back up the database using PostgreSQL tooling, plus runtime.json and the key directory; copying live PostgreSQL files is not a reliable backup. If credentials are missing while database files remain, setup refuses to generate replacement credentials. There is not yet a password-reset workflow: keep your chosen admin credentials securely.

Browser-only sample data stays under `nexus-prototype-state-v1` and is not imported into PostgreSQL. The sample reset button only resets demo data.

## Development commands

```text
npm run setup          # start/check Postgres and restore/build the API
npm start              # start the local workspace
npm run api            # API only, after build
npm run dev            # frontend only; proxies /api to 5080
npm test               # TypeScript unit tests
npm run test:tooling   # local runtime configuration tests
npm run test:backend   # real-PostgreSQL integration tests
npm run test:ui        # demo + intercepted live UI + private-file serving tests
npm run test:live      # live UI/API/DB integration + UI-state tests
npm run build          # typecheck and build frontend
npm run build:api      # build ASP.NET API
```

Backend tests create/drop only unique `nexus_test_*` databases. Live browser tests use unique `nexus_ui_test_*` databases on API5081/UI5176, then drop them. They never bootstrap or reset your real `nexus` database. Test key files are generated and ignored. Tests include synthetic test-only passwords; those are not account defaults.

Sprint 6 verification: **29 frontend unit, 3 tooling, 147 PostgreSQL backend (none skipped), 58 intercepted/prototype browser, and 28 disposable live tests passed**. Exact commands and logs are recorded in ignored `artifacts/s6/STATUS.md`. The live suite includes both the existing human–human private journey and the admin/human/bearer three-context agent journey, with direct PostgreSQL assertions. Focused RED/GREEN logs cover identity/tokens, human-agent Direct creation, authorization, inbox pagination, drafts and admin UI. Build, .NET format, EF pending-model and source/safety audits are recorded alongside suite results.

On a fresh Windows checkout: install Node and Docker Desktop, run `npm ci`, then `python scripts/install-sdk.py` to download the SDK pinned in global.json (SHA-512 verified, extracted locally), and `npm run setup`. Browser tests additionally need Playwright Chromium installed with `PLAYWRIGHT_BROWSERS_PATH` set to the repository's `.browsers` directory. The supplied environment already has these prerequisites. Linux deployments should use the pinned .NET SDK with their own provisioning; Nora deployment is not delivered in this slice.

## Architecture and source

- `backend/Nexus.slnx`: Api, Application, Domain, Infrastructure and Tests
- `backend/README.md`: API contract, session rules, migrations and limitations
- `src/LiveWorkspace.tsx`, `src/PersistentWorkspace.tsx`, `src/ManageAgents.tsx`, `src/live-api.ts`: real authentication, conversation/admin UI and cookie+CSRF API client
- `src/App.tsx`, `src/domain.ts`: retained sample prototype
- `compose.yaml`: digest-pinned PostgreSQL image with project-local data
- `docs/`: original design PDFs and extracted specifications

REST remains authoritative. Polling is temporary UI refresh, not a replacement for durable database state; SignalR can be added later. Startup applies checked-in EF migrations for local development. Production should use reviewed migration deployment, restricted database privileges, TLS, key protection, pagination and operational backups before broader exposure.
