# SMRTR

Turn study notes into visual lessons, interactive explanations, and practice linked to the ideas you want to review.

A hackathon prototype built with Next.js, React, TypeScript, Zod, and React Flow.

## Run locally

Requires Node.js 20.9 or later.

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). The app starts with a **labeled sample lesson**. The preferred **Use my chat** workflow needs no provider API key.

1. Enter notes or a topic, choose your current confidence, and select **Prepare chat request**. Optional topic rows can override that overall level.
2. Have a compatible local MCP chat read and complete the request, or copy its instructions into your chat and paste the returned lesson JSON into the website.
3. The server validates the lesson and computes BFS answer keys. The waiting page loads the result automatically.

The chat authors the content. The website does not automatically access a chat subscription. This coding session can use the local CLI bridge; it does not need newly attached MCP tools. See [the MCP setup and manual bridge guide](./mcp/README.md) for the exact flow and client configuration.

A completed local lesson can be reopened at `http://localhost:3000/?request=LOCAL_REQUEST_ID`. Requests and lesson content are stored in ignored `.smrtr/requests/`; they are not published to GitHub. The app and MCP process must use the same absolute `SMRTR_BRIDGE_DIR` if launched from different working directories. Pending requests expire after 24 hours.

An optional direct **Provider API** mode uses server-side `OPENAI_API_KEY` from `.env.local` and configurable `SMRTR_MODEL`. Copy `.env.example` only if using that mode. It has been tested with mock provider responses; no live provider key was configured for this milestone.

If the default npm cache has a permissions problem:

```sh
npm ci --cache /tmp/smrtr-npm-cache
```

## Learning flow

- Explore a full-screen visual teaching canvas with blue controls and a dismissible details panel. The separate Connections view shows concept relationships.
- Follow a coherent main route: problem, intuitive layers, mechanism questions, reasoning and limits, then transfer. Newly authored lessons keep one continuing scenario through the main explanation.
- Open linked supporting pages, such as Queue → FIFO, then return to the same page, scroll position and simulation state. Optional detours do not add steps to the main route.
- Keep three structures distinct: the teaching sequence, the page hierarchy and the concept relationship graph. Breadcrumbs describe containment; Connections explains how ideas relate.
- Choose among four self-reported confidence levels before generation. The captured profile affects both the suggested route and the authoring instructions/content. Topic labels are entered manually, retain stable IDs, and can use the overall level. A temporary **Start more simply** route leaves that captured profile intact.
- Read explanations and generated examples separately from original source material.
- Step through a computed BFS graph, change its inputs, predict the next expansion, and inspect paths.
- Check concept questions and final practice, then follow specific review links.

The BFS teaching canvas turns actual graph data into delivery landmarks, roads, waiting parcels, discovery marks and distance layers. The novice opening presents the delivery problem first; later pages reveal the queue and discovery mechanisms. A transfer example is explicitly labeled and can use a different graph. Other topics retain their own generated guided steps without being mislabeled as algorithm simulations.

New chat requests require an authored page hierarchy, meaningful inline links, explicit transitions and confidence routes. Saved older lessons open as **Adapted saved lesson** using a compatibility hierarchy; they are not presented as newly authored designs. Confidence is self-report, and practice does not claim measured mastery.

The BFS engine uses fixed, tested code with alphabetical neighbor order and discovery on enqueue. It finds paths with the fewest edges in unweighted graphs. Attempts keep the lesson ID and revision; a missed check suggests review and does not assert mastery.

Source records, semantic lessons, activities, simulation state, evaluation and presentation have separate contracts. Prerequisite ordering is checked separately from the general concept graph. Schema validation checks structure; accurate teaching still depends on the authoring chat. Generated executable code is never run.

## Development

```sh
npm run typecheck
npm test
npm run test:mcp
npm run build
```

The optional provider pipeline normalizes notes, validates a compact plan, generates modules independently with at most three calls in flight, computes graph answers, and progressively delivers complete validated modules. Cancellation, stale revisions, and rejected imports cannot overwrite newer work. Browser storage preserves completed lessons and attempts.

See [COLLABORATION.md](./COLLABORATION.md) for ownership/shared exports and [PROGRESS.md](./PROGRESS.md) for verified milestones.
