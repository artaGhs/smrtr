import { LessonSchema, type Lesson, type BfsActivity, type Question } from "../contracts";
import { GenerationError } from "./errors";
import { SOURCE_ID } from "./schemas";
import { validateLearningDesign } from "./design-validation";

export class LessonValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super("Generated lesson failed validation");
  }
}

export function validateLesson(candidate: unknown, originalText: string, partial = false): Lesson {
  const result = LessonSchema.safeParse(candidate);
  if (!result.success) throw new LessonValidationError(result.error.issues.slice(0, 15).map((issue) => `${issue.path.join(".")}: ${issue.code}`));
  const lesson = result.data;
  const issues: string[] = [];
  const check = (condition: boolean, message: string) => { if (!condition) issues.push(message); };
  const unique = (values: string[], label: string) => check(new Set(values).size === values.length, `${label} must be unique`);
  const present = (value: string) => value.trim().length > 0 && value.length <= 12_000;
  check(lesson.mode === "generated", "mode must be generated");
  check(lesson.sources.length === 1 && lesson.sources[0].id === SOURCE_ID && lesson.sources[0].text === originalText && !lesson.sources[0].locator, "source must exactly preserve submitted input with no invented locator");
  check(lesson.concepts.length <= 7, "at most seven concepts");
  unique([...lesson.concepts, ...lesson.relations, ...lesson.modules, ...lesson.modules.flatMap((m) => m.questions), ...lesson.finalQuestions].map((item) => item.id), "entity IDs");
  const concepts = new Set(lesson.concepts.map((concept) => concept.id));
  validateLearningDesign(lesson, check, partial, validateBfs);
  if (lesson.teachingPlan) {
    const teaching = lesson.teachingPlan;
    const useful = (value: string, min: number, max: number) => value.trim().length >= min && value.length <= max && /\p{L}/u.test(value);
    check(useful(teaching.openingQuestion, 12, 600), "teaching opening question must be meaningful and bounded");
    check(useful(teaching.bigPicture, 24, 1800), "teaching big picture must explain the learning purpose");
    unique(teaching.sequence.map((step) => step.conceptId), "teaching sequence concepts");
    check(teaching.sequence.length === concepts.size && teaching.sequence.every((step) => concepts.has(step.conceptId)), "teaching sequence must include each existing concept exactly once");
    teaching.sequence.forEach((step) => check(useful(step.purpose, 12, 1000), "each teaching step needs a meaningful bounded purpose"));
  }
  const support = (ids: string[]) => ids.length === 1 && ids[0] === SOURCE_ID;
  lesson.concepts.forEach((concept) => {
    check([concept.id, concept.title, concept.summary, concept.objective].every(present), "concept fields must contain useful text");
    check(support(concept.sourceIds), "concept sourceIds must reference source-input");
  });
  unique(lesson.path, "path concepts");
  check(lesson.path.length === concepts.size && lesson.path.every((id) => concepts.has(id)), "path must include each concept exactly once");
  const position = new Map(lesson.path.map((id, index) => [id, index]));
  const links = new Map(lesson.concepts.map((concept) => [concept.id, new Set<string>()]));
  lesson.relations.forEach((relation) => {
    check(concepts.has(relation.source) && concepts.has(relation.target) && relation.source !== relation.target, "relation endpoints must be distinct existing concepts");
    if (lesson.learningDesign) {
      const meaning = relation.meaning?.trim() ?? "";
      const genericLabel = /^(?:(?:prerequisite|related|contrast|example)(?:\s+(?:relation|relationship|connection))?|(?:these\s+)?concepts\s+are\s+(?:related|connected|linked)|related\s+to|depends\s+on|example\s+of|contrast\s+with)[.!]?$/i;
      check(meaning.length >= 12 && (relation.meaning?.length ?? 0) <= 500 && /\p{L}/u.test(meaning) && !genericLabel.test(meaning), "designed lesson relations need explanatory meaning (12–500 characters), not just a relationship label");
    }
    if (relation.type === "prerequisite") check((position.get(relation.source) ?? Infinity) < (position.get(relation.target) ?? -1), "prerequisites must precede their dependents in path");
    links.get(relation.source)?.add(relation.target);
    links.get(relation.target)?.add(relation.source);
  });
  const reached = new Set<string>();
  const visit = (id: string) => { if (reached.has(id)) return; reached.add(id); links.get(id)?.forEach(visit); };
  visit(lesson.concepts[0].id);
  check(reached.size === concepts.size, "concept map must be connected");
  if (!partial) {
    unique(lesson.modules.map((module) => module.conceptId), "module conceptIds");
    check(lesson.modules.length === concepts.size, "each concept needs one module");
    check(lesson.finalQuestions.length >= 1 && lesson.finalQuestions.length <= 5, "final practice needs one to five questions");
  }
  const checkQuestion = (question: Question, moduleConceptId?: string) => {
    check(question.conceptIds.every((id) => concepts.has(id)), "question references unknown concept");
    unique(question.conceptIds, "question conceptIds");
    if (moduleConceptId) check(question.conceptIds.includes(moduleConceptId), "module question must reference its concept");
    check(question.options.length <= 4, "question needs at most four options");
    unique(question.options.map((option) => option.id), "question option IDs");
    unique(question.options.map((option) => option.text.trim().toLowerCase()), "question option texts");
    unique(question.correctOptionIds, "correct option IDs");
    check(question.correctOptionIds.every((id) => question.options.some((option) => option.id === id)), "correct options must exist");
    check([question.id, question.prompt, question.explanation, ...question.options.flatMap((option) => [option.id, option.text])].every(present), "question fields must be nonempty and bounded");
  };
  lesson.modules.forEach((module) => {
    check(concepts.has(module.conceptId), "module references unknown concept");
    check(support(module.sourceIds), "module sourceIds must reference source-input");
    check([module.id, module.explanation, module.example].every(present), "module content must be nonempty and bounded");
    check(module.questions.length >= 1 && module.questions.length <= 4, "module needs one to four questions");
    if (module.activity.kind === "bfs") {
      check(/\bbfs\b|breadth[\s-]*first/i.test(originalText), "BFS activity requires BFS study input");
      try { validateBfs(module.activity); } catch { issues.push("BFS activity contains invalid graph inputs"); }
    } else {
      check(present(module.activity.prompt) && module.activity.steps.length <= 8 && module.activity.steps.every((step) => present(step.title) && present(step.body)), "concept activity steps must be nonempty and bounded");
    }
    module.questions.forEach((question) => checkQuestion(question, module.conceptId));
  });
  lesson.finalQuestions.forEach((question) => checkQuestion(question));
  // Source text may contain unverified URLs; generated content must not invent links.
  const authored = JSON.stringify({ concepts: lesson.concepts, modules: lesson.modules, finalQuestions: lesson.finalQuestions, title: lesson.title, summary: lesson.summary, teachingPlan: lesson.teachingPlan, learningDesign: lesson.learningDesign });
  check(!/https?:\/\//i.test(authored), "generated content must not introduce unverified URLs");
  if (issues.length) throw new LessonValidationError(issues.slice(0, 15));
  return lesson;
}

export function validateBfs(activity: BfsActivity): void {
  const nodes = new Set(activity.nodes);
  if (nodes.size !== activity.nodes.length || nodes.size < 2 || nodes.size > 10 || !nodes.has(activity.start) || activity.nodes.some((id) => !/^[A-Za-z0-9_-]{1,12}$/.test(id)) || activity.edges.length > 24 || activity.edges.some((edge) => !nodes.has(edge.source) || !nodes.has(edge.target))) {
    throw new GenerationError("INVALID_ACTIVITY", "The generated BFS graph is invalid.");
  }
  const edgeKeys = activity.edges.map((edge) => activity.directed ? `${edge.source}:${edge.target}` : [edge.source, edge.target].sort().join(":"));
  if (new Set(edgeKeys).size !== edgeKeys.length) throw new GenerationError("INVALID_ACTIVITY", "The generated BFS graph has duplicate edges.");
}
