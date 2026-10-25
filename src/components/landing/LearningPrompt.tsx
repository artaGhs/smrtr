"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, FileText, LoaderCircle, Paperclip, X } from "lucide-react";
import { DEFAULT_LEARNER_PROFILE, type Lesson } from "@/lib/contracts";
import { generateLesson } from "@/lib/session/generate-lesson";
import { ATTACHMENT_ACCEPT, MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES, MAX_LEARNING_TEXT, composeLearningInput, type LearningAttachment } from "@/lib/session/learning-input";
import styles from "./landing.module.css";
import { GenerationExperience } from "@/components/generation/GenerationExperience";
import type { GenerationPreview } from "@/lib/session/generation-preview";
import { closeLoader, revealLesson } from "@/lib/session/reveal-lesson";

export function LearningPrompt({ onLessonReady }: { onLessonReady: (lesson: Lesson, input: string) => void }) {
  const [prompt, setPrompt] = useState("");
  const [attachments, setAttachments] = useState<LearningAttachment[]>([]);
  const [reading, setReading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generationInput, setGenerationInput] = useState("");
  const [preview, setPreview] = useState<GenerationPreview | null>(null);
  const [partialLesson, setPartialLesson] = useState<Lesson | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const uploadLock = useRef(false);
  const generation = useRef<AbortController | null>(null);
  const upload = useRef<AbortController | null>(null);
  useEffect(() => () => { generation.current?.abort(); upload.current?.abort(); }, []);
  useEffect(() => {
    const field = textarea.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${field.scrollHeight}px`;
  }, [prompt]);

  async function attachFiles(files: File[]) {
    if (!files.length || uploadLock.current || generating) return;
    if (files.length + attachments.length > MAX_ATTACHMENTS) { setError("Add up to three files at a time."); return; }
    uploadLock.current = true;
    setReading(true);
    setError(null);
    const controller = new AbortController();
    upload.current = controller;
    try {
      for (const file of files) {
        if (file.size > MAX_ATTACHMENT_BYTES) throw new Error("Choose a file smaller than 10 MB.");
        const form = new FormData();
        form.append("file", file);
        const response = await fetch("/api/attachments", { method: "POST", body: form, signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "We couldn’t read that file. Try another document.");
        if (typeof result.text !== "string" || typeof result.name !== "string") throw new Error("We couldn’t read that file. Try again.");
        if (!controller.signal.aborted) setAttachments((previous) => [...previous, { id: crypto.randomUUID(), name: result.name, text: result.text }]);
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "We couldn’t read that file. Try again.");
    } finally {
      uploadLock.current = false;
      if (!controller.signal.aborted) setReading(false);
      if (upload.current === controller) upload.current = null;
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reading || generating || generation.current) return;
    setError(null);
    let text: string;
    try { text = composeLearningInput(prompt, attachments); }
    catch (cause) { setError((cause as Error).message); textarea.current?.focus(); return; }
    const controller = new AbortController();
    generation.current = controller;
    setGenerating(true);
    setGenerationInput(text);
    setPreview(null);
    setPartialLesson(null);
    try {
      const lesson = await generateLesson({ requestId: crypto.randomUUID(), text, learnerProfile: structuredClone(DEFAULT_LEARNER_PROFILE) }, controller.signal, (partial) => {
        if (!controller.signal.aborted) setPartialLesson(partial);
      }, fetch, (next) => { if (!controller.signal.aborted) setPreview(next); });
      if (!controller.signal.aborted) await revealLesson(() => onLessonReady({ ...lesson, mode: "generated", origin: "provider" }, text));
    } catch (cause) {
      if (!controller.signal.aborted) {
        const message = cause instanceof Error ? cause.message : "We couldn’t create your lesson. Please try again.";
        setError(/OPENAI_API_KEY|OPENROUTER_API_KEY|not configured|not connected/i.test(message) ? "Lesson creation isn’t connected yet. Your question and attachments are still here, ready when it’s connected." : message);
      }
    } finally {
      if (generation.current === controller) generation.current = null;
      if (!controller.signal.aborted) setGenerating(false);
    }
  }

  const busy = reading || generating;
  const characterCount = prompt.length + attachments.reduce((sum, file) => sum + file.text.length, 0);
  return <div id="learn" className={styles.promptWrap}>
    <form className={`${styles.learningPrompt} ${dragging ? styles.promptDragging : ""}`} onSubmit={submit}
      onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); if (!busy) setDragging(true); } }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
      onDrop={(event) => { event.preventDefault(); setDragging(false); void attachFiles(Array.from(event.dataTransfer.files)); }}>
      <label className="sr-only" htmlFor="learning-prompt">What do you want to understand?</label>
      <textarea id="learning-prompt" ref={textarea} value={prompt} onChange={(event) => { setPrompt(event.target.value); setError(null); }} maxLength={MAX_LEARNING_TEXT} disabled={busy} placeholder="What’s not clicking yet?" rows={2} aria-describedby="learning-prompt-help"
        onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
      {attachments.length > 0 && <ul className={styles.attachedFiles} aria-label="Attached lecture notes">{attachments.map((file) => <li key={file.id}><FileText size={13} /><span>{file.name}</span><button type="button" disabled={busy} aria-label={`Remove ${file.name}`} onClick={() => { setAttachments((previous) => previous.filter((item) => item.id !== file.id)); setError(null); }}><X size={12} /></button></li>)}</ul>}
      <div className={styles.promptBottom}><input ref={fileInput} type="file" accept={ATTACHMENT_ACCEPT} multiple className="sr-only" tabIndex={-1} onChange={(event) => void attachFiles(Array.from(event.target.files ?? []))} aria-label="Choose lecture notes" disabled={busy} />
        <button type="button" className={styles.attachButton} disabled={busy || attachments.length >= MAX_ATTACHMENTS} onClick={() => fileInput.current?.click()} aria-label="Attach lecture notes">{reading ? <LoaderCircle className={styles.promptSpinner} size={15} /> : <Paperclip size={15} />}<span>{reading ? "Reading your notes…" : "Add your notes"}</span></button>
        <button type="submit" className={styles.promptSubmit} disabled={busy || (!prompt.trim() && !attachments.length)}>{generating ? <><LoaderCircle className={styles.promptSpinner} size={15} /><span>Making it click…</span></> : <><span>Make it click</span><ArrowRight size={16} /></>}</button>
      </div>
      {dragging && <div className={styles.dropOverlay}><Paperclip size={24} /><span>Drop your lecture notes here</span></div>}
    </form>
    <div id="learning-prompt-help" className={styles.promptHelp}><span>A question, a tricky topic, or your lecture notes.</span><span>PDF, Word, or text · up to 10 MB</span></div>
    {characterCount > MAX_LEARNING_TEXT && <p className={styles.promptError} role="alert">These notes are too long. Try one chapter or fewer than 40,000 characters.</p>}
    {generating && <GenerationExperience input={generationInput} preview={preview} lesson={partialLesson} onCancel={() => { generation.current?.abort(); generation.current = null; void closeLoader(() => setGenerating(false)); }} />}
    {error && <p className={styles.promptError} role="alert">{error}</p>}
  </div>;
}
