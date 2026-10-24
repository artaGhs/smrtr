# SMRTR

Turn your study notes into a connected concept map, interactive explanations, and practice that links back to the ideas you want to review.

A 24-hour hackathon prototype built with Next.js, React, TypeScript, Zod, and React Flow.

## Run locally

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open [localhost:3000](http://localhost:3000). The first visit displays a **labeled sample lesson** so the interface is immediately explorable. To generate a new lesson from your notes, set `OPENAI_API_KEY` in `.env.local`. Provider keys are server-side only; environment files are ignored by Git. `SMRTR_MODEL` selects the provider model.

If your default npm cache has a permissions problem, use a task-specific cache:

```sh
npm ci --cache /tmp/smrtr-npm-cache
```

## Learning flow

1. Paste a topic, notes, or lecture text.
2. Explore concepts and typed relationships in a pannable map.
3. Follow the guided path or choose a concept directly.
4. Step through an activity, predict a result, and check your understanding.
5. Practice across concepts and follow review links back to the lesson.

Source records preserve submitted material separately from generated explanations and examples. General concept relationships may cycle; prerequisite ordering is checked separately. Attempts keep the lesson ID and revision, so a result from an older lesson cannot imply progress in a new one.

The BFS engine executes fixed, tested code. It uses alphabetical neighbor order and marks nodes discovered when they enter the queue. BFS minimizes the number of edges in an unweighted graph; it does not minimize arbitrary weighted costs.

## Development

```sh
npm run typecheck
npm test
npm run build
```

The client accepts ordinary JSON or complete, validated NDJSON events. New requests cancel earlier work; stale responses cannot overwrite newer notes. Browser storage preserves completed lessons and attempts. Provider errors remain visible and never silently substitute a sample lesson.

See [COLLABORATION.md](./COLLABORATION.md) for module boundaries and shared exports. Current implementation checkpoints are in [PROGRESS.md](./PROGRESS.md).
