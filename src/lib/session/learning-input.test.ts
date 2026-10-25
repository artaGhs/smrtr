import assert from "node:assert/strict";
import test from "node:test";
import { composeLearningInput, MAX_LEARNING_TEXT } from "./learning-input";

test("a short topic and attachment-only notes both become valid direct requests", () => {
  assert.equal(composeLearningInput("gravity", []), "Help me understand gravity.");
  const notes = "An action potential travels along an axon.\nNa+ enters the cell.";
  const result = composeLearningInput("", [{ name: "Lecture 4.pdf", text: notes }]);
  assert.ok(result.includes(notes));
  assert.ok(result.includes("Lecture 4.pdf"));
  assert.ok(result.startsWith("Help me understand"));
});

test("empty input and combined over-limit material fail without silently truncating notes", () => {
  assert.throws(() => composeLearningInput("  ", []), /Add a question/);
  assert.throws(() => composeLearningInput("Explain gravity", [{ name: "notes.txt", text: "" }]), /no readable text/);
  assert.throws(() => composeLearningInput("Explain gravity", [{ name: "notes.txt", text: "x".repeat(MAX_LEARNING_TEXT) }]), /40,000/);
  assert.equal(composeLearningInput("  Explain gravity  ", []), "Explain gravity");
});
