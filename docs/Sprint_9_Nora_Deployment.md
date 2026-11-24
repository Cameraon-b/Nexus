# Sprint 9 — Nora Deployment and LAN Cutover

## Sprint record

- **Goal:** deploy the verified Sprint 8 Nexus production bundle to Nora as a clean, persistent installation behind Nginx Proxy Manager, while leaving the Reeba development workspace and its real database unchanged.
- **Deployment source:** `909cadc9edf6ff8484b8859b0f17ac9b0184a1c0` (`[verified] add production packaging and LAN hardening`).
- **Deployment branch:** `sprint-9-nora-deployment` (documentation only; application images use the exact approved Sprint 8 commit).
- **Deployed:** November 24, 2026.
- **Production URL:** `https://nexus.aether.lab`.
- **Data decision:** clean PostgreSQL database; no prior Nora Nexus database was migrated.

Sprint 9 is an infrastructure deployment rather than a product-code sprint. The application source and container definitions are unchanged from Sprint 8. The work transferred the exact approved Git history to Nora, built the pinned production images under the dedicated rootless Docker daemon, created clean persistent storage, connected the stack to the existing system-Docker proxy through a constrained host bridge, completed first-administrator bootstrap, and verified recovery properties.

## Runtime-state matrix

| Surface | State after Sprint 9 |
| --- | --- |
| Reeba development workspace | Still running independently at `http://127.0.0.1:5174/`; API and real development PostgreSQL remain healthy and unchanged. |
| Reeba `/demo` prototype | Still available through the development workspace; it was not deployed as a separate production service. |
| Approved source | Commit `909cadc9edf6ff8484b8859b0f17ac9b0184a1c0`, transferred as a verified Git bundle and checked out detached on Nora. |
| Nora rootless PostgreSQL | Persistently running in Compose project `nexus_prod_nora`, private backend network only. |
| Nora rootless API | Persistently running and healthy; no host-published port. |
| Nora rootless frontend | Persistently running and healthy; published only on the Nginx Proxy Manager bridge gateway at `172.20.0.1:8088`. |
| Nora migration service | One-shot container, exited successfully with code 0 after applying 11 checked-in migrations. |
| Public reverse proxy | Existing system-Docker Nginx Proxy Manager route now forwards `nexus.aether.lab` to `http://172.20.0.1:8088`. |
| TLS | HTTPS active with a dedicated self-signed custom certificate. HTTP redirects to HTTPS. The certificate is encrypted in transit but is not publicly trusted. |
| Disposable source-address probe | Removed with its two temporary rootless Docker networks. |
| Git publication | The deployed application commit was already on Gitea. This Sprint 9 record remains on its feature branch until Cameron accepts and authorizes the established merge/publication workflow. |

## Nora inventory and privilege boundary

Nora runs Ubuntu 26.04 LTS on Linux/AMD64. Deployment uses the dedicated `hermes` account and its rootless Docker 29.5.2 daemon with Compose 5.1.4. User lingering is enabled, so the rootless daemon is not tied to an active SSH login.

The account intentionally has no system Docker socket access and no `sudo`. Cameron supplied a narrowly formatted system-Docker inventory rather than granting Docker-group membership, which would be root-equivalent. That inventory established:

- Nginx Proxy Manager owns ports 80, 81, and 443 in system Docker.
- Its bridge network is `nginx-proxy-manager_default`, with host gateway `172.20.0.1`.
- No system-Docker container or volume was a prior Nexus deployment.
- Existing `aether-*` resources were unrelated and were not changed.
- `/srv/nexus` was empty, writable by `hermes`, and had sufficient capacity.

Because no prior Nexus container, database volume, or application directory existed, there was no dormant application state to dump. The previous Nginx Proxy Manager route was still recorded in `/srv/nexus/shared/rollback/npm-nexus-before-sprint9.txt` before cutover.

## Release provenance and host layout

The local repository created a complete Git bundle containing `main` at the approved commit. Its SHA-256 was checked before Nora cloned it. Nora then verified the bundle from the cloned repository and checked out the commit detached with a clean tree.

The deployment layout is:

```text
/srv/nexus/
├── incoming/                       # verified Git bundle retained for recovery
├── releases/
│   └── 909cadc9edf6ff8484b8859b0f17ac9b0184a1c0/
└── shared/
    ├── backups/
    ├── certificates/
    ├── config/
    ├── rollback/
    └── secrets/
```

The release checkout contains no production secret. The database password, production environment, certificate material, backups, and rollback records live outside the repository and Docker build context with restricted host permissions.

## Production topology

The running application uses the four-role Compose topology defined in `deployment/compose.production.yaml:1-107`:

1. PostgreSQL stores clean production data in `nexus_prod_nora_database` and has no host publication (`deployment/compose.production.yaml:1-18`).
2. The migration service runs the exact API image with `--migrate-only` and exits before traffic starts (`deployment/compose.production.yaml:19-45`).
3. The API runs as the image user `app`, with a read-only root filesystem, `/tmp` tmpfs, and persistent `nexus_prod_nora_keys` storage (`deployment/compose.production.yaml:46-58`).
4. The frontend runs as UID 101 with a read-only root filesystem and is the only published service (`deployment/compose.production.yaml:59-89`).

The backend uses `10.253.100.0/24`, with the frontend statically reserved at `10.253.100.2` and dynamic allocations confined to `10.253.100.128/25`. The edge network uses `10.253.101.0/24` with dynamic allocations in `10.253.101.128/25`. These ranges did not overlap Nora's LAN, VPN routes, or existing system-Docker bridge ranges.

### Cross-daemon proxy boundary

Nginx Proxy Manager and Nexus cannot share a Docker network because they run in different daemons. The frontend is therefore published exactly on the system proxy network's host gateway:

```text
Nginx Proxy Manager container
        |
        | HTTP to host bridge gateway
        v
172.20.0.1:8088
        |
        v
rootless Nexus frontend -> API -> PostgreSQL
```

A disposable Node probe reproduced the production two-network topology and demonstrated that:

- rootless Docker could bind specifically to `172.20.0.1`;
- Nginx Proxy Manager could reach that address;
- the proxy supplied the expected `Host`, `X-Forwarded-For`, and `X-Forwarded-Proto` headers;
- the port was not published on `0.0.0.0` or Nora's LAN interface.

RootlessKit presents the published connection to the frontend from its dynamically assigned edge endpoint. The frontend therefore trusts only the dedicated edge dynamic range `10.253.101.128/25`, rather than a LAN range or all private addresses. The API separately trusts only the frontend's exact backend address `10.253.100.2`. Forwarded-header handling remains implemented by `deployment/frontend.conf.template:1-31` and the production API validation in `backend/Nexus.Api/Program.cs:108-126`.

The disposable probe container, script, backend network, and edge network were removed before the production stack started.

## Nginx Proxy Manager and TLS

The prior route was:

```text
nexus.aether.lab -> http://192.168.1.137:5055
certificate: none
Force SSL: disabled
HTTP/2: disabled
cache: disabled
common exploit blocking: enabled
WebSocket support: disabled
advanced configuration: empty
```

The final route is:

```text
nexus.aether.lab -> http://172.20.0.1:8088
certificate: Nexus self-signed 2026
Force SSL: enabled
HTTP/2: enabled
HSTS: disabled
cache: disabled
common exploit blocking: enabled
WebSocket support: disabled
advanced configuration: empty
```

HSTS remains disabled because the current certificate is self-signed. This avoids pinning an untrusted certificate policy in browsers. The certificate has `nexus.aether.lab` as its subject alternative name, is retained under restricted permissions in `/srv/nexus/shared/certificates`, and expires December 26, 2027. It should eventually be replaced by a certificate issued by a deliberately managed internal CA or another trusted mechanism.

The certificate SHA-256 fingerprint observed through the public listener is:

```text
3F:33:47:06:07:AF:02:F2:74:90:E9:76:90:53:86:E4:C9:28:CF:15:17:81:0F:1F:80:0C:D0:AE:D0:77:B3:96
```

## Bootstrap and visible behavior

The clean database initially returned:

```json
{"requiresBootstrap":true,"registrationAvailable":false}
```

Cameron created the first administrator through `https://nexus.aether.lab`. After bootstrap, the public status became:

```json
{"requiresBootstrap":false,"registrationAvailable":false}
```

The interface then changed from the first-run administrator form to the normal **Welcome back** sign-in form. A registration request carrying a valid CSRF token returned HTTP 403, proving that registration is closed at the server as well as hidden by the interface (`backend/Nexus.Api/Program.cs:165-185`).

The post-bootstrap production aggregates were:

```text
1 account / 1 participant / 1 conversation / 0 messages /
1 session / 0 integration tokens / 0 drafts / 0 approval decisions /
11 migrations
```

No private identity, session token, CSRF value, password, or message content was captured in deployment evidence.

## Persistence and restart verification

The following were captured before service restarts:

- aggregate database counts;
- an aggregate fingerprint of the persistent ASP.NET data-protection key repository;
- public registration/bootstrap state.

Frontend, API, and PostgreSQL containers were restarted individually and allowed to return to Docker health before the next step. Afterward:

- all three services were healthy;
- aggregate database counts were identical;
- the data-protection key fingerprint was identical;
- the public endpoint still reported bootstrap complete and registration closed;
- Cameron refreshed the existing administrator browser session and confirmed that it remained signed in and loaded the workspace.

That last check proves the complete deployed session path—not only persistence of a session row or key file—survived the restart sequence.

## Backups and restore evidence

A pre-bootstrap custom-format PostgreSQL dump was created and successfully parsed with `pg_restore --list` before the administrator account was created.

After bootstrap and restart verification, a complete recovery set was created at:

```text
/srv/nexus/shared/backups/postbootstrap-20261124T060922Z/
```

It contains:

- custom-format PostgreSQL dump;
- data-protection-key archive;
- retained database password file;
- production environment file;
- certificate and private key;
- Nginx Proxy Manager before/after route records;
- restore metadata;
- SHA-256 manifest.

The PostgreSQL dump passed `pg_restore --list`, the key archive passed `tar -tf`, and the final manifest passed `sha256sum -c`. Backup files and their directory are restricted to the deployment account.

## Runtime security audit

The live runtime was inspected using named fields rather than raw container configuration:

| Service | Runtime properties |
| --- | --- |
| PostgreSQL | Pinned digest, private backend network, no host publication, named database volume, password file mounted read-only, `no-new-privileges`. |
| API | Exact approved image revision, user `app`, read-only root, persistent key volume, password file mounted read-only, no host publication, `no-new-privileges`, healthy. |
| Frontend | Exact approved image revision, user 101, read-only root, no writable volume, exact `172.20.0.1:8088` publication, backend and edge networks only, `no-new-privileges`, healthy. |
| Migration | Exact approved API image, exited 0, no listener. |

The database secret was never printed, placed in an environment variable, copied into an image, or committed. API and database ports remain inaccessible from the host and LAN.

## Reeba preservation

After Nora deployment and cutover, the Reeba development environment was rechecked:

- workspace returned HTTP 200 at `http://127.0.0.1:5174/`;
- development auth status still returned `registrationAvailable: true`;
- development PostgreSQL remained healthy;
- protected aggregates remained exactly `3|4|1|5|14|1|1|0|1|11`;
- local source remained at approved commit `909cadc9edf6ff8484b8859b0f17ac9b0184a1c0` before this documentation branch.

The Nora deployment did not read, copy, migrate, reset, or otherwise mutate the Reeba database, Mira/OpenClaw agent, integration token, messages, approval history, drafts, or data-protection keys.

## Rollback

Rollback intentionally preserves production data:

1. In Nginx Proxy Manager, restore proxy host #6 to `http://192.168.1.137:5055`.
2. Select no certificate and disable Force SSL and HTTP/2, restoring the recorded pre-Sprint-9 route exactly.
3. From the exact release checkout, run:

   ```bash
   node scripts/production.mjs stop \
     --project nexus_prod_nora \
     --config-file /srv/nexus/shared/config/production.env
   ```

4. Do not use `destroy`; ordinary rollback leaves the database and data-protection-key volumes intact.
5. Retain `/srv/nexus/shared`, the approved images, Git bundle, release checkout, and backups until a separately approved cleanup.

If database restore is required, stop traffic first, retain the current failed-state backup, restore the database dump together with the matching database password and key archive, then run explicit migration and health checks before restoring the proxy route. Image rollback across an incompatible schema is not automatic and requires a reviewed database restore.

## Verification summary

| Check | Result |
| --- | --- |
| Exact Git bundle and detached release checkout | Passed |
| Clean production configuration validation | Passed |
| Digest-pinned image acquisition and build | Passed |
| Explicit migration | Exited 0; 11 migrations |
| PostgreSQL health | Healthy |
| API health | Healthy |
| Frontend health | Healthy |
| Exact bridge-only frontend publication | `172.20.0.1:8088` |
| API/database host publications | None |
| NPM-to-rootless cross-daemon reachability | Passed |
| HTTP-to-HTTPS redirect | HTTP 301 |
| HTTPS application status | HTTP 200 |
| Certificate hostname/fingerprint | Verified |
| Post-bootstrap registration state | Closed; valid-CSRF registration returned 403 |
| Frontend/API/PostgreSQL individual restarts | Passed |
| Database aggregates after restart | Unchanged |
| Data-protection keys after restart | Unchanged |
| Existing administrator browser session after restart | Remained signed in; confirmed by Cameron |
| Pre-bootstrap dump validation | Passed |
| Post-bootstrap dump/key archive/manifest validation | Passed |
| Disposable probe cleanup | Passed |
| Reeba workspace/database preservation | Passed |

## Limitations and deferred operations

- The deployed TLS certificate is self-signed. Browsers must explicitly trust/bypass it until an internal-CA or otherwise trusted certificate is installed.
- HSTS is intentionally disabled while the certificate is self-signed.
- Nginx Proxy Manager 2.14.0 reported that a newer version was available. Proxy-manager upgrades were outside this sprint and were not attempted.
- Automated recurring backups and off-host backup replication remain deferred. The verified recovery set is currently local to Nora.
- Monitoring integration, image signing, SBOM policy, and deployment CI remain deferred.
- No old Nexus stack existed to delete. Unrelated system-Docker containers and `aether-*` volumes remain untouched.
- Production cleanup is not authorized by sprint completion. The Git bundle, release checkout, images, database, keys, certificate, backups, and rollback records remain retained.

## Practical code and operations map

1. `deployment/compose.production.yaml:1-107` — production service, network, volume, secret, and publication topology.
2. `deployment/frontend.conf.template:1-34` — same-origin API proxy and trusted edge handling.
3. `deployment/api.Dockerfile:1-16` — API build, runtime user, key path, and readiness health check.
4. `deployment/frontend.Dockerfile:1-16` — deterministic frontend build and unprivileged runtime.
5. `scripts/production.mjs:8-52` — validation, build, migration, start, stop, status, and destroy gates.
6. `scripts/production-operations.mjs` — project operation locks, secret containment, and migration/start ordering.
7. `backend/Nexus.Api/Program.cs:108-185` — trusted proxies, production migration policy, health, status, bootstrap, and closed registration.
8. `deployment/README.md` — lifecycle, secret, update, backup, and rollback operator contract.
9. `/srv/nexus/shared/rollback/` — host-specific pre-cutover and runtime records.
10. `/srv/nexus/shared/backups/postbootstrap-20261124T060922Z/` — verified post-bootstrap recovery set.
