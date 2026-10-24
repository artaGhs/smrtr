import type { Lesson, TeachingPlan } from "../contracts";

/** Teaching order is independent of prerequisites and the relationship layout. */
export function getTeachingPlan(lesson: Lesson): TeachingPlan {
  const known = new Set(lesson.concepts.map((c) => c.id));
  const authored = lesson.teachingPlan;
  if (
    authored &&
    authored.sequence.length === known.size &&
    new Set(authored.sequence.map((s) => s.conceptId)).size === known.size &&
    authored.sequence.every((s) => known.has(s.conceptId))
  )
    return authored;
  const activity = lesson.modules.find(
    (module) => module.activity.kind === "bfs",
  );
  const first = activity?.conceptId ?? lesson.path[0] ?? lesson.concepts[0].id;
  const order = [
    ...new Set([first, ...lesson.path, ...lesson.concepts.map((c) => c.id)]),
  ].filter((id) => known.has(id));
  return {
    openingQuestion: activity
      ? "How would you find a route, one stop at a time?"
      : `What does ${lesson.concepts.find((c) => c.id === first)?.title.toLowerCase()} look like in practice?`,
    bigPicture: activity
      ? "Start with the network. Make a prediction, then uncover the rules that make the search work."
      : lesson.summary,
    sequence: order.map((conceptId, index) => ({
      conceptId,
      approach:
        index === 0
          ? "example"
          : index === order.length - 1
            ? "practice"
            : "visual",
      purpose:
        lesson.concepts.find((c) => c.id === conceptId)?.objective ??
        "Explore this idea.",
    })),
  };
}
export function getTeachingSequence(lesson: Lesson) {
  return getTeachingPlan(lesson).sequence;
}
