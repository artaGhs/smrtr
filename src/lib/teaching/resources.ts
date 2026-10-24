import type { Lesson } from "../contracts";

export type VerifiedLearningResource = {
  title: string;
  publisher: string;
  url: string;
  verificationUrl: string;
  kind: "video";
};

/** Curated further learning, kept separate from the learner's original sources.
 * The MIT course page links the exact YouTube video; no timestamps/transcript assumed.
 * Verified 2026-10-24 against the publisher page.
 */
export function getVerifiedResources(
  lesson: Lesson,
  conceptId: string,
): VerifiedLearningResource[] {
  const module = lesson.modules.find((item) => item.conceptId === conceptId);
  if (module?.activity.kind !== "bfs") return [];
  return [
    {
      title: "Breadth-first search · MIT 6.006, Lecture 13",
      publisher: "MIT OpenCourseWare",
      url: "https://www.youtube.com/watch?v=s-CYnVz-uh4",
      verificationUrl:
        "https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/resources/lecture-13-breadth-first-search-bfs/",
      kind: "video",
    },
  ];
}
