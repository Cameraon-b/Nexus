# TDD execution record

Implementation proceeded through observed failing HTTP integration behavior, production changes, then passing reruns against real PostgreSQL. These are execution outcomes, not invented examples.

| Slice | Observed RED | Observed GREEN |
|---|---|---|
| Protected reads | 3 cases failed: endpoints returned 404 | 3 passed with 401 guards |
| First administrator | Bootstrap status returned 404 instead of 200 | Bootstrap/status/me passed after EF identity migration and stored sessions |
| One-time setup | Concurrent setup test failed: both requests succeeded | One success, one conflict, later setup conflict, one stored account |
| CSRF | Missing and forged CSRF setup requests succeeded | Both rejected with safe 400 and no account |
| Setup validation | 5 invalid-input cases failed | All rejected without account creation |
| Login continuity | Login endpoint absent | Login/session replay through a fresh app host passed; DB contains hashes, not raw credentials/tokens |
| Logout | Logout endpoint absent | Revoked token rejected by another host |
| Workspace | Authenticated Home returned 401 | Main, participant, membership and empty messages passed |
| Persisted messaging | POST endpoint absent | Authenticated post, trimming, server authorship, fresh-host reads and Home history passed |
| Message validation | 5 invalid body/missing-ID cases failed | Safe 400 with no message persisted |
| Message retries | Concurrent identical requests produced different IDs | Identical requests return same stored message; changed body returns 409 |
| Rate limits | 11th auth request was not 429 (2 cases) | Both bootstrap/login return 429 and Retry-After |
| Malformed JSON | Development response was not safe ProblemDetails | Safe 400 response |
| Unexpected DB errors | Dropped test table exposed development exception response | Generic 500 ProblemDetails |
| Production malformed JSON | Production returned bare 400 rather than ProblemDetails | Explicit route bad-request behavior gives safe 400 in both environments |

Additional acceptance coverage checks production cookie flags, session expiry, unsafe endpoint CSRF, anonymous posts, bad credentials, and accepted 1/5000-character boundaries. The generated empty example test was removed.

Final Release execution: **37 passed, 0 failed, 0 skipped**, zero build warnings/errors. `TestResults/integration.trx` contains the actual machine-readable run. `dotnet format --verify-no-changes` passed, and EF reported no model changes pending since the last migration.

Only uniquely named disposable `nexus_test_*` databases were used by backend integration tests. The actual `nexus` database was not bootstrapped or reset.
