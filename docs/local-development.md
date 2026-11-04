# Local development guardrails

- Run .NET through `node scripts/dotnet.mjs`: it puts CLI home, NuGet packages, temporary files and caches inside this repository. Do not replace this with a global SDK install during local work.
- Keep `.local`, downloaded tools, browsers, bin/obj, test keys and reports out of Git. Check `git ls-files --others --exclude-standard` before staging new backend files.
- Preserve Vite's private-directory deny list. `.local/runtime.json` would otherwise be accessible through Vite's generic file serving, even though it is Git-ignored. The `server-boundaries` browser test verifies direct and `/@fs/` paths.
- Never run setup tests against the real `nexus` database. Backend fixtures use `nexus_test_<UUID>`; browser integration uses `nexus_ui_test_<UUID>`, API5081 and UI5176. Those suites remove only databases they created.
- `/` is the real workspace; `/demo` is the original browser-local prototype. Do not silently fall back to demo data when the API is unavailable.
- API cookies and CSRF tokens are not localStorage values. Refresh CSRF around sign-in/setup transitions. POST message retries must retain their request UUID until the outcome is known.
- Run `npm run test:live` after either API or frontend changes; unit tests and request interception alone do not prove the actual cookie, proxy, database and browser path.
- PostgreSQL image layers live in Docker storage with user permission. Persistent database files are bind-mounted from `.local/postgres`; confirm the mount rather than assuming data is local.
- The real workspace must remain unbootstrapped at handoff: the user chooses their own account credentials. Screenshots and tests use isolated fixture accounts, not a default account.
