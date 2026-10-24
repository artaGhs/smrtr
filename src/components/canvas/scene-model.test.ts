import { test } from "node:test";
import assert from "node:assert/strict";
import { sampleLesson } from "../../lib/fixtures/sample-lesson";
import { createBfsTrace } from "../../lib/simulation/bfs";
import { getTeachingSequence } from "../../lib/teaching/sequence";
import {
  buildCanvasScenes,
  defaultRouteTarget,
  deliveryLayout,
  experimentGraph,
  knownDistance,
  lessonBfsActivity,
  safeBfsTrace,
  teachingViewport,
} from "./scene-model";

test("scene indices follow teaching order independently of the prerequisite path", () => {
  const scenes = buildCanvasScenes(sampleLesson);
  assert.deepEqual(
    scenes.map((scene) => scene.concept.id),
    getTeachingSequence(sampleLesson).map((step) => step.conceptId),
  );
  assert.equal(scenes[0].concept.id, "bfs");
  assert.equal(scenes[0].family, "network");
  assert.equal(
    scenes.find((scene) => scene.concept.id === "queue")!.family,
    "queue",
  );
  assert.equal(
    scenes.find((scene) => scene.concept.id === "visited")!.family,
    "discovery",
  );
  assert.equal(
    scenes.find((scene) => scene.concept.id === "paths")!.family,
    "layers",
  );
});
test("actual BFS activity takes precedence over FIFO/layer wording; route evidence gets a distance scene", () => {
  const lesson = structuredClone(sampleLesson);
  const opener = lesson.concepts.find((concept) => concept.id === "bfs")!;
  opener.title = "Explore the network in layers";
  opener.summary = "Watch layers emerge from FIFO order.";
  const last = lesson.concepts.find((concept) => concept.id === "paths")!;
  last.title = "Trace a fewest-edge route";
  last.summary = "Follow parent links.";
  const scenes = buildCanvasScenes(lesson);
  assert.equal(scenes[0].family, "network");
  assert.equal(
    scenes.find((scene) => scene.concept.id === "paths")!.family,
    "layers",
  );
});
test("a non-BFS lesson keeps honest explanation scenes even when its terms mention networks", () => {
  const lesson = structuredClone(sampleLesson);
  lesson.modules = lesson.modules.map((module) => ({
    ...module,
    activity: {
      kind: "concept" as const,
      prompt: module.explanation,
      steps: [{ title: "Reason about this idea", body: module.explanation }],
    },
  }));
  assert.equal(lessonBfsActivity(lesson), null);
  assert.ok(
    buildCanvasScenes(lesson).every((scene) => scene.family === "concept"),
  );
});
test("start, direction and isolation experiments recompute real traversal with immutable source graph", () => {
  const activity = lessonBfsActivity(sampleLesson)!;
  const initial = JSON.stringify(activity);
  const changed = experimentGraph(activity, "T", true, "original");
  assert.equal(createBfsTrace(changed).frames.at(-1)!.expanded.length, 1);
  const reverse = experimentGraph(activity, "T", false, "original");
  assert.equal(createBfsTrace(reverse).unreachable.length, 0);
  const isolated = createBfsTrace(
    experimentGraph(activity, "S", true, "island"),
  );
  assert.ok(isolated.unreachable.includes("T"));
  assert.equal(JSON.stringify(activity), initial);
});
test("layout uses computed layers and only real unreachable nodes; target prefers a reachable goal", () => {
  const activity = lessonBfsActivity(sampleLesson)!;
  const trace = createBfsTrace({
    ...activity,
    nodes: [...activity.nodes, "U"],
  });
  const layout = deliveryLayout(trace);
  assert.equal(layout.positions.get("U")!.layer, null);
  assert.equal(layout.positions.get("T")!.layer, 2);
  assert.equal(defaultRouteTarget(trace), "T");
  assert.ok(layout.positions.get("S")!.x < layout.positions.get("T")!.x);
  assert.equal(layout.positions.size, trace.graph.nodes.length);
});
test("ten-node crowded and disconnected graphs keep every landmark and caption inside the scene", () => {
  const activity = lessonBfsActivity(sampleLesson)!;
  const nodes = Array.from({ length: 10 }, (_, i) => `N${i}`);
  for (const edges of [
    nodes.slice(1).map((target) => ({ source: "N0", target })),
    [],
  ]) {
    const trace = createBfsTrace({ ...activity, nodes, start: "N0", edges });
    const layout = deliveryLayout(trace);
    for (const point of layout.positions.values()) {
      assert.ok(point.x >= 45 && point.x <= 950);
      assert.ok(point.y >= 40 && point.y + 110 < layout.height);
      assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
    }
    for (const group of layout.layers.values()) {
      const ys = group
        .map((node) => layout.positions.get(node)!.y)
        .sort((a, b) => a - b);
      assert.ok(ys.every((y, i) => i === 0 || y - ys[i - 1] >= 160));
    }
  }
});
test("invalid graphs and prototype-like unreachable labels do not fabricate visual states", () => {
  const activity = lessonBfsActivity(sampleLesson)!;
  assert.equal(safeBfsTrace({ ...activity, start: "missing" }), null);
  const trace = createBfsTrace({
    ...activity,
    nodes: ["S", "constructor", "__proto__"],
    edges: [],
  });
  assert.equal(knownDistance(trace.frames[0], "constructor"), undefined);
  assert.equal(deliveryLayout(trace).positions.get("constructor")!.layer, null);
  assert.equal(defaultRouteTarget(trace), "S");
});

test("known-bounds viewports reserve shell space and retain a readable mobile opening", () => {
  for (const index of [0, 1, 4]) {
    const desktop = teachingViewport(index, 1440, 1000, false);
    const top = desktop.y + (index % 2 ? 70 : 0) * desktop.zoom;
    const left = desktop.x + index * 1540 * desktop.zoom;
    assert.ok(top >= 89 && top + 940 * desktop.zoom <= 891);
    assert.ok(left >= 44 && left + 1320 * desktop.zoom <= 1396);
    const mobile = teachingViewport(index, 390, 844, true);
    assert.ok(mobile.zoom > 0.5);
    assert.equal(mobile.x + index * 1540 * mobile.zoom, 12);
    assert.equal(mobile.y + (index % 2 ? 70 : 0) * mobile.zoom, 135);
  }
});
test("isolation experiment disconnects a reachable goal even when the last node was already isolated", () => {
  const activity = lessonBfsActivity(sampleLesson)!;
  const source = { ...activity, nodes: [...activity.nodes, "U"] };
  const result = createBfsTrace(experimentGraph(source, "S", true, "island"));
  assert.ok(result.unreachable.includes("T"));
  assert.ok(result.unreachable.includes("U"));
});

test("a ten-stop chain keeps roads and destinations apart rather than compressing their hops", () => {
  const base = lessonBfsActivity(sampleLesson)!;
  const nodes = Array.from({ length: 10 }, (_, i) => `N${i}`);
  const edges = nodes
    .slice(1)
    .map((target, i) => ({ source: nodes[i], target }));
  const layout = deliveryLayout(
    createBfsTrace({ ...base, nodes, edges, start: "N0" }),
  );
  const xs = nodes.map((node) => layout.positions.get(node)!.x);
  assert.ok(xs.every((x, i) => i === 0 || x - xs[i - 1] >= 160));
  assert.ok(xs.at(-1)! + 60 < layout.width);
});
