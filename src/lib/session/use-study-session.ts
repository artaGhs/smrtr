"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_LEARNER_PROFILE,
  type LearnerProfile,
  type Attempt,
  type ChatRequest,
  type Evaluation,
  type GenerationMode,
  type GenerationStatus,
  type Lesson,
  type Question,
  type StudyWorkspaceProps,
} from "../contracts";
import { getTeachingSequence } from "../teaching/sequence";
import { sampleLesson, SAMPLE_INPUT } from "../fixtures/sample-lesson";
import { generateLesson } from "./generate-lesson";
import { useLearningNavigation } from "../learning/use-learning-navigation";
import { RequestGate } from "./request-gate";
import { readSession, saveSession } from "./storage";
import {
  cancelChatRequest,
  copyChatRequest,
  createChatRequest,
  getChatRequest,
  importChatLesson,
  waitForChatLesson,
} from "./chat-bridge";

export function useStudySession(): StudyWorkspaceProps {
  const [learnerProfile, setLearnerProfile] = useState<LearnerProfile>(
    DEFAULT_LEARNER_PROFILE,
  );
  const [lesson, setLesson] = useState(sampleLesson);
  const learning = useLearningNavigation(lesson);
  const [selectedConceptId, onSelectConcept] = useState(
    getTeachingSequence(sampleLesson)[0].conceptId,
  );
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<GenerationStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [generationMode, setGenerationMode] = useState<GenerationMode>("chat");
  const [chatRequest, setChatRequest] = useState<ChatRequest | null>(null);
  const [restored, setRestored] = useState(false);
  const gate = useRef(new RequestGate());
  const lastCompleteLesson = useRef<Lesson>(sampleLesson);
  const pendingChat = useRef<string | null>(null);
  const restoreCompleted = useCallback(() => {
    setLesson(lastCompleteLesson.current);
    onSelectConcept((current) =>
      lastCompleteLesson.current.concepts.some((c) => c.id === current)
        ? current
        : (lastCompleteLesson.current.path[0] ??
          lastCompleteLesson.current.concepts[0].id),
    );
  }, []);
  const onCancel = useCallback(() => {
    gate.current.cancel();
    if (pendingChat.current)
      void cancelChatRequest(pendingChat.current).catch(() => undefined);
    pendingChat.current = null;
    const url = new URL(window.location.href);
    url.searchParams.delete("request");
    window.history.replaceState(null, "", url);
    setChatRequest(null);
    restoreCompleted();
    setStatus("idle");
  }, [restoreCompleted]);
  const applyCompleted = (result: Lesson) => {
    if (result.learnerProfile) setLearnerProfile(result.learnerProfile);
    lastCompleteLesson.current = result;
    setLesson(result);
    onSelectConcept(getTeachingSequence(result)[0].conceptId);
    setInput(result.sources[0]?.text ?? input);
    setStatus("ready");
  };
  async function executeChat(existingId?: string) {
    const id = crypto.randomUUID();
    const signal = gate.current.begin(id);
    setStatus("generating");
    setError(null);
    try {
      const request = existingId
        ? await getChatRequest(existingId, signal)
        : await createChatRequest(
            id,
            input,
            signal,
            structuredClone(learnerProfile),
          );
      if (!gate.current.isCurrent(id)) {
        if (!existingId)
          void cancelChatRequest(request.id).catch(() => undefined);
        return;
      }
      if (request.learnerProfile) setLearnerProfile(request.learnerProfile);
      pendingChat.current = request.status === "waiting" ? request.id : null;
      setChatRequest(request);
      const url = new URL(window.location.href);
      url.searchParams.set("request", request.id);
      window.history.replaceState(null, "", url);
      const result = await waitForChatLesson(request, signal, (update) => {
        if (gate.current.isCurrent(id)) setChatRequest(update);
      });
      if (!gate.current.isCurrent(id)) return;
      pendingChat.current = null;
      applyCompleted(result);
      gate.current.finish(id);
    } catch (cause) {
      if (!gate.current.isCurrent(id) || signal.aborted) return;
      pendingChat.current = null;
      restoreCompleted();
      setError(
        cause instanceof Error ? cause.message : "Chat connection failed.",
      );
      setStatus("error");
      gate.current.finish(id);
    }
  }
  useEffect(() => {
    let saved = null;
    try {
      saved = readSession(localStorage);
    } catch {}
    const linkedRequestId = new URLSearchParams(window.location.search).get(
      "request",
    );
    if (saved) {
      lastCompleteLesson.current = saved.lesson;
      setLesson(saved.lesson);
      setInput(saved.input);
      setAttempts(saved.attempts);
      setGenerationMode(saved.generationMode ?? "chat");
      setLearnerProfile(
        saved.learnerProfile ??
          saved.lesson.learnerProfile ??
          DEFAULT_LEARNER_PROFILE,
      );
      onSelectConcept(
        saved.lesson.concepts.some((c) => c.id === saved.selectedConceptId)
          ? saved.selectedConceptId
          : saved.lesson.concepts[0].id,
      );
      if (!linkedRequestId && saved.chatRequestId)
        void executeChat(saved.chatRequestId);
    }
    if (linkedRequestId) {
      setGenerationMode("chat");
      void executeChat(linkedRequestId);
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
          generationMode,
          learnerProfile,
          chatRequestId:
            chatRequest?.status === "waiting" ? chatRequest.id : undefined,
        });
      } catch {}
    }
  }, [
    restored,
    lesson,
    input,
    selectedConceptId,
    attempts,
    generationMode,
    chatRequest,
    learnerProfile,
  ]);
  const onInputChange = (value: string) => {
    onCancel();
    setInput(value);
    setError(null);
  };
  const onGenerate = async () => {
    onCancel();
    if (generationMode === "chat") {
      await executeChat();
      return;
    }
    const requestId = crypto.randomUUID();
    const signal = gate.current.begin(requestId);
    setStatus("generating");
    setError(null);
    let planShown = false;
    try {
      const result = await generateLesson(
        {
          requestId,
          text: input,
          learnerProfile: structuredClone(learnerProfile),
        },
        signal,
        (partial) => {
          if (!gate.current.isCurrent(requestId)) return;
          setLesson(partial);
          if (!planShown) {
            onSelectConcept(getTeachingSequence(partial)[0].conceptId);
            planShown = true;
          }
        },
      );
      if (!gate.current.isCurrent(requestId)) return;
      lastCompleteLesson.current = { ...result, origin: "provider" };
      setLesson(lastCompleteLesson.current);
      if (!planShown) onSelectConcept(getTeachingSequence(result)[0].conceptId);
      setStatus("ready");
      gate.current.finish(requestId);
    } catch (cause) {
      if (!gate.current.isCurrent(requestId) || signal.aborted) return;
      restoreCompleted();
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
    learning,
    learnerProfile,
    onLearnerProfileChange: (profile) => {
      onCancel();
      setLearnerProfile(structuredClone(profile));
      setError(null);
    },
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
    generationMode,
    chatRequest,
    onGenerationModeChange: (mode) => {
      onCancel();
      setGenerationMode(mode);
      setError(null);
    },
    onCopyChatRequest: async () => {
      if (!chatRequest) throw new Error("Create a chat request first.");
      await copyChatRequest(chatRequest.id);
    },
    onImportChatLesson: async (json) => {
      if (!chatRequest || chatRequest.status !== "waiting")
        throw new Error(
          "Create a waiting chat request before importing its lesson.",
        );
      const request = await importChatLesson(chatRequest.id, json);
      // Polling consumes this completion too; the gate still protects newer requests.
      if (pendingChat.current === request.id) setChatRequest(request);
    },
    onLoadSample: () => {
      onCancel();
      lastCompleteLesson.current = sampleLesson;
      setLesson(sampleLesson);
      onSelectConcept(getTeachingSequence(sampleLesson)[0].conceptId);
      setInput(SAMPLE_INPUT);
      setError(null);
    },
  };
}
