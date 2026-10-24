import { ArrowUpRight, FileText } from "lucide-react";
import { useState } from "react";
import type { Concept, Lesson } from "@/lib/contracts";

function externalLocator(locator?: string) {
  if (!locator) return null;
  try {
    const url = new URL(locator);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch { return null; }
}

export function SourcePassages({ lesson, concept, sourceIds, onSelectConcept }: {
  lesson: Lesson;
  concept: Concept;
  sourceIds: string[];
  onSelectConcept: (id: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const sources = showAll ? lesson.sources : lesson.sources.filter((source) => sourceIds.includes(source.id));
  return <div className="lesson-content sources-content">
    <span className="eyebrow">GO TO THE SOURCE</span><h2>Ideas, grounded.</h2>
    <p>Original source passages are kept separate from the lesson’s explanations and worked examples.</p>
    <div className="source-scope"><span>{showAll ? "All lesson sources" : `Supporting ${concept.title}`}</span><button onClick={() => setShowAll(!showAll)}>{showAll ? "For this concept" : "Show all sources"}</button></div>
    {sources.length ? sources.map((source, index) => {
      const href = externalLocator(source.locator);
      const supported = lesson.concepts.filter((item) => item.sourceIds.includes(source.id) || lesson.modules.some((module) => module.conceptId === item.id && module.sourceIds.includes(source.id)));
      return <article className="source-passage" key={source.id}><div className="source-heading"><span className="source-number"><FileText size={14} />{String(index + 1).padStart(2, "0")}</span><h3>{source.title}</h3></div>{source.locator && (href ? <a className="source-locator" href={href} target="_blank" rel="noopener noreferrer">Open original source<ArrowUpRight size={12} /></a> : <p className="source-locator">{source.locator}</p>)}<blockquote tabIndex={0} aria-label={`Source passage: ${source.title}`}>{source.text}</blockquote><div className="source-concepts"><span>CONNECTED IDEAS</span>{supported.map((item) => <button key={item.id} onClick={() => onSelectConcept(item.id)}>{item.title}<ArrowUpRight size={11} /></button>)}</div></article>;
    }) : <p className="empty-state">No source passage is linked to this concept. Choose “Show all sources” to see the material supplied for this lesson.</p>}
    {lesson.mode === "sample" && <p className="practice-note">These passages belong to the prepared sample. Generate a new map to work with your own source material.</p>}
  </div>;
}
