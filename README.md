# SMRTR

A hackathon prototype that turns study notes into a connected concept map, interactive learning activities, and practice linked back to concepts.

## Run locally

```sh
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. The first preview is a **labeled sample lesson**; input-driven generation is being implemented behind `/api/generate`. Provider credentials remain server-side and are never committed. See [COLLABORATION.md](./COLLABORATION.md) for module ownership and shared contracts.

## Milestones

- Scaffold: typed lesson/source/activity/question contracts; sample and error fixtures; responsive map preview; cancellation-safe client session.
