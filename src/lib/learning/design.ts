import {
  DEFAULT_LEARNER_PROFILE,
  type ConfidenceLevel,
  type LearnerProfile,
  type LearningDesign,
  type Lesson,
  type PageScene,
} from "../contracts";
import { getTeachingPlan } from "../teaching/sequence";

export const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  new: "New to this",
  recognize: "Recognize terms",
  explain: "Can explain basics",
  apply: "Can apply",
};
export function effectiveConfidence(
  profile: LearnerProfile,
  topicIds: string[] = [],
): ConfidenceLevel {
  const levels: ConfidenceLevel[] = ["new", "recognize", "explain", "apply"];
  const overrides = profile.topics
    .filter((topic) => topicIds.includes(topic.id) && topic.level !== null)
    .map((topic) => topic.level!);
  return overrides.length
    ? levels[Math.min(...overrides.map((level) => levels.indexOf(level)))]
    : profile.overall;
}
function sceneFor(title: string, bfs: boolean): PageScene {
  if (!bfs) return "explanation";
  if (/queue|fifo|frontier/i.test(title)) return "queue";
  if (/visited|discover|repeat/i.test(title)) return "discovery";
  if (/path|route|shortest|guarantee/i.test(title)) return "route";
  if (/layers?|distance/i.test(title)) return "layers";
  return "scenario";
}
/** Old lessons are arranged into pages, explicitly identified as a compatibility view. */
export function normalizeLearningDesign(lesson: Lesson): {
  design: LearningDesign;
  provenance: "authored" | "legacy";
} {
  if (lesson.learningDesign)
    return { design: lesson.learningDesign, provenance: "authored" };
  const teaching = getTeachingPlan(lesson);
  const bfs = lesson.modules.find((module) => module.activity.kind === "bfs");
  const activity = bfs?.activity.kind === "bfs" ? bfs.activity : null;
  const rootId = "lesson-overview";
  const sequence = teaching.sequence.map((step) => ({
    pageId: `page-${step.conceptId}`,
    purpose: step.purpose,
    whyNext:
      "The next page introduces another idea used in this lesson. This is a compatibility sequence from existing content.",
  }));
  const pages: LearningDesign["pages"] = [
    {
      id: rootId,
      title: lesson.title,
      question: teaching.openingQuestion,
      purpose: lesson.summary,
      kind: "overview",
      parentId: null,
      conceptIds: lesson.concepts.map((concept) => concept.id),
      sourceIds: lesson.sources.map((source) => source.id),
      topicIds: [],
      blocks: [
        {
          id: "overview-context",
          kind: "paragraph",
          segments: [{ kind: "text", text: teaching.bigPicture }],
        },
        {
          id: "overview-start",
          kind: "callout",
          segments: [
            {
              kind: "text",
              text: "This older lesson has been arranged into navigable pages. Its original explanations are preserved; a new hierarchical teaching plan was not generated.",
            },
            {
              kind: "page-link",
              text: "Open the first example",
              pageId: sequence[0].pageId,
              reason: "Start exploring the existing lesson.",
            },
          ],
        },
      ],
      scene: activity ? "scenario" : "explanation",
      activityConceptId: bfs?.conceptId ?? null,
      recommendedNextPageId: sequence[0].pageId,
    },
  ];
  for (const [index, step] of teaching.sequence.entries()) {
    const concept = lesson.concepts.find((item) => item.id === step.conceptId)!;
    const module = lesson.modules.find((item) => item.conceptId === concept.id);
    const next = sequence[index + 1]?.pageId ?? null;
    const segments: LearningDesign["pages"][number]["blocks"][number]["segments"] =
      [{ kind: "text", text: module?.explanation ?? concept.summary }];
    for (const relation of lesson.relations.filter(
      (relation) =>
        relation.source === concept.id || relation.target === concept.id,
    )) {
      const otherId =
        relation.source === concept.id ? relation.target : relation.source;
      const other = lesson.concepts.find((item) => item.id === otherId);
      if (other)
        segments.push({
          kind: "page-link",
          text: other.title,
          pageId: `page-${otherId}`,
          reason:
            relation.meaning ??
            `Explore the ${relation.type} connection described by the original lesson.`,
        });
    }
    const blocks: LearningDesign["pages"][number]["blocks"] = [
      { id: `body-${concept.id}`, kind: "paragraph", segments },
    ];
    if (module?.activity.kind === "concept") {
      for (const [number, detail] of module.activity.steps.entries()) {
        const id = `detail-${concept.id}-${number}`;
        blocks.push({
          id: `link-${id}`,
          kind: "paragraph",
          segments: [
            {
              kind: "page-link",
              text: detail.title,
              pageId: id,
              reason:
                "Open this supporting explanation without leaving your place.",
            },
          ],
        });
        pages.push({
          id,
          title: detail.title,
          question: `How does ${detail.title.toLowerCase()} fit this idea?`,
          purpose: concept.objective,
          kind: "support",
          parentId: `page-${concept.id}`,
          conceptIds: [concept.id],
          sourceIds: module.sourceIds,
          topicIds: [],
          blocks: [
            {
              id: `text-${id}`,
              kind: "paragraph",
              segments: [{ kind: "text", text: detail.body }],
            },
          ],
          scene: sceneFor(concept.title, !!activity),
          activityConceptId: bfs?.conceptId ?? null,
          recommendedNextPageId: next,
        });
      }
    }
    pages.push({
      id: `page-${concept.id}`,
      title: concept.title,
      question: concept.objective,
      purpose: step.purpose,
      kind: "core",
      parentId: rootId,
      conceptIds: [concept.id],
      sourceIds: concept.sourceIds,
      topicIds: [],
      blocks,
      scene:
        module?.activity.kind === "bfs"
          ? "scenario"
          : sceneFor(concept.title, !!activity),
      activityConceptId:
        module?.activity.kind === "bfs"
          ? module.conceptId
          : (bfs?.conceptId ?? null),
      recommendedNextPageId: next,
    });
  }
  const core = sequence.map((step) => step.pageId);
  return {
    provenance: "legacy",
    design: {
      centralQuestion: teaching.openingQuestion,
      objective: lesson.summary,
      assumedKnowledge: [],
      scenario: {
        id: "existing-example",
        title: "Existing lesson example",
        description: activity
          ? "This view reuses the original lesson graph and its stable node IDs."
          : lesson.summary,
        entities:
          activity?.nodes.map((id) => ({
            id,
            label: id,
            role: id === activity.start ? "starting point" : "network stop",
          })) ?? [],
        activityConceptId: bfs?.conceptId ?? null,
        activity,
      },
      pages,
      sequence: [
        {
          pageId: rootId,
          purpose: lesson.summary,
          whyNext:
            "See the original example before exploring its supporting ideas.",
        },
        ...sequence,
      ],
      routes: {
        new: [rootId, ...core],
        recognize: core,
        explain: core.slice(Math.max(0, core.length - 2)),
        apply: core.slice(-1),
      },
    },
  };
}
export function coreRoute(
  design: LearningDesign,
  profile: LearnerProfile = DEFAULT_LEARNER_PROFILE,
) {
  const ids = design.routes[profile.overall];
  return ids.flatMap((id) => {
    const page = design.pages.find((item) => item.id === id);
    return page ? [page] : [];
  });
}
export function pageSceneIndex(
  lesson: Lesson,
  pageId: string,
  design: LearningDesign,
) {
  const page = design.pages.find((item) => item.id === pageId);
  const conceptId = page?.conceptIds[0] ?? design.scenario.activityConceptId;
  return Math.max(
    0,
    getTeachingPlan(lesson).sequence.findIndex(
      (step) => step.conceptId === conceptId,
    ),
  );
}
export function pageBreadcrumbs(design: LearningDesign, pageId: string) {
  const trail: LearningDesign["pages"] = [];
  const seen = new Set<string>();
  let current = design.pages.find((page) => page.id === pageId);
  while (current && !seen.has(current.id)) {
    trail.unshift(current);
    seen.add(current.id);
    current = design.pages.find((page) => page.id === current?.parentId);
  }
  return trail;
}
