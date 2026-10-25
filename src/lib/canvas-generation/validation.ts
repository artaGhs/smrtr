import type { Lesson } from "../contracts";
import { validateBfs, validateLesson } from "../server/validation";
import { CanvasOutlineSchema, CanvasUnitSchema, type CanvasOutline, type CanvasUnit } from "./contracts";

export function assembledLesson(outline: CanvasOutline, units: CanvasUnit[], text: string): Lesson {
  const ordered = outline.teachingPlan.sequence.flatMap((step) => units.filter((unit) => unit.module.conceptId === step.conceptId).map((unit) => unit.module));
  return { id: "canvas-lesson", revision: "canvas-draft", mode: "generated", title: outline.title, summary: outline.summary,
    sources: [{ id: "source-input", title: "Your submitted notes or topic", text }],
    concepts: outline.concepts.map(({ parentId: _parent, connection: _connection, ...concept }) => concept),
    relations: outline.relations, path: outline.path, teachingPlan: outline.teachingPlan, modules: ordered,
    finalQuestions: ordered.flatMap((module) => module.questions.slice(0, 1).map((question) => ({ ...question, id: `final-${question.id}` }))).slice(0, 5),
  };
}
export function validateOutline(value: unknown, text: string): CanvasOutline {
  const outline = CanvasOutlineSchema.parse(value);
  if (JSON.stringify(outline).length > 40000) throw new Error("The outline must remain compact.");
  validateLesson(assembledLesson(outline, [], text), text, true);
  const byId = new Map(outline.concepts.map((concept) => [concept.id, concept]));
  for (const concept of outline.concepts) {
    const seen = new Set([concept.id]);
    let parent = concept.parentId;
    while (parent) {
      if (!byId.has(parent) || seen.has(parent)) throw new Error("The outline has an unknown or cyclic parent.");
      seen.add(parent); parent = byId.get(parent)!.parentId;
    }
  }
  const { activity, activityConceptId } = outline.scenario;
  if ((activity === null) !== (activityConceptId === null) || (activityConceptId && !byId.has(activityConceptId))) throw new Error("The scenario needs an existing matching activity concept.");
  if (activity?.kind === "bfs") {
    validateBfs(activity);
    if (!/\bbfs\b|breadth[\s-]*first/i.test(text)) throw new Error("BFS requires BFS study material.");
  }
  if (/https?:\/\//i.test(JSON.stringify(outline))) throw new Error("Generated outline cannot invent external links.");
  return outline;
}
export function validateUnit(value: unknown, outline: CanvasOutline, committed: CanvasUnit[], text: string, allowDemonstration = false): CanvasUnit {
  const unit = CanvasUnitSchema.parse(value);
  const module = unit.module;
  if (module.id !== `module-${module.conceptId}` || !outline.concepts.some((concept) => concept.id === module.conceptId)) throw new Error("The unit does not match its outline concept.");
  if (committed.some((item) => item.module.conceptId === module.conceptId)) throw new Error("A committed unit cannot be overwritten.");
  const detailIds = unit.details.map((detail) => detail.id);
  const committedDetails = new Set(committed.flatMap((item) => item.details.map((detail) => detail.id)));
  if (new Set(detailIds).size !== detailIds.length || detailIds.some((id) => !id.startsWith(`${module.conceptId}-`) || committedDetails.has(id))) throw new Error("Detail IDs must be globally unique and prefixed with their concept ID.");
  if (unit.demonstration && !allowDemonstration) throw new Error("Sorting demonstrations are only available in the labeled curated simulation.");
  if (outline.scenario.activityConceptId === module.conceptId && JSON.stringify(module.activity) !== JSON.stringify(outline.scenario.activity)) throw new Error("The activity must retain the canonical scenario inputs.");
  if (module.activity.kind === "bfs" && outline.scenario.activityConceptId !== module.conceptId) throw new Error("BFS must use the canonical activity concept.");
  validateLesson(assembledLesson(outline, [...committed, unit], text), text, true);
  if (JSON.stringify(unit).length > 50000 || /https?:\/\//i.test(JSON.stringify(unit))) throw new Error("The unit is too large or contains unverified links.");
  return unit;
}
export function validateComplete(outline: CanvasOutline, units: CanvasUnit[], text: string) {
  validateOutline(outline, text);
  const checked: CanvasUnit[] = [];
  for (const unit of units) checked.push(validateUnit(unit, outline, checked, text, true));
  return validateLesson(assembledLesson(outline, checked, text), text);
}
