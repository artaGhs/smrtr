import { test } from "node:test";
import assert from "node:assert/strict";
import type { Question } from "../contracts";
import { evaluateQuestion } from "./assessment";
const question: Question = { id: "q", conceptIds: ["queue", "bfs"], prompt: "Select both", options: [{ id: "a", text: "A" }, { id: "b", text: "B" }, { id: "c", text: "C" }], correctOptionIds: ["a", "b"], explanation: "A and B." };
test("multi-answer requires the complete set without extra or unknown options", () => {
  assert.equal(evaluateQuestion(question, ["b", "a"]).correct, true);
  for (const selected of [[], ["a"], ["b"], ["a", "b", "c"], ["a", "unknown"]]) {
    const result = evaluateQuestion(question, selected);
    assert.equal(result.correct, false);
    assert.deepEqual(result.reviewConceptIds, ["queue", "bfs"]);
  }
  assert.deepEqual(evaluateQuestion(question, ["a", "b"]).reviewConceptIds, []);
});
