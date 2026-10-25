"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { StudyWorkspace } from "@/components/presentation/StudyWorkspace";
import { useStudySession } from "@/lib/session/use-study-session";
import { readSession } from "@/lib/session/storage";
import styles from "@/components/landing/landing.module.css";

export default function StudyPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    const linked = new URLSearchParams(window.location.search).has("request");
    let hasLesson = false;
    try { hasLesson = readSession(localStorage)?.lesson.mode === "generated"; } catch {}
    if (linked || hasLesson) setAllowed(true);
    else router.replace("/#learn");
  }, [router]);
  return allowed ? <ExistingStudy onNewLesson={() => router.push("/#learn")} /> : <div className={styles.openingLesson} role="status">Opening your learning space…</div>;
}

function ExistingStudy({ onNewLesson }: { onNewLesson: () => void }) {
  const session = useStudySession();
  // Loading and failed lesson links must never expose the unrelated preset lesson.
  if (session.lesson.mode === "sample") return <div className={styles.openingLesson}><div role={session.error ? "alert" : "status"}>{session.error ?? "Opening your visual lesson…"}</div><Link href="/#learn">Back to your question</Link></div>;
  return <StudyWorkspace {...session} onNewLesson={onNewLesson} />;
}
