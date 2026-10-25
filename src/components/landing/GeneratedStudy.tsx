"use client";

import type { Lesson } from "@/lib/contracts";
import { useStudySession } from "@/lib/session/use-study-session";
import { StudyWorkspace } from "@/components/presentation/StudyWorkspace";

export default function GeneratedStudy({ lesson, input, onNewLesson }: { lesson: Lesson; input: string; onNewLesson: () => void }) {
  const session = useStudySession({ lesson, input });
  return <StudyWorkspace {...session} onNewLesson={onNewLesson} />;
}
