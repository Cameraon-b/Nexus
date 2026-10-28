# Nexus — conversation-first prototype

An interactive React + TypeScript prototype based on the supplied **Nexus Design Reset Complete Updated** and **Condensed** packets. This iteration reuses and repairs the existing frontend rather than discarding it.

## Open

The development instance uses **http://127.0.0.1:5174/**.

- Double-click **Start Nexus.cmd** to start it and open the browser.
- Or run `npm start` from `C:\Nexus`, then open the address above.
- If that port is already occupied by this prototype, just open the existing instance.
- Stop a server you started with Ctrl+C in its terminal.
- `npm run dev` is the equivalent development command.

Node.js and project dependencies are already present in this environment. The server binds only to loopback. This is not a LAN deployment. Port 5173 was occupied and was left untouched.

## Try this first

1. Post in **Common room**. Enter sends; Shift+Enter adds a line.
2. Select **Start a topic**, give it a title and opening message, then continue the discussion.
3. Select a participant to open a direct conversation.
4. Select **Preview agent draft** in Main, a topic, or an agent DM. The text is explicitly simulated, not AI-generated.
5. In **Review queue**, approve, edit and approve, or reject. Edited releases retain agent authorship. Resolved drafts are available in **Review history**, including original text after edits.
6. Try **Agent policy** and **Participants** in governance. Limited agents still need review; blocked/suspended agents cannot publish. Approval rechecks author access.
7. Return to topics/DMs to clear unread indicators. Reload to check browser-local persistence.

Search finds conversations by title. Reset asks for confirmation before replacing this browser's demo data.

## What this is—and is not

Implemented: Main, public topics, human-to-participant DMs, visible participant types and sample availability, draft approval/edit/reject, review history, moderation, per-agent outbound approval toggles, local audit history, unread indicators, conversation search, responsive layout, isolated unsent composer text per conversation.

**This is a single-admin UI prototype, not the complete MVP.** All seeded people, availability, services, and conversations are sample content. There are no real agent connectors, external messages, authentication, tokens, shared server database, or realtime sync. There is no command execution. Admin authority is modeled in domain functions, but client-side data is not a security boundary.

Data is saved in localStorage under `nexus-prototype-state-v1`, scoped to this browser and origin. Other browsers/ports do not share it. Clearing browser storage removes it. Unsent composer text stays separate per conversation during the session but is not persisted. Local audit records are not tamper-proof. Do not enter sensitive information. Invalid saved top-level data falls back to the sample workspace.

Domain helpers support agent-pair DMs; this iteration does not connect real agent-to-agent messaging. Human account creation/login, integration management, per-action permission policies, withdrawal/cancellation, conversation archiving, and Nora deployment are not implemented.

## Approved future stack remains unchanged

The source docs specify **C# / ASP.NET Core Web API / EF Core / PostgreSQL**, REST-first, selective SignalR, React + TypeScript, and Docker Compose deployment on Nora. This prototype does not replace that architecture with a browser-only production design.

Recommended next vertical slice: introduce the approved API/database with admin bootstrap, a persistent Main conversation, and server-authorized message posting; then replace the local-state adapter. Real integration tokens and governed connector inbox/draft submission follow that foundation.

## Verification

```text
npm test          # domain tests
npm run test:ui   # Chromium browser flows
npm run build     # TypeScript check + production bundle
```

Verified in this workspace:
- 19 domain tests passed.
- 11 browser-flow tests passed.
- TypeScript and production build passed.
- npm audit reported zero known vulnerabilities in the installed dependency tree.
- Desktop and mobile screenshots inspected; artifacts are in `artifacts/`.

## Project layout

- `src/App.tsx`: prototype UI and sample workspace state
- `src/domain.ts`: immutable domain operations and governance/read rules
- `src/domain.test.ts`: domain regression tests
- `src/styles.css`, `src/refinements.css`: retained base styles and readability/responsive refinements
- `tests/workspace.spec.ts`: browser flows
- `scripts/`: launcher, browser-test wrapper, screenshot capture
- `docs/`: text extracted from the supplied PDFs and implementation notes
- `dist/`: verified production build (serve over HTTP; not a double-click HTML bundle)
- `.tools/`, `.browsers/`, `.cache/`: project-local document tooling, Chromium, and caches

All intentional source, dependency, cache, and artifact writes for this work were directed inside `C:\Nexus`. Supplied PDFs were read from their attachment paths without modification. No global configuration was changed.
