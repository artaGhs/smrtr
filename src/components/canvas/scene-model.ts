import type {
  BfsActivity,
  Concept,
  Lesson,
  LessonModule,
  PageScene,
} from "../../lib/contracts";
import { getTeachingSequence } from "../../lib/teaching/sequence";
import {
  compareNodeIds,
  createBfsTrace,
  type BfsTrace,
  type BfsFrame,
} from "../../lib/simulation/bfs";

export type CanvasScene = {
  id: string;
  concept: Concept;
  module?: LessonModule;
  family: "network" | "queue" | "discovery" | "layers" | "concept";
  index: number;
};
export function buildCanvasScenes(lesson: Lesson): CanvasScene[] {
  const bfs = lesson.modules.find((module) => module.activity.kind === "bfs");
  const order = getTeachingSequence(lesson).map((step) => step.conceptId);
  return order
    .flatMap((id) => {
      const concept = lesson.concepts.find((item) => item.id === id);
      if (!concept) return [];
      const module = lesson.modules.find((item) => item.conceptId === id);
      const title = `${concept.title} ${concept.summary}`;
      let family: CanvasScene["family"] = "concept";
      if (bfs) {
        if (module?.activity.kind === "bfs") family = "network";
        else if (/fifo|queue|frontier/i.test(title)) family = "queue";
        else if (/visited|discover|duplicate|cycle/i.test(title))
          family = "discovery";
        else if (
          /shortest|distance|layers?|paths?|routes?|parents?|fewest|hops?/i.test(
            title,
          )
        )
          family = "layers";
        else if (
          /graphs?|networks?|breadth.first|\bbfs\b|connections?/i.test(title)
        )
          family = "network";
      }
      return [{ id: `scene-${id}`, concept, module, family, index: 0 }];
    })
    .map((scene, index) => ({ ...scene, index }));
}

export function lessonBfsActivity(lesson: Lesson): BfsActivity | null {
  const activity = lesson.modules.find(
    (module) => module.activity.kind === "bfs",
  )?.activity;
  return activity?.kind === "bfs" ? activity : null;
}

export function experimentGraph(
  activity: BfsActivity,
  start: string,
  directed: boolean,
  variant: string,
): BfsActivity {
  const current = safeBfsTrace({ ...activity, start, directed });
  const goal = current ? defaultRouteTarget(current) : start;
  const last =
    goal !== start
      ? goal
      : ([...activity.nodes].reverse().find((node) => node !== start) ?? start);
  return {
    ...activity,
    start,
    directed,
    edges:
      variant === "island"
        ? activity.edges.filter(
            (edge) => edge.source !== last && edge.target !== last,
          )
        : variant === "return"
          ? [
              ...activity.edges,
              ...activity.edges.map((edge) => ({
                source: edge.target,
                target: edge.source,
              })),
            ]
          : activity.edges,
  };
}

/** Layout follows computed hop distance; the disconnected column contains real unreachable nodes only. */
export function deliveryLayout(trace: BfsTrace) {
  const final = trace.frames.at(-1)!;
  const layers = new Map<number, string[]>();
  for (const node of trace.graph.nodes) {
    const distance = knownDistance(final, node);
    if (distance !== undefined)
      layers.set(distance, [...(layers.get(distance) ?? []), node]);
  }
  const depth = Math.max(0, ...layers.keys());
  const spacing = Math.max(160, depth ? 550 / depth : 160);
  const islandX = Math.max(825, 95 + depth * spacing + 180);
  const width = Math.max(
    1000,
    trace.unreachable.length ? islandX + 160 : 95 + depth * spacing + 120,
  );
  const islandRows = Math.ceil(trace.unreachable.length / 2);
  const rows = Math.max(
    1,
    islandRows,
    ...[...layers.values()].map((nodes) => nodes.length),
  );
  const height = Math.max(565, rows * 170 + 100);
  const positions = new Map<
    string,
    { x: number; y: number; layer: number | null }
  >();
  for (const [layer, nodes] of layers)
    nodes.sort(compareNodeIds).forEach((node, i) => {
      positions.set(node, {
        x: 95 + layer * spacing,
        y: (height - nodes.length * 170) / 2 + 45 + i * 170,
        layer,
      });
    });
  trace.unreachable.forEach((node, i) =>
    positions.set(node, {
      x: islandX + (i % 2) * 90,
      y: (height - islandRows * 170) / 2 + 45 + Math.floor(i / 2) * 170,
      layer: null,
    }),
  );
  return { positions, layers, depth, height, width, spacing, islandX };
}

export function safeBfsTrace(activity: BfsActivity | null): BfsTrace | null {
  if (!activity) return null;
  try {
    return createBfsTrace(activity);
  } catch {
    return null;
  }
}

export function defaultRouteTarget(trace: BfsTrace): string {
  const final = trace.frames.at(-1)!;
  return (
    trace.graph.nodes
      .filter((node) => knownDistance(final, node) !== undefined)
      .sort(
        (a, b) =>
          final.distances[b] - final.distances[a] || compareNodeIds(b, a),
      )[0] ?? trace.graph.start
  );
}

export function knownDistance(
  frame: BfsFrame,
  node: string,
): number | undefined {
  return Object.hasOwn(frame.distances, node)
    ? frame.distances[node]
    : undefined;
}

/** Known stage bounds keep focus independent of ResizeObserver/handle measurements. */
export function teachingViewport(
  index: number,
  width: number,
  height: number,
  mobile: boolean,
) {
  const zoom = mobile
    ? Math.max(0.18, Math.min(0.72, (width - 24) / 620))
    : Math.max(0.18, Math.min((width - 90) / 1320, (height - 200) / 940, 1.1));
  return {
    x: (mobile ? 12 : (width - 1320 * zoom) / 2) - index * 1540 * zoom,
    y:
      (mobile ? 135 : 90 + (height - 200 - 940 * zoom) / 2) -
      (index % 2 ? 70 : 0) * zoom,
    zoom,
  };
}

/** An explicit page scene is a view of the selected page, not another lesson sequence. */
export function pageCanvasScenes(
  lesson: Lesson,
  pageScene: PageScene | undefined,
  selectedConceptId: string,
  activeSceneIndex: number,
): CanvasScene[] {
  const scenes = buildCanvasScenes(lesson);
  if (pageScene === undefined) return scenes;
  if (pageScene === "none") return [];
  const concept =
    lesson.concepts.find((item) => item.id === selectedConceptId) ??
    scenes[activeSceneIndex]?.concept ??
    lesson.concepts[0];
  if (!concept) return [];
  const family: CanvasScene["family"] =
    pageScene === "scenario"
      ? "network"
      : pageScene === "route"
        ? "layers"
        : pageScene === "explanation"
          ? "concept"
          : pageScene;
  return [
    {
      id: `page-scene-${concept.id}-${pageScene}`,
      concept,
      module: lesson.modules.find((module) => module.conceptId === concept.id),
      family,
      index: 0,
    },
  ];
}
