# SMRTR implementation contract

Next.js App Router, React, TypeScript, Zod. Import shared types from `@/lib/contracts`.

## Ownership
- Lead/integrator: `src/lib/contracts.ts`, fixtures, `src/lib/session/**`, `src/app/page.tsx`, layout, package/config files, repository and dev server.
- Backend: `src/lib/server/**`, `src/app/api/generate/**`. POST JSON `{requestId,text}`. Return `{requestId,lesson}` parsed by `GenerationResponseSchema`. Errors `{error:string,code?:string}` with non-2xx status. Respect request abort. Real input-driven provider generation required; return explicit missing-key errors. Do not silently serve fixture. May add health route. Add dependencies through lead to avoid package conflicts.
- Simulation/assessment: `src/lib/simulation/**`, `src/components/activities/**`. Named exports `ActivityView` from `ActivityView.tsx` and `QuestionView` from `QuestionView.tsx`. Props `ActivityViewProps` / `QuestionViewProps`. Deterministic BFS trace; alphabetical neighbors, visited on enqueue. QuestionView calls `onAnswer(selectedOptionIds, evaluation)`. Scope activity CSS to new file(s), import from component.
- Presentation: `src/components/presentation/**`, `src/app/globals.css`. Named `StudyWorkspace(props:StudyWorkspaceProps)` export. Render activity and question components. Includes notes, typed map, selected concept, guided path, final practice, source support, revision-scoped review. Keep mobile and keyboard usable.

Do not edit another owner's files without coordination. Others are working concurrently: preserve their edits. Shared contract changes go through lead. Workers should commit only their owned files. Use own branches/worktrees after base exists and report commit SHA; lead integrates.

## Data
Source records preserve original material. Concepts/typed relations/path form semantic plan. Modules contain explanations, examples, activities and questions. Lesson IDs and revision scope attempts. General relationships may cycle; prerequisite order must be acyclic. ActivitySpec is `bfs | concept`; no arbitrary executable generated code. SourceIds connect support; generated examples are distinct from source excerpts. `sampleLesson` is visibly marked `mode:sample`. `failureFixture` exercises missing-provider UI.

## Commands
`npm install`, `npm run dev`, `npm run typecheck`, `npm run build`, `npm test`.

## Preview status
Initial scaffold uses a sample fixture. Generation route deliberately returns a 503 until backend implementation lands. Client cancels prior requests and ignores stale responses, retaining previous lesson on errors. Attempts preserve lesson revision.
