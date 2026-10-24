import { DEFAULT_LEARNER_PROFILE, LearnerProfileSchema, type ConfidenceLevel, type LearnerProfile, type Lesson } from "../contracts";
import { GenerationError } from "./errors";

export function normalizeLearnerProfile(value: unknown): LearnerProfile {
  const result = LearnerProfileSchema.safeParse(value ?? DEFAULT_LEARNER_PROFILE);
  if (!result.success || new Set(result.data.topics.map((topic) => topic.id)).size !== result.data.topics.length) throw new GenerationError("INVALID_LEARNER_PROFILE", "Choose one confidence level and use unique stable topic IDs for overrides.", 400);
  return result.data;
}

export const CONFIDENCE_GUIDANCE: Record<ConfidenceLevel, string> = {
  new: "Assume no topic knowledge. Begin with the continuing concrete situation in everyday language, show one small prediction at a time, define needed terms in context, and link basic support pages before requiring abstractions.",
  recognize: "The learner recognizes terms but needs a coherent mechanism. Briefly orient them in the continuing situation, ask what happens next, explain connections and common confusions, and make detailed prerequisite support optional.",
  explain: "The learner reports being able to explain the topic. Avoid repeating introductory definitions; focus on why the mechanism works, invariants, counterexamples and limits in the continuing situation, then use a focused explanation or transfer challenge.",
  apply: "The learner reports being able to apply the topic. Start with a transfer or decision challenge, test assumptions and tradeoffs, use a concise route, and offer mechanisms and basic definitions as optional linked support rather than forcing a novice tour.",
};

export function conceptLearnerContext(lesson: Lesson, conceptId: string) {
  const profile = normalizeLearnerProfile(lesson.learnerProfile);
  const pages = lesson.learningDesign?.pages.filter((page) => page.conceptIds.includes(conceptId)) ?? [];
  const topicIds = new Set(pages.flatMap((page) => page.topicIds));
  const topics = profile.topics.filter((topic) => topicIds.has(topic.id)).map((topic) => ({ ...topic, effectiveLevel: topic.level ?? profile.overall }));
  const order: ConfidenceLevel[] = ["new", "recognize", "explain", "apply"];
  const effectiveLevel = topics.length ? topics.map((topic) => topic.effectiveLevel).sort((a, b) => order.indexOf(a) - order.indexOf(b))[0] : profile.overall;
  return { profile, topics, effectiveLevel, guidance: CONFIDENCE_GUIDANCE[effectiveLevel], pages, selectedRoute: lesson.learningDesign?.routes[profile.overall] ?? [] };
}
