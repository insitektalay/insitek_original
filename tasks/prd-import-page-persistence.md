# Import Page Persistence – Product Requirements Document (PRD)

## 1. Introduction / Overview
Today, if a user navigates away from the Import page while a transcript import is running, the UI loses all state. When the user returns, it appears as if the job stopped, even though the backend continues processing. This feature ensures the Import page immediately reflects the **true status** of the most recent import (in-progress, completed, or failed) whenever a user revisits the page during the same browser session.

## 2. Goals
1. Persist import job visibility across internal page navigation within the SPA.
2. Reflect real-time progress updates (< 2 s lag) when the user returns to the Import page.
3. Display the final state (success or error) without manual refresh.

## 3. User Stories
* **As a user**, I want to return to the Import page and still see my running import so that I know it hasn't failed.
* **As an admin**, I want to see the status of all active imports without manually refreshing the page.

## 4. Functional Requirements
1. **Initial Sync** – On mounting the Import page, the front-end MUST query the backend `ImportJob` endpoint to obtain the latest job(s) for the current user session.
2. **WebSocket Re-Subscription** – The page MUST (re)subscribe to the `progress` WebSocket channel to receive live updates for any active job IDs.
3. **Progress Rendering** – For each tracked job, the UI MUST show:
   a. A banner with status colour (blue=in-progress, green=completed, red=errored).
   b. Percentage progress if the backend emits it.
4. **Multiple Imports** – While the backend may run multiple jobs, **phase 1** MUST show only the _most recent active_ import. (Future phases may list a queue.)
5. **Latency Budget** – Progress displayed to the user MUST be updated within 2 seconds of a backend state change.
6. **Resilience** – If the backend restarts or the WebSocket connection drops, the UI MUST automatically re-establish the connection and re-sync job status via Requirement 1.
7. **Session Scope** – Persistence is limited to navigation within the same browser tab; closing the tab/browser ends the tracking session.

## 5. Non-Goals (Out of Scope)
* Offline persistence or `localStorage`/IndexedDB caching.
* Import cancellation, pausing, or retry actions.
* Cross-device or multi-tab synchronisation.
* Dedicated "Imports Dashboard".

## 6. Design Considerations
* Reuse the existing Import panel layout.
* Status colours:
  * `blue-500` background for in-progress.
  * `green-500` for completed.
  * `red-500` for errored.
* Include a slim progress bar beneath the banner for visual feedback.
* Display a concise message: e.g., "Importing... 42%", "Import completed", "Import failed - click for details".

## 7. Technical Considerations
* Leverage the existing `useImport` hook; add logic to:
  * Fetch `GET /api/import-jobs?status=active` on mount.
  * Dispatch `subscribe(jobId)` to the WebSocket wrapper.
* Store active job metadata in React Context (`ImportContext`) so any nested components can read state without prop drilling.
* Fallback polling every 10 s if WebSocket is unavailable.
* Backend must expose `GET /api/import-jobs` returning `{id, state, progress}` for the current session/user.
* Ensure Prisma model `ImportJob.state` transitions are emitted over WebSocket.

## 8. Success Metrics
* ≥ 95 % of progress updates appear in the UI within 2 s.
* ≥ 99 % of completed imports display final status within 5 s of job completion.
* Reduce user-reported "import vanished" support tickets to zero.

## 9. Open Questions
1. Do we need role-based visibility (e.g., admins see all jobs, regular users see only their own)?
2. Should we surface historical completed jobs in a collapsible section for quick re-download of transcripts?
3. How should we surface backend error messages (toast vs. inline)? 