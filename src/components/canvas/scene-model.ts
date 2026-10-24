import type {
  BfsActivity,
  Concept,
  Lesson,
  LessonModule,
} from "../../lib/contracts";
import { getTeachingSequence } from "../../lib/teaching/sequence";
import {
  compareNodeIds,
  createBfsTrace,
  type BfsTrace,
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
        if (/fifo|queue|frontier/i.test(title)) family = "queue";
        else if (/visited|discover|duplicate|cycle/i.test(title))
          family = "discovery";
        else if (/shortest|distance|layers?|paths?/i.test(title))
          family = "layers";
        else if (
          module?.activity.kind === "bfs" ||
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
  const last =
    [...activity.nodes].reverse().find((node) => node !== start) ?? start;
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
    const distance = final.distances[node];
    if (distance !== undefined)
      layers.set(distance, [...(layers.get(distance) ?? []), node]);
  }
  const depth = Math.max(0, ...layers.keys());
  const positions = new Map<
    string,
    { x: number; y: number; layer: number | null }
  >();
  for (const [layer, nodes] of layers)
    nodes.sort(compareNodeIds).forEach((node, i) => {
      positions.set(node, {
        x: 95 + layer * (depth ? 550 / depth : 0),
        y: 130 + ((i + 1) * 300) / (nodes.length + 1),
        layer,
      });
    });
  trace.unreachable.forEach((node, i) =>
    positions.set(node, {
      x: 825 + (i % 2) * 90,
      y: 235 + Math.floor(i / 2) * 105,
      layer: null,
    }),
  );
  return { positions, layers, depth };
}

export function safeBfsTrace(activity: BfsActivity | null): BfsTrace | null {
  if (!activity) return null;
  try {
    return createBfsTrace(activity);
  } catch {
    return null;
  }
}
