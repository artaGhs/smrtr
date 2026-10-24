import { ArrowLeft, ArrowRight, ArrowUpRight, FileText, RotateCcw } from "lucide-react";
import type { Concept, Question, StudyWorkspaceProps } from "@/lib/contracts";
import { getVerifiedResources } from "@/lib/teaching/resources";
import { getTeachingSequence } from "@/lib/teaching/sequence";
import { ActivityView } from "../activities/ActivityView";
import { QuestionView } from "../activities/QuestionView";
import { SourcePassages } from "./SourcePassages";

export type DetailView = "learn" | "sources" | "practice";

export function LearningDetail({ session, concept, view, onSelectConcept, onShowView }: {
  session: StudyWorkspaceProps;
  concept: Concept;
  view: DetailView;
  onSelectConcept: (id: string) => void;
  onShowView: (view: DetailView) => void;
}) {
  const { lesson } = session;
  const module = lesson.modules.find((item) => item.conceptId === concept.id);
  const attempts = session.attempts.filter((attempt) => attempt.lessonId === lesson.id && attempt.revision === lesson.revision);
  const latest = new Map(attempts.map((attempt) => [attempt.questionId, attempt]));
  const sequence = getTeachingSequence(lesson);
  const path = sequence.map((step) => step.conceptId);
  const pathIndex = path.indexOf(concept.id);
  const approach = sequence.find((step) => step.conceptId === concept.id)?.approach;
  const approachLabels = { example: "Example", visual: "Visual explanation", explanation: "Explanation", practice: "Practice" };
  const tags = [
    ...(approach ? [approachLabels[approach]] : []),
    ...(module?.activity.kind === "bfs"
      ? ["BFS simulation", module.activity.directed ? "Directed" : "Undirected", "Unweighted"]
      : module?.activity.kind === "concept" ? ["Guided explanation"] : []),
  ];
  const related = lesson.relations.filter((relation) => relation.source === concept.id || relation.target === concept.id);
  const resources = getVerifiedResources(lesson, concept.id);
  function questionView(question: Question) {
    return <div key={`${lesson.revision}:${question.id}`}><QuestionView question={question} onAnswer={(answers, evaluation) => session.onAnswer(question, answers, evaluation)} />{latest.get(question.id)?.correct === false && <div className="review-links"><span>Review this idea</span>{question.conceptIds.map((id) => {
      const target = lesson.concepts.find((item) => item.id === id);
      return target ? <button key={id} onClick={() => onSelectConcept(id)}><RotateCcw size={12} />{target.title}</button> : null;
    })}</div>}</div>;
  }
  if (view === "sources") return <SourcePassages lesson={lesson} concept={concept} sourceIds={[...new Set([...concept.sourceIds, ...(module?.sourceIds ?? []), ...(session.learning?.page.sourceIds ?? [])])]} contextTitle={session.learning ? "this page or selected concept" : undefined} onSelectConcept={onSelectConcept} />;
  if (view === "practice") return <div className="lesson-content practice-content"><span className="eyebrow">FINAL PRACTICE</span><h2>Bring the ideas together.</h2><p>Each question connects back to the concepts in this lesson.</p><div className="practice-status">{lesson.finalQuestions.filter((question) => latest.has(question.id)).length} of {lesson.finalQuestions.length} checked</div>{lesson.finalQuestions.map((question, index) => <section className="final-question" key={question.id}><div className="final-question-header"><span>QUESTION {String(index + 1).padStart(2, "0")}</span><div>{question.conceptIds.map((id) => {
    const target = lesson.concepts.find((item) => item.id === id);
    return target ? <button key={id} onClick={() => onSelectConcept(id)}>{target.title}<ArrowUpRight size={11} /></button> : null;
  })}</div></div>{questionView(question)}</section>)}{!lesson.finalQuestions.length && <p>This lesson has no final questions yet. Explore the checks within each concept.</p>}<p className="practice-note">Practice is a snapshot, not a mastery score. Revisit any idea that feels unclear.</p></div>;
  return <>
    <div className="lesson-content" key={concept.id}><div className="detail-kicker"><span className="eyebrow">CONCEPT {String(Math.max(pathIndex, 0) + 1).padStart(2, "0")}</span>{[...latest.values()].some((attempt) => !attempt.correct && attempt.conceptIds.includes(concept.id)) && <span className="review-badge">Suggested review</span>}</div><h2>{concept.title}</h2>{tags.length > 0 && <ul className="concept-tags" aria-label="Concept tags">{tags.map((tag) => <li key={tag}>{tag}</li>)}</ul>}<p className="concept-summary">{concept.summary}</p><div className="learning-objective"><span className="eyebrow">WHAT YOU’LL UNDERSTAND</span><p>{concept.objective}</p></div><p className="explanation">{module?.explanation ?? concept.summary}</p>{module && <><div className="example"><span className="eyebrow">WORKED EXAMPLE</span><p>{module.example}</p><small>Lesson illustration · original passages in Sources</small></div><ActivityView key={`${lesson.id}:${lesson.revision}:${module.id}`} activity={module.activity} conceptId={concept.id} simulation={session.learning?.simulations[module.conceptId]} onSimulationChange={session.learning ? (state) => session.learning?.onSimulationChange(module.conceptId, state) : undefined} />{module.questions.map(questionView)}</>}<div className="concept-connections"><span className="eyebrow">CONNECTIONS</span>{related.map((relation) => {
      const other = lesson.concepts.find((item) => item.id === (relation.source === concept.id ? relation.target : relation.source));
      const label = relation.type === "prerequisite" ? relation.target === concept.id ? "Builds on" : "Prepares you for" : relation.type === "contrast" ? "Compare with" : relation.type === "example" ? relation.target === concept.id ? "Example of" : "See an example" : "Related idea";
      return other ? <button key={relation.id} onClick={() => onSelectConcept(other.id)}><span>{label}</span><strong>{other.title}</strong><ArrowUpRight size={13} /></button> : null;
    })}</div><button className="source-link" onClick={() => onShowView("sources")}><FileText size={13} />Read the source passages<ArrowUpRight size={13} /></button>{resources.length > 0 && <section className="further-learning"><span className="eyebrow">FURTHER LEARNING</span>{resources.map((resource) => <div key={resource.url}><a href={resource.url} target="_blank" rel="noopener noreferrer">{resource.title}<ArrowUpRight size={13} /></a><span>{resource.publisher} · video</span><a className="publisher-link" href={resource.verificationUrl} target="_blank" rel="noopener noreferrer">Official course page<ArrowUpRight size={11} /></a></div>)}</section>}</div>
    <footer className="lesson-footer"><button className="secondary-button" disabled={pathIndex <= 0} onClick={() => onSelectConcept(path[pathIndex - 1])}><ArrowLeft size={14} />Previous</button><button className="primary-button" onClick={() => pathIndex >= 0 && pathIndex < path.length - 1 ? onSelectConcept(path[pathIndex + 1]) : onShowView("practice")}>{pathIndex >= 0 && pathIndex < path.length - 1 ? "Next concept" : "Final practice"}<ArrowRight size={14} /></button></footer>
  </>;
}
