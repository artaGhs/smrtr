"use client";
import { StudyWorkspace } from "@/components/presentation/StudyWorkspace";
import { useStudySession } from "@/lib/session/use-study-session";
export default function Home(){return <StudyWorkspace {...useStudySession()}/>}
