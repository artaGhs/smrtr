import { test } from "node:test";
import assert from "node:assert/strict";
import type { Lesson, SimulationState } from "../../lib/contracts";
import { sampleLesson } from "../../lib/fixtures/sample-lesson";
import {
  pageCanvasScenes,
  lessonBfsActivity,
  teachingViewport,
  teachingDisclosure,
} from "./scene-model";
import {
  changeSimulationState,
  defaultSimulationState,
  normalizeSimulationState,
  resolveScenarioActivity,
  simulationTrace,
} from "./simulation-state";
const graph = lessonBfsActivity(sampleLesson)!;

test("nested support views resolve the canonical scenario rather than a new graph", () => {
  const resolved = resolveScenarioActivity(sampleLesson, "bfs")!;
  assert.equal(resolved.activityConceptId, "bfs");
  assert.deepEqual(resolved.activity, graph);
  assert.equal(
    resolveScenarioActivity(sampleLesson, "queue")!.activityConceptId,
    "bfs",
  );
  const lesson = structuredClone(sampleLesson);
  const scenarioGraph = { ...graph, start: "A" };
  lesson.learningDesign = {
    scenario: { activityConceptId: "bfs", activity: scenarioGraph },
  } as Lesson["learningDesign"];
  assert.equal(resolveScenarioActivity(lesson, "bfs")!.activity, scenarioGraph);
});
test("explicit page scenes render only that page's requested scenario view", () => {
  const queue = pageCanvasScenes(sampleLesson, "queue", "queue", 3);
  assert.equal(queue.length, 1);
  assert.equal(queue[0].concept.id, "queue");
  assert.equal(queue[0].family, "queue");
  assert.equal(queue[0].index, 0);
  assert.equal(
    pageCanvasScenes(sampleLesson, "route", "paths", 4)[0].family,
    "layers",
  );
  assert.equal(
    pageCanvasScenes(sampleLesson, "explanation", "queue", 0)[0].family,
    "concept",
  );
  assert.deepEqual(pageCanvasScenes(sampleLesson, "none", "queue", 0), []);
  assert.equal(pageCanvasScenes(sampleLesson, undefined, "bfs", 0).length, 5);
});
test("one shared frontier advances consistently across main and queue support pages", () => {
  let main = defaultSimulationState(graph);
  main = changeSimulationState(graph, main, { step: 1 });
  main = changeSimulationState(graph, main, { step: 2 });
  const queueSupport = normalizeSimulationState(graph, main);
  assert.deepEqual(
    simulationTrace(graph, queueSupport)!.frames[queueSupport.step].queue,
    ["B", "C"],
  );
  const fromSupport = changeSimulationState(graph, queueSupport, { step: 3 });
  assert.deepEqual(
    simulationTrace(graph, fromSupport)!.frames[fromSupport.step].queue,
    ["C", "T"],
  );
  assert.equal(
    main.step,
    2,
    "a support update does not mutate the entry snapshot",
  );
});
test("external back restoration retains exact step, target and graph inputs", () => {
  const entry: SimulationState = Object.freeze({
    start: "B",
    directed: false,
    variant: "return",
    step: 2,
    target: "A",
  });
  const snapshot = structuredClone(entry);
  const support = changeSimulationState(graph, entry, { step: 3, target: "C" });
  assert.notDeepEqual(support, entry);
  assert.deepEqual(normalizeSimulationState(graph, snapshot), entry);
  assert.equal(simulationTrace(graph, snapshot)!.frames[entry.step].index, 2);
  assert.deepEqual(entry, snapshot);
});
test("only graph input changes reset playback; steps and target changes preserve each other", () => {
  const base = { ...defaultSimulationState(graph), step: 3, target: "A" };
  assert.equal(changeSimulationState(graph, base, { target: "T" }).step, 3);
  assert.equal(changeSimulationState(graph, base, { step: 1 }).target, "A");
  for (const patch of [
    { start: "T" },
    { directed: false },
    { variant: "island" },
  ]) {
    const changed = changeSimulationState(graph, base, patch);
    assert.equal(changed.step, 0);
    assert.ok(graph.nodes.includes(changed.target));
  }
});
test("restored or legacy state is bounded without mutating its source", () => {
  const legacy = {
    start: "S",
    directed: true,
    variant: "cycles",
    step: 999,
    target: "missing",
  };
  const normalized = normalizeSimulationState(graph, legacy);
  assert.equal(normalized.variant, "return");
  assert.ok(
    normalized.step < simulationTrace(graph, normalized)!.frames.length,
  );
  assert.equal(legacy.step, 999);
  assert.equal(legacy.variant, "cycles");
  assert.equal(
    normalizeSimulationState(graph, { ...legacy, start: "missing", step: NaN })
      .start,
    "S",
  );
  assert.equal(
    normalizeSimulationState(graph, { ...legacy, step: NaN }).step,
    0,
  );
});

test("hierarchy framing uses the bounded canvas pane rather than global viewport offsets", () => {
  const desktop = teachingViewport(0, 1000, 700, false, "scenario");
  assert.ok(desktop.y >= 0 && desktop.y + 850 * desktop.zoom <= 700);
  assert.ok(desktop.zoom > 0.7);
  const mobile = teachingViewport(0, 360, 280, true, "scenario");
  assert.equal(mobile.y + 90 * mobile.zoom, 8);
  assert.ok(mobile.y + (90 + 350) * mobile.zoom < 208);
  const queue = teachingViewport(0, 360, 280, true, "queue");
  assert.ok(queue.y + 440 * queue.zoom >= 0);
  assert.ok(queue.y + (440 + 155) * queue.zoom < 208);
});

test("novice problem and intuition views reveal terminology only when the page calls for mechanism", () => {
  assert.equal(teachingDisclosure("scenario", "overview"), "problem");
  assert.equal(teachingDisclosure("layers", "core"), "intuition");
  for (const scene of ["queue", "discovery", "route"] as const)
    assert.equal(teachingDisclosure(scene, "support"), "mechanism");
  assert.equal(teachingDisclosure("layers", "transfer"), "mechanism");
  assert.equal(teachingDisclosure(undefined, undefined), "mechanism");
  const state = { ...defaultSimulationState(graph), step: 2, target: "C" };
  const entry = structuredClone(state);
  teachingDisclosure("scenario", "overview");
  teachingDisclosure("layers", "core");
  assert.deepEqual(
    state,
    entry,
    "disclosure does not reset or mutate the shared simulation",
  );
  const frame = teachingViewport(0, 358, 313, true, "scenario", "overview");
  assert.ok(frame.y + 90 * frame.zoom >= 0);
  assert.ok(frame.y + (90 + 395) * frame.zoom <= 313);
});
