# Progressive canvas generation

`/canvas-lab` now mounts `ProgressiveCanvasWorkspace`, which supplies validated `CanvasSource` revisions and compact controls to `EditableCanvas`. The editor owns learner overlays, source reconciliation, layout, camera, folds and activity state. Every projected snapshot passes `parseCanvasSource`. Source IDs and node IDs remain stable through a run, including the initial pending input echo. Each new run has a distinct recoverable document identity.

## Working paths

- **Simulated generation:** the default New topic choice; curated Sorting and Photosynthesis fixtures travel through the actual NDJSON endpoint, lifecycle reducer, semantic validation and editor projection. Explicitly labeled. No provider creation or network call occurs. One failed branch can be simulated. It is a demonstration of progressive delivery, not live model authoring.
- **Compact provider generation:** `POST /api/canvas/generate` with `{requestId,text,mode:"provider"}` emits a small outline followed by independently validated units, then a checked final manifest. Up to three unit calls run concurrently. Each stage allows one content repair and two bounded transient retries. Partial failures retain successful siblings. Server key requirements and sanitization come from the existing provider adapter. No live-provider calls were made during implementation.
- **Existing provider generation:** `legacy.ts` adapts the unchanged `/api/generate` plan/module/complete consumer. It retains that endpoint's original full-plan delay. No existing generation contract was replaced.
- **Connected chat:** `POST /api/canvas/chat` creates a request in the existing local store. `GET /api/canvas/chat/[id]?after=N` polls its journal. The existing MCP `get_lesson_request` exports staged schemas/instructions for this request type; new `submit_canvas_stage` writes an outline, unit, scoped failure or final manifest. The same operation is available via POST to the polling URL. Existing complete-lesson requests still use `submit_lesson`. The browser displays real submitted stages; it does not access a chat subscription automatically or replay a finished import as progress.

Stages carry immutable request/run/source identity and a consecutive `seq`. Exact retries are idempotent; conflicting duplicate sequences, gaps, stale identities, invalid references, writes after cancellation, premature completion and writes after terminal completion are rejected. Chat writes share the existing filesystem lock and atomic persistence. Staged content has a bounded journal. Completed chat canvases also assemble a validated ordinary Lesson for compatibility.

`state.ts` is server-safe and has no editor runtime dependencies. `projection.ts` imports the editor source parser. `reducer.ts` re-exports both for integration callers. This separation is necessary because the stdio MCP server may start outside the application working directory, where Next path aliases are unavailable.

## Interaction

Pause updates buffers the newest validated source, without pausing generation; Show updates applies it. Stop aborts the active fetch/provider orchestration or cancels the chat request, retaining a stopped draft. New requests invalidate callbacks from older requests. Incoming sources are coalesced over 80 ms. Announcements describe real availability, not time percentages. The editor's reduced-motion, keyboard and camera policies remain authoritative.

Sorting's curated demonstration appears inside its existing method node once that unit arrives. Generated topics can use conceptual steps or validated canonical BFS inputs; they never inherit the sorting renderer. Other conceptual activities are foldable children and open in the existing activity renderer. Support details use a nested canvas with a stable entry ID.

## Limits and integration checks

- V2 is intentionally a compact canvas contract. It validates its authored containment, conceptual relationships, teaching sequence, sources, modules and canonical activity, and final ordinary Lesson invariants. It does not generate the older endpoint's rich `learningDesign` confidence routes/pages. The older endpoint and its full design validation remain unchanged.
- Provider HTTP reconnect does not replay a persisted provider journal; a broken stream keeps the last good draft and offers a new request. Chat journals can be polled by cursor while open, but reloading the wrapper does not automatically reconnect to an outstanding chat request.
- Retries are bounded stage retries. The UI's new request action starts a separate saved map; it does not yet regenerate only failed branches.
- Source data preserves edits through the editor boundary. Browser verification should include initial pending-root → outline anchoring, measured layout during inline simulation arrival, pause/reveal, phone toolbar wrapping, nested return and editing while units arrive. The wrapper never calls a camera method. Camera/origin stability and animation choreography are editor responsibilities.

## Verification

Focused tests cover both fixtures, canonical source projection, split UTF-8/lines, duplicate/stale/gapped events, premature/late completion, partial branches, cancellation, blocked provider modules after an early outline, bounded retries, timeout, v1 adaptation, staged store locking/revision/cancellation rules, and a full stdio MCP staged workflow. Parent integration tests exercise edit/placement/fold/camera preservation and undo with arriving units.

A smoke check against the existing development server on port 3001 received HTTP 200 NDJSON: started at about 1.25 s (including route compilation), outline at 2.01 s, units at 2.82/4.08/5.28 s, and complete at 5.28 s. This used the simulated Photosynthesis fixture and establishes actual incremental HTTP arrival, not provider latency or a user study. `/canvas-lab` returned HTTP 200. No extra development server, dependency installation, paid call or commit was made.
