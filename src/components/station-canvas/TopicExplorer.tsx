"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, ChevronDown, Expand, Minus, Pause, Play, Plus, RotateCcw } from "lucide-react";
import { Background, BackgroundVariant, Handle, MarkerType, Position, ReactFlow, ReactFlowProvider, useReactFlow, type Edge, type Node, type NodeChange, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { descendantCount, layoutTopicMap, topicById, type TopicElement } from "@/lib/station-canvas/topic-map";
import { buildBubbleTrace, createSortItems, SORTING_VALUES } from "@/lib/station-canvas/model";
import { cameraEase } from "@/lib/station-canvas/topic-motion";
import type { CanvasId, SortFrame } from "@/lib/station-canvas/types";
import { SortDemonstration } from "./SortDemonstration";
import { useTopicMotion } from "./useTopicMotion";
import styles from "./topic-explorer.module.css";

type ElementData = Record<string, unknown> & {
  element: TopicElement;
  expanded: boolean;
  explained: boolean;
  selected: boolean;
  frame: SortFrame;
  previousFrame?: SortFrame;
  playing: boolean;
  exiting: boolean;
  instant: boolean;
  onBranch: (animate?: boolean) => void;
  onExplain: (animate?: boolean) => void;
  onCanvas: () => void;
  onPlay: () => void;
  onStep: () => void;
  onReset: () => void;
};
type ElementNode = Node<ElementData, "element">;

function InlineDefinition({ open, instant, children }: { open: boolean; instant: boolean; children: ReactNode }) {
  return <div className={styles.reveal} data-open={open} data-instant={instant} aria-hidden={!open} inert={!open}><div className={styles.revealClip}><div className={styles.definition}>{children}</div></div></div>;
}

function MapElement({ data }: NodeProps<ElementNode>) {
  const { element, expanded, explained, selected } = data;
  const isTopic = element.kind === "topic";
  const branchControl = element.children.length > 0 && <button className={`nodrag nopan ${styles.branchToggle} ${expanded ? styles.branchOpen : ""}`} onClick={(event) => data.onBranch(event.detail !== 0)} aria-expanded={expanded} aria-label={`${expanded ? "Fold" : "Unfold"} ${element.title} branch`} title="Hide or reveal this part. Your place is saved.">
    {expanded ? <Minus size={14} /> : <Plus size={14} />}<span>{expanded ? isTopic ? "Fold map" : "Fold" : `${descendantCount(element.id)} ideas`}</span>
  </button>;
  return <article className={`${styles.element} ${styles[element.kind]} ${selected ? styles.selected : ""}`} aria-label={`${element.title} map element`} data-topic-id={element.id} aria-hidden={data.exiting || undefined} inert={data.exiting}>
    <Handle type="target" position={Position.Left} className={styles.handle} style={isTopic ? { top: 68 } : undefined} />
    <Handle type="source" position={Position.Right} className={styles.handle} style={isTopic ? { top: 68 } : undefined} />
    {isTopic ? <>
      <div className={styles.topicRing}>
        <span>{element.eyebrow}</span>
        <button className="nodrag nopan" onClick={(event) => data.onExplain(event.detail !== 0)} aria-expanded={explained} aria-label="Show sorting definition">{element.title}<Plus size={17} /></button>
        <p>Choose a question to explore.</p>
      </div>
      {!explained && <div className={styles.hoverDefinition}><p>{element.summary}</p><button className="nodrag nopan" onClick={(event) => data.onExplain(event.detail !== 0)}>Read the definition here <ArrowRight size={14} /></button></div>}
      <InlineDefinition open={explained} instant={data.instant}><p>{element.explanation}</p><button className="nodrag nopan" onClick={(event) => data.onExplain(event.detail !== 0)}>Hide definition <Minus size={13} /></button></InlineDefinition>
    </> : <>
      <span className={styles.eyebrow}>{element.eyebrow}</span>
      <h2>{element.title}</h2>
      <p className={styles.summary}>{element.summary}</p>
      {element.kind === "example" && <div className={styles.liveExample}>
        <SortDemonstration mode="problem" frame={data.frame} previousFrame={data.previousFrame} compact />
        <div className={`nodrag nopan ${styles.transport}`}><button onClick={data.onReset} aria-label="Reset map sorting example"><RotateCcw size={15} /></button><button onClick={data.onPlay} aria-label={data.playing ? "Pause map sorting example" : "Play map sorting example"}>{data.playing ? <Pause size={17} /> : <Play size={17} />}</button><button onClick={data.onStep} aria-label="Next map sorting action" disabled={data.frame.phase === "done"}><ArrowRight size={17} /></button><span aria-live="polite">{data.frame.description}</span></div>
      </div>}
      {element.id === "direction" && <div className={styles.orderExample}><span>£12</span><span>£28</span><span>£45</span><ArrowRight size={17} /><small>low → high</small></div>}
      {element.kind === "comparison" && <table className={styles.comparison}><caption>Standard algorithms · worst case</caption><tbody><tr><th>Bubble</th><td>O(n²)</td></tr><tr><th>Merge</th><td>O(n log n)</td></tr><tr><th>Quick</th><td>O(n²)</td></tr></tbody></table>}
      <div className={`nodrag nopan ${styles.elementActions}`}>
        <button onClick={(event) => data.onExplain(event.detail !== 0)} aria-expanded={explained} aria-label={`${explained ? "Hide" : "Explain"} ${element.title} here`}>{explained ? <Minus size={14} /> : <Plus size={14} />}{explained ? "Less" : "Explain"}</button>
        {element.canvas && <button className={styles.deepLink} onClick={data.onCanvas} aria-label={`Open ${element.title} detail canvas`}>Open canvas <ArrowRight size={14} /></button>}
        {branchControl}
      </div>
      <InlineDefinition open={explained} instant={data.instant}><p>{element.explanation}</p>{element.kind === "comparison" && <a className="nodrag nopan" href="https://algs4.cs.princeton.edu/cheatsheet/" target="_blank" rel="noreferrer">Algorithm reference ↗</a>}</InlineDefinition>
    </>}
    {isTopic && branchControl}
  </article>;
}

const nodeTypes = { element: MapElement };
const edgeDefaults = { type: "default", markerEnd: { type: MarkerType.ArrowClosed, color: "#b2bac8", width: 15, height: 15 }, style: { stroke: "#b2bac8", strokeWidth: 1.4 }, labelStyle: { fill: "#737f90", fontSize: 12 }, labelBgStyle: { fill: "#f6f7f9", fillOpacity: 0.97 }, labelBgPadding: [9, 6] as [number, number], labelBgBorderRadius: 20 };
const trace = buildBubbleTrace(createSortItems(SORTING_VALUES));

export function TopicExplorer({ onOpenCanvas }: { onOpenCanvas: (canvas: CanvasId, frame: number) => void }) {
  return <ReactFlowProvider><TopicMap onOpenCanvas={onOpenCanvas} /></ReactFlowProvider>;
}

function TopicMap({ onOpenCanvas }: { onOpenCanvas: (canvas: CanvasId, frame: number) => void }) {
  const flow = useReactFlow<ElementNode>();
  const [expanded, setExpanded] = useState(() => new Set(["sorting"]));
  const expandedRef = useRef(expanded);
  const [explained, setExplained] = useState<Set<string>>(() => new Set());
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState("sorting");
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [indexOpen, setIndexOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [instantReveal, setInstantReveal] = useState(false);
  const initialized = useRef(false);
  const reduced = useRef(false);
  const placements = useMemo(() => layoutTopicMap(expanded, heights), [expanded, heights]);
  const visibleIds = useMemo(() => new Set(placements.map((node) => node.element.id)), [placements]);
  const { rendered, pin } = useTopicMotion(placements, reducedMotion);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => { reduced.current = media.matches; setReducedMotion(media.matches); };
    change();
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);

  useEffect(() => {
    if (!playing) return;
    if (!visibleIds.has("bubble") || frameIndex >= trace.length - 1) { setPlaying(false); return; }
    const timer = window.setTimeout(() => setFrameIndex((index) => Math.min(index + 1, trace.length - 1)), trace[frameIndex].phase === "swap" ? 1150 : 900);
    return () => window.clearTimeout(timer);
  }, [playing, visibleIds, frameIndex]);

  const focus = useCallback((id: string) => {
    setSelected(id);
    void flow.fitView({ nodes: [{ id }], padding: 0.35, minZoom: 0.55, maxZoom: 1.1, duration: reduced.current ? 0 : 600, ease: cameraEase, interpolate: "linear" });
  }, [flow]);

  const toggleBranch = useCallback((element: TopicElement, animate = true) => {
    const closing = expandedRef.current.has(element.id);
    pin(element.id, animate);
    const next = new Set(expandedRef.current);
    if (closing) next.delete(element.id); else next.add(element.id);
    expandedRef.current = next;
    setExpanded(next);
    setSelected(element.id);
    setAnnouncement(closing ? `${element.title} folded. Its explanations and example state are kept.` : `${element.title} opened. Connected details are visible.`);
    // Unfolding changes the graph, never the user's camera or zoom.
  }, [pin]);

  const onNodeChanges = useCallback((changes: NodeChange<ElementNode>[]) => {
    const dimensions = changes.filter((change) => change.type === "dimensions");
    if (!dimensions.length) return;
    setHeights((current) => {
      const next = { ...current }; let changed = false;
      for (const change of dimensions) if (change.type === "dimensions" && change.dimensions && Math.abs((next[change.id] ?? 0) - change.dimensions.height) > 1) { next[change.id] = change.dimensions.height; changed = true; }
      return changed ? next : current;
    });
  }, []);

  useEffect(() => {
    if (initialized.current || Object.keys(heights).length < 4) return;
    const timer = window.setTimeout(() => {
      initialized.current = true;
      if (window.innerWidth < 700) focus("sorting");
      else void flow.fitView({ padding: 0.15, minZoom: 0.4, maxZoom: 0.95, duration: 0 });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [heights, focus, flow]);

  const nodes = useMemo<ElementNode[]>(() => rendered.map(({ element, x, y, width, opacity, exiting }) => ({
    id: element.id, type: "element", position: { x, y }, style: { width, opacity, pointerEvents: exiting ? "none" : "auto" }, draggable: false, selectable: false,
    // Controlled position updates must retain measurements. Without these,
    // React Flow hides and remeasures every card on every animation frame.
    measured: heights[element.id] ? { width, height: heights[element.id] } : undefined,
    data: { element, expanded: expanded.has(element.id), explained: explained.has(element.id), selected: selected === element.id, frame: trace[frameIndex], previousFrame: trace[Math.max(0, frameIndex - 1)], playing, exiting, instant: instantReveal || reducedMotion,
      onBranch: (animate = true) => toggleBranch(element, animate),
      onExplain: (animate = true) => { pin(element.id, animate); setInstantReveal(!animate); setSelected(element.id); setExplained((current) => { const next = new Set(current); if (next.has(element.id)) next.delete(element.id); else next.add(element.id); return next; }); },
      onCanvas: () => { setPlaying(false); if (element.canvas) onOpenCanvas(element.canvas, frameIndex); },
      onPlay: () => { if (frameIndex >= trace.length - 1) setFrameIndex(0); setPlaying((value) => !value); },
      onStep: () => { setPlaying(false); setFrameIndex((index) => Math.min(index + 1, trace.length - 1)); },
      onReset: () => { setPlaying(false); setFrameIndex(0); },
    },
  })), [rendered, heights, expanded, explained, selected, frameIndex, playing, toggleBranch, onOpenCanvas, instantReveal, reducedMotion, pin]);

  const edges = useMemo<Edge[]>(() => {
    const present = new Map(rendered.map((node) => [node.element.id, node]));
    const tree = rendered.flatMap(({ element }) => element.children.filter((id) => present.has(id)).map((id) => ({ id: `${element.id}-${id}`, source: element.id, target: id, label: topicById.get(id)!.relation })));
    if (present.has("bubble") && present.has("growth")) tree.push({ id: "bubble-growth", source: "bubble", target: "growth", label: "the same strategy, measured" });
    return tree.map((edge) => {
      const opacity = Math.min(present.get(edge.source)!.opacity, present.get(edge.target)!.opacity);
      return { ...edge, ...edgeDefaults, labelStyle: { ...edgeDefaults.labelStyle, opacity }, labelBgStyle: { ...edgeDefaults.labelBgStyle, opacity }, style: { ...edgeDefaults.style, opacity, ...(edge.id === "bubble-growth" ? { stroke: "#b1a17b", strokeDasharray: "5 5" } : {}) } };
    });
  }, [rendered]);

  function viewBranch() {
    const element = topicById.get(selected)!;
    const ids = window.innerWidth < 700 ? element.children.slice(0, 1) : [element.id, ...element.children];
    void flow.fitView({ nodes: ids.filter((id) => visibleIds.has(id)).map((id) => ({ id })), padding: 0.18, minZoom: 0.3, maxZoom: 0.95, duration: reduced.current ? 0 : 650, ease: cameraEase, interpolate: "linear" });
    if (window.innerWidth < 700 && element.children[0]) setSelected(element.children[0]);
  }

  return <main className={styles.workspace}>
    <h1 className={styles.screenReader}>Sorting: an expandable topic map</h1>
    <header className={styles.header}><div className={styles.headerIdentity}><a className={styles.brand} href="/" aria-label="SMRTR home">smrtr<span>↗</span></a><div className={styles.studyName}>Sorting<span>Your learning map</span></div></div><div className={styles.headerActions}><button onClick={() => setIndexOpen(!indexOpen)} aria-expanded={indexOpen} aria-label="On the map">Browse <ChevronDown size={14} /></button><button onClick={() => void flow.fitView({ padding: 0.14, minZoom: 0.15, maxZoom: 0.95, duration: reduced.current ? 0 : 650, ease: cameraEase, interpolate: "linear" })}><Expand size={15} />Fit map</button></div></header>
    <div className={styles.mapArea}><ReactFlow<ElementNode> nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodeChanges} minZoom={0.15} maxZoom={1.5} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} panOnScroll zoomOnScroll={false} zoomOnPinch zoomOnDoubleClick={false} onNodeClick={(_, node) => setSelected(node.id)} defaultEdgeOptions={edgeDefaults}><Background variant={BackgroundVariant.Dots} gap={28} size={1} color="#dfe3e9" /></ReactFlow></div>
    <div className={styles.orientation}><span className={styles.orientationDot} /><span>Open only what you need.</span></div>
    {indexOpen && <nav className={styles.index} aria-label="Visible map elements"><strong>Visible on your map</strong>{placements.map(({ element }) => <button key={element.id} onClick={() => { focus(element.id); setIndexOpen(false); }}>{element.title}<ArrowRight size={13} /></button>)}</nav>}
    <div className={styles.camera}><button onClick={() => void flow.zoomIn({ duration: reduced.current ? 0 : 200 })} aria-label="Zoom topic map in"><Plus size={18} /></button><button onClick={() => void flow.zoomOut({ duration: reduced.current ? 0 : 200 })} aria-label="Zoom topic map out"><Minus size={18} /></button><button onClick={() => focus(selected)} aria-label="Focus selected map element"><Expand size={17} /></button></div>
    <footer className={styles.footer}><button className={styles.focusSelection} onClick={() => focus(selected)} aria-label={`Read ${topicById.get(selected)!.title}`}><Expand size={14} />Read idea</button>{expanded.has(selected) && topicById.get(selected)!.children.length > 0 ? <button className={styles.viewBranch} onClick={viewBranch}><ArrowRight size={14} />View branch</button> : null}<button onClick={() => focus("sorting")} aria-label="Back to the big picture"><ArrowLeft size={14} />Overview</button></footer>
    <p className={styles.screenReader} role="status">{announcement}</p>
  </main>;
}
