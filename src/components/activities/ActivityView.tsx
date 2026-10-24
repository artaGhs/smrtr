"use client";

import { useId, useMemo, useState } from "react";
import type { ActivitySpec, ActivityViewProps, BfsActivity } from "@/lib/contracts";
import { compareNodeIds, createBfsTrace, evaluateNextExpansion, pathTo, type BfsTrace } from "@/lib/simulation/bfs";
import styles from "./activities.module.css";

export function ActivityView({ activity, conceptId }: ActivityViewProps) {
  return activity.kind === "bfs"
    ? <BfsActivityView key={`${conceptId}:${JSON.stringify(activity)}`} activity={activity} />
    : <ConceptActivity key={`${conceptId}:${JSON.stringify(activity)}`} activity={activity} />;
}

function ConceptActivity({ activity }: { activity: Extract<ActivitySpec, { kind: "concept" }> }) {
  const [step, setStep] = useState(0);
  const current = activity.steps[step];
  return <section className={styles.lab} aria-label="Guided explanation">
    <div className={styles.heading}><span className={styles.eyebrow}>WORK THROUGH THE IDEA</span><span className={styles.badge}>Explanation</span></div>
    <p className={styles.prompt}>{activity.prompt}</p>
    <div className={styles.explanation} aria-live="polite">
      <span className={styles.counter}>STEP {step + 1} / {activity.steps.length}</span>
      <h4>{current.title}</h4><p>{current.body}</p>
    </div>
    {activity.steps.length > 1 && <div className={styles.controls}>
      <button type="button" disabled={step === 0} onClick={() => setStep(step - 1)}>← Previous</button>
      <button type="button" disabled={step === activity.steps.length - 1} onClick={() => setStep(step + 1)}>Next step →</button>
    </div>}
    <p className={styles.note}>An explanation from this lesson. Source support appears with the concept.</p>
  </section>;
}

function BfsActivityView({ activity }: { activity: BfsActivity }) {
  const [start, setStart] = useState(activity.start);
  const [directed, setDirected] = useState(activity.directed);
  const [variant, setVariant] = useState("original");
  const lastNode = activity.nodes.at(-1)!;
  const graph = useMemo(() => ({ ...activity, start, directed,
    edges: variant === "isolated" ? activity.edges.filter(e => e.source !== lastNode && e.target !== lastNode)
      : variant === "cycles" ? [...activity.edges, ...activity.edges.map(e => ({ source: e.target, target: e.source }))] : activity.edges,
  }), [activity, start, directed, variant, lastNode]);
  const result = useMemo(() => {
    try { return { trace: createBfsTrace(graph), error: null }; }
    catch (error) { return { trace: null, error: error instanceof Error ? error.message : "Check the graph input." }; }
  }, [graph]);
  return <section className={styles.lab} aria-label="Breadth-first search lab">
    <div className={styles.heading}><span className={styles.eyebrow}>INTERACTIVE LAB</span><span className={styles.badge}>BFS · computed live</span></div>
    <h3 className={styles.title}>A queue makes the order.</h3>
    <p className={styles.subtitle}>Expand one node. Discover its neighbors. Watch the next layer take shape.</p>
    <div className={styles.settings}>
      <label>Start node<select value={start} onChange={e => setStart(e.target.value)}>{activity.nodes.map(n => <option key={n} value={n}>{n}</option>)}</select></label>
      <label>Connections<select value={directed ? "directed" : "undirected"} onChange={e => setDirected(e.target.value === "directed")}><option value="directed">Directed →</option><option value="undirected">Undirected ↔</option></select></label>
      <label className={styles.wideSetting}>Experiment<select value={variant} onChange={e => setVariant(e.target.value)}><option value="original">Lesson graph</option><option value="cycles">Add return edges</option><option value="isolated">Isolate {lastNode}</option></select></label>
    </div>
    {result.trace ? <BfsPlayback key={JSON.stringify(graph)} trace={result.trace} /> : <p role="alert" className={styles.feedback}>{result.error}</p>}
    <p className={styles.note}>Unweighted edges · alphabetical node IDs (A before a) · mark visited when enqueued. Experiments reset playback and predictions.</p>
  </section>;
}

function BfsPlayback({ trace }: { trace: BfsTrace }) {
  const [index, setIndex] = useState(0);
  const [target, setTarget] = useState(trace.graph.nodes.at(-1)!);
  const [prediction, setPrediction] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const frame = trace.frames[index];
  const path = pathTo(frame, target);
  const changeStep = (next: number) => { setIndex(next); setPrediction(null); setChecked(false); };
  const evaluation = checked && prediction !== null ? evaluateNextExpansion(trace, index, prediction) : null;
  const description = frame.current === null ? `Discover ${trace.graph.start} and place it in the queue. No node has been expanded yet.`
    : `Expand ${frame.current}. ${frame.newlyDiscovered.length ? `Enqueue ${frame.newlyDiscovered.join(", ")} in alphabetical order.` : "No new nodes to enqueue."}${frame.skipped.length ? ` Skip ${frame.skipped.join(", ")}: already discovered.` : ""}`;
  return <>
    <GraphDiagram trace={trace} index={index} target={target} onTarget={setTarget} path={path} />
    <div className={styles.legend}><span>○ Unseen</span><span>◉ Queued</span><span>✓ Expanded</span><span>◎ Just expanded</span></div>
    <div className={styles.queueHeader}><strong>FIFO queue</strong><span>front → back</span></div>
    <ol className={styles.queue} aria-label="FIFO queue, front to back">
      {frame.queue.length ? frame.queue.map((node, i) => <li key={node}><span>{i === 0 ? "NEXT" : `+${i}`}</span><strong>{node}</strong></li>) : <li className={styles.emptyQueue}>Empty · traversal complete</li>}
    </ol>
    <div className={styles.stepInfo} aria-live="polite" aria-atomic="true"><span className={styles.counter}>{frame.complete ? "COMPLETE" : `EXPANSION ${index} / ${trace.frames.length - 1}`}</span><p>{description}</p>
      {frame.complete && <p>Reached {frame.discovered.length} of {trace.graph.nodes.length} nodes.{trace.unreachable.length ? ` Unreachable from ${trace.graph.start}: ${trace.unreachable.join(", ")}.` : " Every node is reachable."}</p>}
    </div>
    <div className={styles.controls}>
      <button type="button" aria-label="Previous BFS step" disabled={index === 0} onClick={() => changeStep(index - 1)}>← Previous</button>
      <button type="button" aria-label="Replay BFS from beginning" disabled={index === 0} onClick={() => changeStep(0)}>↺ Replay</button>
      <button type="button" className={styles.primary} aria-label="Next BFS step" disabled={frame.complete} onClick={() => changeStep(index + 1)}>Next →</button>
    </div>
    <label className={styles.timeline}>Scrub through the traversal<input type="range" min={0} max={trace.frames.length - 1} value={index} onChange={e => changeStep(Number(e.target.value))} aria-valuetext={`After ${index} expansions`} /></label>
    <div className={styles.inspector}><span className={styles.counter}>PATH TO {target}</span><p>{path ? <><strong>{path.join(" → ")}</strong><br />{frame.distances[target]} {frame.distances[target] === 1 ? "edge" : "edges"} from {trace.graph.start}. A fewest-edge path in this unweighted graph.</> : frame.complete ? `No path from ${trace.graph.start} to ${target}.` : `${target} is not discovered yet. Select any node to inspect its path.`}</p></div>
    <details className={styles.details}><summary>Inspect visited and expanded nodes</summary><p><strong>Visited (discovered on enqueue):</strong> {frame.discovered.join(", ")}</p><p><strong>Fully expanded:</strong> {frame.expanded.join(", ") || "None yet"}</p><p><strong>Neighbor order:</strong> {trace.graph.nodes.map(n => `${n}: [${trace.neighbors[n].join(", ")}]`).join("; ")}</p></details>
    {!frame.complete && <fieldset className={styles.prediction}><legend>Predict before the next step</legend><p>Which node will be expanded next?</p><div className={styles.predictionOptions}>{[...trace.graph.nodes].sort(compareNodeIds).map(node => <button type="button" key={node} disabled={checked} aria-pressed={prediction === node} onClick={() => setPrediction(node)}>{node}</button>)}</div><button type="button" className={styles.checkButton} disabled={prediction === null || checked} onClick={() => setChecked(true)}>Check prediction</button>
      {evaluation && <p className={styles.feedback} role="status"><strong>{evaluation.correct ? "Exactly. " : "Look at the queue. "}</strong>{evaluation.feedback}</p>}
    </fieldset>}
  </>;
}

function GraphDiagram({ trace, index, target, onTarget, path }: { trace: BfsTrace; index: number; target: string; onTarget: (id: string) => void; path: readonly string[] | null }) {
  const marker = useId().replace(/:/g, "");
  const frame = trace.frames[index];
  const size = Math.max(340, trace.graph.nodes.length * 35);
  const center = size / 2;
  const radius = size / 2 - 48;
  const positions = new Map(trace.graph.nodes.map((node, i) => {
    const angle = -Math.PI / 2 + i * Math.PI * 2 / trace.graph.nodes.length;
    return [node, { x: trace.graph.nodes.length === 1 ? center : center + radius * Math.cos(angle), y: trace.graph.nodes.length === 1 ? center : center + radius * Math.sin(angle) }];
  }));
  const edges = [...new Map(trace.graph.edges.map(e => [trace.graph.directed ? JSON.stringify([e.source, e.target]) : JSON.stringify([e.source, e.target].sort(compareNodeIds)), e])).values()];
  return <div className={styles.diagramWrap}><svg className={styles.diagram} viewBox={`0 0 ${size} ${size}`} role="group" aria-label={`${trace.graph.directed ? "Directed" : "Undirected"} graph. Select a node to inspect its fewest-edge path.`}>
    <defs><marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" /></marker></defs>
    {edges.map((edge, i) => {
      const from = positions.get(edge.source)!; const to = positions.get(edge.target)!;
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      const dx = length ? (to.x - from.x) / length : 0; const dy = length ? (to.y - from.y) / length : 0;
      const selected = path?.some((n, at) => at > 0 && ((path[at - 1] === edge.source && n === edge.target) || (!trace.graph.directed && path[at - 1] === edge.target && n === edge.source)));
      const reciprocal = trace.graph.directed && edges.some(e => e.source === edge.target && e.target === edge.source);
      const offset = reciprocal ? 4 : 0;
      const d = length ? `M ${from.x + dx * 25 - dy * offset} ${from.y + dy * 25 + dx * offset} L ${to.x - dx * 29 - dy * offset} ${to.y - dy * 29 + dx * offset}` : `M ${from.x - 18} ${from.y - 18} C ${from.x - 65} ${from.y - 80}, ${from.x + 65} ${from.y - 80}, ${from.x + 18} ${from.y - 18}`;
      return <path key={i} d={d} className={selected ? styles.pathEdge : styles.edge} markerEnd={trace.graph.directed ? `url(#${marker})` : undefined}><title>{edge.source} {trace.graph.directed ? "to" : "connected to"} {edge.target}</title></path>;
    })}
    {trace.graph.nodes.map(node => {
      const point = positions.get(node)!;
      const state = frame.expanded.includes(node) ? "expanded" : frame.discovered.includes(node) ? "queued" : "unseen";
      return <g key={node} transform={`translate(${point.x},${point.y})`} className={`${styles.graphNode} ${styles[state]} ${frame.current === node ? styles.current : ""}`} tabIndex={0} role="button" aria-pressed={target === node} aria-label={`Node ${node}, ${state}${frame.current === node ? ", just expanded" : ""}. ${frame.distances[node] !== undefined ? `Distance ${frame.distances[node]}.` : "Not discovered."} Inspect path.`} onClick={() => onTarget(node)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onTarget(node); } }}>
        <title>{node} · {state}</title>{target === node && <circle r="29" className={styles.targetRing} />}<circle r="23" className={styles.nodeCircle} /><text textAnchor="middle" y="5" className={styles.nodeText}>{node.length > 5 ? `${node.slice(0, 4)}…` : node}</text>
        <text textAnchor="middle" y="42" className={styles.nodeCaption}>{frame.current === node ? "◎ expanded now" : state === "expanded" ? `✓ layer ${frame.distances[node]}` : state === "queued" ? `queued · ${frame.distances[node]}` : "unseen"}</text>
      </g>;
    })}
  </svg></div>;
}
