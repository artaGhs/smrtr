import { parseCanvasSource, type CanvasBounds, type CanvasSource, type CanvasSourceEdge, type CanvasSourceNode } from './source';

export type EditorNode = CanvasSourceNode & { groupId?: string; detached?: boolean };
export type NodePatch = Partial<Omit<EditorNode, 'id' | 'canvasId' | 'kind' | 'activity'>>;
export type Overlay = {
  nodes: Record<string, NodePatch>; edges: Record<string, Partial<CanvasSourceEdge>>;
  addedNodes: EditorNode[]; addedEdges: CanvasSourceEdge[]; deletedNodes: string[]; deletedEdges: string[];
};
export type ViewState = {
  canvasId: string; expanded: string[]; explained: string[];
  cameras: Record<string, { x: number; y: number; zoom: number }>;
  frames: Record<string, number>;
  anchors?: Record<string, { id: string; x: number; y: number }>;
  visits: { canvasId: string; viewport: { x: number; y: number; zoom: number }; frames?: Record<string, number> }[];
};
export type CanvasDocument = { version: 1; source: CanvasSource; overlay: Overlay; view: ViewState; conflicts: string[]; updatedAt: string };
export type History = { past: Overlay[]; present: Overlay; future: Overlay[] };
export const emptyOverlay = (): Overlay => ({ nodes: {}, edges: {}, addedNodes: [], addedEdges: [], deletedNodes: [], deletedEdges: [] });
export const copy = <T,>(value: T): T => structuredClone(value);
export function normalizeSource(source: CanvasSource): CanvasSource {
  source = parseCanvasSource(source);
  const edges = [...source.edges];
  for (const node of source.nodes) if (node.parentId && !edges.some(e => e.relation === 'hierarchy' && e.target === node.id)) {
    edges.push({ id: `parent:${node.id}`, canvasId: node.canvasId, source: node.parentId, target: node.id, label: 'explore', relation: 'hierarchy' });
  }
  return { ...copy(source), edges };
}
export function createDocument(input: CanvasSource): CanvasDocument {
  const source = normalizeSource(input);
  return { version: 1, source, overlay: emptyOverlay(), conflicts: [], updatedAt: new Date().toISOString(), view: {
    canvasId: source.rootCanvasId, expanded: source.nodes.filter(n => n.role === 'topic').map(n => n.id), explained: [], cameras: {}, frames: {}, visits: [],
  } };
}
export function compose(source: CanvasSource, overlay: Overlay) {
  const nodes = [...source.nodes, ...overlay.addedNodes].filter(n => !overlay.deletedNodes.includes(n.id)).map(n => ({ ...n, ...overlay.nodes[n.id] } as EditorNode));
  const ids = new Set(nodes.map(n => n.id));
  const edges = [...source.edges, ...overlay.addedEdges].filter(e => !overlay.deletedEdges.includes(e.id) && ids.has(e.source) && ids.has(e.target)).map(e => ({ ...e, ...overlay.edges[e.id] }));
  // Hierarchy is independent from spatial grouping. Node parentId is source metadata only.
  return { nodes, edges };
}
export function commit(history: History, next: Overlay): History {
  if (JSON.stringify(history.present) === JSON.stringify(next)) return history;
  return { past: [...history.past.slice(-79), history.present], present: next, future: [] };
}
export function undo(history: History): History {
  const previous = history.past.at(-1);
  return previous ? { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] } : history;
}
export function redo(history: History): History {
  const next = history.future[0];
  return next ? { past: [...history.past, history.present], present: next, future: history.future.slice(1) } : history;
}
export function patchNode(overlay: Overlay, id: string, patch: NodePatch): Overlay {
  return { ...overlay, nodes: { ...overlay.nodes, [id]: { ...overlay.nodes[id], ...patch } } };
}
export function connectionError(nodes: EditorNode[], edges: CanvasSourceEdge[], candidate: CanvasSourceEdge, replacedId?: string): string | null {
  const from = nodes.find(n => n.id === candidate.source), to = nodes.find(n => n.id === candidate.target);
  if (!from || !to) return 'Choose two existing ideas.';
  if (from.id === to.id) return 'An idea cannot connect to itself.';
  if (from.canvasId !== to.canvasId || candidate.canvasId !== from.canvasId) return 'Connect ideas on the same canvas.';
  if (['ink', 'group'].includes(from.kind) || ['ink', 'group'].includes(to.kind)) return 'Connect an idea, text or shape.';
  const rest = edges.filter(e => e.id !== replacedId);
  if (rest.some(e => e.source === from.id && e.target === to.id && e.relation === candidate.relation)) return 'That connection already exists.';
  if (candidate.relation === 'hierarchy') {
    if (rest.some(e => e.relation === 'hierarchy' && e.target === to.id)) return 'This idea already has a parent. Reconnect its existing branch connection.';
    const seen = new Set<string>();
    const visit = (id: string): boolean => {
      if (id === from.id) return true;
      if (seen.has(id)) return false;
      seen.add(id);
      return rest.some(e => e.relation === 'hierarchy' && e.source === id && visit(e.target));
    };
    if (visit(to.id)) return 'A branch cannot contain its own ancestor.';
  }
  return null;
}
export function visibleNodes(nodes: EditorNode[], edges: CanvasSourceEdge[], canvasId: string, expanded: Set<string>): EditorNode[] {
  const local = nodes.filter(n => n.canvasId === canvasId);
  const parents = new Map(edges.filter(e => e.canvasId === canvasId && e.relation === 'hierarchy').map(e => [e.target, e.source]));
  return local.filter(n => {
    let current = n.id; const seen = new Set<string>();
    while (parents.has(current)) {
      const parent = parents.get(current)!;
      if (seen.has(parent) || !expanded.has(parent)) return false;
      seen.add(parent); current = parent;
    }
    return true;
  });
}
export function deleteObjects(source: CanvasSource, overlay: Overlay, selectedNodes: string[], selectedEdges: string[]): Overlay {
  const graph = compose(source, overlay);
  const remove = new Set(selectedNodes);
  // Deleting a group dissolves it; deleting a branch promotes its children instead of destroying notes.
  const next = copy(overlay);
  next.deletedNodes = [...new Set([...next.deletedNodes, ...remove])];
  next.deletedEdges = [...new Set([...next.deletedEdges, ...selectedEdges, ...graph.edges.filter(e => remove.has(e.source) || remove.has(e.target)).map(e => e.id)])];
  for (const node of graph.nodes) if (node.groupId && remove.has(node.groupId)) {
    next.nodes[node.id] = { ...next.nodes[node.id], groupId: '' };
  }
  return next;
}
export function rebaseDocument(document: CanvasDocument, incoming: CanvasSource): CanvasDocument {
  if (incoming.id !== document.source.id) return createDocument(incoming);
  const source = normalizeSource(incoming), overlay = copy(document.overlay);
  const newIds = new Set(source.nodes.map(n => n.id));
  const conflicts = new Set(document.conflicts);
  for (const old of document.source.nodes) {
    const patch = overlay.nodes[old.id];
    if (!newIds.has(old.id)) {
      const linked = overlay.addedEdges.some(e => e.source === old.id || e.target === old.id);
      if ((patch || linked) && !overlay.deletedNodes.includes(old.id) && !overlay.addedNodes.some(n => n.id === old.id)) {
        overlay.addedNodes.push({ ...old, ...patch, parentId: undefined, detached: true });
        conflicts.add(`${old.title}: original removed; your copy is kept.`);
      }
    } else if (patch) {
      const fresh = source.nodes.find(n => n.id === old.id)!;
      for (const key of ['title', 'summary', 'explanation'] as const) if (key in patch && old[key] !== fresh[key] && patch[key] !== fresh[key]) conflicts.add(`${old.title}: original ${key} changed; your edit is kept.`);
    }
  }
  // Patches to removed tombstoned objects need no live target; the tombstone remains.
  const retainedIds = new Set([...source.nodes, ...overlay.addedNodes].map(n => n.id));
  for (const id of Object.keys(overlay.nodes)) if (!retainedIds.has(id)) delete overlay.nodes[id];
  // If a source ID returns, preserve its overrides but remove the detached duplicate.
  overlay.addedNodes = overlay.addedNodes.filter(n => !newIds.has(n.id));
  const sceneIds = new Set(source.canvases.map(c => c.id));
  const retainedScenes = document.source.canvases.filter(c => !sceneIds.has(c.id) && overlay.addedNodes.some(n => n.canvasId === c.id || n.detailCanvasId === c.id)).map(c => ({ id: c.id, title: c.title }));
  source.canvases.push(...retainedScenes);
  const allIds = new Set([...source.nodes, ...overlay.addedNodes].map(n => n.id));
  for (const old of document.source.edges) if (overlay.edges[old.id] && !source.edges.some(e => e.id === old.id) && !overlay.addedEdges.some(e => e.id === old.id) && allIds.has(old.source) && allIds.has(old.target)) overlay.addedEdges.push({ ...old, ...overlay.edges[old.id] });
  const knownEdgeIds = new Set([...source.edges, ...overlay.addedEdges].map(e => e.id));
  for (const id of Object.keys(overlay.edges)) if (!knownEdgeIds.has(id)) delete overlay.edges[id];
  // A generated hierarchy and learner reconnection may disagree. Keep personal records,
  // hide invalid source links rather than letting layout recurse into a cycle.
  const graph = compose(source, overlay), accepted: CanvasSourceEdge[] = [];
  for (const edge of [...graph.edges].sort((a, b) => Number(!!overlay.edges[b.id] || overlay.addedEdges.some(e => e.id === b.id)) - Number(!!overlay.edges[a.id] || overlay.addedEdges.some(e => e.id === a.id)))) {
    const error = connectionError(graph.nodes, accepted, edge);
    if (error) { overlay.deletedEdges.push(edge.id); conflicts.add(`Connection “${edge.label}” needs review: ${error}`); }
    else accepted.push(edge);
  }
  return { ...document, source, overlay, conflicts: [...conflicts], view: { ...document.view, canvasId: source.canvases.some(c => c.id === document.view.canvasId) ? document.view.canvasId : source.rootCanvasId }, updatedAt: new Date().toISOString() };
}
export function defaultBounds(node: EditorNode, index = 0): CanvasBounds {
  return node.bounds ?? { x: 80 + (index % 3) * 390, y: 100 + Math.floor(index / 3) * 310, width: node.kind === 'simulation' ? 450 : node.role === 'topic' ? 280 : 330, height: node.kind === 'simulation' ? 360 : node.role === 'topic' ? 150 : 170 };
}

/** Rebase every history checkpoint, never replace learner history with a stream snapshot. */
export function rebaseHistory(history: History, document: CanvasDocument, source: CanvasSource): { document: CanvasDocument; history: History } {
  const rebase = (overlay: Overlay) => rebaseDocument({ ...document, overlay }, source);
  const current = rebase(history.present);
  return { document: current, history: { past: history.past.map(o => rebase(o).overlay), present: current.overlay, future: history.future.map(o => rebase(o).overlay) } };
}
