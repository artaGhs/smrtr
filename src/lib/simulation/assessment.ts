import type { Evaluation, Question } from "../contracts";

/** Multiple-answer questions require the entire correct set, with no extra choices. */
export function evaluateQuestion(question: Question, selectedOptionIds: string[]): Evaluation {
  const selected = new Set(selectedOptionIds);
  const expected = new Set(question.correctOptionIds);
  const validIds = new Set(question.options.map(option => option.id));
  const correct = selected.size > 0 && selected.size === expected.size &&
    [...selected].every(id => validIds.has(id) && expected.has(id));
  return { correct, feedback: question.explanation, reviewConceptIds: correct ? [] : [...question.conceptIds] };
}
