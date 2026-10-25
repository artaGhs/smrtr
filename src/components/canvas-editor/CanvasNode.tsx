'use client';
import { useEffect, useMemo, useState } from 'react';
import { Handle, NodeResizer, Position, type Node, type NodeProps } from '@xyflow/react';
import { ArrowRight, Minus, Plus, Play, Pause, RotateCcw } from 'lucide-react';
import { buildBubbleTrace, createSortItems, getFrameForMode } from '@/lib/station-canvas/model';
import { SortDemonstration } from '@/components/station-canvas/SortDemonstration';
import { SortingPrediction } from '@/components/station-canvas/SortingPrediction';
import { ActivityView } from '@/components/activities/ActivityView';
import type { EditorNode } from '@/lib/canvas-document/model';
import type { CanvasBounds } from '@/lib/canvas-document/source';
import styles from './editor.module.css';

export type CanvasNodeData = Record<string, unknown> & {
  item: EditorNode; expanded: boolean; explained: boolean; children: number; edited: boolean;
  frame: number; onFrame: (frame: number) => void; onFold: () => void; onExplain: () => void; onEnter: () => void; onEdit: () => void;
  onResizeStart: () => void; onResize: (bounds: CanvasBounds) => void; onResizeEnd: (bounds: CanvasBounds) => void;
  connectable: boolean; hand: boolean; active: boolean;
};
export type FlowNode = Node<CanvasNodeData, 'canvasObject'>;

function Simulation({ item, frame, onFrame, active }: Pick<CanvasNodeData, 'item' | 'frame' | 'onFrame' | 'active'>) {
  const activity = item.activity;
  const values = activity?.kind === 'sorting' ? activity.values : [];
  const trace = useMemo(() => buildBubbleTrace(createSortItems(values)), [values]);
  const mode = activity?.kind === 'sorting' ? activity.mode ?? 'problem' : 'problem';
  const equalFrame = values.length !== new Set(values).size ? trace.findIndex(f => f.phase === 'compare' && f.activeIds.length === 2 && f.items.filter(i => f.activeIds.includes(i.id)).every((i, _, pair) => i.value === pair[0].value)) : -1;
  const index = Math.min(frame < 0 ? equalFrame >= 0 ? equalFrame : getFrameForMode(trace, mode) : frame, trace.length - 1);
  const [playing, setPlaying] = useState(false);
  const current = trace[index];
  const predict = mode === 'transfer' && ['ready', 'compare'].includes(current.phase);
  useEffect(() => {
    if (!playing || !active || predict || index >= trace.length - 1) { if (playing) setPlaying(false); return; }
    const timer = window.setTimeout(() => onFrame(index + 1), current.phase === 'swap' ? 1150 : 900);
    return () => clearTimeout(timer);
  }, [playing, active, predict, index, trace.length, current.phase, onFrame]);
  if (!activity) return null;
  if (activity.kind !== 'sorting') return <div className={`nodrag nopan nowheel ${styles.activity}`}><ActivityView activity={activity} conceptId={item.id} /></div>;
  return <div className={`nodrag nopan ${styles.simulation}`}>
    <SortDemonstration mode={mode} frame={current} previousFrame={trace[Math.max(0, index - 1)]} compact />
    <div className={styles.playback}>
      <button aria-label={`Reset ${item.title}`} onClick={() => { setPlaying(false); onFrame(0); }}><RotateCcw size={14} /></button>
      <button aria-label={`${playing ? 'Pause' : 'Play'} ${item.title}`} onClick={() => { if (index === trace.length - 1) onFrame(0); setPlaying(!playing); }}>{playing ? <Pause size={15} /> : <Play size={15} />}</button>
      <button aria-label={`Step ${item.title}`} onClick={() => { setPlaying(false); onFrame(Math.min(index + 1, trace.length - 1)); }} disabled={index === trace.length - 1}><ArrowRight size={15} /></button>
      <span>{current.description}</span>
    </div>
    {predict && <SortingPrediction frame={current} onReveal={() => { setPlaying(false); onFrame(current.phase === 'ready' ? Math.min(2, trace.length - 1) : Math.min(index + 1, trace.length - 1)); }} />}
  </div>;
}
export function CanvasNode({ data, selected }: NodeProps<FlowNode>) {
  const n = data.item;
  const ink = n.kind === 'ink', group = n.kind === 'group', bare = n.kind === 'text';
  const points = n.points ?? [];
  const pointWidth = Math.max(1, ...points.map(p => p.x)), pointHeight = Math.max(1, ...points.map(p => p.y));
  return <article data-editor-node={n.id} className={`${styles.card} ${styles[n.kind]} ${n.role === 'topic' ? styles.topic : n.role === 'branch' ? styles.branch : ''} ${selected ? styles.selected : ''}`} style={{ background: ink || bare || group ? undefined : n.style?.fill, color: n.style?.color, borderColor: n.style?.stroke }} aria-label={`${n.title || n.kind} canvas object`}>
    <NodeResizer isVisible={selected && !data.hand} minWidth={n.kind === 'simulation' ? 350 : 80} minHeight={ink ? 20 : 60} onResizeStart={data.onResizeStart} onResize={(_, p) => data.onResize({ x: p.x, y: p.y, width: p.width, height: p.height })} onResizeEnd={(_, p) => data.onResizeEnd({ x: p.x, y: p.y, width: p.width, height: p.height })} />
    {!ink && !group && <><Handle id="in" type="target" position={Position.Left} isConnectable={data.connectable} className={styles.handle} /><Handle id="out" type="source" position={Position.Right} isConnectable={data.connectable} className={styles.handle} /></>}
    {ink ? <svg className={styles.inkSvg} viewBox={`-4 -4 ${pointWidth + 8} ${pointHeight + 8}`} preserveAspectRatio="none"><path d={points.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ')} fill="none" stroke={n.style?.stroke ?? '#52677b'} strokeWidth={n.style?.strokeWidth ?? 3} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" /></svg> : n.role === 'topic' ? <>
      <div className={styles.topicRing}><span>{n.eyebrow ?? 'Start here'}</span><button className="nodrag nopan" onClick={data.onExplain} aria-expanded={data.explained} aria-label={`Explain ${n.title}`}><span className={styles.rootTitle} style={{ fontSize: n.title.length > 20 ? 24 : n.title.length > 12 ? 26 : 37 }}>{n.title}</span><Plus size={17} /></button><p>Choose a question to explore.</p></div>
      <div className={`nodrag nopan ${styles.cardActions}`}>
        {data.children > 0 && <button onClick={data.onFold} aria-expanded={data.expanded} aria-label={`${data.expanded ? 'Fold' : 'Unfold'} ${n.title}`}>{data.expanded ? <Minus size={13} /> : <Plus size={13} />}{data.expanded ? 'Fold map' : `${data.children} ideas`}</button>}
      </div>
      <div className={styles.disclosure} data-open={data.explained} inert={!data.explained} aria-hidden={!data.explained}><div><p>{n.explanation || n.summary}</p></div></div>
    </> : <>
      <div className={styles.cardHeading}><span>{n.eyebrow ?? (group ? 'Group' : n.role === 'annotation' ? 'My idea' : '')}</span>{data.edited && <small title="Your changes are separate from the original">Edited</small>}{n.detached && <small>Saved copy</small>}</div>
      <h2 onDoubleClick={event => { event.stopPropagation(); data.onEdit(); }}>{n.title || 'Untitled idea'}</h2>
      {!group && <>
        {n.summary && <p className={styles.summary}>{n.summary}</p>}
        {n.readiness === 'pending' && <span className={styles.pending}>Explanation is being prepared…</span>}
        {n.readiness === 'failed' && <span className={styles.pending}>This explanation is incomplete. Your notes are safe.</span>}
        {n.kind === 'simulation' && <Simulation item={n} frame={data.frame} onFrame={data.onFrame} active={data.active} />}
        {n.id === 'direction' && <div className={styles.order}><span>£12</span><span>£28</span><span>£45</span><ArrowRight size={16} /><small>low → high</small></div>}
        {n.id === 'growth' && <table className={styles.comparison}><caption>Standard algorithms · worst case</caption><tbody><tr><th>Bubble</th><td>O(n²)</td></tr><tr><th>Merge</th><td>O(n log n)</td></tr><tr><th>Quick</th><td>O(n²)</td></tr></tbody></table>}
        <div className={`nodrag nopan ${styles.cardActions}`}>
          {n.explanation && <button onClick={data.onExplain} aria-expanded={data.explained} aria-label={`${data.explained ? 'Hide' : 'Explain'} ${n.title}`}>{data.explained ? <Minus size={13} /> : <Plus size={13} />}{data.explained ? 'Less' : 'Explain'}</button>}
          {data.children > 0 && <button onClick={data.onFold} aria-expanded={data.expanded} aria-label={`${data.expanded ? 'Fold' : 'Unfold'} ${n.title}`}>{data.expanded ? <Minus size={13} /> : <Plus size={13} />}{data.expanded ? 'Fold' : `${data.children} ideas`}</button>}
          {n.detailCanvasId && <button onClick={data.onEnter}>Open canvas <ArrowRight size={13} /></button>}
        </div>
        <div className={styles.disclosure} data-open={data.explained} inert={!data.explained} aria-hidden={!data.explained}><div><p>{n.explanation}</p></div></div>
      </>}
    </>}
  </article>;
}
