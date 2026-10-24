"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, FileText, Layers, LoaderCircle, Map as MapIcon, MessageSquare, Plus, Shapes, X } from "lucide-react";
import type { StudyWorkspaceProps } from "@/lib/contracts";
import { getTeachingSequence } from "@/lib/teaching/sequence";
import { LearningCanvas } from "@/components/canvas/LearningCanvas";
import { ConceptMap } from "./ConceptMap";
import { LearningDetail, type DetailView } from "./LearningDetail";
import { NotesComposer } from "./NotesComposer";

export function StudyWorkspace(props: StudyWorkspaceProps) {
  return <CanvasWorkspace {...props} />;
}

function CanvasWorkspace(session: StudyWorkspaceProps) {
  const { lesson } = session;
  const [composerOpen, setComposerOpen] = useState(lesson.mode === "sample" && session.status !== "generating");
  const [detailView, setDetailView] = useState<DetailView | null>(null);
  const [canvasMode, setCanvasMode] = useState<"lesson" | "map">("lesson");
  const [pathOpen, setPathOpen] = useState(false);
  const [activeSceneIndex, setActiveSceneIndex] = useState(0);
  const [overviewVersion, setOverviewVersion] = useState(0);
  const drawerRef = useRef<HTMLElement>(null);
  const drawerTrigger = useRef<HTMLElement | null>(null);
  const shownRevision = useRef(`${lesson.id}:${lesson.revision}`);
  const concept = lesson.concepts.find((item) => item.id === session.selectedConceptId) ?? lesson.concepts[0];
  const sequence = getTeachingSequence(lesson);
  const currentStep = sequence[activeSceneIndex] ?? sequence[0];
  const currentTitle = lesson.concepts.find((item) => item.id === currentStep?.conceptId)?.title ?? concept.title;
  const attempts = session.attempts.filter((attempt) => attempt.lessonId === lesson.id && attempt.revision === lesson.revision);
  const latest = new Map(attempts.map((attempt) => [attempt.questionId, attempt]));
  const practiced = new Set(attempts.flatMap((attempt) => attempt.conceptIds));
  const needsReview = new Set([...latest.values()].filter((attempt) => !attempt.correct).flatMap((attempt) => attempt.conceptIds));
  const badge = lesson.mode === "sample" ? "Sample" : lesson.origin === "chat" ? "From your chat" : "From your notes";
  const waiting = session.status === "generating";

  useEffect(() => {
    const revision = `${lesson.id}:${lesson.revision}`;
    if (shownRevision.current !== revision) {
      shownRevision.current = revision;
      setComposerOpen(false);
      setDetailView(null);
      setActiveSceneIndex(0);
      setPathOpen(false);
    }
  }, [lesson.id, lesson.revision]);
  useEffect(() => {
    if (detailView) {
      drawerRef.current?.focus({preventScroll: true});
      drawerRef.current?.querySelector(".drawer-scroll")?.scrollTo({top: 0});
    }
  }, [detailView, concept.id]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !composerOpen) { setDetailView(null); setPathOpen(false); }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [composerOpen]);

  function openDetail(view: DetailView) {
    drawerTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDetailView(view);
    setPathOpen(false);
  }
  function closeDetail() {
    setDetailView(null);
    drawerTrigger.current?.focus({preventScroll: true});
  }
  function selectConcept(id: string, open = true) {
    session.onSelectConcept(id);
    const index = sequence.findIndex((step) => step.conceptId === id);
    if (index >= 0) setActiveSceneIndex(index);
    if (open) openDetail("learn");
  }
  function goToStep(index: number) {
    const bounded = Math.max(0, Math.min(sequence.length - 1, index));
    setActiveSceneIndex(bounded);
    if (sequence[bounded]) session.onSelectConcept(sequence[bounded].conceptId);
    setPathOpen(false);
    if (detailView) setDetailView("learn");
  }

  return <main className={`canvas-workspace ${detailView ? "has-detail" : ""}`}>
    <a className="skip-link" href="#guided-sequence">Skip to guided sequence</a>
    <section className="canvas-stage" aria-label="Learning canvas">
      {canvasMode === "lesson" ? <LearningCanvas key={`${lesson.id}:${lesson.revision}`} lesson={lesson} selectedConceptId={concept.id} onSelectConcept={(id) => selectConcept(id, false)} onOpenConcept={(id) => selectConcept(id)} activeSceneIndex={activeSceneIndex} onSceneChange={(index) => goToStep(index)} /> : <ConceptMap lesson={lesson} selectedConceptId={concept.id} onSelectConcept={(id) => selectConcept(id)} practiced={practiced} needsReview={needsReview} overviewVersion={overviewVersion} />}
    </section>
    <header className="canvas-header">
      <div className="canvas-identity"><button className="canvas-wordmark" onClick={() => setComposerOpen(true)} aria-label="SMRTR — open topic or notes">smrtr<span>↗</span></button><span className="header-divider" /><div className="canvas-document"><span className="canvas-document-title">{lesson.title}</span><span className="lesson-origin">{badge}</span></div></div>
      <nav className="canvas-actions" aria-label="Workspace tools">
        {waiting && <button className="request-chip" onClick={() => setComposerOpen(true)}><LoaderCircle className="spin" size={13} /><span>{session.generationMode === "chat" ? "Awaiting chat" : "Generating"}</span></button>}
        {!waiting && session.error && <button className="request-chip request-error" onClick={() => setComposerOpen(true)}><MessageSquare size={13} /><span>Request needs attention</span></button>}
        <button className="toolbar-button" onClick={() => openDetail("sources")} aria-label="Open source passages" title="Sources"><FileText size={15} /><span>Sources</span></button><button className="toolbar-button" onClick={() => openDetail("practice")} aria-label="Open final practice" title="Practice"><Layers size={15} /><span>Practice</span></button><button className="new-lesson-button" onClick={() => setComposerOpen(true)}><Plus size={15} /><span>New lesson</span></button>
      </nav>
    </header>
    <div className="canvas-view-switch" role="group" aria-label="Canvas view"><button className={canvasMode === "lesson" ? "active" : ""} aria-pressed={canvasMode === "lesson"} onClick={() => setCanvasMode("lesson")}><Shapes size={14} />Visual lesson</button><button className={canvasMode === "map" ? "active" : ""} aria-pressed={canvasMode === "map"} onClick={() => { setCanvasMode("map"); setOverviewVersion((value) => value + 1); }}><MapIcon size={14} />Connections</button></div>
    {canvasMode === "map" && <div className="canvas-map-legend"><span><i />Prerequisite → next idea</span><span><i className="dashed" />Related</span><span>Click an idea to explore</span></div>}
    <footer className="sequence-dock" id="guided-sequence" aria-label="Guided teaching sequence">
      {pathOpen && <div className="sequence-popover"><div className="sequence-popover-heading"><span>YOUR LEARNING SEQUENCE</span><button className="icon-button" onClick={() => setPathOpen(false)} aria-label="Close learning sequence"><X size={14} /></button></div>{sequence.map((step, index) => <button key={`${step.conceptId}:${index}`} className={index === activeSceneIndex ? "active" : ""} onClick={() => goToStep(index)}><span>{practiced.has(step.conceptId) ? <Check size={12} /> : String(index + 1).padStart(2, "0")}</span><div><strong>{lesson.concepts.find((item) => item.id === step.conceptId)?.title}</strong><small>{step.purpose}</small></div></button>)}<button onClick={() => openDetail("practice")}><span><Layers size={13} /></span><div><strong>Final practice</strong><small>Connect what you’ve learned</small></div></button></div>}
      <button className="sequence-arrow" disabled={activeSceneIndex === 0} onClick={() => goToStep(activeSceneIndex - 1)} aria-label="Previous scene"><ArrowLeft size={16} /></button>
      <button className="sequence-current" onClick={() => setPathOpen(!pathOpen)} aria-expanded={pathOpen}><span>STEP {String(activeSceneIndex + 1).padStart(2, "0")} OF {String(sequence.length).padStart(2, "0")}</span><strong>{currentTitle}</strong><ChevronDown size={14} /></button>
      <div className="sequence-dots" aria-label="Teaching steps">{sequence.map((step, index) => <button key={`${step.conceptId}:${index}`} className={index === activeSceneIndex ? "active" : ""} onClick={() => goToStep(index)} aria-label={`Step ${index + 1}: ${lesson.concepts.find((item) => item.id === step.conceptId)?.title}`} aria-current={index === activeSceneIndex ? "step" : undefined} />)}</div>
      <button className="sequence-inspect" onClick={() => { if (currentStep) selectConcept(currentStep.conceptId); }} aria-label="Open current concept details" title="Concept details"><BookOpen size={16} /></button>
      <button className="sequence-arrow sequence-next" onClick={() => activeSceneIndex < sequence.length - 1 ? goToStep(activeSceneIndex + 1) : openDetail("practice")} aria-label={activeSceneIndex < sequence.length - 1 ? "Next scene" : "Start final practice"}><ArrowRight size={16} /></button>
    </footer>
    {detailView && <aside className="detail-drawer" aria-label="Learning detail" tabIndex={-1} ref={drawerRef}><div className="drawer-header"><nav aria-label="Learning views">{([['learn', 'Learn'], ['sources', 'Sources'], ['practice', 'Practice']] as const).map(([id, label]) => <button key={id} className={detailView === id ? "active" : ""} onClick={() => setDetailView(id)} aria-pressed={detailView === id}>{label}</button>)}</nav><button className="icon-button" onClick={closeDetail} aria-label="Close learning detail"><X size={17} /></button></div><div className="drawer-scroll"><LearningDetail session={session} concept={concept} view={detailView} onSelectConcept={(id) => selectConcept(id)} onShowView={setDetailView} /></div></aside>}
    {composerOpen && <CanvasDialog onClose={() => setComposerOpen(false)}><NotesComposer session={session} onExploreSample={() => {session.onLoadSample();setComposerOpen(false);}} /></CanvasDialog>}
  </main>;
}

function CanvasDialog({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); dialog?.querySelector("textarea")?.focus(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className="composer-dialog" aria-label="Create a learning canvas" aria-describedby={titleId} onCancel={onClose} onClick={(event) => {if(event.target === event.currentTarget) onClose();}}><div className="composer-dialog-inner"><span id={titleId} className="sr-only">Add a topic or notes, prepare a request for your chat, or generate with a configured provider.</span><button className="dialog-close icon-button" onClick={onClose} aria-label="Close notes and return to canvas"><X size={19} /></button>{children}</div></dialog>;
}
