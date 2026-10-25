'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type PointerEvent } from 'react';
import { ReactFlow, ReactFlowProvider, Background, BackgroundVariant, useReactFlow, MarkerType, type Edge, type NodeChange, type Connection } from '@xyflow/react';
import { MousePointer2, Hand, Type, Square, Circle, Pencil, Plus, Link2, Undo2, Redo2, Download, Upload, Copy, Trash2, Group, Ungroup, ArrowLeft, Maximize2, Minus, X, FolderOpen } from 'lucide-react';
import '@xyflow/react/dist/style.css';
import type { CanvasBounds, CanvasPoint, CanvasSource, CanvasSourceEdge } from '@/lib/canvas-document/source';
import { compose, connectionError, copy, defaultBounds, deleteObjects, patchNode, visibleNodes, type EditorNode, type Overlay } from '@/lib/canvas-document/model';
import { layoutDocument } from '@/lib/canvas-document/layout';
import { parseDocument, serializeDocument } from '@/lib/canvas-document/serialization';
import { listDocuments, type StoredCanvas } from '@/lib/canvas-document/storage';
import { useEditorDocument } from './useEditorDocument';
import { useCanvasMotion } from './useCanvasMotion';
import { CanvasNode, type FlowNode } from './CanvasNode';
import styles from './editor.module.css';

type Tool = 'select' | 'hand' | 'idea' | 'text' | 'rectangle' | 'ellipse' | 'pen' | 'connect';
const nodeTypes = { canvasObject: CanvasNode };
const freshId = (prefix = 'my') => `${prefix}:${crypto.randomUUID()}`;
const editableTarget = (target: EventTarget | null) => target instanceof HTMLElement && !!target.closest('input, textarea, select, [contenteditable="true"]');
const scenarioKey = (item: EditorNode) => item.activity?.kind === 'sorting' ? `sort:${item.activity.values.join(',')}` : item.id;
export type EditableCanvasProps = { source?: CanvasSource; storageKey?: string; toolbarSlot?: ReactNode };

export function EditableCanvas(props: EditableCanvasProps) {
  return <ReactFlowProvider><Editor {...props} /></ReactFlowProvider>;
}
function Editor({ source, storageKey = 'smrtr.editable-canvas.v1', toolbarSlot }: EditableCanvasProps) {
  const flow = useReactFlow<FlowNode>();
  const [editing, setEditing] = useState(false);
  const [tool, setTool] = useState<Tool>('select');
  const [busy, setBusy] = useState(false);
  const editor = useEditorDocument(source, storageKey, busy);
  useEffect(() => { if (editor.recoveryNotice) setMessage(editor.recoveryNotice); }, [editor.recoveryNotice]);
  const { document: doc, change, view } = editor;
  const [selected, setSelected] = useState<string[]>([]), [selectedEdges, setSelectedEdges] = useState<string[]>([]);
  const [inspector, setInspector] = useState(false), [message, setMessage] = useState('');
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [draft, setDraft] = useState<Record<string, CanvasBounds>>({});
  const [reduced, setReduced] = useState(false);
  const [relation, setRelation] = useState<'related' | 'hierarchy'>('related');
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [ink, setInk] = useState<CanvasPoint[]>([]);
  const inkRef = useRef<CanvasPoint[]>([]), inkPointer = useRef<number | null>(null);
  const [strokeColor, setStrokeColor] = useState('#52677b');
  const [saved, setSaved] = useState<StoredCanvas[] | null>(null);
  const [importError, setImportError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null), area = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ id: string; x: number; y: number } | null>(null);
  const gestureStart = useRef<Record<string, CanvasBounds>>({}), draftRef = useRef(draft);
  draftRef.current = draft;
  const graph = useMemo(() => compose(doc.source, doc.overlay), [doc.source, doc.overlay]);
  const expanded = useMemo(() => new Set(doc.view.expanded), [doc.view.expanded]);
  const visible = useMemo(() => visibleNodes(graph.nodes, graph.edges, doc.view.canvasId, expanded), [graph, doc.view.canvasId, expanded]);
  const visibleIds = useMemo(() => new Set(visible.map(n => n.id)), [visible]);
  const layout = useMemo(() => layoutDocument(visible, graph.edges, doc.overlay, heights, anchor.current ?? doc.view.anchors?.[doc.view.canvasId]), [visible, graph.edges, doc.overlay, heights, doc.view.anchors, doc.view.canvasId]);
  const targets = useMemo(() => ({ ...layout, ...draft }), [layout, draft]);
  const direct = useMemo(() => new Set([...Object.keys(draft), ...Object.keys(doc.overlay.nodes).filter(id => !!doc.overlay.nodes[id].bounds), ...doc.overlay.addedNodes.map(n => n.id)]), [draft, doc.overlay]);
  const positions = useCanvasMotion(targets, reduced, `${doc.source.id}:${doc.view.canvasId}`, direct);
  const positionRef = useRef(positions); positionRef.current = positions;
  const item = graph.nodes.find(n => n.id === selected[0]);
  const chosenEdge = graph.edges.find(e => e.id === selectedEdges[0]);
  const selectedRef = useRef(selected); selectedRef.current = selected;
  const graphRef = useRef(graph); graphRef.current = graph;
  function changeMode(next: boolean) {
    setEditing(next); setSelected([]); setSelectedEdges([]); setInspector(false);
    setConnectFrom(null); setTool('select'); setDraft({}); draftRef.current = {};
    setInk([]); inkRef.current = []; inkPointer.current = null; setBusy(false);
    setMessage(next ? 'Edit mode · select an idea or add something of your own.' : 'View mode · unfold ideas, play examples and explore.');
  }

  useEffect(() => { const media = matchMedia('(prefers-reduced-motion: reduce)'); const update = () => setReduced(media.matches); update(); media.addEventListener('change', update); return () => media.removeEventListener('change', update); }, []);
  const cameraScene = useRef('');
  useEffect(() => {
    if (!editor.ready) return;
    const key = `${doc.source.id}:${doc.view.canvasId}`;
    if (cameraScene.current === key) return;
    cameraScene.current = key; anchor.current = doc.view.anchors?.[doc.view.canvasId] ?? null; setSelected([]); setSelectedEdges([]); setInspector(false); setHeights({}); setDraft({}); setConnectFrom(null);
    const stored = doc.view.cameras[doc.view.canvasId];
    const entry = visible.find(n => n.id === doc.source.canvases.find(c => c.id === doc.view.canvasId)?.entryNodeId) ?? visible.find(n => n.role === 'topic') ?? visible[0];
    const b = entry ? layout[entry.id] ?? defaultBounds(entry) : { x: 0, y: 0 };
    if (entry && !anchor.current) {
      const initialAnchor = { id: entry.id, x: b.x, y: b.y }; anchor.current = initialAnchor;
      view(v => ({ ...v, anchors: { ...v.anchors, [v.canvasId]: initialAnchor } }));
    }
    const width = area.current?.clientWidth ?? 1000;
    const height = area.current?.clientHeight ?? 800;
    const boxes = width < 600 && entry ? [layout[entry.id] ?? defaultBounds(entry)] : Object.values(layout);
    const minX = boxes.length ? Math.min(...boxes.map(b => b.x)) : 0, minY = boxes.length ? Math.min(...boxes.map(b => b.y)) : 0;
    const maxX = boxes.length ? Math.max(...boxes.map(b => b.x + b.width)) : 500, maxY = boxes.length ? Math.max(...boxes.map(b => b.y + b.height)) : 500;
    const zoom = Math.max(.15, Math.min(.92, (width - 110) / (maxX - minX), (height - 290) / (maxY - minY)));
    const initial = { x: (width - (maxX - minX) * zoom) / 2 - minX * zoom, y: 145 + (height - 290 - (maxY - minY) * zoom) / 2 - minY * zoom, zoom };
    void flow.setViewport(stored ?? initial, { duration: 0 });
  }, [doc.source.id, doc.view.canvasId, editor.ready, doc.source.canvases, doc.view.cameras, flow, layout, visible]);
  useEffect(() => { setSelected(current => current.filter(id => visibleIds.has(id))); setSelectedEdges(current => current.filter(id => graph.edges.some(e => e.id === id))); }, [visibleIds, graph.edges]);

  const pin = useCallback((id: string) => { const p = positionRef.current[id]; if (p) { const a = { id, x: p.x, y: p.y }; anchor.current = a; view(v => ({ ...v, anchors: { ...v.anchors, [v.canvasId]: a } })); } }, [view]);
  const toggle = useCallback((key: 'expanded' | 'explained', id: string) => { pin(id); view(v => ({ ...v, [key]: v[key].includes(id) ? v[key].filter(n => n !== id) : [...v[key], id] })); }, [pin, view]);
  const enter = useCallback((id: string) => {
    const viewport = flow.getViewport();
    view(v => ({ ...v, cameras: { ...v.cameras, [v.canvasId]: viewport }, visits: [...v.visits, { canvasId: v.canvasId, viewport, frames: { ...v.frames } }].slice(-100), canvasId: id }));
  }, [view, flow]);
  const back = () => view(v => { const visit = v.visits.at(-1); return visit ? { ...v, cameras: { ...v.cameras, [v.canvasId]: flow.getViewport(), [visit.canvasId]: visit.viewport }, canvasId: visit.canvasId, frames: visit.frames ?? v.frames, visits: v.visits.slice(0, -1) } : v; });
  const startGesture = useCallback(() => { setBusy(true); gestureStart.current = copy(positionRef.current); }, []);
  const finishGesture = useCallback((bounds?: Record<string, CanvasBounds>) => {
    const nextBounds = bounds ?? draftRef.current;
    change(overlay => { let next = overlay; for (const [id, b] of Object.entries(nextBounds)) if (graphRef.current.nodes.some(n => n.id === id)) next = patchNode(next, id, { bounds: b }); return next; });
    setDraft({}); draftRef.current = {}; setBusy(false);
  }, [change]);
  const updateDraft = useCallback((id: string, bounds: CanvasBounds) => {
    const values: Record<string, CanvasBounds> = { [id]: bounds };
    const original = gestureStart.current[id] ?? positionRef.current[id];
    if (graphRef.current.nodes.find(n => n.id === id)?.kind === 'group' && original) {
      for (const member of graphRef.current.nodes.filter(n => n.groupId === id)) {
        const b = gestureStart.current[member.id] ?? positionRef.current[member.id];
        if (b) values[member.id] = { ...b, x: b.x + bounds.x - original.x, y: b.y + bounds.y - original.y };
      }
    }
    setDraft(current => { const next = { ...current, ...values }; draftRef.current = next; return next; });
  }, []);
  const removeSelected = useCallback(() => {
    change(overlay => deleteObjects(editor.documentRef.current.source, overlay, selectedRef.current, selectedEdges));
    setSelected([]); setSelectedEdges([]); setInspector(false);
  }, [change, editor.documentRef, selectedEdges]);
  const onNodeChanges = useCallback((changes: NodeChange<FlowNode>[]) => {
    for (const c of changes) {
      if (c.type === 'dimensions' && c.dimensions) setHeights(current => Math.abs((current[c.id] ?? 0) - c.dimensions!.height) > 1 ? { ...current, [c.id]: c.dimensions!.height } : current);
      if (c.type === 'select') setSelected(current => c.selected ? [...new Set([...current, c.id])] : current.filter(id => id !== c.id));
      if (c.type === 'position' && c.position) {
        const b = draftRef.current[c.id] ?? positionRef.current[c.id];
        if (!b) continue;
        if (c.dragging === true) updateDraft(c.id, { ...b, ...c.position });
        else if (c.dragging === undefined) change(overlay => patchNode(overlay, c.id, { bounds: { ...b, ...c.position } }));
      }
    }
  }, [change, updateDraft]);
  const create = useCallback((kind: Tool, at: CanvasPoint, parent?: string) => {
    if (!['idea', 'text', 'rectangle', 'ellipse'].includes(kind)) return;
    const id = freshId(), n: EditorNode = { id, canvasId: doc.view.canvasId, kind: kind as EditorNode['kind'], role: 'annotation', title: kind === 'text' ? 'Your note' : kind === 'idea' ? 'A new idea' : '', summary: '', explanation: '', bounds: { ...at, width: kind === 'text' ? 260 : 300, height: kind === 'ellipse' ? 180 : 150 }, style: { stroke: '#d8e1e4', fill: kind === 'rectangle' || kind === 'ellipse' ? '#edf4ef' : '#ffffff' } };
    change(o => ({ ...o, addedNodes: [...o.addedNodes, n], addedEdges: parent ? [...o.addedEdges, { id: freshId('edge'), canvasId: n.canvasId, source: parent, target: id, relation: 'hierarchy', label: 'my idea' }] : o.addedEdges }));
    if (parent) view(v => ({ ...v, expanded: [...new Set([...v.expanded, parent])] }));
    setTool('select'); setSelected([id]); setSelectedEdges([]); setInspector(true); setMessage('Added. Edit the words in the panel.');
  }, [doc.view.canvasId, change, view]);
  const connect = useCallback((connection: Connection, old?: CanvasSourceEdge) => {
    if (!connection.source || !connection.target) return;
    const edge: CanvasSourceEdge = { id: old?.id ?? freshId('edge'), canvasId: doc.view.canvasId, source: connection.source, target: connection.target, relation: old?.relation ?? relation, label: old?.label ?? (relation === 'hierarchy' ? 'explore' : 'related') };
    const error = connectionError(graph.nodes, graph.edges, edge, old?.id);
    if (error) { setMessage(error); return; }
    change(o => old ? { ...o, edges: { ...o.edges, [old.id]: { ...o.edges[old.id], source: edge.source, target: edge.target } } } : { ...o, addedEdges: [...o.addedEdges, edge] });
    if (edge.relation === 'hierarchy') view(v => ({ ...v, expanded: [...new Set([...v.expanded, edge.source])] }));
    setSelectedEdges([edge.id]); setSelected([]); setInspector(true); setConnectFrom(null); setMessage('Connection saved.');
  }, [doc.view.canvasId, graph, relation, change, view]);
  const duplicate = useCallback(() => {
    const chosen = new Set(selectedRef.current);
    for (const n of graphRef.current.nodes) if (n.groupId && chosen.has(n.groupId)) chosen.add(n.id);
    const originals = graphRef.current.nodes.filter(n => chosen.has(n.id));
    if (!originals.length) return;
    const ids = new Map(originals.map(n => [n.id, freshId()]));
    const copies = originals.map(n => ({ ...copy(n), id: ids.get(n.id)!, parentId: undefined, groupId: n.groupId ? ids.get(n.groupId) : undefined, bounds: { ...(positionRef.current[n.id] ?? defaultBounds(n)), x: (positionRef.current[n.id]?.x ?? defaultBounds(n).x) + 40, y: (positionRef.current[n.id]?.y ?? defaultBounds(n).y) + 40 } }));
    const edges = graphRef.current.edges.filter(e => chosen.has(e.source) && chosen.has(e.target)).map(e => ({ ...e, id: freshId('edge'), source: ids.get(e.source)!, target: ids.get(e.target)! }));
    change(o => ({ ...o, addedNodes: [...o.addedNodes, ...copies], addedEdges: [...o.addedEdges, ...edges] })); setSelected(copies.map(n => n.id));
  }, [change]);
  const group = () => {
    const chosen = graph.nodes.filter(n => selected.includes(n.id) && n.kind !== 'group' && !n.groupId);
    if (chosen.length < 2) { setMessage('Select two or more ungrouped objects.'); return; }
    const boxes = chosen.map(n => positions[n.id]);
    const x = Math.min(...boxes.map(b => b.x)) - 24, y = Math.min(...boxes.map(b => b.y)) - 52;
    const groupId = freshId('group');
    const groupNode: EditorNode = { id: groupId, canvasId: doc.view.canvasId, kind: 'group', role: 'annotation', title: 'My group', bounds: { x, y, width: Math.max(...boxes.map(b => b.x + b.width)) - x + 24, height: Math.max(...boxes.map(b => b.y + b.height)) - y + 24 } };
    change(o => { let next = { ...o, addedNodes: [...o.addedNodes, groupNode] }; for (const n of chosen) next = patchNode(next, n.id, { groupId, bounds: positions[n.id] }); return next; }); setSelected([groupId]);
  };
  const ungroup = () => {
    const groupIds = new Set(graph.nodes.filter(n => selected.includes(n.id)).map(n => n.kind === 'group' ? n.id : n.groupId).filter(Boolean) as string[]);
    if (!groupIds.size) { setMessage('Select a group or one of its objects.'); return; }
    change(o => { let next = copy(o); for (const n of graph.nodes) if (n.groupId && groupIds.has(n.groupId)) next = patchNode(next, n.id, { groupId: '' }); next.deletedNodes = [...new Set([...next.deletedNodes, ...groupIds])]; return next; }); setSelected([]);
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (!editing) return;
      if (editableTarget(event.target)) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); editor.travel(event.shiftKey); return; }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicate(); return; }
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); removeSelected(); }
      if (event.key === 'Escape') { setTool('select'); setConnectFrom(null); setDraft({}); draftRef.current = {}; setBusy(false); setInk([]); inkRef.current = []; setInspector(false); }
      if (event.key === 'Enter' && selectedRef.current.length === 1) { event.preventDefault(); setInspector(true); }
      if (!event.metaKey && !event.ctrlKey && !event.altKey) {
        const shortcuts: Record<string, Tool> = { v: 'select', h: 'hand', n: 'idea', t: 'text', r: 'rectangle', o: 'ellipse', p: 'pen', c: 'connect' };
        if (shortcuts[event.key.toLowerCase()]) setTool(shortcuts[event.key.toLowerCase()]);
      }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [editing, editor.travel, duplicate, removeSelected]);
  const nodes = useMemo<FlowNode[]>(() => visible.map(n => {
    const b = positions[n.id] ?? targets[n.id] ?? defaultBounds(n);
    const isFixedHeight = ['rectangle', 'ellipse', 'ink', 'group'].includes(n.kind);
    return { id: n.id, type: 'canvasObject', position: { x: b.x, y: b.y }, selected: editing && selected.includes(n.id), draggable: editing && tool === 'select', selectable: editing && (tool === 'select' || tool === 'connect'), zIndex: n.kind === 'group' ? -1 : undefined,
      style: { width: b.width, ...(isFixedHeight ? { height: b.height } : { minHeight: Math.max(80, n.bounds?.height ?? 100) }) }, measured: heights[n.id] ? { width: b.width, height: heights[n.id] } : undefined,
      data: { item: n, expanded: expanded.has(n.id), explained: doc.view.explained.includes(n.id), children: graph.edges.filter(e => e.source === n.id && e.relation === 'hierarchy').length, edited: !!doc.overlay.nodes[n.id], connectable: editing && (tool === 'select' || tool === 'connect'), hand: !editing || tool === 'hand', active: !busy,
        frame: doc.view.frames[scenarioKey(n)] ?? (n.canvasId === 'topic-map' ? 0 : -1), onFrame: value => view(v => ({ ...v, frames: { ...v.frames, [scenarioKey(n)]: value } })),
        onFold: () => toggle('expanded', n.id), onExplain: () => toggle('explained', n.id), onEnter: () => { if (n.detailCanvasId) enter(n.detailCanvasId); }, onEdit: () => { if (editing) { setSelected([n.id]); setSelectedEdges([]); setInspector(true); } },
        onResizeStart: startGesture, onResize: bounds => updateDraft(n.id, bounds), onResizeEnd: bounds => finishGesture({ ...draftRef.current, [n.id]: bounds }),
      } };
  }), [visible, positions, targets, selected, tool, heights, expanded, doc.view.explained, doc.view.frames, doc.overlay.nodes, graph.edges, busy, editing, view, toggle, enter, startGesture, updateDraft, finishGesture]);
  const edges = useMemo<Edge[]>(() => graph.edges.filter(e => visibleIds.has(e.source) && visibleIds.has(e.target)).map(e => ({ id: e.id, source: e.source, target: e.target, sourceHandle: 'out', targetHandle: 'in', label: e.label, selected: selectedEdges.includes(e.id), reconnectable: editing && (tool === 'select' || tool === 'connect'), selectable: editing, type: 'default', markerEnd: { type: MarkerType.ArrowClosed, width: 13, height: 13, color: '#a7b5b8' }, style: { stroke: selectedEdges.includes(e.id) ? '#52766a' : '#b7c3c7', strokeWidth: selectedEdges.includes(e.id) ? 2.5 : 1.5, strokeDasharray: e.relation === 'hierarchy' ? undefined : '5 4' }, labelStyle: { fill: '#65747d', fontSize: 11 }, labelShowBg: false })), [graph.edges, visibleIds, selectedEdges, tool, editing]);

  const penDown = (event: PointerEvent<HTMLDivElement>) => {
    if (inkPointer.current !== null) { inkRef.current = []; setInk([]); return; }
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId); inkPointer.current = event.pointerId; setBusy(true);
    inkRef.current = [flow.screenToFlowPosition({ x: event.clientX, y: event.clientY })]; setInk(inkRef.current);
  };
  const penMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerId !== inkPointer.current || !inkRef.current.length) return;
    const p = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }), last = inkRef.current.at(-1)!;
    if (Math.hypot(p.x - last.x, p.y - last.y) < 1.5 || inkRef.current.length >= 6000) return;
    inkRef.current = [...inkRef.current, p]; setInk(inkRef.current);
  };
  const penEnd = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    if (event.pointerId !== inkPointer.current) return;
    const points = inkRef.current; inkPointer.current = null; inkRef.current = []; setInk([]); setBusy(false);
    if (cancelled || points.length < 2) return;
    const x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y));
    const id = freshId('ink');
    const stroke: EditorNode = { id, canvasId: doc.view.canvasId, kind: 'ink', role: 'annotation', title: 'My drawing', points: points.map(p => ({ x: p.x - x, y: p.y - y })), bounds: { x, y, width: Math.max(16, Math.max(...points.map(p => p.x)) - x), height: Math.max(16, Math.max(...points.map(p => p.y)) - y) }, style: { stroke: strokeColor, strokeWidth: 3 } };
    change(o => ({ ...o, addedNodes: [...o.addedNodes, stroke] })); setSelected([id]); setSelectedEdges([]);
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([serializeDocument(doc)], { type: 'application/json' }));
    const a = window.document.createElement('a'); a.href = url; a.download = `${doc.source.title.replace(/[^a-z0-9-]/gi, '-').slice(0, 60)}.smrtr.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setMessage('Editable backup downloaded.');
  };
  const focus = (ids: string[]) => void flow.fitView({ nodes: ids.map(id => ({ id })), padding: 0.3, minZoom: 0.2, maxZoom: 1, duration: reduced ? 0 : 600 });
  const previewRect = area.current?.getBoundingClientRect();
  const penPath = ink.map((p, i) => { const screen = flow.flowToScreenPosition(p); return `${i ? 'L' : 'M'}${screen.x - (previewRect?.left ?? 0)},${screen.y - (previewRect?.top ?? 0)}`; }).join(' ');

  return <main className={styles.workspace} aria-label="Editable learning canvas">
    <div className={styles.canvasArea} ref={area}>
      <ReactFlow<FlowNode> nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodeChanges}
        onNodeDragStart={startGesture} onNodeDragStop={() => finishGesture()} onSelectionDragStart={startGesture} onSelectionDragStop={() => finishGesture()}
        onConnect={c => connect(c)} onReconnect={(old, c) => connect(c, graph.edges.find(e => e.id === old.id))}
        onNodeClick={(_, n) => { if (!editing) return; if (tool === 'connect') { if (!connectFrom) { setConnectFrom(n.id); setMessage('Now select the second idea.'); } else connect({ source: connectFrom, target: n.id, sourceHandle: null, targetHandle: null }); } else { setSelectedEdges([]); } }}
        onNodeDoubleClick={(_, n) => { if (!editing) return; setSelected([n.id]); setSelectedEdges([]); setInspector(true); }}
        onEdgeClick={(_, e) => { if (!editing) return; setSelectedEdges([e.id]); setSelected([]); setInspector(true); }}
        onPaneClick={event => { if (!editing) return; if (['idea', 'text', 'rectangle', 'ellipse'].includes(tool)) create(tool, flow.screenToFlowPosition({ x: event.clientX, y: event.clientY })); else { setSelected([]); setSelectedEdges([]); setInspector(false); setConnectFrom(null); } }}
        onMoveEnd={(_, viewport) => view(v => ({ ...v, cameras: { ...v.cameras, [v.canvasId]: viewport } }))}
        nodesDraggable={editing && tool === 'select'} nodesConnectable={editing && (tool === 'select' || tool === 'connect')} elementsSelectable={editing && (tool === 'select' || tool === 'connect')} nodesFocusable={editing} edgesFocusable={editing}
        panOnDrag={!editing || tool === 'hand' ? true : [1, 2]} panOnScroll zoomOnScroll={false} zoomOnPinch zoomOnDoubleClick={false} selectionOnDrag={editing && tool === 'select'} selectionKeyCode="Shift" multiSelectionKeyCode={['Meta', 'Control', 'Shift']} deleteKeyCode={null} minZoom={0.15} maxZoom={2} autoPanOnNodeDrag={false} autoPanOnConnect={false} autoPanOnNodeFocus={false} preventScrolling><Background variant={BackgroundVariant.Dots} gap={28} size={1} color="#dce4e5" /></ReactFlow>
      {editing && tool === 'pen' && <div className={styles.penSurface} onPointerDown={penDown} onPointerMove={penMove} onPointerUp={e => penEnd(e)} onPointerCancel={e => penEnd(e, true)}><svg><path d={penPath} stroke={strokeColor} strokeWidth={3 * flow.getZoom()} fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg></div>}
    </div>
    <header className={styles.header}><div className={styles.identity}><a href="/" aria-label="SMRTR home">smrtr↗</a><span>{doc.source.title}<small>{doc.source.provenance === 'curated' ? 'Your learning canvas' : `${doc.source.provenance} · ${doc.source.status}`}</small></span></div><div className={styles.headerTools}><div className={styles.modeSwitch} role="group" aria-label="Canvas mode"><button aria-pressed={!editing} onClick={() => changeMode(false)}>View</button><button aria-pressed={editing} onClick={() => changeMode(true)}>Edit</button></div>{toolbarSlot}<button onClick={() => { void listDocuments(storageKey).then(setSaved).catch(error => setMessage(error.message)); }} aria-label="Open saved canvases"><FolderOpen size={17} /></button><button onClick={download} aria-label="Download editable canvas"><Download size={17} /></button>{editing && <button onClick={() => fileInput.current?.click()} aria-label="Import canvas"><Upload size={17} /></button>}<button onClick={() => focus(visible.map(n => n.id))} aria-label="Fit canvas"><Maximize2 size={17} /></button></div></header>
    <nav className={styles.breadcrumbs} aria-label="Canvas navigation">{doc.view.visits.length > 0 && <button onClick={back}><ArrowLeft size={14} />Back</button>}<span>{doc.source.canvases.find(c => c.id === doc.view.canvasId)?.title}</span></nav>
    {editing && <div className={styles.tools} role="toolbar" aria-label="Canvas tools">
      {([{ id: 'select', label: 'Select (V)', Icon: MousePointer2 }, { id: 'hand', label: 'Hand (H)', Icon: Hand }, { id: 'idea', label: 'Add idea (N)', Icon: Plus }, { id: 'text', label: 'Text (T)', Icon: Type }, { id: 'rectangle', label: 'Rounded shape (R)', Icon: Square }, { id: 'ellipse', label: 'Ellipse (O)', Icon: Circle }, { id: 'pen', label: 'Pen (P)', Icon: Pencil }, { id: 'connect', label: 'Connect (C)', Icon: Link2 }] as const).map(({ id, label, Icon }) => <button key={id} aria-label={label} title={label} aria-pressed={tool === id} onClick={() => { setTool(id); setConnectFrom(null); setMessage(id === 'select' ? 'Drag to select. Hold Space to pan.' : id === 'connect' ? 'Select two ideas or drag between their connection handles.' : id === 'hand' ? 'Drag open space to move around.' : id === 'pen' ? 'Draw on the canvas. Choose Select to move a stroke.' : 'Click the canvas to add an object.'); }}><Icon size={18} /></button>)}
      <span className={styles.toolDivider} /><button aria-label="Undo" disabled={!editor.history.past.length} onClick={() => editor.travel(false)}><Undo2 size={18} /></button><button aria-label="Redo" disabled={!editor.history.future.length} onClick={() => editor.travel(true)}><Redo2 size={18} /></button>
    </div>}
    {editing && tool === 'connect' && <div className={styles.toolOptions}><label>Connection <select value={relation} onChange={e => setRelation(e.target.value as typeof relation)}><option value="related">Related idea</option><option value="hierarchy">Part of branch</option></select></label></div>}
    {editing && tool === 'pen' && <div className={styles.toolOptions}><label>Ink <input type="color" aria-label="Ink color" value={strokeColor} onChange={e => setStrokeColor(e.target.value)} /></label></div>}
    {editing && (selected.length > 0 || selectedEdges.length > 0) && <div className={styles.selectionTools} role="toolbar" aria-label="Selected objects"><span>{selected.length || selectedEdges.length} selected</span><button onClick={() => setInspector(!inspector)}>Edit</button><button onClick={duplicate} aria-label="Duplicate selected"><Copy size={15} /></button><button onClick={group} aria-label="Group selected"><Group size={16} /></button><button onClick={ungroup} aria-label="Ungroup selected"><Ungroup size={16} /></button><button onClick={removeSelected} aria-label="Delete selected"><Trash2 size={15} /></button><button onClick={() => focus(selected)} aria-label="Focus selected"><Maximize2 size={15} /></button></div>}
    {editing && inspector && (item || chosenEdge) && <Inspector key={item?.id ?? chosenEdge?.id} item={item} edge={chosenEdge} nodes={graph.nodes.filter(n => n.canvasId === doc.view.canvasId && !['ink', 'group'].includes(n.kind))} original={doc.source.nodes.find(n => n.id === item?.id)} onBusy={setBusy} onClose={() => { setInspector(false); setBusy(false); }}
      onPatch={patch => { if (item) { pin(item.id); change(o => patchNode(o, item.id, patch)); } }}
      onReset={() => { if (!item) return; change(o => { const next = copy(o); if (next.nodes[item.id]) { delete next.nodes[item.id].title; delete next.nodes[item.id].summary; delete next.nodes[item.id].explanation; } return next; }); }}
      onEdge={patch => { if (!chosenEdge) return; const candidate = { ...chosenEdge, ...patch }; const error = connectionError(graph.nodes, graph.edges, candidate, chosenEdge.id); if (error) { setMessage(error); return; } change(o => ({ ...o, edges: { ...o.edges, [chosenEdge.id]: { ...o.edges[chosenEdge.id], ...patch } } })); }}
      onChild={() => { if (item) { const b = positions[item.id]; create('idea', { x: b.x + b.width + 120, y: b.y }, item.id); } }} />}
    <div className={styles.camera}><button aria-label="Zoom in" onClick={() => void flow.zoomIn({ duration: reduced ? 0 : 180 })}><Plus size={17} /></button><button aria-label="Zoom out" onClick={() => void flow.zoomOut({ duration: reduced ? 0 : 180 })}><Minus size={17} /></button></div>
    <div className={styles.status} data-error={editor.saveError}><span>{editor.saveStatus}</span>{editor.saveError && <button onClick={editor.retrySave}>Retry</button>}<small>{message || (!editing ? 'View mode · drag to explore · unfold ideas and play examples' : tool === 'select' ? 'Select an idea · Enter to edit · Space to pan' : tool === 'hand' ? 'Drag to explore' : 'Make it yours')}</small></div>
    {doc.conflicts.length > 0 && <details className={styles.conflicts}><summary>{doc.conflicts.length} source update{doc.conflicts.length > 1 ? 's' : ''} to review</summary><ul>{doc.conflicts.map((c, i) => <li key={i}>{c}</li>)}</ul></details>}
    {!editor.ready && <div className={styles.loading}>Opening your canvas…</div>}
    <input ref={fileInput} className={styles.hidden} type="file" accept=".json,application/json" onChange={async event => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; try { const imported = parseDocument(await file.text()); const id = `${imported.source.id}:import:${crypto.randomUUID().slice(0, 8)}`; imported.source = { ...imported.source, id }; await editor.open(imported); setMessage('Imported as a separate canvas. Your previous canvas is saved.'); setImportError(''); } catch (error) { setImportError(error instanceof Error ? error.message : 'Import failed.'); } }} />
    {importError && <div className={styles.error} role="alert">{importError}<button onClick={() => setImportError('')} aria-label="Dismiss import error"><X size={15} /></button></div>}
    {saved && <div className={styles.modalBackdrop}><section className={styles.savedDialog} role="dialog" aria-modal="true" aria-label="Saved canvases"><div><h2>Saved on this device</h2><button onClick={() => setSaved(null)} aria-label="Close saved canvases"><X size={18} /></button></div>{saved.length ? saved.map(record => <button key={record.key} onClick={async () => { try { await editor.open(parseDocument(record.json)); setSaved(null); } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not open canvas.'); } }}><strong>{record.title}</strong><small>{new Date(record.updatedAt).toLocaleString()}</small></button>) : <p>Your saved canvases will appear here.</p>}</section></div>}
    <span className={styles.srOnly} role="status" aria-live="polite">{message}</span>
  </main>;
}

function Inspector({ item, edge, nodes, original, onBusy, onClose, onPatch, onReset, onEdge, onChild }: { item?: EditorNode; edge?: CanvasSourceEdge; nodes: EditorNode[]; original?: EditorNode; onBusy: (value: boolean) => void; onClose: () => void; onPatch: (patch: Partial<EditorNode>) => void; onReset: () => void; onEdge: (patch: Partial<CanvasSourceEdge>) => void; onChild: () => void }) {
  const [title, setTitle] = useState(item?.title ?? ''), [summary, setSummary] = useState(item?.summary ?? ''), [explanation, setExplanation] = useState(item?.explanation ?? ''), [label, setLabel] = useState(edge?.label ?? '');
  useEffect(() => { setTitle(item?.title ?? ''); setSummary(item?.summary ?? ''); setExplanation(item?.explanation ?? ''); }, [item?.title, item?.summary, item?.explanation]);
  useEffect(() => setLabel(edge?.label ?? ''), [edge?.label]);
  const save = () => { if (item) onPatch({ title, summary, explanation }); else if (edge) onEdge({ label }); onBusy(false); };
  return <aside className={styles.inspector} aria-label="Edit selected object" onFocusCapture={() => onBusy(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) onBusy(false); }}>
    <div className={styles.inspectorHeading}><strong>{edge ? 'Connection' : 'Your words'}</strong><button onClick={onClose} aria-label="Close editor"><X size={16} /></button></div>
    {item ? <><label>Title<input aria-label="Object title" value={title} maxLength={500} onChange={e => setTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save(); } }} /></label><label>Summary<textarea aria-label="Object summary" value={summary} maxLength={5000} onChange={e => setSummary(e.target.value)} rows={3} /></label><label>Explanation<textarea aria-label="Object explanation" value={explanation} maxLength={40000} onChange={e => setExplanation(e.target.value)} rows={5} /></label><div className={styles.inspectorRow}><button className={styles.primary} onClick={save}>Save words</button><button onClick={onChild}>Add child idea</button></div><label>Fill<input type="color" aria-label="Object fill" value={item.style?.fill ?? '#ffffff'} onChange={e => onPatch({ style: { ...item.style, fill: e.target.value } })} /></label>{original && <details><summary>Original lesson text</summary><strong>{original.title}</strong><p>{original.summary}</p><p>{original.explanation}</p><button onClick={onReset}>Reset my text edits</button></details>}<p className={styles.note}>Your edits belong to your copy. They do not change the original lesson.</p></> : edge && <><label>Label<input aria-label="Connection label" value={label} maxLength={1000} onChange={e => setLabel(e.target.value)} /></label><label>Relationship<select aria-label="Connection relationship" value={edge.relation} onChange={e => onEdge({ relation: e.target.value as CanvasSourceEdge['relation'] })}><option value="related">Related idea</option><option value="hierarchy">Part of branch</option><option value="contrast">Contrast</option><option value="example">Example</option><option value="prerequisite">Prerequisite</option></select></label><label>From<select aria-label="Connection source" value={edge.source} onChange={e => onEdge({ source: e.target.value })}>{nodes.map(n => <option key={n.id} value={n.id}>{n.title || n.kind}</option>)}</select></label><label>To<select aria-label="Connection target" value={edge.target} onChange={e => onEdge({ target: e.target.value })}>{nodes.map(n => <option key={n.id} value={n.id}>{n.title || n.kind}</option>)}</select></label><button className={styles.primary} onClick={save}>Save label</button><p className={styles.note}>Branch connections control folding. Related ideas can connect across branches.</p></>}
  </aside>;
}
