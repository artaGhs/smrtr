import test from "node:test";
import assert from "node:assert/strict";
import { parseCanvasSource, type CanvasSource } from "../canvas-document/source";

const source = (): CanvasSource => ({ schemaVersion: 1, id: "lesson-a", revision: "1", title: "A topic", rootCanvasId: "root", canvases: [{ id: "root", title: "A topic", entryNodeId: "a" }], nodes: [{ id: "a", canvasId: "root", kind: "idea", role: "topic", title: "A" }, { id: "b", canvasId: "root", parentId: "a", kind: "idea", role: "branch", title: "B" }], edges: [{ id: "a-b", canvasId: "root", source: "a", target: "b", label: "includes", relation: "hierarchy" }], provenance: "generated", status: "outline" });

test("source boundary accepts a progressive outline and returns an independent snapshot", () => {
  const input = source(), parsed = parseCanvasSource(input);
  input.nodes[0].title = "Changed";
  assert.equal(parsed.nodes[0].title, "A");
  assert.equal(parsed.status, "outline");
});

test("source boundary rejects dangling edges, duplicate identities and invalid navigation", () => {
  for (const mutate of [
    (s: CanvasSource) => { s.edges[0].target = "missing"; },
    (s: CanvasSource) => { s.nodes.push({ ...s.nodes[0] }); },
    (s: CanvasSource) => { s.nodes[0].detailCanvasId = "missing"; },
    (s: CanvasSource) => { s.nodes[0].canvasId = "missing"; },
  ]) { const input = source(); mutate(input); assert.throws(() => parseCanvasSource(input)); }
});

test("source boundary allows semantic cycles but rejects ownership and scene cycles", () => {
  const semantic = source();
  semantic.edges.push({ id: "b-a", canvasId: "root", source: "b", target: "a", label: "relates to", relation: "related" });
  assert.doesNotThrow(() => parseCanvasSource(semantic));
  semantic.nodes[0].parentId = "b";
  assert.throws(() => parseCanvasSource(semantic));
  const scenes = source(); scenes.canvases.push({ id: "child", title: "Child", parentCanvasId: "child" });
  assert.throws(() => parseCanvasSource(scenes));
});

test("external styles, coordinates and activities stay bounded", () => {
  const invalid = source();
  invalid.nodes[0].style = { fill: "url(https://example.invalid/track)" };
  assert.throws(() => parseCanvasSource(invalid));
  invalid.nodes[0].style = { fill: "#aabbcc" };
  invalid.nodes[0].bounds = { x: Infinity, y: 0, width: 100, height: 100 };
  assert.throws(() => parseCanvasSource(invalid));
  invalid.nodes[0].bounds = undefined;
  invalid.nodes[0].kind = "simulation";
  invalid.nodes[0].activity = { kind: "bfs", nodes: ["A"], edges: [{ source: "A", target: "B" }], start: "A", directed: false, neighborOrder: "alphabetical", visitedOn: "enqueue" };
  assert.throws(() => parseCanvasSource(invalid));
});
