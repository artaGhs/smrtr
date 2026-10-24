import { test } from "node:test";
import assert from "node:assert/strict";
import type { BfsActivity } from "../contracts";
import { createBfsTrace, evaluateNextExpansion, pathTo } from "./bfs";

const graph: BfsActivity = { kind: "bfs", nodes: ["S", "A", "B", "C", "T"], start: "S", directed: true, neighborOrder: "alphabetical", visitedOn: "enqueue",
  edges: [{ source: "S", target: "B" }, { source: "S", target: "A" }, { source: "A", target: "C" }, { source: "B", target: "T" }, { source: "C", target: "T" }] };
test("alphabetical neighbors and FIFO give the exact sample queue", () => {
  const trace = createBfsTrace(graph);
  assert.deepEqual(trace.frames.map(f => f.current), [null, "S", "A", "B", "C", "T"]);
  assert.deepEqual(trace.frames[2].queue, ["B", "C"]);
  assert.equal(evaluateNextExpansion(trace, 2, "B").correct, true);
  assert.equal(evaluateNextExpansion(trace, 2, "C").correct, false);
  assert.deepEqual(pathTo(trace.frames.at(-1)!, "T"), ["S", "B", "T"]);
  assert.equal(trace.frames.at(-1)!.distances.T, 2);
  assert.deepEqual(trace.frames[4].skipped, ["T"]);
});
test("cycles, duplicate edges and self loops enqueue every node only once", () => {
  const trace = createBfsTrace({ ...graph, edges: [...graph.edges, graph.edges[0], { source: "T", target: "S" }, { source: "S", target: "S" }] });
  assert.equal(trace.frames.length, graph.nodes.length + 1);
  for (const f of trace.frames) {
    assert.equal(new Set(f.queue).size, f.queue.length);
    assert.equal(new Set(f.discovered).size, f.discovered.length);
    assert.ok(f.queue.every(n => f.discovered.includes(n) && !f.expanded.includes(n)));
    assert.ok(f.expanded.every(n => f.discovered.includes(n)));
  }
});
test("disconnected nodes remain unreachable and reverse edges require undirected mode", () => {
  const directed = createBfsTrace({ ...graph, start: "T" });
  assert.deepEqual(directed.unreachable, ["S", "A", "B", "C"]);
  assert.equal(pathTo(directed.frames.at(-1)!, "S"), null);
  const undirected = createBfsTrace({ ...graph, start: "T", directed: false });
  assert.equal(undirected.unreachable.length, 0);
  assert.equal(undirected.frames.at(-1)!.distances.S, 2);
});
test("isolated start has initial and final frames, with no further prediction", () => {
  const trace = createBfsTrace({ ...graph, nodes: ["S"], edges: [] });
  assert.deepEqual(trace.frames.map(f => f.queue), [["S"], []]);
  assert.equal(trace.frames[1].complete, true);
  assert.throws(() => evaluateNextExpansion(trace, 1, "S"));
  assert.throws(() => evaluateNextExpansion(trace, -1, "S"));
});
test("bad IDs, duplicate nodes, start and dangling edges are rejected", () => {
  assert.throws(() => createBfsTrace({ ...graph, nodes: [] }));
  assert.throws(() => createBfsTrace({ ...graph, nodes: ["S", "S"] }));
  assert.throws(() => createBfsTrace({ ...graph, nodes: ["S", " "] }));
  assert.throws(() => createBfsTrace({ ...graph, start: "X" }));
  assert.throws(() => createBfsTrace({ ...graph, edges: [{ source: "X", target: "S" }] }));
});
test("snapshots and graph are immutable and isolated from input mutation", () => {
  const input = structuredClone(graph);
  const trace = createBfsTrace(input);
  input.edges[0].target = "S";
  input.nodes.push("X");
  assert.equal(trace.graph.nodes.length, 5);
  assert.equal(trace.graph.edges[0].target, "B");
  assert.ok(Object.isFrozen(trace.frames[0].queue));
  assert.ok(Object.isFrozen(trace.frames[0].parents));
  assert.ok(Object.isFrozen(trace.graph.edges[0]));
  assert.deepEqual(trace.frames[0].discovered, ["S"]);
});
test("special object-key node IDs are ordinary graph nodes", () => {
  const trace = createBfsTrace({ ...graph, nodes: ["__proto__", "constructor", "toString"], start: "__proto__", edges: [{ source: "__proto__", target: "constructor" }] });
  assert.deepEqual(pathTo(trace.frames.at(-1)!, "constructor"), ["__proto__", "constructor"]);
  assert.equal(pathTo(trace.frames.at(-1)!, "toString"), null);
});
test("distances are minimal for every reachable node across graph families", () => {
  for (let seed = 1; seed < 40; seed++) {
    const nodes = ["A", "B", "C", "D", "E", "F"];
    const edges = nodes.flatMap((source, a) => nodes.filter((_, b) => (seed * (a + 3) + b * 7) % 5 < 2).map(target => ({ source, target })));
    const trace = createBfsTrace({ ...graph, nodes, edges, start: "A", directed: seed % 2 === 0 });
    // Independent relaxation oracle: all edges have unit cost.
    const distance: Record<string, number> = { A: 0 };
    for (let pass = 0; pass < nodes.length; pass++) for (const e of edges) {
      if (distance[e.source] !== undefined) distance[e.target] = Math.min(distance[e.target] ?? Infinity, distance[e.source] + 1);
      if (!trace.graph.directed && distance[e.target] !== undefined) distance[e.source] = Math.min(distance[e.source] ?? Infinity, distance[e.target] + 1);
    }
    assert.deepEqual({ ...trace.frames.at(-1)!.distances }, distance);
  }
});
