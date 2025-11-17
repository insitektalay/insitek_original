## Relevant Files

- `server.mjs` – Existing Express API + WebSocket server; extend with /api/import-jobs route and progress broadcast helpers.
- `api/import-jobs.js` – (NEW) Handler that returns current ImportJob(s) for the active user/session.
- `prisma/schema.prisma` – Ensure `ImportJob` model has `state` & `progress` fields used by the endpoint.
- `src/v2/hooks/useImport.js` – Extend hook with initial sync, WebSocket (re)subscription, context dispatch.
- `src/v2/contexts/ImportContext.jsx` – (NEW) React Context to store active import job(s) globally.
- `src/v2/utils/ws.js` – (NEW) Thin wrapper for resilient WebSocket connection/reconnect logic.
- `src/v2/components/ui/ImportPanel.jsx` – Render persistent banner & progress using ImportContext.
- `src/v2/hooks/__tests__/useImport.test.js` – Unit tests for hook logic & API interactions.
- `src/v2/contexts/__tests__/ImportContext.test.jsx` – Tests for provider/state updates.
- `src/v2/components/ui/__tests__/ImportPanel.test.jsx` – Component tests for banner rendering.

### Notes

- Place test files next to the code they cover (e.g.
  `ImportPanel.jsx` ↔ `ImportPanel.test.jsx`).
- Use Jest + React Testing Library for unit & component tests.
- Run all tests with `npx jest`. Run a single test with `npx jest path/to/file.test.js`.

## Tasks

- [ ] 1.0 Backend: ImportJob status endpoint and WebSocket events
  - [x] 1.1 Add `GET /api/import-jobs` route in **server.mjs** (or new `api/import-jobs.js`) returning `{ id, state, progress }` for the current session/user.
  - [x] 1.2 Ensure the route can filter by `?status=active` (states: `PENDING | RUNNING`).
  - [x] 1.3 When an `ImportJob.state` changes (e.g., via shell progress lines), broadcast an updated `{ type:"progress", importId, stage, progress }` message over the existing WebSocket channel.
  - [x] 1.4 Add basic validation & 500-error handling to the endpoint.
  - [x] 1.5 Unit-test the route logic with Jest + Supertest.

- [ ] 2.0 Frontend: Extend `useImport` hook for initial sync & re-subscribe
  - [x] 2.1 On mount, call `GET /api/import-jobs?status=active` and save the latest job in state.
  - [x] 2.2 Connect to WebSocket (`ws://…`) and subscribe to the job's `importId`.
  - [x] 2.3 On `progress` messages, update local state (`{state, progress, stage}`) via ImportContext.
  - [x] 2.4 Expose hook API: `{ importing, activeJob, importYoutube, refreshJobs }`.
  - [x] 2.5 Add cleanup to close the socket on unmount.
  - [x] 2.6 Write unit tests mocking fetch & WebSocket to assert state transitions.

- [ ] 3.0 Frontend: Introduce `ImportContext` for global job state
  - [x] 3.1 Create `ImportContext.jsx` with `Provider` + `useImportContext` hook.
  - [x] 3.2 Store `activeJob` and helper actions (`setActiveJob`, `clearJob`).
  - [x] 3.3 Wrap the V2 app root (`LayoutV2` or `App.jsx`) with the provider.
  - [x] 3.4 Ensure context updates trigger re-render across any panel.
  - [x] 3.5 Add unit tests for provider & consumer behavior.

- [ ] 4.0 UI: Update Import panel to render persistent status banner
  - [x] 4.1 Use `useImportContext` to read `activeJob` when the panel mounts.
  - [x] 4.2 If `activeJob` exists: show coloured banner (`blue` running / `green` done / `red` errored) with progress bar.
  - [x] 4.3 If `activeJob` === done/error: show final message immediately.
  - [x] 4.4 Hide banner when there is no active job.
  - [x] 4.5 Component tests: given mocked context values, expect correct banner state.

- [ ] 5.0 Resilience: Fallback polling & reconnection handling
  - [x] 5.1 In `ws.js`, detect `onclose` / `onerror` and attempt exponential back-off reconnect.
  - [x] 5.2 While socket is down, poll `/api/import-jobs?status=active` every 10 s.
  - [x] 5.3 After reconnect, cancel polling and resume socket-driven updates.
  - [x] 5.4 Integration test simulating WS drop to verify polling kicks in. 