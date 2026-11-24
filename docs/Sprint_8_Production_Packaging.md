# Sprint 8 — Production Packaging and LAN Hardening

## Sprint record

- **Goal:** package Nexus as a reproducible, security-hardened production container bundle for a later clean deployment to Nora behind OpenResty, without deploying to Nora or disrupting the Reeba development workspace.
- **Feature branch:** `sprint-8-production-packaging`
- **Branch base:** `bd054b4a63d453488b7207651fdaad0df4e9df0b`
- **Verified locally:** November 23, 2026
- **Deployment status:** packaged and accepted on isolated Windows Docker Desktop resources; **not deployed to Nora**.

Sprint 8 changes the way Nexus can be packaged and operated, not the product’s conversation model. The existing `npm start` development workflow remains the active Reeba workspace. Production images, secrets, networks, volumes, certificates, ports, and databases are isolated from that workspace.

## Delivered architecture

The production bundle consists of four roles in `deployment/compose.production.yaml`:

1. **PostgreSQL** stores application data in a named `database` volume. It is available only on the internal backend network and has no published host port (`deployment/compose.production.yaml:1-18`).
2. **Migration** runs the API image once with `--migrate-only`. It receives the database secret but does not serve HTTP (`deployment/compose.production.yaml:19-45`).
3. **API** runs the compiled ASP.NET application as the image’s `app` user with a read-only root filesystem, `/tmp` tmpfs, and a writable named `/keys` volume for ASP.NET data-protection keys (`deployment/compose.production.yaml:46-58`, `deployment/api.Dockerfile:6-16`).
4. **Frontend** serves the compiled React application from an unprivileged Nginx image and proxies same-origin `/api` traffic. It is the only base service that publishes a port, bound to loopback by default (`deployment/compose.production.yaml:59-89`, `deployment/frontend.Dockerfile:9-16`).

The backend network is internal. A separate edge network exists for the later TLS/reverse-proxy boundary. The isolated acceptance harness adds an ephemeral TLS container to that edge network without recreating the frontend or redefining the base network (`deployment/compose.production.yaml:90-101`, `scripts/production-acceptance-config.mjs:6-8`).

All runtime base images are pinned to immutable platform digests. Source, tests, local state, tools, registry caches, credentials, certificates, and generated output are excluded from image build contexts through `.dockerignore`.

## Visible authentication behavior

### Clean-database bootstrap and closed registration

Production exposes first-administrator bootstrap only while the database has no account. The public status contract reports both `requiresBootstrap` and `registrationAvailable`; registration is available only when bootstrap is complete and configuration explicitly permits it (`backend/Nexus.Api/Program.cs:128-169`).

Production configuration sets `Nexus__AllowPublicRegistration` to false. In that mode, the registration endpoint is mapped without a request-body model and always returns 403, so malformed request bodies cannot alter the closed-registration response (`backend/Nexus.Api/Program.cs:178-185`). Development retains public registration by default.

The frontend strictly parses the status response rather than trusting JavaScript truthiness. Missing, contradictory, or wrong-type status fields fail closed (`src/registration.ts:1-9`). On session expiry it obtains a fresh authoritative status before deciding whether account creation should be visible. Abort checks prevent older status responses from replacing a newer closed or unavailable state (`src/LiveWorkspace.tsx:25-52`).

When registration is closed, the sign-in form does not render a meaningless one-item tab list. When registration is open, Sign in and Create account have associated tab panels, selected state, one tab stop, and Left/Right keyboard navigation (`src/LiveWorkspace.tsx:60-79`).

## API production behavior

### Explicit execution modes

The API executable now has three distinct production-relevant paths:

- `--healthcheck` performs a bounded local readiness request and exits without starting another server (`backend/Nexus.Api/Program.cs:11-23`).
- `--migrate-only` applies EF migrations and exits. It produces a generic failure message without exposing provider details (`backend/Nexus.Api/Program.cs:24-26`, `backend/Nexus.Api/Program.cs:81-95`).
- Normal Production startup never migrates the database automatically. Development continues to migrate on startup for the existing local workflow (`backend/Nexus.Api/Program.cs:128-134`).

### Health boundaries

`/health/live` proves only that the process can respond. `/health/ready` requires database connectivity and no pending EF migrations. Failures return narrow JSON and a 503 without provider errors, schema names, counts, or topology details (`backend/Nexus.Api/Program.cs:134-145`).

### Secrets and cryptographic keys

The API reads the PostgreSQL password from a mounted file and constructs the connection string in memory. Missing or empty files fail with a generic error; the value is never placed in Compose environment variables or image build arguments (`backend/Nexus.Api/Program.cs:27-50`).

Production requires an absolute data-protection key path. Before binding a listener it creates and removes a unique write probe, failing startup if the repository cannot be created or written (`backend/Nexus.Api/Program.cs:61-70`, `backend/Nexus.Api/Program.cs:96-107`). The Compose API stores keys in the persistent `keys` volume, allowing cookies and protected state to survive container replacement.

### Proxy and request security

Production requires explicit allowed hosts and configured trusted proxies. Only private, loopback, link-local, or IPv6 unique-local proxy addresses/networks are accepted; broad or globally routable ranges fail startup (`backend/Nexus.Api/Program.cs:108-126`). Cookie authentication remains Secure, HttpOnly, and SameSite Strict in Production, and human state-changing requests remain protected by CSRF validation (`backend/Nexus.Api/Program.cs:71-80`, `backend/Nexus.Api/Program.cs:146-163`). Integration bearer endpoints remain a separate authentication boundary.

## Lifecycle and migration safety

`scripts/production.mjs` provides explicit `validate`, `build`, `migrate`, `start`, `status`, `stop`, and confirmation-gated `destroy` commands (`scripts/production.mjs:8-18`).

### Maintenance-window updates

`migrate` and `start` stop the existing frontend and API before PostgreSQL migration begins. `start` launches the replacement API/frontend only after migration exits successfully; standalone `migrate` intentionally leaves traffic stopped. Any migration or partial-start failure re-quiesces both traffic-serving services (`scripts/production-operations.mjs:27-37`). This is an explicit short maintenance window, not a zero-downtime migration promise.

### Operation serialization

Every mutating command takes an exclusive filesystem lock keyed only by Docker Compose project identity. Different configuration files therefore cannot operate concurrently on the same containers, networks, or volumes. Lock metadata records PID, host, and canonical configuration path, but no secret values. Locks are not stolen based on age; stale-lock removal requires operator verification (`scripts/production-operations.mjs:14-25`).

### Secret containment

Commands that can validate, build, migrate, or start services require an absolute, nonempty regular secret file. Both normalized and canonical paths must be outside the repository and Docker build context, rejecting `..`, symlink, and junction aliases into the source tree (`scripts/production-operations.mjs:5-13`, `scripts/production.mjs:19-33`).

Emergency `status`, `stop`, and confirmed `destroy` remain available if the password file is unavailable, because they do not start or authenticate application services. Exact project/configuration requirements still apply (`scripts/production.mjs:13-24`, `scripts/production.mjs:46-48`).

## Acceptance and cleanup controls

`scripts/test-production.mjs` creates a unique `nexus_s8_*` project with disposable networks, volumes, password, certificate, ports, and configuration. It performs a real HTTPS browser journey through frontend, API, migration container, and PostgreSQL. The journey covers:

- clean administrator bootstrap;
- closed registration and direct registration rejection;
- Secure cookie and CSRF behavior through HTTPS;
- sign-out/sign-in;
- Topic and message persistence;
- agent/token creation;
- human-agent direct conversation;
- integration inbox and proposal;
- administrator approval and truthful authorship;
- service restarts, session/key persistence, and data persistence;
- update of an already running stack with traffic stopped before migration.

The runtime auditor requires the exact expected service set, users, health/states, root-filesystem modes, security options, devices, tmpfs paths, mounts, volume identities, secret modes, and loopback publications (`scripts/production-acceptance-safety.mjs:53-98`). It rejects broad host binds, Docker socket mounts, unexpected volumes, public API/database ports, wrong service users, extra security options, and port drift.

Cleanup inspects running **and stopped** containers plus project networks and volumes. Temporary secrets and certificates are removed only after exact Docker cleanup succeeds. If cleanup fails, recovery material is retained and only a safe exact-project recovery instruction is printed (`scripts/production-acceptance-safety.mjs:31-44`).

## Independent verification

Hermes independently reproduced the final matrix after the correction reviews:

| Boundary | Verified result |
| --- | ---: |
| Frontend unit tests | 33 passed |
| Existing tooling tests | 4 passed |
| Production configuration/runtime/tooling tests | 174 passed |
| Backend tests against disposable real PostgreSQL | 259 passed, 0 skipped |
| Intercepted browser tests | 133 passed |
| Live browser/API tests | 31 passed |
| Production build | Passed |
| .NET format verification | Passed |
| EF pending-model check | No pending model changes |
| Isolated HTTPS production acceptance | 1 browser journey passed; update, persistence, runtime audit, stop/start, and cleanup passed |

The final independent backend/container/security reviewer and frontend stale-status reviewer both returned **GO** with no blocking defects.

The authoritative Reeba database remained unchanged at:

`3 accounts / 4 participants / 1 agent / 5 conversations / 14 delivered messages / 1 integration token / 1 draft / 0 pending drafts / 1 approval decision / 11 migrations`

The protected data-key repository remained one file with aggregate fingerprint:

`1df165b71a29176d8c8ec2c4e907f3884c28a3784d23361aca191d23c911515a`

Post-verification checks found no disposable test databases, recent run-owned key fixtures, operation locks, Sprint 8 containers (including stopped containers), networks, volumes, or isolated acceptance listeners.

### Verification-process disclosure

The implementation required multiple independent correction rounds. Early correction evidence included behavioral tests produced by temporarily reverting already-implemented helpers. Those logs are useful mutation/regression evidence but are **not** chronological test-before-implementation proof. Later correction rounds used genuine current-tree RED→GREEN tests. This distinction remains documented in ignored local evidence and is not represented here as perfect historical TDD compliance.

Two attempted combined/background verification commands failed with `stdin is not a tty` because some Windows-local test runners require an attached terminal. The same suites were rerun individually in foreground terminals and passed. The first two local HTTPS attempts also failed safely because an earlier EF command had persisted `TMP`/`TEMP` inside the repository, causing the new secret-containment check to reject the generated secret. Restoring Hermes’s external scratch directory allowed acceptance to pass; this demonstrated the containment guard working as designed.

## Design decisions and invariants

- **Same origin remains mandatory.** The browser talks to `/api` through the frontend proxy, preserving cookie and CSRF behavior without credential storage in localStorage.
- **Production schema changes are explicit.** Normal API startup cannot silently migrate a production database.
- **Traffic is stopped before migration.** Schema/application version overlap is avoided through a maintenance window.
- **Lifecycle operations serialize by deployment identity.** The Docker project, not the config filename, is the shared mutation boundary.
- **Secrets must be outside source and build contexts.** Git ignore rules are not treated as a security boundary.
- **Keys and database data persist independently.** Both must be backed up and restored together with the retained database secret.
- **Closed registration is enforced on both server and interface.** The UI cannot advertise registration from malformed or stale status data, and the server returns 403 before request-body binding.
- **Cleanup is evidence-driven.** Successful command exit is not enough; stopped containers, networks, volumes, locks, test databases, key fixtures, and temporary materials are checked explicitly.
- **Local acceptance is not deployment approval.** Nora host inventory, backups, OpenResty configuration, trusted proxy addresses, real TLS, clean bootstrap, cutover, and rollback proof remain Sprint 9 work.

## Deferred work and limitations

- No Nora container, volume, proxy, DNS, certificate, or database was changed.
- Linux/rootless named-volume source behavior is covered by fixtures; the full acceptance harness was executed on Windows Docker Desktop, not Nora.
- The acceptance certificate is ephemeral and valid only for `localhost`; it is not suitable for `nexus.aether.lab`.
- Database transport TLS is not implemented because PostgreSQL is private to one Docker host in this bundle. A remote or multi-host database requires separate review.
- Backup automation, image signing, SBOM policy, CI publication, secret-vault integration, monitoring, and orchestration are intentionally deferred.
- Review images built from the dirty feature tree use the base commit tag for disposable acceptance only. Final release images must be built from the eventual clean verified commit.

## Practical code-reading map

1. Start with `deployment/README.md` for the operator contract and explicit limitations.
2. Read `deployment/compose.production.yaml` for service, network, volume, and secret topology.
3. Read `deployment/api.Dockerfile` and `deployment/frontend.Dockerfile` for immutable build/runtime stages.
4. Read `scripts/production.mjs` and `scripts/production-operations.mjs` for lifecycle validation, locks, migration ordering, and destruction controls.
5. Read `backend/Nexus.Api/Program.cs:11-199` for health, migration-only execution, key storage, proxy validation, bootstrap, registration, cookies, and CSRF behavior.
6. Read `src/registration.ts` and `src/LiveWorkspace.tsx:18-79` for fail-closed auth status and accessible registration presentation.
7. Read `scripts/production-acceptance-safety.mjs` for network allocation, exact runtime auditing, and cleanup retention.
8. Read `scripts/test-production.mjs` and `tests/production-acceptance.spec.ts` for the isolated HTTPS journey.
9. Read `scripts/production*.test.mjs`, `backend/Nexus.Tests/Production*Tests.cs`, `backend/Nexus.Tests/KeyIsolationTests.cs`, and `tests/auth-status-corrections.spec.ts` for regression boundaries established during review.
