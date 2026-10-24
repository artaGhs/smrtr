"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type Attempt,
  type Evaluation,
  type GenerationStatus,
  type Lesson,
  type Question,
  type StudyWorkspaceProps,
} from "../contracts";
import { sampleLesson, SAMPLE_INPUT } from "../fixtures/sample-lesson";
import { generateLesson } from "./generate-lesson";
import { RequestGate } from "./request-gate";
import { readSession, saveSession } from "./storage";
export function useStudySession(): StudyWorkspaceProps {
  const [lesson, setLesson] = useState(sampleLesson);
  const [selectedConceptId, onSelectConcept] = useState(sampleLesson.path[0]);
  const [input, setInput] = useState(SAMPLE_INPUT);
  const [status, setStatus] = useState<GenerationStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [restored, setRestored] = useState(false);
  const gate = useRef(new RequestGate());
  const lastCompleteLesson = useRef<Lesson>(sampleLesson);
  const onCancel = useCallback(() => {
    gate.current.cancel();
    setLesson(lastCompleteLesson.current);
    onSelectConcept((current) =>
      lastCompleteLesson.current.concepts.some((c) => c.id === current)
        ? current
        : (lastCompleteLesson.current.path[0] ??
          lastCompleteLesson.current.concepts[0].id),
    );
    setStatus("idle");
  }, []);
  useEffect(() => {
    let saved = null;
    try {
      saved = readSession(localStorage);
    } catch {
      /* Browser storage may be disabled. */
    }
    if (saved) {
      lastCompleteLesson.current = saved.lesson;
      setLesson(saved.lesson);
      setInput(saved.input);
      setAttempts(saved.attempts);
      onSelectConcept(
        saved.lesson.concepts.some((c) => c.id === saved.selectedConceptId)
          ? saved.selectedConceptId
          : saved.lesson.concepts[0].id,
      );
    }
    setRestored(true);
    return () => gate.current.cancel();
  }, []);
  useEffect(() => {
    if (restored) {
      try {
        saveSession(localStorage, {
          lesson: lastCompleteLesson.current,
          input,
          selectedConceptId,
          attempts,
        });
      } catch {
        /* Keep the session usable if storage is disabled. */
      }
    }
  }, [restored, lesson, input, selectedConceptId, attempts]);
  const onInputChange = (value: string) => {
    onCancel();
    setInput(value);
    setError(null);
  };
  const onGenerate = async () => {
    const requestId = crypto.randomUUID();
    const signal = gate.current.begin(requestId);
    setStatus("generating");
    setError(null);
    let planShown = false;
    try {
      const result = await generateLesson(
        { requestId, text: input },
        signal,
        (partial) => {
          if (!gate.current.isCurrent(requestId)) return;
          setLesson(partial);
          if (!planShown) {
            onSelectConcept(partial.path[0] ?? partial.concepts[0].id);
            planShown = true;
          }
        },
      );
      if (!gate.current.isCurrent(requestId)) return;
      lastCompleteLesson.current = result;
      setLesson(result);
      if (!planShown) onSelectConcept(result.path[0] ?? result.concepts[0].id);
      setStatus("ready");
      gate.current.finish(requestId);
    } catch (cause) {
      if (!gate.current.isCurrent(requestId) || signal.aborted) return;
      setLesson(lastCompleteLesson.current);
      onSelectConcept((current) =>
        lastCompleteLesson.current.concepts.some((c) => c.id === current)
          ? current
          : (lastCompleteLesson.current.path[0] ??
            lastCompleteLesson.current.concepts[0].id),
      );
      setError(cause instanceof Error ? cause.message : "Generation failed.");
      setStatus("error");
      gate.current.finish(requestId);
    }
  };
  const onAnswer = (
    question: Question,
    selectedOptionIds: string[],
    evaluation: Evaluation,
  ) =>
    setAttempts((previous) =>
      [
        ...previous,
        {
          id: crypto.randomUUID(),
          lessonId: lesson.id,
          revision: lesson.revision,
          questionId: question.id,
          conceptIds: question.conceptIds,
          selectedOptionIds,
          correct: evaluation.correct,
          createdAt: new Date().toISOString(),
        },
      ].slice(-1000),
    );
  return {
    lesson,
    selectedConceptId,
    onSelectConcept,
    input,
    onInputChange,
    onGenerate,
    onCancel,
    status,
    error,
    attempts,
    onAnswer,
    onLoadSample: () => {
      onCancel();
      lastCompleteLesson.current = sampleLesson;
      setLesson(sampleLesson);
      onSelectConcept(sampleLesson.path[0]);
      setInput(SAMPLE_INPUT);
      setError(null);
    },
  };
}
