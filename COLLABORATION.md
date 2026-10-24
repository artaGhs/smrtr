# SMRTR implementation contract

Next.js App Router, React, TypeScript, Zod. Import shared types from `@/lib/contracts`.

## Ownership
- Lead/integrator: `src/lib/contracts.ts`, `src/lib/teaching/**`, `src/lib/learning/**`, fixtures, `src/lib/session/**`, `src/app/page.tsx`, layout, package/config files, repository and dev server.
- Backend: `src/lib/server/**`, `src/app/api/**`. Provider POST JSON `{requestId,text,learnerProfile}`. Return `{requestId,lesson}` parsed by `GenerationResponseSchema`. Errors `{error:string,code?:string}` with non-2xx status. Respect request abort. Real input-driven provider generation required; return explicit missing-key errors. Do not silently serve fixture. Add dependencies through lead to avoid package conflicts.
- Simulation/assessment: `src/lib/simulation/**`, `src/components/activities/**`, `src/components/canvas/**`. Named exports `ActivityView` from `ActivityView.tsx` and `QuestionView` from `QuestionView.tsx`. Props `ActivityViewProps` / `QuestionViewProps`. Deterministic BFS trace; alphabetical neighbors, visited on enqueue. QuestionView calls `onAnswer(selectedOptionIds, evaluation)`. Scope activity CSS to new file(s), import from component.
- Presentation: `src/components/presentation/**`, `src/app/globals.css`. Named `StudyWorkspace(props:StudyWorkspaceProps)` export. Render activity and question components. Owns the full-screen canvas shell, notes dialog, dismissible details, secondary relationship map, final practice, sources and review links. The visual scene implementation is a separate canvas module. Keep mobile and keyboard usable.

Do not edit another owner's files without coordination. Others are working concurrently: preserve their edits. Shared contract changes go through lead. Workers should commit only their owned files. Use own branches/worktrees after base exists and report commit SHA; lead integrates.

## Data
Source records preserve original material. Concepts/typed relations/path form semantic plan. Modules contain explanations, examples, activities and questions. Lesson IDs and revision scope attempts. General relationships may cycle; prerequisite order must be acyclic. ActivitySpec is `bfs | concept`; no arbitrary executable generated code. SourceIds connect support; generated examples are distinct from source excerpts. `sampleLesson` is visibly marked `mode:sample`. `failureFixture` exercises missing-provider UI.

## Commands
`npm install`, `npm run dev`, `npm run typecheck`, `npm run build`, `npm test`.

## Preview status
The preferred keyless chat/MCP/JSON-import flow and optional provider API are implemented. New sessions start with empty notes and a simple entry dialog; the sample is explicitly labeled. Client cancels prior requests and ignores stale responses, retaining previous lesson on errors. Attempts preserve lesson revision.

## Progressive transport

Client sends `Accept: application/x-ndjson, application/json`; ordinary JSON success remains supported. NDJSON events conform to `GenerationEventSchema`: `plan` contains a complete validated Lesson with modules optionally empty; `module` contains one complete LessonModule; `complete` contains the final Lesson; `error` contains a human-readable error. All events include the original requestId. The client buffers incomplete transport chunks. Canceled or failed partial lessons revert to the last completed lesson and are never saved as completed sessions.

## Visual teaching and learning order

`Lesson.teachingPlan` is optional for saved-lesson compatibility and required on newly generated provider plans. It contains an accessible opening question, a big-picture explanation and a sequence of concept IDs with teaching approaches/purposes. It is deliberately independent of the prerequisite path and relationship graph. `getTeachingSequence` supplies a compatible order for old lessons.

`LearningCanvas(LearningCanvasProps)` renders the visual scenes, with one scene per teaching step. Presentation owns the outer navigation and dismissible inspector. The concrete rich visual family currently covers BFS: illustrated delivery landmarks and roads, a physical FIFO parcel queue, discovery marks and distance layers, all computed from activity inputs. Other topics use their actual guided explanation steps without claiming a simulation. Curated verified further-learning resources live outside source records and generated lesson prose.

## Page hierarchy and learner profile

`Lesson.learningDesign` defines one overview root, acyclic page containment, inline page links, an explicit main sequence with transition reasons, confidence routes and a canonical scenario/activity. Inline links and semantic relations may cycle independently of containment. Core/support pages share the canonical graph; explicitly labeled transfer pages may bind a different activity. New authoring requests require this design; `normalizeLearningDesign` marks compatible older lessons as legacy.

`LearnerProfile` captures one of four self-report levels plus optional manually entered stable topic IDs. A null topic level inherits the overall level. Each request/export freezes its profile, and the completed lesson uses that snapshot; later draft edits cannot change an existing lesson's route. The optional provider pipeline receives the profile and page targets when writing prose.

Root-owned `useLearningNavigation` supplies presentation's `LearningNavigationProps`: current page, route, breadcrumbs, exact history and shared simulation snapshots. Back restores page, main-route context, scroll, scene, target and simulation settings. Supporting detours do not count as main-route steps. A temporary simpler route is part of navigation history, not a change to the frozen confidence profile.

Canvas and `ActivityView` accept controlled `SimulationState` keyed by activity concept ID. Presentation supplies page scene, page kind and activity binding; the canvas progressively reveals mechanisms and preserves the canonical trace. Local state remains a compatibility fallback for callers without controlled snapshots.
