# Production bundle — local acceptance, not a deployment

Sprint 8 packages Nexus for later independent review and a separately approved deployment. Nothing here configures Nora, DNS, OpenResty, or real certificates. The Windows `npm start` workflow and `compose.yaml` are separate and unchanged. Never reuse `.local/postgres`, `.local/keys`, the development secret, or the development Compose project for this bundle.

## Architecture and trust

- `frontend`: digest-pinned unprivileged Nginx serving compiled assets, SPA fallback (including `/demo`), `/api/` and API health proxying. Only this base service publishes a port, loopback by default. No Vite or source maps in runtime.
- `api`: digest-pinned ASP.NET 10 runtime, non-root `app`, read-only root, `/tmp` tmpfs, writable named `/keys` volume. No SDK/source/test assemblies. Narrow image-native `--healthcheck` probes readiness without installing health-check tooling.
- `postgres`: pinned PostgreSQL 18, private internal backend network, no host port, fresh `database` named volume. PostgreSQL's standard entrypoint initially runs as root to initialize ownership, then its server runs as postgres. It is not a read-only/non-root-entrypoint image.
- `migrate`: the API image, `--migrate-only`, one-shot, no listener or feature seeds. The API depends on successful migration; frontend depends on API health. Normal Production startup never migrates. Pending schema or unavailable DB makes readiness return 503.
- PostgreSQL and the API read a mounted password file. The Compose file never interpolates the password value. This password-authentication bundle explicitly disables optional GSS/Kerberos encryption negotiation, avoiding an unnecessary native Kerberos dependency. It does not provide database TLS; its database network is internal to the single Docker host. Remote/multi-host database transport requires separate review.
- API trusts only the frontend's reserved backend IP. Frontend replaces forwarded client headers and accepts HTTPS scheme/client address only from `NEXUS_EDGE_PROXY`. Do not trust arbitrary subnets, `0.0.0.0/0`, or direct browser forwarding headers. Production API requires explicit allowed hosts and valid proxy IPs/non-global CIDRs. Cookies remain Secure, HttpOnly, SameSite Strict; CSRF remains mandatory.
- Backend and edge networks have **one authoritative IPAM definition in base Compose**. Both subnet/range pairs must be present even before attaching TLS. An overlay must attach its TLS proxy to edge, reserving an address outside the dynamic pool, and must not redefine networks. `scripts/production-network.test.mjs` renders the actual acceptance environment/base/overlay and compares the complete networks. Acceptance also checks live network/frontend IDs stay unchanged when TLS joins.

## Prepare configuration (do not run against real data during review)

1. Review `deployment/.env.example`. Copy it to a private absolute path **outside Git and the build context**. Set the full current `git rev-parse HEAD`, intended host, unique backend and edge subnets/ranges, and absolute secret-file path. On Windows, use forward-slash absolute paths (`C:/...`). Inspect `docker network inspect` and host/LAN/VPN routes for overlapping ranges. Keep reserved static addresses outside the dynamic pools.
2. Generate a random database password once into the private path. For example, in a private working directory, run `node -e "require('fs').writeFileSync('database-password',require('crypto').randomBytes(48).toString('base64url'),{flag:'wx',mode:0o444})"`. This refuses to overwrite an existing file. The parent directory must be private (mode 0700 on Linux, restricted host ACLs on Windows). A read-only 0444 file inside that private parent allows the distinct non-root API/PostgreSQL container users to read the mounted file without granting other host users directory traversal. Verify the effective container readability: Compose file secrets preserve host bind-mount permissions, and setting secret `uid`/`mode` in YAML does not reliably remap file sources. Compose file secrets are **not** an encrypted secret vault.
3. Retain the password together with the database backup; never regenerate it just because a config file is missing. An existing database volume retains its original password. Do not put passwords into environment files, command arguments, image build args, reports, or `docker compose config` evidence. Missing/empty files are refused safely for validate/build/migrate/start. The path must be absolute and both its normalized path and real path must be outside the entire repository/build context (including backend/); junction/symlink aliases into the context are rejected. `.dockerignore` is defense in depth, not permission to store secrets in-tree.
4. Review the `openresty-nexus.example.conf` placeholder, not a live configuration. The base frontend is HTTP **behind TLS termination**; it is not an independently usable production HTTP login endpoint because cookies are Secure. Only the TLS-facing proxy should reach it. Keep the published bind loopback (or separately restrict a reviewed proxy-only interface).
5. `NEXUS_EDGE_PROXY` must match the actual proxy peer visible inside frontend. For a container TLS overlay, reserve e.g. the example edge `.2` address. A host proxy can appear as a Docker gateway; verify that topology before configuring trust. Do not broaden trust to make a mismatched configuration work. The example does not prove a future Nora topology.

Commands below run from the repository root. Substitute an explicit unique project and private configuration path. No operation discovers or reuses development settings. Explicit config-file values are authoritative: the tools strip inherited `NEXUS_*`/`COMPOSE_*` interpolation overrides from Docker subprocesses (Docker connection/PATH settings remain available). `nexus_prod_*` and `nexus_s8_*` are the only accepted project namespaces.

```text
node scripts/production.mjs validate --project nexus_prod_example --config-file /private/production.env
node scripts/production.mjs build    --project nexus_prod_example --config-file /private/production.env
node scripts/production.mjs migrate  --project nexus_prod_example --config-file /private/production.env
node scripts/production.mjs start    --project nexus_prod_example --config-file /private/production.env
node scripts/production.mjs status   --project nexus_prod_example --config-file /private/production.env
node scripts/production.mjs stop     --project nexus_prod_example --config-file /private/production.env
```

- `validate` captures resolved Compose privately, checks the file secret and full-SHA image tag, and emits only a safe summary. Do not substitute unredacted `docker compose config` output in saved evidence.
- `build` requires tag equal to current HEAD and a clean tree; uses `--pull=false`. Only disposable review acceptance may explicitly use `--allow-dirty`. Such images are **not reproducible release images**: tags/revision labels identify the base commit plus uncommitted changes, not a reviewed source commit. No Git credentials enter builds.
- Both `migrate` and `start` deliberately stop frontend and API **before** starting PostgreSQL/migration. This is a short explicit maintenance window, not zero-downtime or an online-compatible migration policy. Standalone `migrate` leaves frontend/API stopped even on success; `start` starts them only after migration exits successfully. A failed migration leaves them stopped. Run build first. A separately managed TLS proxy may remain running, but cannot serve the stopped public frontend. Failures exit nonzero with safe generic diagnostics.
- `status` shows image tags (full base commit), states, Docker health, and the migration exit status. Healthy API implies DB connectivity and no pending migrations. Expected one-shot state is exited/0, not running. `/health/live` is process-only; `/health/ready` is DB+schema only, not a check of every application feature. Both return narrow JSON without private state.
- `stop` stops the base services **without deleting volumes**. It leaves any separately managed TLS overlay alone; manage that overlay with the same exact project/env/base+overlay files. Keep the explicit environment topology available. Emergency `status`, `stop` and confirmation-gated `destroy` do not require the database secret to exist or be readable; they never start/authenticate services. Exact project/config and destroy confirmation requirements still apply.
- An update requires reviewed source/images, backup of PostgreSQL and key volume, retained secret, explicit migration, start, health verification and an HTTPS sign-in/CSRF check. No automatic rollback of schema is supplied. Do not roll back images across incompatible migrations without a reviewed restore plan.

### Operation serialization and stale-lock recovery

Mutating build/migrate/start/stop/destroy commands exclusively lock the exact Docker Compose project identity using atomic directory creation under `.local/production-locks`, independent of config path. Concurrent operations on that project refuse before invoking Compose; different projects remain independent and status remains read-only. Lock metadata records PID, hostname and canonical config path for diagnostics, never secret values. Bypassing the CLI bypasses this protection.

Locks are removed on normal exit, including handled failures. A crash/forced termination can leave a lock. **Never remove or steal it because it is old.** An operator must identify its exact hash (SHA-256 of the exact project identity), inspect its owner PID/host, and verify that owning process and its Docker/Compose children are no longer running and no migration/build is active. PID reuse/another host is not proof of safety; if uncertain, keep maintenance mode and investigate. Only then remove that exact lock directory and retry the reviewed operation. Do not broadly delete lock directories or bypass a live lock.

### Destructive cleanup (never default)

Only for an explicitly approved exact project; this permanently deletes its database and data-protection-key volumes:

```text
node scripts/production.mjs destroy --project nexus_s8_example --config-file /private/production.env --confirm-destroy nexus_s8_example
```

The confirmation must equal the exact project. The operation removes project orphans too, including its disposable TLS container, but never deletes host secret/certificate files. Remove those exact private paths separately only after verifying Docker cleanup. Never use wildcard container/database removal or broad prune. Ordinary shutdown is `stop`, not `destroy`.

## Independent verification

Requires Docker Desktop/Linux containers, cached pinned bases, Node/npm dependencies, the local .NET SDK/EF tool, OpenSSL, and Playwright Chromium. No normal pulls are needed in this environment.

```text
npm test
npm run test:tooling
node --test scripts/production*.test.mjs
node scripts/test-backend.mjs -c Release
npm run test:ui
npm run test:live
npm run build
node scripts/dotnet.mjs format backend/Nexus.slnx --no-restore --verify-no-changes
node scripts/test-production.mjs
node --test scripts/production-image.test.mjs
```

Image tests default to base commit `bd054b4a63d453488b7207651fdaad0df4e9df0b`; set `NEXUS_COMMIT` to the built full SHA after that commit changes. For EF use the local tool, ensuring `.tools/dotnet` is first on PATH and DOTNET_ROOT points there:

```text
.tools/ef/dotnet-ef.exe migrations has-pending-model-changes --project backend/Nexus.Infrastructure --startup-project backend/Nexus.Infrastructure --configuration Release
```

Run fixed-port UI/live suites sequentially. Backend/live suites create unique disposable databases on the local test server; they do not migrate the real database. These test runners currently assume the repository's Windows-local SDK/key paths. Production operations themselves are Node/Compose cross-platform; Linux acceptance of the harness has not been independently demonstrated.

### HTTPS acceptance

`node scripts/test-production.mjs` selects a unique `nexus_s8_<random>` project, non-development host ports, separate networks/volumes, random database secret and ephemeral one-day localhost certificate in an OS temp directory. It validates and builds fresh images using `--pull=false --allow-dirty`, migrates, waits for base health, then adds the TLS overlay **without stopping/recreating frontend or its networks**. TLS uses a read-only root and explicit tmpfs temp paths and has a real HTTPS readiness check. Only the acceptance Playwright context ignores the self-signed certificate; this is not a production certificate policy.

The actual HTTPS browser/API journey covers `/demo` isolation, clean bootstrap, closed registration/direct 403, secure cookies, sign-out/in, Topic/message, agent/token, human-agent DM, bearer inbox/proposal, administrator approval, authorship/provenance, API/frontend/PostgreSQL restarts, key-file aggregate fingerprint, existing session and CSRF validity, and persistent released message. Reports disable screenshots/video/traces to avoid retaining one-time credentials. The harness audits non-root API/frontend, health/read-only roots, mount destinations, unpublished API/DB ports, no privileges/host networking/socket/dev mounts, secret absence from container config/history, and non-destructive stop/start volume retention plus equal database-count/key-fingerprint snapshots. It also updates an already running stack and uses Docker events to prove frontend/API stop before migration and restart only after migration exits, preserving count/key snapshots. Finally it removes only that project and verifies running **and stopped** containers, networks and volumes are absent before deleting its temporary material. If Docker cleanup fails or leaves any labeled resource, it retains the exact config/secret/certificate directory and prints its path and safe exact-project recovery instructions, not file contents. Evidence is ignored under `artifacts/s8/`.

The test certificate hostname is `localhost`, not a live `nexus.aether.lab` DNS route. Configured production-host filtering is separately exercised by backend tests. Host port selection checks availability but cannot atomically reserve ports across Docker startup; an external race fails safely and cleans up rather than sleeping/retrying around it.

## Updating base digests

Each Dockerfile FROM and the PostgreSQL service is pinned to an immutable official linux/amd64 manifest. In a separately approved maintenance change, resolve the intended official upstream tag/platform, verify the manifest and blobs, review image/runtime changes, update the pin (and the acceptance TLS image pin together with frontend runtime), then rerun config/image/content/HTTPS/regression checks. Do not silently switch runtime families, drop digest pins, or commit registry retrieval/cache tooling. In this environment use already cached official images and `--pull=false`; known registry routing failures are not an application workaround requirement.

## Scope limits

No Nora deployment, actual DNS/TLS configuration, backup automation, secret vault, database transport TLS, invites/recovery/admin-account provisioning, CI, image signing/SBOM policy, orchestration, or external monitoring is implemented. Persisted data-protection keys require restricted host/volume access and backup; they are not encrypted at rest by an external key service. Initial images may include normal upstream OS shells/package tools; none are installed solely to perform health checks. Local acceptance is not authorization to deploy.
