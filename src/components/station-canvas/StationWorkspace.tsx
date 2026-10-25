"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownRight, ArrowLeft, ArrowRight, ChevronRight, CornerDownRight, Expand, Home, Layers3, Minus, Pause, Play, Plus, RotateCcw, Scan, Sparkles } from "lucide-react";
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  getBezierPath,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { buildBubbleTrace, createSortItems, getCanvas, getFrameForMode, SORTING_VALUES, STABILITY_VALUES, TRANSFER_VALUES } from "@/lib/station-canvas/model";
import type { CanvasId, SortFrame, Station } from "@/lib/station-canvas/types";
import { SortDemonstration } from "./SortDemonstration";
import { SortingPrediction } from "./SortingPrediction";
import { TopicExplorer } from "./TopicExplorer";
import styles from "./station-workspace.module.css";

type StationData = Record<string, unknown> & {
  station: Station;
  index: number;
  active: boolean;
  frame: SortFrame;
  previousFrame?: SortFrame;
  onFocus: () => void;
  onEnter: () => void;
};
type StationNode = Node<StationData, "station">;
type ConnectionEdge = Edge<{ optional: boolean }, "connection">;
type CanvasVisit = {
  canvasId: CanvasId;
  stationId: string;
  viewport: Viewport;
  scope: "core" | "transfer" | "stability";
  coreFrame: number;
  transferFrame: number;
  stabilityFrame: number;
};

const handles = [Position.Left, Position.Right, Position.Top, Position.Bottom];

function TeachingStation({ data }: NodeProps<StationNode>) {
  const { station, index, active, frame, previousFrame, onFocus, onEnter } = data;
  return (
    <article className={`${styles.station} ${styles[station.kind]} ${active ? styles.activeStation : ""}`} style={{ width: station.width, minHeight: station.height }} aria-label={`${station.title} teaching station`}>
      {handles.map((position) => <span key={position}><Handle id={`in-${position}`} type="target" position={position} className={styles.handle} /><Handle id={`out-${position}`} type="source" position={position} className={styles.handle} /></span>)}
      <div className={styles.stationTopline}>
        <button className={`nodrag nopan ${styles.stationHeading}`} onClick={onFocus} aria-label={`Focus ${station.title}`}><span className={styles.stationNumber}>{String(index + 1).padStart(2, "0")}</span><span>{station.title}</span></button>
        {active ? <span className={styles.liveTag}><span />Live example</span> : <span className={styles.stationKind}>{station.kind === "challenge" ? "Try it" : station.detailCanvas ? "Preview · explore inside" : "Preview"}</span>}
      </div>
      <h2>{station.question}</h2>
      <div className={styles.demonstration}><SortDemonstration mode={station.visual} frame={frame} previousFrame={previousFrame} compact onOpenDetail={station.detailCanvas ? onEnter : undefined} /></div>
      <div className={styles.stationFoot}>
        <p>{station.caption}</p>
        {station.detailCanvas && <button className={`nodrag nopan ${styles.enterButton}`} onClick={(event) => { event.stopPropagation(); onEnter(); }} aria-label={`Explore ${station.title} in a deeper canvas`}><CornerDownRight size={16} /><span>Explore inside</span><ArrowRight size={15} /></button>}
      </div>
      {station.note && <span className={styles.stationNote}>{station.note}</span>}
    </article>
  );
}

function TeachingConnection({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, label, data }: EdgeProps<ConnectionEdge>) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, curvature: 0.36 });
  return <>
    <BaseEdge id={id} path={path} className={`${styles.connection} ${data?.optional ? styles.optionalConnection : ""}`} markerEnd="url(#station-arrow)" />
    <EdgeLabelRenderer><div className={`${styles.connectionLabel} ${data?.optional ? styles.optionalLabel : ""}`} style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }}><span>{label}</span>{data?.optional ? <CornerDownRight size={14} /> : <ArrowRight size={14} />}</div></EdgeLabelRenderer>
  </>;
}

const nodeTypes = { station: TeachingStation };
const edgeTypes = { connection: TeachingConnection };

export function StationWorkspace() {
  const [detail, setDetail] = useState<{ canvas: CanvasId; frame: number } | null>(null);
  return <div style={{ position: "relative" }}>
    <div style={{ visibility: detail ? "hidden" : "visible" }} aria-hidden={detail ? true : undefined} inert={detail ? true : undefined}><TopicExplorer onOpenCanvas={(canvas, frame) => setDetail({ canvas, frame })} /></div>
    {detail && <div style={{ position: "absolute", inset: 0 }}><ReactFlowProvider><ConnectedWorkspace initialCanvas={detail.canvas} initialFrame={detail.frame} onReturnToMap={() => setDetail(null)} /></ReactFlowProvider></div>}
  </div>;
}

function ConnectedWorkspace({ initialCanvas, initialFrame, onReturnToMap }: { initialCanvas: CanvasId; initialFrame: number; onReturnToMap: () => void }) {
  const flow = useReactFlow<StationNode, ConnectionEdge>();
  const [canvasId, setCanvasId] = useState<CanvasId>(initialCanvas);
  const [selectedId, setSelectedId] = useState(() => getCanvas(initialCanvas).stations[0].id);
  const [history, setHistory] = useState<CanvasVisit[]>([]);
  const [scope, setScope] = useState<"core" | "transfer" | "stability">(initialCanvas === "transfer" ? "transfer" : initialCanvas === "stability" ? "stability" : "core");
  const [coreFrame, setCoreFrame] = useState(initialFrame);
  const [transferFrame, setTransferFrame] = useState(0);
  const [stabilityFrame, setStabilityFrame] = useState(() => {
    const equalTrace = buildBubbleTrace(createSortItems(STABILITY_VALUES));
    return Math.max(0, equalTrace.findIndex((frame) => frame.phase === "compare" && frame.activeIds.length === 2 && frame.items.filter((item) => frame.activeIds.includes(item.id)).every((item, _, pair) => item.value === pair[0].value)));
  });
  const [playing, setPlaying] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [isOverview, setIsOverview] = useState(false);
  const [introVisible, setIntroVisible] = useState(true);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const pendingViewport = useRef<Viewport | null>(null);
  const canvas = useMemo(() => getCanvas(canvasId), [canvasId]);
  const coreTrace = useMemo(() => buildBubbleTrace(createSortItems(SORTING_VALUES)), []);
  const transferTrace = useMemo(() => buildBubbleTrace(createSortItems(TRANSFER_VALUES)), []);
  const stabilityTrace = useMemo(() => buildBubbleTrace(createSortItems(STABILITY_VALUES)), []);
  const selectedStation = canvas.stations.find((station) => station.id === selectedId) ?? canvas.stations[0];
  const activeTransfer = scope === "transfer" || (canvasId === "sorting" && selectedStation.visual === "transfer");
  const activeStability = scope === "stability";
  const trace = activeStability ? stabilityTrace : activeTransfer ? transferTrace : coreTrace;
  const frameIndex = Math.min(activeStability ? stabilityFrame : activeTransfer ? transferFrame : coreFrame, trace.length - 1);
  const currentFrame = trace[frameIndex];
  const predictionNeeded = activeTransfer && (currentFrame.phase === "ready" || currentFrame.phase === "compare");
  const selectedIndex = canvas.stations.findIndex((station) => station.id === selectedStation.id);
  const duration = reducedMotion ? 0 : 440;

  const setFrame = useCallback((next: number | ((current: number) => number)) => {
    if (activeStability) setStabilityFrame(next);
    else if (activeTransfer) setTransferFrame(next);
    else setCoreFrame(next);
  }, [activeTransfer, activeStability]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!playing) return;
    if (predictionNeeded) { setPlaying(false); return; }
    if (frameIndex >= trace.length - 1) { setPlaying(false); return; }
    const timer = window.setTimeout(() => setFrame((value) => Math.min(value + 1, trace.length - 1)), currentFrame.phase === "swap" ? 1150 : 900);
    return () => window.clearTimeout(timer);
  }, [playing, predictionNeeded, frameIndex, trace.length, currentFrame.phase, setFrame]);

  const focusStation = useCallback((station: Station) => {
    setSelectedId(station.id);
    setIsOverview(false);
    setIntroVisible(false);
    const availableWidth = typeof window !== "undefined" ? window.innerWidth : 1280;
    const availableHeight = typeof window !== "undefined" ? window.innerHeight : 800;
    const actualHeight = flow.getNode(station.id)?.measured?.height ?? Math.max(station.height, station.kind === "problem" ? 450 : 400);
    const zoom = Math.min(1.12, (availableWidth - 66) / station.width, (availableHeight - 260) / (actualHeight + 20));
    void flow.setViewport({ x: (availableWidth - station.width * zoom) / 2 - station.x * zoom, y: 142 - station.y * zoom, zoom: Math.max(0.38, zoom) }, { duration });
  }, [flow, duration]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (pendingViewport.current) {
        void flow.setViewport(pendingViewport.current, { duration });
        pendingViewport.current = null;
      } else {
        const first = canvas.stations[0];
        const width = window.innerWidth;
        if (width < 700) {
          focusStation(first);
        } else {
          // Start close enough to read and act. The canvas extends beyond this first view.
          const actualHeight = flow.getNode(first.id)?.measured?.height ?? Math.max(first.height, 450);
          const zoom = Math.min(0.84, (window.innerHeight - 255) / actualHeight);
          void flow.setViewport({ x: 96 - first.x * zoom, y: 160 - first.y * zoom, zoom: Math.max(0.5, zoom) }, { duration: 0 });
        }
      }
    }, 100);
    return () => window.clearTimeout(timer);
    // The viewport is restored only on a canvas change, not when playback updates a frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasId]);

  const enterCanvas = useCallback((destination: CanvasId, sourceStationId?: string) => {
    if (destination === canvasId) return;
    setHistory((visits) => [...visits, { canvasId, stationId: sourceStationId ?? selectedId, viewport: flow.getViewport(), scope, coreFrame, transferFrame, stabilityFrame }]);
    setPlaying(false);
    setOutlineOpen(false);
    setIntroVisible(false);
    setCanvasId(destination);
    setSelectedId(getCanvas(destination).stations[0].id);
    if (destination === "transfer") setScope("transfer");
    else if (destination === "stability") setScope("stability");
    setIsOverview(false);
  }, [canvasId, selectedId, flow, scope, coreFrame, transferFrame, stabilityFrame]);

  const returnToVisit = useCallback((index: number) => {
    const visit = history[index];
    if (!visit) return;
    pendingViewport.current = visit.viewport;
    setPlaying(false);
    setCanvasId(visit.canvasId);
    setSelectedId(visit.stationId);
    setScope(visit.scope);
    setCoreFrame(visit.coreFrame);
    setTransferFrame(visit.transferFrame);
    setStabilityFrame(visit.stabilityFrame);
    setHistory((visits) => visits.slice(0, index));
    setOutlineOpen(false);
    setIsOverview(false);
  }, [history]);

  const nodes = useMemo<StationNode[]>(() => canvas.stations.map((station, index) => {
    const active = station.id === selectedStation.id;
    const stationTrace = activeStability ? stabilityTrace : scope === "transfer" || (canvasId === "sorting" && station.visual === "transfer") ? transferTrace : coreTrace;
    const stationIsTransfer = scope === "transfer" || (canvasId === "sorting" && station.visual === "transfer");
    const previewIndex = activeStability ? Math.min(stabilityFrame, stationTrace.length - 1) : stationIsTransfer ? Math.min(transferFrame, stationTrace.length - 1) : Math.max(0, Math.min(getFrameForMode(stationTrace, station.visual), stationTrace.length - 1));
    return {
      id: station.id,
      type: "station",
      position: { x: station.x, y: station.y },
      draggable: false,
      selectable: false,
      style: { width: station.width },
      data: { station, index, active, frame: active ? currentFrame : stationTrace[previewIndex], previousFrame: active ? trace[Math.max(0, frameIndex - 1)] : stationTrace[Math.max(0, previewIndex - 1)], onFocus: () => focusStation(station), onEnter: () => station.detailCanvas && enterCanvas(station.detailCanvas, station.id) },
    };
  }), [canvas, selectedStation.id, trace, coreTrace, transferTrace, stabilityTrace, stabilityFrame, activeStability, transferFrame, scope, currentFrame, frameIndex, focusStation, enterCanvas]);

  const edges = useMemo<ConnectionEdge[]>(() => canvas.connections.map((connection) => {
    const source = canvas.stations.find((station) => station.id === connection.source);
    const target = canvas.stations.find((station) => station.id === connection.target);
    const dx = (target?.x ?? 0) - (source?.x ?? 0);
    const dy = (target?.y ?? 0) - (source?.y ?? 0);
    const horizontal = Math.abs(dx) > Math.abs(dy) * 0.7;
    const sourceSide = horizontal ? dx > 0 ? "right" : "left" : dy > 0 ? "bottom" : "top";
    const targetSide = horizontal ? dx > 0 ? "left" : "right" : dy > 0 ? "top" : "bottom";
    return { id: connection.id, source: connection.source, target: connection.target, type: "connection", sourceHandle: `out-${sourceSide}`, targetHandle: `in-${targetSide}`, label: connection.label, data: { optional: !!connection.optional }, selectable: false };
  }), [canvas]);

  function showOverview() {
    setPlaying(false);
    setIsOverview(true);
    setIntroVisible(false);
    void flow.fitView({ padding: 0.16, duration, minZoom: 0.18, maxZoom: 0.82 });
  }

  function revealPrediction() {
    const comparison = currentFrame.phase === "ready" ? trace.findIndex((frame) => frame.phase === "compare") : frameIndex;
    setPlaying(false);
    setFrame(Math.min(Math.max(comparison, frameIndex) + 1, trace.length - 1));
  }

  function moveToStation(direction: number) {
    const next = canvas.stations[Math.max(0, Math.min(canvas.stations.length - 1, selectedIndex + direction))];
    if (next) focusStation(next);
  }

  return (
    <main className={styles.workspace}>
      <svg className={styles.markerDefs} aria-hidden="true"><defs><marker id="station-arrow" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="none" stroke="#95a5bb" strokeWidth="1.2" /></marker></defs></svg>
      <ReactFlow<StationNode, ConnectionEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={(_, node) => focusStation(node.data.station)}
        minZoom={0.18}
        maxZoom={1.65}
        panOnDrag
        panOnScroll
        zoomOnScroll={false}
        zoomOnPinch
        preventScrolling
        nodesConnectable={false}
        nodesDraggable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: false }}
        className={styles.flow}
      ><Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#d9dee8" /></ReactFlow>

      <header className={styles.header}>
        <div className={styles.identity}><a href="/" className={styles.wordmark} aria-label="SMRTR home">smrtr<span>↗</span></a><span className={styles.headerDivider} /><span className={styles.studyTitle}>Sorting, from the inside out.</span></div>
        <div className={styles.headerActions}><span className={styles.studyBadge}>Curated interaction study</span><button className={styles.outlineButton} onClick={() => setOutlineOpen(!outlineOpen)} aria-expanded={outlineOpen}><Layers3 size={16} /><span>Stations</span></button><button className={styles.overviewButton} onClick={showOverview}><Scan size={16} /><span>Whole canvas</span></button></div>
      </header>

      <nav className={styles.breadcrumbs} aria-label="Canvas depth">
        <button className={styles.backButton} onClick={onReturnToMap}><Home size={15} /><span>Topic map</span></button>
        {history.length > 0 && <button className={styles.backButton} onClick={() => returnToVisit(history.length - 1)} aria-label={`Back to ${getCanvas(history[history.length - 1].canvasId).title}`}><ArrowLeft size={17} /><span>Back</span></button>}
        {history.map((visit, index) => <span className={styles.crumb} key={`${visit.canvasId}-${index}`}><button onClick={() => returnToVisit(index)}>{index === 0 ? <Home size={14} /> : null}{getCanvas(visit.canvasId).title}</button><ChevronRight size={13} /></span>)}
        <span className={styles.currentCrumb}>{canvas.title}</span>
      </nav>

      <h1 className={styles.accessibleTitle}>{canvas.title}</h1>

      {introVisible && <div className={styles.introHint}><span><Sparkles size={15} /></span><div><strong>Start with the shelf. Follow the connections.</strong><p>Open a linked station to find a canvas inside.</p></div><button onClick={() => setIntroVisible(false)} aria-label="Dismiss canvas introduction">×</button></div>}

      {outlineOpen && <nav className={styles.stationOutline} aria-label="Stations on this canvas"><div><strong>On this canvas</strong><button onClick={() => setOutlineOpen(false)} aria-label="Close station outline">×</button></div>{canvas.stations.map((station, index) => <button key={station.id} className={station.id === selectedStation.id ? styles.outlineActive : ""} onClick={() => { focusStation(station); setOutlineOpen(false); }}><span>{String(index + 1).padStart(2, "0")}</span><span>{station.title}</span><ArrowDownRight size={14} /></button>)}</nav>}

      <div className={styles.cameraControls} aria-label="Canvas camera controls"><button onClick={() => void flow.zoomIn({ duration })} aria-label="Zoom in"><Plus size={18} /></button><button onClick={() => void flow.zoomOut({ duration })} aria-label="Zoom out"><Minus size={18} /></button><button onClick={() => focusStation(selectedStation)} aria-label="Focus current station"><Expand size={17} /></button></div>
      <div className={styles.panHint}>Drag the open space <span>·</span> Pinch to zoom</div>

      {predictionNeeded && <aside className={styles.predictionDock}><SortingPrediction frame={currentFrame} onReveal={revealPrediction} /></aside>}

      <section className={styles.playback} aria-label="Live sorting demonstration">
        <div className={styles.playbackContext}><span>{activeStability ? "EQUAL-VALUE EXAMPLE" : activeTransfer ? "NEW SHELF" : "SAME FIVE BOOKS"}</span><strong>{selectedStation.title}</strong></div>
        <div className={styles.transport}><button onClick={() => { setFrame(0); setPlaying(false); }} aria-label="Reset sorting demonstration"><RotateCcw size={17} /></button><button onClick={() => { if (frameIndex === trace.length - 1) setFrame(0); setPlaying(!playing); }} className={styles.playButton} disabled={predictionNeeded} aria-label={playing ? "Pause sorting animation" : "Play sorting animation"}>{playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}</button><button onClick={() => { setPlaying(false); setFrame((value) => Math.min(value + 1, trace.length - 1)); }} disabled={predictionNeeded || frameIndex >= trace.length - 1} aria-label="Next sorting action"><ArrowRight size={19} /></button></div>
        <div className={styles.liveObservation} aria-live="polite"><span>{currentFrame.phase === "done" ? "SORTED" : `ACTION ${frameIndex + 1} / ${trace.length}`}</span><p>{currentFrame.description}</p></div>
        <div className={styles.stationStepper}><button onClick={() => moveToStation(-1)} disabled={selectedIndex === 0} aria-label="Focus previous station"><ArrowLeft size={17} /></button><span>{selectedIndex + 1}<i>/ {canvas.stations.length}</i></span><button onClick={() => moveToStation(1)} disabled={selectedIndex === canvas.stations.length - 1} aria-label="Focus next station"><ArrowRight size={17} /></button></div>
      </section>
      {isOverview && <button className={styles.resumeButton} onClick={() => focusStation(selectedStation)}><Scan size={16} />Resume at {selectedStation.title}<ArrowRight size={16} /></button>}
    </main>
  );
}
