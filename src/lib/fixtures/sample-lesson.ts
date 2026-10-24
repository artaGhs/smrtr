import { LessonSchema } from "../contracts";
export const SAMPLE_INPUT =
  "Explore breadth-first search (BFS): graphs contain nodes and edges; a FIFO queue explores in layers. Mark nodes visited when enqueuing to avoid duplicates. BFS finds paths with the fewest edges in unweighted graphs. Directed example: S→A, S→B, A→C, B→T, C→T; visit neighbors alphabetically.";
const titles = [
  "Graphs & connections",
  "The FIFO queue",
  "Breadth-first search",
  "Visited nodes",
  "Shortest paths",
];
const summaries = [
  "Model a world as nodes and edges.",
  "First in, first out keeps exploration fair.",
  "Explore one complete layer at a time.",
  "Remember discoveries to avoid duplicate work.",
  "Find the fewest edges in an unweighted graph.",
];
const ids = ["graphs", "queue", "bfs", "visited", "paths"];
export const sampleLesson = LessonSchema.parse({
  id: "sample-bfs",
  revision: "sample-v1",
  title: "Think in connections.",
  summary:
    "From a simple graph to a shortest path. Build your intuition, one connection at a time.",
  mode: "sample",
  sources: [
    { id: "source-1", title: "Sample study notes", text: SAMPLE_INPUT },
  ],
  concepts: ids.map((id, i) => ({
    id,
    title: titles[i],
    summary: summaries[i],
    objective: summaries[i],
    sourceIds: ["source-1"],
  })),
  relations: [
    { id: "r1", source: "graphs", target: "bfs", type: "prerequisite" },
    { id: "r2", source: "queue", target: "bfs", type: "prerequisite" },
    { id: "r3", source: "bfs", target: "visited", type: "related" },
    { id: "r4", source: "bfs", target: "paths", type: "prerequisite" },
  ],
  path: ids,
  modules: ids.map((id, i) => ({
    id: `module-${id}`,
    conceptId: id,
    explanation: [
      "A graph is a collection of nodes with edges that describe their connections. Directed edges have a direction: S → A does not imply A → S.",
      "A queue removes items in the same order they arrive. In BFS, newly discovered nodes join the back, while the next node to expand comes from the front.",
      "BFS starts with a node in a queue. Repeatedly remove the front node, then enqueue its undiscovered neighbors. This creates layers ordered by distance from the start.",
      "Mark each node visited as soon as you enqueue it. That prevents two different parents from adding the same node to the queue.",
      "In an unweighted graph, BFS discovers each node by a path with the fewest edges. This does not minimize arbitrary edge weights.",
    ][i],
    example:
      "Directed sample: S → A, S → B, A → C, B → T, C → T. Neighbors are visited alphabetically.",
    sourceIds: ["source-1"],
    activity:
      id === "bfs"
        ? {
            kind: "bfs",
            nodes: ["S", "A", "B", "C", "T"],
            edges: [
              { source: "S", target: "A" },
              { source: "S", target: "B" },
              { source: "A", target: "C" },
              { source: "B", target: "T" },
              { source: "C", target: "T" },
            ],
            start: "S",
            directed: true,
            neighborOrder: "alphabetical",
            visitedOn: "enqueue",
          }
        : {
            kind: "concept",
            prompt: summaries[i],
            steps: [{ title: titles[i], body: summaries[i] }],
          },
    questions: [
      {
        id: `q-${id}`,
        conceptIds: [id],
        prompt:
          id === "bfs"
            ? "After expanding S and A, the queue is [B, C]. Which node is expanded next?"
            : `Which statement matches ${titles[i].toLowerCase()}?`,
        options:
          id === "bfs"
            ? [
                { id: "a", text: "B" },
                { id: "b", text: "C" },
                { id: "c", text: "S" },
              ]
            : [
                { id: "a", text: summaries[i] },
                { id: "b", text: "Choose any node at random." },
              ],
        correctOptionIds: ["a"],
        explanation:
          id === "bfs"
            ? "B is at the front of the FIFO queue. C waits behind it."
            : summaries[i],
      },
    ],
  })),
  finalQuestions: [
    {
      id: "final-paths",
      conceptIds: ["bfs", "paths"],
      prompt: "What does BFS minimize in an unweighted graph?",
      options: [
        { id: "a", text: "The number of edges in a path" },
        { id: "b", text: "Any weighted travel cost" },
      ],
      correctOptionIds: ["a"],
      explanation:
        "BFS explores in layers of edge distance. Weighted costs need a different algorithm.",
    },
  ],
});
export const failureFixture = {
  requestId: "fixture-failure",
  error:
    "Generation is not configured. Add a server-side provider key to create a lesson from fresh notes.",
  code: "PROVIDER_NOT_CONFIGURED",
};
