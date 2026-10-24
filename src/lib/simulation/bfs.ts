import type { BfsActivity } from "../contracts";

export type BfsFrame = Readonly<{
  index: number;
  current: string | null;
  queue: readonly string[];
  discovered: readonly string[];
  expanded: readonly string[];
  newlyDiscovered: readonly string[];
  skipped: readonly string[];
  distances: Readonly<Record<string, number>>;
  parents: Readonly<Record<string, string | null>>;
  complete: boolean;
}>;
export type BfsTrace = Readonly<{
  graph: Readonly<Omit<BfsActivity, "nodes" | "edges"> & {
    nodes: readonly string[];
    edges: readonly Readonly<{ source: string; target: string }>[];
  }>;
  neighbors: Readonly<Record<string, readonly string[]>>;
  frames: readonly BfsFrame[];
  unreachable: readonly string[];
}>;

/** Stable node-ID order, independent of the browser's locale. */
export const compareNodeIds = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

export function validateBfsGraph(graph: BfsActivity): void {
  if (graph.neighborOrder !== "alphabetical" || graph.visitedOn !== "enqueue") {
    throw new Error("This lab requires alphabetical neighbors and discovery on enqueue.");
  }
  if (typeof graph.directed !== "boolean") throw new Error("Specify whether the graph is directed.");
  if (!graph.nodes.length) throw new Error("Add at least one node.");
  const nodes = new Set(graph.nodes);
  if (graph.nodes.some(node => typeof node !== "string" || !node.trim())) throw new Error("Every node needs a nonempty ID.");
  if (nodes.size !== graph.nodes.length) throw new Error("Node IDs must be unique.");
  if (!nodes.has(graph.start)) throw new Error("The start node must exist in the graph.");
  for (const edge of graph.edges) {
    if (!nodes.has(edge.source) || !nodes.has(edge.target)) throw new Error("Every edge must connect existing nodes.");
  }
}

/** One immutable frame per expansion; visited means discovered when enqueued. */
export function createBfsTrace(input: BfsActivity): BfsTrace {
  validateBfsGraph(input);
  const graph = Object.freeze({ ...input,
    nodes: Object.freeze([...input.nodes]),
    edges: Object.freeze(input.edges.map(edge => Object.freeze({ ...edge }))),
  });
  const adjacency = new Map(graph.nodes.map(node => [node, new Set<string>()]));
  for (const { source, target } of graph.edges) {
    adjacency.get(source)!.add(target);
    if (!graph.directed) adjacency.get(target)!.add(source);
  }
  const neighbors: Record<string, readonly string[]> = Object.create(null);
  for (const [node, adjacent] of adjacency) neighbors[node] = Object.freeze([...adjacent].sort(compareNodeIds));
  const queue = [graph.start];
  const discovered = new Set([graph.start]);
  const expanded: string[] = [];
  const distances: Record<string, number> = Object.create(null);
  const parents: Record<string, string | null> = Object.create(null);
  distances[graph.start] = 0;
  parents[graph.start] = null;
  const frames: BfsFrame[] = [];
  const snapshot = (current: string | null, newlyDiscovered: string[], skipped: string[]) => {
    frames.push(Object.freeze({ index: frames.length, current,
      queue: Object.freeze([...queue]), discovered: Object.freeze([...discovered]),
      expanded: Object.freeze([...expanded]), newlyDiscovered: Object.freeze([...newlyDiscovered]),
      skipped: Object.freeze([...skipped]), distances: Object.freeze({ ...distances }),
      parents: Object.freeze({ ...parents }), complete: queue.length === 0,
    }));
  };
  snapshot(null, [graph.start], []);
  while (queue.length) {
    const current = queue.shift()!;
    const added: string[] = [];
    const skipped: string[] = [];
    for (const next of neighbors[current]) {
      if (discovered.has(next)) { skipped.push(next); continue; }
      discovered.add(next);
      queue.push(next);
      distances[next] = distances[current] + 1;
      parents[next] = current;
      added.push(next);
    }
    expanded.push(current);
    snapshot(current, added, skipped);
  }
  return Object.freeze({ graph, neighbors: Object.freeze(neighbors), frames: Object.freeze(frames),
    unreachable: Object.freeze(graph.nodes.filter(node => !discovered.has(node))),
  });
}

export function pathTo(frame: BfsFrame, target: string): readonly string[] | null {
  if (!Object.hasOwn(frame.parents, target)) return null;
  const path: string[] = [];
  let node: string | null = target;
  while (node !== null) { path.unshift(node); node = frame.parents[node]; }
  return Object.freeze(path);
}

export function evaluateNextExpansion(trace: BfsTrace, frameIndex: number, selectedNode: string) {
  if (!Number.isInteger(frameIndex) || frameIndex < 0 || frameIndex >= trace.frames.length - 1) {
    throw new Error("Choose a frame with an expansion remaining.");
  }
  const expected = trace.frames[frameIndex + 1].current!;
  return Object.freeze({ correct: selectedNode === expected, expected,
    feedback: `${expected} is at the front of the FIFO queue, so it is expanded next.`,
  });
}
