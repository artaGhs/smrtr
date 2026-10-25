import { defaultBounds, type EditorNode, type Overlay } from './model';
import type { CanvasBounds, CanvasSourceEdge } from './source';

/** Trees reflow; manually arranged objects are fixed obstacles. No camera policy lives here. */
export function layoutDocument(nodes: EditorNode[], edges: CanvasSourceEdge[], overlay: Overlay, heights: Record<string, number>, anchor?: { id: string; x: number; y: number } | null): Record<string, CanvasBounds> {
  const out: Record<string, CanvasBounds> = {};
  const ids = new Set(nodes.map(n => n.id));
  const hierarchy = edges.filter(e => e.relation === 'hierarchy' && ids.has(e.source) && ids.has(e.target));
  const children = (id: string) => hierarchy.filter(e => e.source === id).map(e => nodes.find(n => n.id === e.target)!);
  const pinned = (n: EditorNode) => !!overlay.nodes[n.id]?.bounds || overlay.addedNodes.some(a => a.id === n.id);
  const size = (n: EditorNode) => { const b = defaultBounds(n, nodes.indexOf(n)); return { ...b, height: Math.max(b.height, heights[n.id] ?? 0) }; };
  if (!hierarchy.length) {
    for (const node of nodes) out[node.id] = size(node);
    if (anchor && out[anchor.id]) { out[anchor.id].x = anchor.x; out[anchor.id].y = anchor.y; }
    return out;
  }
  const roots = nodes.filter(n => !hierarchy.some(e => e.target === n.id) && (children(n.id).length || n.role === 'topic'));
  const visited = new Set<string>();
  const span = (n: EditorNode, chain = new Set<string>()): number => {
    if (chain.has(n.id)) return size(n).height;
    const next = new Set([...chain, n.id]);
    return Math.max(size(n).height, children(n.id).reduce((sum, child, i) => sum + span(child, next) + (i ? 66 : 0), 0));
  };
  const place = (n: EditorNode, x: number, top: number) => {
    if (visited.has(n.id)) return;
    visited.add(n.id);
    const b = size(n), total = span(n);
    out[n.id] = { ...b, x, y: top + (total - b.height) / 2 };
    let childTop = top;
    for (const child of children(n.id)) { place(child, x + b.width + 140, childTop); childTop += span(child) + 66; }
  };
  let top = 90;
  for (const root of roots) { place(root, 80, top); top += span(root) + 140; }
  if (anchor && out[anchor.id]) {
    const dx = anchor.x - out[anchor.id].x, dy = anchor.y - out[anchor.id].y;
    for (const id of visited) { out[id].x += dx; out[id].y += dy; }
  }
  for (const n of nodes) if (!visited.has(n.id) || pinned(n)) out[n.id] = size(n);
  const obstacles = nodes.filter(pinned).filter(n => n.kind !== 'group').map(n => out[n.id]);
  const placed: CanvasBounds[] = [];
  for (const node of [...nodes].sort((a, b) => out[a.id].y - out[b.id].y)) {
    const b = out[node.id];
    if (pinned(node) || node.kind === 'group' || node.id === anchor?.id) continue;
    for (let pass = 0; pass < nodes.length + 2; pass++) {
      const overlap = [...obstacles, ...placed].find(o => b.x < o.x + o.width + 30 && b.x + b.width + 30 > o.x && b.y < o.y + o.height + 40 && b.y + b.height + 40 > o.y);
      if (!overlap) break;
      b.y = overlap.y + overlap.height + 40;
    }
    placed.push(b);
  }
  return out;
}
