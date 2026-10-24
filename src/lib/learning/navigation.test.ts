import assert from "node:assert/strict";
import test from "node:test";
import { sampleLesson } from "../fixtures/sample-lesson";
import {
  coreRoute,
  effectiveConfidence,
  normalizeLearningDesign,
  pageBreadcrumbs,
} from "./design";
import {
  backLearningPage,
  initialNavigation,
  openLearningPage,
  setLearningSimulation,
} from "./navigation";

const { design } = normalizeLearningDesign(sampleLesson);
test("a two-level drilldown returns the exact main frontier, target and reading position", () => {
  const supportDesign = {
    ...design,
    pages: design.pages.map((page) =>
      page.id === "page-queue" ? { ...page, kind: "support" as const } : page,
    ),
  };
  let state = initialNavigation(sampleLesson, supportDesign, "page-bfs");
  state = setLearningSimulation(state, "bfs", {
    start: "S",
    directed: true,
    variant: "original",
    step: 2,
    target: "T",
  });
  state = { ...state, location: { ...state.location, scrollTop: 184 } };
  state = openLearningPage(
    state,
    sampleLesson,
    supportDesign,
    "page-queue",
    184,
  );
  assert.equal(state.location.simulations.bfs.step, 2);
  state = setLearningSimulation(state, "bfs", {
    ...state.location.simulations.bfs,
    step: 3,
    target: "C",
  });
  state = openLearningPage(
    state,
    sampleLesson,
    supportDesign,
    "detail-queue-0",
    92,
  );
  assert.equal(state.location.mainPageId, "page-bfs");
  state = setLearningSimulation(state, "bfs", {
    ...state.location.simulations.bfs,
    step: 4,
  });
  state = backLearningPage(state);
  assert.equal(state.location.pageId, "page-queue");
  assert.equal(state.location.scrollTop, 92);
  assert.equal(state.location.simulations.bfs.step, 3);
  state = backLearningPage(state);
  assert.equal(state.location.pageId, "page-bfs");
  assert.equal(state.location.scrollTop, 184);
  assert.equal(state.location.simulations.bfs.step, 2);
  assert.equal(state.location.simulations.bfs.target, "T");
  assert.equal(state.history.length, 0);
});
test("breadcrumb navigation reuses a prior location without creating a duplicate branch", () => {
  let state = initialNavigation(sampleLesson, design, "page-bfs");
  state = openLearningPage(state, sampleLesson, design, "page-queue", 45);
  state = openLearningPage(state, sampleLesson, design, "detail-queue-0", 80);
  state = openLearningPage(state, sampleLesson, design, "page-bfs");
  assert.equal(state.location.scrollTop, 45);
  assert.equal(state.history.length, 0);
  assert.equal(
    openLearningPage(state, sampleLesson, design, "missing-page"),
    state,
  );
});
test("legacy arrangement preserves source content and does not turn relationship cycles into parent cycles", () => {
  const original = JSON.stringify(sampleLesson);
  const lesson = {
    ...sampleLesson,
    relations: [
      ...sampleLesson.relations,
      { id: "cycle", source: "paths", target: "bfs", type: "related" as const },
    ],
  };
  const normalized = normalizeLearningDesign(lesson);
  assert.equal(normalized.provenance, "legacy");
  const ids = new Set(normalized.design.pages.map((page) => page.id));
  for (const page of normalized.design.pages) {
    if (page.parentId) assert.ok(ids.has(page.parentId));
    assert.equal(
      new Set(
        pageBreadcrumbs(normalized.design, page.id).map((page) => page.id),
      ).size,
      pageBreadcrumbs(normalized.design, page.id).length,
    );
    for (const block of page.blocks)
      for (const segment of block.segments)
        if (segment.kind === "page-link") assert.ok(ids.has(segment.pageId));
  }
  assert.equal(JSON.stringify(sampleLesson), original);
});
test("self-reported confidence chooses a different starting route and uses stable override identities", () => {
  const profile = {
    overall: "apply" as const,
    topics: [
      { id: "queue-topic", label: "Queues", level: "new" as const },
      { id: "routes-topic", label: "Routes", level: null },
    ],
  };
  assert.notEqual(
    coreRoute(design, profile)[0].id,
    coreRoute(design, { overall: "new", topics: [] })[0].id,
  );
  assert.equal(effectiveConfidence(profile, ["queue-topic"]), "new");
  assert.equal(effectiveConfidence(profile, ["routes-topic"]), "apply");
  assert.equal(effectiveConfidence(profile, ["Queues"]), "apply");
  const experienced = coreRoute(design, profile)[0].id;
  const entry = initialNavigation(sampleLesson, design, experienced);
  const simpler = openLearningPage(
    entry,
    sampleLesson,
    design,
    design.routes.new[0],
  );
  assert.equal(backLearningPage(simpler).location.pageId, experienced);
});

test("opening an unvisited overview temporarily offers the complete novice route and back restores the experienced context", () => {
  const entry = initialNavigation(sampleLesson, design, "page-paths");
  const intro = openLearningPage(
    entry,
    sampleLesson,
    design,
    "lesson-overview",
    120,
  );
  assert.equal(intro.location.routeLevel, "new");
  assert.equal(intro.location.mainPageId, "lesson-overview");
  const returned = backLearningPage(intro);
  assert.equal(returned.location.pageId, "page-paths");
  assert.equal(returned.location.routeLevel, undefined);
  assert.equal(returned.location.scrollTop, 120);
});
