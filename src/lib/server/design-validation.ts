import type { BfsActivity, Lesson } from "../contracts";
import { normalizeLearnerProfile } from "./learner-profile";
import { SOURCE_ID } from "./schemas";

export function validateLearningDesign(lesson: Lesson, check: (condition: boolean, message: string) => void, partial: boolean, validateBfs: (activity: BfsActivity) => void) {
  if (lesson.learnerProfile) {
    try { normalizeLearnerProfile(lesson.learnerProfile); }
    catch { check(false, "learner profile must have unique topic IDs and valid confidence levels"); }
  }
  const design = lesson.learningDesign;
  if (!design) return;
  const useful = (text: string, min = 1, max = 2500) => text.trim().length >= min && text.length <= max;
  const unique = (ids: string[]) => new Set(ids).size === ids.length;
  const concepts = new Set(lesson.concepts.map((concept) => concept.id));
  const topics = new Set(lesson.learnerProfile?.topics.map((topic) => topic.id) ?? []);
  check(useful(design.centralQuestion, 12, 600) && useful(design.objective, 12, 1200), "learning design needs a concrete central question and objective");
  check(design.assumedKnowledge.length <= 12 && design.assumedKnowledge.every((text) => useful(text, 1, 400)), "assumed knowledge must be explicit and bounded");
  check(useful(design.scenario.id, 1, 120) && useful(design.scenario.title, 1, 180) && useful(design.scenario.description, 24, 4000), "one continuing scenario needs a useful identity, title and description");
  check(design.scenario.entities.length >= 1 && design.scenario.entities.length <= 12 && unique(design.scenario.entities.map((entity) => entity.id)) && design.scenario.entities.every((entity) => useful(entity.id, 1, 120) && useful(entity.label, 1, 120) && useful(entity.role, 1, 600)), "scenario entities need unique IDs, labels and roles");
  const canonical = design.scenario.activity;
  const canonicalConcept = design.scenario.activityConceptId;
  const transferConcepts = new Set(design.pages.filter((page) => page.kind === "transfer").flatMap((page) => page.activityConceptId ? [page.activityConceptId] : []));
  check((canonical === null) === (canonicalConcept === null), "scenario activity and activityConceptId must both be null or both present");
  if (canonicalConcept !== null) check(concepts.has(canonicalConcept), "scenario activity references an unknown concept");
  if (canonical?.kind === "bfs") {
    try { validateBfs(canonical); } catch { check(false, "canonical scenario BFS inputs are invalid"); }
    const entityIds = new Set(design.scenario.entities.map((entity) => entity.id));
    check(canonical.nodes.every((id) => entityIds.has(id)), "scenario BFS nodes must use the continuing scenario entity IDs");
  }
  if (canonical && canonicalConcept) {
    const module = lesson.modules.find((item) => item.conceptId === canonicalConcept);
    if (!partial || module) check(!!module && JSON.stringify(module.activity) === JSON.stringify(canonical), "scenario activity must exactly match its canonical module activity");
    lesson.modules.filter((item) => item.activity.kind === "bfs" && !transferConcepts.has(item.conceptId)).forEach((item) => check(JSON.stringify(item.activity) === JSON.stringify(canonical), "core and support BFS modules must reuse the canonical scenario graph"));
  }
  lesson.modules.filter((item) => item.activity.kind === "bfs" && !transferConcepts.has(item.conceptId)).forEach((item) => check(canonical?.kind === "bfs" && JSON.stringify(item.activity) === JSON.stringify(canonical), "core BFS activity requires the exact canonical scenario graph"));
  const pages = new Map(design.pages.map((page) => [page.id, page]));
  check(design.pages.length <= 18 && pages.size === design.pages.length, "learning pages need unique IDs and at most eighteen pages");
  const roots = design.pages.filter((page) => page.parentId === null);
  check(roots.length === 1 && roots[0].kind === "overview", "page hierarchy needs one overview root");
  const blockIds = design.pages.flatMap((page) => page.blocks.map((block) => block.id));
  check(unique(blockIds), "page block IDs must be globally unique for exact return context");
  const coveredConcepts = new Set<string>();
  for (const page of design.pages) {
    check([page.id, page.title, page.question, page.purpose].every((text) => useful(text, 1, 1000)), "page identity, question and purpose must be nonempty and bounded");
    check(page.parentId === null || pages.has(page.parentId), "page parent must exist");
    const ancestors = new Set([page.id]);
    let parent = page.parentId;
    while (parent !== null && pages.has(parent)) {
      if (ancestors.has(parent)) { check(false, "page containment hierarchy must be acyclic"); break; }
      ancestors.add(parent); parent = pages.get(parent)!.parentId;
    }
    check(unique(page.conceptIds) && page.conceptIds.every((id) => concepts.has(id)), "page concept references must exist and be unique");
    page.conceptIds.forEach((id) => coveredConcepts.add(id));
    check(page.sourceIds.length === 1 && page.sourceIds[0] === SOURCE_ID, "page sources must reference source-input");
    check(unique(page.topicIds) && page.topicIds.every((id) => topics.has(id)), "page topic references must use immutable learner profile topic IDs");
    check(page.activityConceptId === null || (concepts.has(page.activityConceptId) && (page.activityConceptId === canonicalConcept || page.kind === "transfer")), "core and support page activities must reference the continuing scenario activity concept");
    if (["queue", "discovery", "route"].includes(page.scene)) {
      const activity = page.kind === "transfer" ? lesson.modules.find((module) => module.conceptId === page.activityConceptId)?.activity : canonical;
      check(page.activityConceptId !== null && (activity?.kind === "bfs" || (partial && page.kind === "transfer" && concepts.has(page.activityConceptId))), "algorithm scenes need a validated BFS activity; alternate graphs belong only to transfer pages");
    }
    check(page.recommendedNextPageId === null || (pages.has(page.recommendedNextPageId) && page.recommendedNextPageId !== page.id), "recommended next page must exist and differ from current page");
    check(page.blocks.length <= 8, "page prose is limited to eight blocks");
    for (const block of page.blocks) {
      check(useful(block.id, 1, 150) && block.segments.length <= 16, "page blocks need stable IDs and bounded segments");
      for (const segment of block.segments) {
        check(useful(segment.text, 1, 1800), "page segments must contain bounded explanatory prose");
        if (segment.kind === "page-link") check(pages.has(segment.pageId) && segment.pageId !== page.id && useful(segment.reason, 12, 600), "page links need a different existing target and an explanatory reason");
      }
    }
  }
  check([...concepts].every((id) => coveredConcepts.has(id)), "learning pages must cover every concept");
  const main = design.pages.filter((page) => page.kind !== "support").map((page) => page.id);
  const sequence = design.sequence.map((step) => step.pageId);
  check(unique(sequence) && sequence.length === main.length && main.every((id) => sequence.includes(id)), "main teaching sequence must include every non-support page once and exclude support pages");
  check(design.sequence.every((step) => useful(step.purpose, 12, 1000) && useful(step.whyNext, 12, 1000)), "main teaching transitions need specific purpose and why-next explanations");
  for (const route of Object.values(design.routes)) check(unique(route) && route.length <= 18 && route.every((id) => pages.has(id) && pages.get(id)!.kind !== "support"), "confidence routes must contain unique existing main pages only");
  check(design.routes.new.length === main.length && main.every((id) => design.routes.new.includes(id)), "novice route must preserve the complete main progression");
  if (main.length >= 3) check(JSON.stringify(design.routes.new) !== JSON.stringify(design.routes.apply), "novice and apply routes must differ substantively rather than relabel the same tour");
}
