# Nexus backend slice

ASP.NET Core / .NET 10 with PostgreSQL persistence. All projects target `net10.0`.

## Projects

- `Nexus.Api`: HTTP composition, CSRF, cookies, rate limiting, safe problem responses.
- `Nexus.Application`: use-case ports and transport-independent DTO contracts.
- `Nexus.Domain`: identity/message rules and account, participant, conversation, membership, message and session models.
- `Nexus.Infrastructure`: EF Core/Npgsql mappings, migrations, transactional implementations, Identity password hashing and opaque sessions.
- `Nexus.Tests`: real PostgreSQL integration tests through fresh ASP.NET hosts; no in-memory database provider.

## Start

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

Do not paste the connection string into committed source or logs. The app reads environment/configuration, not runtime.json itself. The parent launcher supplies the connection string. Data-protection paths must be absolute; the app defaults to `C:/Nexus/.local/keys`. Development HTTP is only for local loopback. Outside Development, use HTTPS: both cookies become Secure.

Startup applies checked-in EF migrations with `MigrateAsync`, never `EnsureCreated`. No application rows or credentials are seeded. A clean database stays unbootstrapped until a person supplies credentials. Main, its first membership, participant, admin account and initial session are created together during bootstrap. Migration history is the only initial database data.

## HTTP contract

All JSON uses camelCase. Same-origin frontend proxy only; no permissive CORS policy.

| Method | Path | Request | Success |
|---|---|---|---|
| GET | `/api/auth/status` | — | `{requiresBootstrap:boolean}` |
| GET | `/api/auth/csrf` | — | `{token:string}` plus `nexus.csrf` cookie |
| POST | `/api/auth/bootstrap` | `{email,displayName,password}` | User DTO and `nexus.session` cookie |
| POST | `/api/auth/login` | `{email,password}` | User DTO and `nexus.session` cookie |
| GET | `/api/auth/me` | Session cookie | User DTO |
| POST | `/api/auth/logout` | Session cookie | 204, stored session revoked and cookie deleted |
| GET | `/api/workspace/home` | Session cookie | Workspace Home DTO |
| GET | `/api/conversations/main/messages` | Session cookie | Message DTO array, chronological order |
| POST | `/api/conversations/main/messages` | `{body,clientRequestId:UUID}` and session cookie | Message DTO, HTTP 200 (also on identical retry) |

Every unsafe request, including bootstrap/login/logout, requires the matching `nexus.csrf` cookie **and** `X-CSRF-TOKEN` request header from `/api/auth/csrf`. Fetch CSRF before bootstrap/login and after identity transitions. Missing/invalid CSRF is 400. Authentication is checked on every protected request against PostgreSQL. Anonymous access with valid CSRF is 401.

User DTO:

```text
{id:UUID,email:string,displayName:string,participantId:UUID,isAdmin:boolean}
```

Workspace Home DTO:

```text
{
  participants:[{id:UUID,name:string,kind:'human',state:'active',availability:'available',isAdmin:boolean}],
  conversation:{id:'main',title:'The Common Room',kind:'main',state:'active',participantIds:UUID[],description:string},
  messages:MessageDto[]
}
```

Message DTO:

```text
{id:UUID,conversationId:'main',authorId:UUID,body:string,state:'delivered',createdAt:ISO8601}
```

The author always comes from the resolved session's participant, never client input. Unknown fields such as client-supplied authorId are ignored. Body is trimmed and must contain 1–5000 UTF-16 code units. clientRequestId must be a nonzero UUID. Idempotency is per author and request ID, with a database unique index and transaction-level advisory lock. Retrying the same normalized body returns the original message; a different normalized body returns 409.

Bootstrap validates email, display name (1–100 trimmed characters), and password (12–128 characters). Email is trimmed/lowercased. A PostgreSQL transaction/advisory lock makes concurrent setup attempts atomic; only one succeeds, all subsequent valid setup requests return 409. Passwords use ASP.NET Identity V3 hashing configured for 210,000 iterations. Session tokens are random 256-bit opaque values; only SHA-256 hashes are stored, with fixed seven-day expiry and revocation timestamp. Cookies are HttpOnly, SameSite=Strict, Path=/, Secure outside Development.

Bootstrap/login share a per-remote-IP fixed-window limit of 10 requests/minute per app host. Limit responses are 429 ProblemDetails with `Retry-After: 60`. Validation/CSRF are safe 400 ProblemDetails; wrong credentials are a generic 401 ProblemDetails; conflicts are 409 ProblemDetails. Unexpected failures return generic 500 ProblemDetails; server logs retain diagnostic details without enabled sensitive-data logging.

## Verify

PostgreSQL must be running and `.local/runtime.json` must contain `adminConnectionString`. Tests create independently named `nexus_test_<UUID>` databases using that administrative connection and drop only their own databases on completion. Test data-protection keys remain under `backend/.test-keys/` (gitignored), not the app key directory. Tests never reset or bootstrap the real `nexus` database.

```text
node scripts/dotnet.mjs build backend/Nexus.slnx --configuration Release
node scripts/dotnet.mjs test backend/Nexus.Tests --configuration Release --logger "trx;LogFileName=integration.trx" --results-directory C:/Nexus/backend/TestResults
node scripts/dotnet.mjs format backend/Nexus.slnx --no-restore --verify-no-changes
```

Verified: Release build has zero warnings/errors; 37 PostgreSQL integration cases pass, none skipped. Machine-readable evidence: `backend/TestResults/integration.trx`. EF model matches the checked-in migrations.

## Scope and caveats

This is the first-admin/Main-conversation slice, not the full approved MVP. No signup/invitations, password reset, MFA, topical/direct conversations, agents, moderation, realtime delivery or pagination is implemented. Reads currently return all messages. No default account exists.

Local-prototype migration-at-startup requires schema privileges. Production rollout should separately apply reviewed migrations and restrict app DB privileges. Rate counters are process-local and reset on restart; a shared-IP reverse proxy shares the limit unless deliberately configured otherwise. There is no session-row cleanup job or sliding renewal. Protect runtime credentials and data-protection key files with filesystem permissions; key files are not explicitly encrypted at rest. Use TLS and an appropriately secured reverse proxy outside local development.
