import { useEffect, useRef, useState, Fragment } from "react";
import { ArrowLeft, ArrowRight, BookOpen, ChevronDown, FileText, Layers, X } from "lucide-react";
import type { LearningNavigationProps, StudyWorkspaceProps } from "@/lib/contracts";
import { LearningCanvas } from "@/components/canvas/LearningCanvas";

export function HierarchyLesson({ session, learning, onOpenConcept, onOpenSources, onOpenPractice }: {
  session: StudyWorkspaceProps;
  learning: LearningNavigationProps;
  onOpenConcept: (id: string) => void;
  onOpenSources: () => void;
  onOpenPractice: () => void;
}) {
  const { page, design } = learning;
  const readingRef = useRef<HTMLElement>(null);
  const [routeOpen, setRouteOpen] = useState(false);
  const isSupport = page.kind === "support";
  const isOverview = page.kind === "overview";
  const corePages = learning.route.map((item, index) => ({ page: item, index })).filter((item) => item.page.kind === "core" || item.page.kind === "transfer");
  const position = corePages.findIndex((item) => item.page.id === page.id);
  const sequenceStep = design.sequence.find((step) => step.pageId === page.id);
  const nextIndex = isOverview ? corePages[0]?.index ?? 0 : learning.coreIndex + 1;
  const next = learning.route[nextIndex];
  const supports = design.pages.filter((item) => item.kind === "support" && item.parentId === page.id);
  const scrollTop = () => readingRef.current?.scrollTop ?? learning.location.scrollTop;
  function openPage(pageId: string, returningToAncestor = false) {
    setRouteOpen(false);
    const target = design.pages.find((item) => item.id === pageId);
    const routeIndex = learning.route.findIndex((item) => item.id === pageId);
    if (!returningToAncestor && target?.kind !== "support" && routeIndex >= 0) learning.onGoToCore(routeIndex);
    else learning.onOpenPage(pageId, scrollTop());
  }
  useEffect(() => {
    readingRef.current?.scrollTo({ top: learning.location.scrollTop });
    readingRef.current?.focus({ preventScroll: true });
    setRouteOpen(false);
    // Restore the saved reading position when changing pages or returning from support.
    // Scroll events themselves update the snapshot without moving the reader again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.id]);

  return <>
    <div className={`hierarchy-page ${isSupport ? "support-page" : ""}`}>
      <article className="hierarchy-reading" ref={readingRef} tabIndex={-1} onScroll={(event) => learning.onScroll(event.currentTarget.scrollTop)} aria-labelledby="learning-page-title">
        <nav className="page-breadcrumbs" aria-label="Lesson breadcrumb">{learning.breadcrumbs.map((item, index) => <Fragment key={item.id}>{index > 0 && <span aria-hidden="true">/</span>}{item.id === page.id ? <span aria-current="page">{item.title}</span> : <button onClick={() => openPage(item.id, true)}>{item.kind === "overview" ? "Overview" : item.title}</button>}</Fragment>)}</nav>
        {learning.canGoBack && <button className="context-back" onClick={learning.onBack}><ArrowLeft size={12} />Back to where you were</button>}
        <div className="page-kind"><span>{isSupport ? "OPTIONAL SUPPORT" : isOverview ? "THE BIG PICTURE" : page.kind === "transfer" ? "TRY A NEW SITUATION" : `CORE PAGE ${Math.max(position, 0) + 1} OF ${corePages.length}`}</span>{learning.provenance === "legacy" && <span className="legacy-design-label">Adapted saved lesson</span>}</div>
        <h1 id="learning-page-title">{page.question || page.title}</h1>
        <p className="page-purpose">{page.purpose}</p>
        {isSupport && <p className="optional-support-note">A short detour to support the main idea. This page doesn’t add to the core route.</p>}
        {page.blocks.map((block) => <p className={block.kind === "callout" ? "page-callout" : "page-paragraph"} key={block.id}>{block.segments.map((segment, index) => segment.kind === "text" ? <Fragment key={`${block.id}:${index}`}>{segment.text}</Fragment> : <button key={`${block.id}:${index}`} className="inline-page-link" title={segment.reason} aria-label={`${segment.text}: ${segment.reason}`} onClick={() => openPage(segment.pageId)}>{segment.text}</button>)}</p>)}
        {isOverview && <section className="overview-route"><span className="eyebrow">YOUR CORE ROUTE</span><p>One problem, connected explanations. Optional support is available whenever a term needs a closer look.</p>{corePages.map(({page: item, index}, order) => <button key={item.id} onClick={() => learning.onGoToCore(index)}><span>{String(order + 1).padStart(2,"0")}</span><div><strong>{item.title}</strong><small>{item.purpose}</small></div><ArrowRight size={13} /></button>)}</section>}
        {supports.length > 0 && <section className="page-support-links"><span className="eyebrow">OPTIONAL SUPPORT</span>{supports.map((support) => <button key={support.id} onClick={() => openPage(support.id)}><BookOpen size={12} /><span>{support.title}</span><ArrowRight size={12} /></button>)}</section>}
        <div className="page-reading-tools"><button onClick={onOpenSources}><FileText size={12} />Source passages</button>{page.conceptIds[0] && <button onClick={() => onOpenConcept(page.conceptIds[0])}><BookOpen size={12} />Concept details</button>}{!isOverview && <button onClick={learning.onStartSimpler}>Start more simply</button>}</div>
        <div className="page-transition">{isSupport ? <><span className="eyebrow">RETURN TO THE PROBLEM</span><p>Continue from the same place, with the same simulation state.</p><button className="primary-button" disabled={!learning.canGoBack} onClick={learning.onBack}><ArrowLeft size={13} />Back to where you were</button></> : <><span className="eyebrow">{isOverview ? "START WITH THE PROBLEM" : "WHY THIS COMES NEXT"}</span><p>{sequenceStep?.whyNext ?? (next ? next.purpose : "Bring these ideas together in final practice.")}</p><button className="primary-button" onClick={() => next ? learning.onGoToCore(nextIndex) : onOpenPractice()}>{next ? next.title : "Final practice"}<ArrowRight size={13} /></button></>}</div>
      </article>
      <section className="hierarchy-visual" aria-label="Shared lesson scenario"><div className="shared-scenario-label"><span>SAME SCENARIO</span><strong>{design.scenario.title}</strong></div>{page.scene !== "none" ? <LearningCanvas key={`${session.lesson.id}:${session.lesson.revision}`} lesson={session.lesson} selectedConceptId={session.selectedConceptId} onSelectConcept={session.onSelectConcept} onOpenConcept={onOpenConcept} pageScene={page.scene} activityConceptId={page.activityConceptId ?? design.scenario.activityConceptId} simulations={learning.simulations} onSimulationChange={learning.onSimulationChange} activeSceneIndex={learning.location.sceneIndex} onSceneChange={() => { /* Page navigation owns the route; scene clicks only select concepts. */ }} /> : <div className="scenario-context"><span className="eyebrow">KEEP THE PROBLEM IN VIEW</span><h2>{design.scenario.title}</h2><p>{design.scenario.description}</p><dl>{design.scenario.entities.map((entity) => <div key={entity.id}><dt>{entity.label}</dt><dd>{entity.role}</dd></div>)}</dl></div>}</section>
    </div>
    <footer className="sequence-dock hierarchy-dock" id="guided-sequence" aria-label="Core learning route">{routeOpen && <div className="sequence-popover"><div className="sequence-popover-heading"><span>CORE ROUTE · OPTIONAL SUPPORT DOES NOT COUNT</span><button className="icon-button" onClick={() => setRouteOpen(false)} aria-label="Close core route"><X size={14} /></button></div>{learning.route.map((item,index) => <button key={item.id} className={item.id === page.id ? "active" : ""} onClick={() => {setRouteOpen(false);learning.onGoToCore(index);}}><span>{item.kind === "overview" ? "↗" : corePages.findIndex((core) => core.page.id === item.id) + 1}</span><div><strong>{item.title}</strong><small>{item.purpose}</small></div></button>)}<button onClick={onOpenPractice}><span><Layers size={13} /></span><div><strong>Final practice</strong><small>Apply the connected ideas</small></div></button></div>}<button className="sequence-arrow" disabled={isSupport ? !learning.canGoBack : learning.coreIndex <= 0} onClick={() => isSupport ? learning.onBack() : learning.onGoToCore(learning.coreIndex - 1)} aria-label={isSupport ? "Back to main page" : "Previous core page"}><ArrowLeft size={16} /></button><button className="sequence-current" aria-expanded={routeOpen} onClick={() => setRouteOpen(!routeOpen)}><span>{isSupport ? "OPTIONAL SUPPORT" : isOverview ? "OVERVIEW" : `CORE PAGE ${position + 1} OF ${corePages.length}`}</span><strong>{page.title}</strong><ChevronDown size={14} /></button><button className="sequence-arrow sequence-next" onClick={() => isSupport ? learning.onBack() : next ? learning.onGoToCore(nextIndex) : onOpenPractice()} disabled={isSupport && !learning.canGoBack} aria-label={isSupport ? "Return to main page" : next ? "Next core page" : "Start final practice"}><ArrowRight size={16} /></button></footer>
  </>;
}
