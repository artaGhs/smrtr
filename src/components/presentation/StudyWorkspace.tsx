"use client";

import { useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Check, Compass,
  FileText, Focus, KeyRound, Layers, LoaderCircle, MessageSquare, RotateCcw, Sparkles, X,
} from "lucide-react";
import type { Question, StudyWorkspaceProps } from "@/lib/contracts";
import { ActivityView } from "../activities/ActivityView";
import { QuestionView } from "../activities/QuestionView";
import { ConceptMap } from "./ConceptMap";
import { SourcePassages } from "./SourcePassages";
import { ChatHandoff } from "./ChatHandoff";

type DetailView = "learn" | "sources" | "practice";

export function StudyWorkspace(props: StudyWorkspaceProps) {
  return <WorkspaceContent key={`${props.lesson.id}:${props.lesson.revision}`} {...props} />;
}

function WorkspaceContent(props: StudyWorkspaceProps) {
  const { lesson, selectedConceptId } = props;
  const [view, setView] = useState<DetailView>("learn");
  const [overviewVersion, setOverviewVersion] = useState(0);
  const mapRef = useRef<HTMLElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const concept = lesson.concepts.find((item) => item.id === selectedConceptId) ?? lesson.concepts[0];
  const module = lesson.modules.find((item) => item.conceptId === concept.id);
  const path = lesson.path.filter((id) => lesson.concepts.some((item) => item.id === id));
  const pathIndex = path.indexOf(concept.id);
  const currentAttempts = props.attempts.filter((attempt) => attempt.lessonId === lesson.id && attempt.revision === lesson.revision);
  const latestAttempts = new Map(currentAttempts.map((attempt) => [attempt.questionId, attempt]));
  const practiced = new Set(currentAttempts.flatMap((attempt) => attempt.conceptIds));
  const needsReview = new Set([...latestAttempts.values()].filter((attempt) => !attempt.correct).flatMap((attempt) => attempt.conceptIds));
  const related = lesson.relations.filter((relation) => relation.source === concept.id || relation.target === concept.id);
  const generating = props.status === "generating";
  const inputLength = props.input.trim().length;
  const chatMode = props.generationMode === "chat";
  const waitingForChat = chatMode && props.chatRequest?.status === "waiting" && generating;
  const lessonBadge = lesson.mode === "sample" ? "SAMPLE LESSON" : lesson.origin === "chat" ? "GENERATED WITH CONNECTED CHAT" : "FROM YOUR NOTES";

  function revealDetail() {
    requestAnimationFrame(() => {
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      detailRef.current?.scrollIntoView({ block: "start", behavior: reducedMotion ? "instant" : "smooth" });
      detailRef.current?.focus({ preventScroll: true });
    });
  }

  function selectConcept(id: string, focusDetail = false) {
    props.onSelectConcept(id);
    setView("learn");
    if (focusDetail || window.matchMedia("(max-width: 850px)").matches) revealDetail();
  }

  function overview() {
    setOverviewVersion((value) => value + 1);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    mapRef.current?.scrollIntoView({ block: "start", behavior: reducedMotion ? "instant" : "smooth" });
    mapRef.current?.focus({ preventScroll: true });
  }

  function showView(next: DetailView) {
    setView(next);
    revealDetail();
  }

  function reviewLinks(question: Question) {
    if (latestAttempts.get(question.id)?.correct !== false) return null;
    return <div className="review-links"><span>Worth another look:</span>{question.conceptIds.map((id) => {
      const target = lesson.concepts.find((item) => item.id === id);
      return target ? <button key={id} onClick={() => selectConcept(id, true)}><RotateCcw size={12} />{target.title}</button> : null;
    })}</div>;
  }

  return (
    <main className="app-shell">
      <a className="skip-link" href="#study-input">Skip to your notes</a>
      <aside className="rail" aria-label="Workspace navigation">
        <a className="brand" href="/" aria-label="SMRTR home">s<span>↗</span></a>
        <button onClick={overview} aria-label="Map overview" title="Map overview"><Compass size={21} /></button>
        <button onClick={() => showView("learn")} aria-label="Learn selected concept" title="Learn"><BookOpen size={20} /></button>
        <button onClick={() => showView("practice")} aria-label="Open final practice" title="Final practice"><Layers size={20} /></button>
        <span className="rail-bottom" aria-hidden="true">↗</span>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <a href="/" className="wordmark">SMRTR<span>STUDY, CONNECTED.</span></a>
          <div className="top-status"><span className="status-dot" />A workspace for your next aha.<span className="prototype">EARLY PREVIEW <ArrowUpRight size={13} /></span></div>
        </header>
        <div className="heading">
          <div><div className="eyebrow">YOUR LEARNING ATLAS</div><h1>A little more <em>connected.</em></h1><p>Bring your notes. See the ideas. Put them into practice.</p></div>
          <div className="workspace-stat"><strong>{lesson.concepts.length.toString().padStart(2, "0")}</strong><span>ideas to explore</span></div>
        </div>

        <section className="study-grid" aria-label="Study workspace">
          <div className="map-column">
            <section className="input-card" aria-labelledby="input-heading">
              <div className="section-label"><span id="input-heading"><Sparkles size={15} />Start with a spark</span><button className="text-button" onClick={props.onLoadSample}>Explore sample <ArrowUpRight size={12} /></button></div>
              <label htmlFor="study-input">A topic, your notes, that tricky lecture.</label>
              <div className="generation-modes" role="group" aria-label="How to create your lesson"><button className={chatMode ? "active" : ""} aria-pressed={chatMode} onClick={() => props.onGenerationModeChange("chat")}><MessageSquare size={13} />Use my chat<span>No API key</span></button><button className={!chatMode ? "active" : ""} aria-pressed={!chatMode} onClick={() => props.onGenerationModeChange("provider")}><KeyRound size={13} />Provider API</button></div>
              <p className="mode-explanation">{chatMode ? "Prepare a request for your own LLM chat, then bring the lesson back." : "Generate directly with the provider configured on this app’s server."}</p>
              <textarea id="study-input" value={props.input} maxLength={40000} onChange={(event) => props.onInputChange(event.target.value)} placeholder="Paste your notes or tell us what you want to understand…" aria-describedby="input-help" />
              <div className="input-footer">
                <span id="input-help">{props.input.length.toLocaleString()} / 40,000 characters{inputLength < 10 ? " · Add at least 10 characters" : " · Ready to connect"}</span>
                {generating ? <button className="primary-button" onClick={props.onCancel}><X size={15} />{waitingForChat ? "Cancel request" : "Cancel"}</button> : <button className="primary-button" disabled={inputLength < 10 || inputLength > 40000} onClick={props.onGenerate}>{chatMode ? "Prepare chat request" : "Build my map"}<ArrowRight size={16} /></button>}
              </div>
              {generating && !waitingForChat && <div className="generation-progress" role="status"><LoaderCircle className="spin" size={17} /><div><strong>{chatMode ? "Preparing your chat request…" : "Building a map from your notes…"}</strong><span>{chatMode ? "Your notes will be packaged with the lesson format and instructions." : "Connecting concepts, explanations, and practice. You can keep exploring below."}</span></div><div className="indeterminate-track" /></div>}
              {chatMode && props.chatRequest && <ChatHandoff key={props.chatRequest.id} chatRequest={props.chatRequest} status={props.status} onCopyChatRequest={props.onCopyChatRequest} onImportChatLesson={props.onImportChatLesson} />}
              {props.error && <div className="error" role="alert"><strong>Your new map couldn’t be created.</strong><p>{props.error}</p><span>{lesson.mode === "sample" ? "The labeled sample is still available below." : "Your previous lesson is still available below."} Your notes are saved in the box above.</span></div>}
            </section>

            <section className="map-card" ref={mapRef} tabIndex={-1} aria-labelledby="map-heading">
              <div className="map-heading"><div><span className="eyebrow">THE BIG PICTURE</span><h2 id="map-heading">{lesson.title}</h2></div><span className={`sample-badge ${lesson.mode === "generated" ? "generated-badge" : ""}`}>{lessonBadge}</span></div>
              <p className="map-summary">{lesson.summary}</p>
              {lesson.mode === "sample" && <p className="sample-note">A prepared example to explore. Build a new map above to use your own notes.</p>}
              <ConceptMap lesson={lesson} selectedConceptId={concept.id} onSelectConcept={(id) => selectConcept(id)} practiced={practiced} needsReview={needsReview} overviewVersion={overviewVersion} />
              <div className="map-footer"><span><i className="legend-prerequisite" />Prerequisite → next idea</span><span><i className="legend-related" />Related</span>{lesson.relations.some((relation) => relation.type === "contrast") && <span><i className="legend-contrast" />Contrast</span>}{lesson.relations.some((relation) => relation.type === "example") && <span><i className="legend-example" />Example →</span>}<button onClick={overview}><Focus size={12} />Fit map</button></div>
            </section>

            <section className="path-card" aria-labelledby="path-heading">
              <div className="path-heading"><span id="path-heading"><Compass size={16} />YOUR GUIDED PATH</span><span>{practiced.size} / {lesson.concepts.length} practiced</span></div>
              <div className="path-steps">{path.map((id, index) => {
                const target = lesson.concepts.find((item) => item.id === id)!;
                return <button key={id} className={`path-step ${id === concept.id && view === "learn" ? "active" : ""}`} onClick={() => selectConcept(id)} aria-current={id === concept.id && view === "learn" ? "step" : undefined}><span className="path-number">{practiced.has(id) ? <Check size={13} /> : String(index + 1).padStart(2, "0")}</span><span>{target.title}{needsReview.has(id) && <small>Suggested review</small>}</span><ArrowRight size={13} /></button>;
              })}<button className={`path-step path-practice ${view === "practice" ? "active" : ""}`} onClick={() => showView("practice")}><span className="path-number"><Layers size={13} /></span><span>Bring it together<small>Final practice</small></span><ArrowRight size={13} /></button></div>
              <p>Follow the path, or jump into any idea on the map.</p>
            </section>
          </div>

          <aside className="lesson-card" ref={detailRef} tabIndex={-1} aria-label="Learning detail">
            <nav className="detail-tabs" aria-label="Learning views">{([['learn', 'Learn', BookOpen], ['sources', 'Sources', FileText], ['practice', 'Final practice', Layers]] as const).map(([id, label, Icon]) => <button key={id} onClick={() => setView(id)} className={view === id ? "active" : ""} aria-pressed={view === id}><Icon size={14} />{label}</button>)}</nav>
            {view === "learn" && <>
              <div className="lesson-topline"><button onClick={overview}><ArrowLeft size={12} />Map overview</button><span>{pathIndex >= 0 ? `CONCEPT ${String(pathIndex + 1).padStart(2, "0")} / ${String(path.length).padStart(2, "0")}` : "EXPLORE A CONNECTION"}</span></div>
              <div className="lesson-content" key={concept.id}>
                <div className="concept-title-row"><div className="concept-icon" aria-hidden="true">↗</div>{needsReview.has(concept.id) && <span className="review-badge">Suggested review</span>}</div>
                <h2>{concept.title}</h2><p className="concept-summary">{concept.summary}</p>
                <div className="learning-objective"><span className="eyebrow">YOUR TAKEAWAY</span><p>{concept.objective}</p></div>
                <div className="lesson-divider" /><span className="eyebrow">THE IDEA</span>
                <p className="explanation">{module?.explanation ?? concept.summary}</p>
                {module && <>
                  <div className="example"><span className="eyebrow">WORKED EXAMPLE</span><p>{module.example}</p><span className="example-caption">Lesson illustration · see Sources for original passages</span></div>
                  <ActivityView key={`${lesson.id}:${lesson.revision}:${module.id}`} activity={module.activity} conceptId={concept.id} />
                  {module.questions.map((question) => <div key={`${lesson.revision}:${question.id}`}><QuestionView question={question} onAnswer={(answer, evaluation) => props.onAnswer(question, answer, evaluation)} />{reviewLinks(question)}</div>)}
                </>}
                <div className="concept-connections"><span className="eyebrow">CONNECT THE DOTS</span>{related.length ? related.map((relation) => {
                  const otherId = relation.source === concept.id ? relation.target : relation.source;
                  const other = lesson.concepts.find((item) => item.id === otherId);
                  const label = relation.type === "prerequisite" ? relation.target === concept.id ? "Builds on" : "Prepares you for" : relation.type === "contrast" ? "Compare with" : relation.type === "example" ? relation.target === concept.id ? "Example of" : "See an example" : "Related idea";
                  return other ? <button key={relation.id} onClick={() => selectConcept(otherId, true)}><span>{label}</span><strong>{other.title}</strong><ArrowUpRight size={14} /></button> : null;
                }) : <p>Use the guided path to explore the next idea.</p>}</div>
                <button className="source-link" onClick={() => showView("sources")}><FileText size={14} />Read the supporting source passages<ArrowUpRight size={14} /></button>
              </div>
              <footer className="lesson-footer"><button className="secondary-button" disabled={pathIndex <= 0} onClick={() => selectConcept(path[pathIndex - 1], true)}><ArrowLeft size={14} />Previous</button><button className="primary-button" onClick={() => pathIndex >= 0 && pathIndex < path.length - 1 ? selectConcept(path[pathIndex + 1], true) : showView("practice")}>{pathIndex >= 0 && pathIndex < path.length - 1 ? "Next concept" : "Final practice"}<ArrowRight size={14} /></button></footer>
            </>}
            {view === "sources" && <SourcePassages lesson={lesson} concept={concept} sourceIds={[...new Set([...concept.sourceIds, ...(module?.sourceIds ?? [])])]} onSelectConcept={(id) => selectConcept(id, true)} />}
            {view === "practice" && <div className="lesson-content practice-content"><span className="eyebrow">BRING IT TOGETHER</span><h2>Make it stick.</h2><p>Connect the ideas in this lesson. Each question links back to the concepts it uses.</p><div className="practice-status"><Layers size={16} /><span>{lesson.finalQuestions.filter((question) => latestAttempts.has(question.id)).length} of {lesson.finalQuestions.length} questions checked</span></div>{lesson.finalQuestions.length ? lesson.finalQuestions.map((question, index) => <div className="final-question" key={`${lesson.revision}:${question.id}`}><div className="final-question-header"><span>QUESTION {String(index + 1).padStart(2, "0")}</span><div>{question.conceptIds.map((id) => {
              const target = lesson.concepts.find((item) => item.id === id);
              return target ? <button key={id} onClick={() => selectConcept(id, true)}>{target.title}<ArrowUpRight size={11} /></button> : null;
            })}</div></div><QuestionView question={question} onAnswer={(answer, evaluation) => props.onAnswer(question, answer, evaluation)} />{reviewLinks(question)}</div>) : <p className="empty-state">This lesson has no final questions. Try the checks inside each concept.</p>}<p className="practice-note">A check is a snapshot, not a mastery score. Follow a review link whenever something feels unclear.</p><button className="secondary-button" onClick={overview}><Compass size={14} />Return to the map</button></div>}
          </aside>
        </section>
        <footer className="page-footer"><span>Follow the connections. Find your understanding.</span><span>Made for curious minds. ↗</span></footer>
      </div>
    </main>
  );
}
