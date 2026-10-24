import assert from "node:assert/strict";
import test from "node:test";
import { sampleLesson } from "../fixtures/sample-lesson";
import { getTeachingPlan } from "./sequence";

test("existing BFS lessons begin with an example without rewriting prerequisites", () => {
  const plan = getTeachingPlan(sampleLesson);
  assert.equal(plan.sequence[0].conceptId, "bfs");
  assert.equal(plan.sequence[0].approach, "example");
  assert.equal(sampleLesson.path[0], "graphs");
  assert.equal(
    new Set(plan.sequence.map((step) => step.conceptId)).size,
    sampleLesson.concepts.length,
  );
});
test("authored teaching strategy can differ from prerequisite order", () => {
  const teachingPlan = {
    openingQuestion: "How do we choose a route?",
    bigPicture: "Start with an actual route.",
    sequence: [...sampleLesson.path]
      .reverse()
      .map((conceptId) => ({
        conceptId,
        approach: "visual" as const,
        purpose: "Inspect the concrete example.",
      })),
  };
  assert.deepEqual(
    getTeachingPlan({ ...sampleLesson, teachingPlan }),
    teachingPlan,
  );
});
test("non-BFS lessons and invalid old strategy metadata never claim a BFS example", () => {
  const lesson = {
    ...sampleLesson,
    modules: sampleLesson.modules.filter(
      (module) => module.activity.kind !== "bfs",
    ),
  };
  assert.equal(getTeachingPlan(lesson).sequence[0].conceptId, "graphs");
  const teachingPlan = {
    openingQuestion: "Invalid",
    bigPicture: "Invalid",
    sequence: [
      {
        conceptId: "unknown",
        approach: "example" as const,
        purpose: "Invalid",
      },
    ],
  };
  assert.equal(
    getTeachingPlan({ ...lesson, teachingPlan }).sequence[0].conceptId,
    "graphs",
  );
});
