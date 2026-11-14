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
- A shared persistent Main conversation plus public topical conversations with server-derived authorship
- Topic creation with title, description, opening message, all-human membership, retry-safe IDs, and per-conversation drafts
- Retry-safe message IDs, validation, five-second participant/conversation/message polling and connection-error states
- Responsive, keyboard-accessible topic navigation and creation dialog
- The prototype's sage/dark shell, participant-first layout and mobile treatment

**Still to build:** invitations or closed registration policy, direct messages, topic archiving/unread state, agent connectors, approval governance backed by the server, password recovery, and deployment on Nora. Direct messages and governance remain marked as coming next. `/demo` still offers broader sample flows for design iteration; nothing there is connected to the real database. Registration is intended only for this loopback local-development workspace; this is not a hardened production/LAN release.

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
npm run test:ui        # preserved demo + private-file serving tests
npm run test:live      # live UI/API/DB integration + UI-state tests
npm run build          # typecheck and build frontend
npm run build:api      # build ASP.NET API
```

Backend tests create/drop only unique `nexus_test_*` databases. Live browser tests use unique `nexus_ui_test_*` databases on API5081/UI5176, then drop them. They never bootstrap or reset your real `nexus` database. Test key files are generated and ignored. Tests include synthetic test-only passwords; those are not account defaults.

On a fresh Windows checkout: install Node and Docker Desktop, run `npm ci`, then `python scripts/install-sdk.py` to download the SDK pinned in global.json (SHA-512 verified, extracted locally), and `npm run setup`. Browser tests additionally need Playwright Chromium installed with `PLAYWRIGHT_BROWSERS_PATH` set to the repository's `.browsers` directory. The supplied environment already has these prerequisites. Linux deployments should use the pinned .NET SDK with their own provisioning; Nora deployment is not delivered in this slice.

## Architecture and source

- `backend/Nexus.slnx`: Api, Application, Domain, Infrastructure and Tests
- `backend/README.md`: API contract, session rules, migrations and limitations
- `src/LiveWorkspace.tsx`, `src/PersistentWorkspace.tsx`, `src/live-api.ts`: real authentication, conversation UI and API client
- `src/App.tsx`, `src/domain.ts`: retained sample prototype
- `compose.yaml`: digest-pinned PostgreSQL image with project-local data
- `docs/`: original design PDFs and extracted specifications

REST remains authoritative. Polling is temporary UI refresh, not a replacement for durable database state; SignalR can be added later. Startup applies checked-in EF migrations for local development. Production should use reviewed migration deployment, restricted database privileges, TLS, key protection, pagination and operational backups before broader exposure.
