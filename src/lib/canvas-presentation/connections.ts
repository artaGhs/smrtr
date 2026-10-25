import type { CanvasBounds, CanvasPoint, CanvasSourceEdge } from '../canvas-document/source';

export type ConnectionRoute = {
  points: CanvasPoint[];
  sourceHandle: 'out' | 'out-bottom';
  targetHandle: 'in' | 'in-top';
  label?: CanvasBounds & { lines: string[] };
};
export const intersects = (a: CanvasBounds, b: CanvasBounds, gap = 0) => a.x < b.x + b.width + gap && a.x + a.width + gap > b.x && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
const segmentBox = (a: CanvasPoint, b: CanvasPoint): CanvasBounds => ({ x: Math.min(a.x, b.x) - 2, y: Math.min(a.y, b.y) - 2, width: Math.abs(a.x - b.x) + 4, height: Math.abs(a.y - b.y) + 4 });
function crosses(a: CanvasPoint, b: CanvasPoint, r: CanvasBounds, pad = 0) {
  if (a.x === b.x) return a.x > r.x - pad && a.x < r.x + r.width + pad && Math.max(a.y, b.y) > r.y - pad && Math.min(a.y, b.y) < r.y + r.height + pad;
  return a.y > r.y - pad && a.y < r.y + r.height + pad && Math.max(a.x, b.x) > r.x - pad && Math.min(a.x, b.x) < r.x + r.width + pad;
}
function detour(route: ConnectionRoute, cards: Record<string, CanvasBounds>, edge: CanvasSourceEdge) {
  const unrelated = Object.entries(cards).filter(([id]) => id !== edge.source && id !== edge.target).map(([, b]) => b);
  if (!route.points.slice(1).some((b, i) => unrelated.some(r => crosses(route.points[i], b, r, 10)))) return route.points;
  const start = route.points[0], end = route.points.at(-1)!;
  const from = route.sourceHandle === 'out' ? { x: start.x + 28, y: start.y } : { x: start.x, y: start.y + 28 };
  const to = route.targetHandle === 'in' ? { x: end.x - 28, y: end.y } : { x: end.x, y: end.y - 28 };
  const obstacles = Object.values(cards);
  const xs = [...new Set([from.x, to.x, ...obstacles.flatMap(r => [r.x - 28, r.x + r.width + 28])])].sort((a, b) => a - b);
  const ys = [...new Set([from.y, to.y, ...obstacles.flatMap(r => [r.y - 28, r.y + r.height + 28])])].sort((a, b) => a - b);
  const encode = (x: number, y: number, direction: number) => (y * xs.length + x) * 3 + direction;
  const decode = (key: number) => { const cell = Math.floor(key / 3); return { x: cell % xs.length, y: Math.floor(cell / xs.length), direction: key % 3 }; };
  const first = encode(xs.indexOf(from.x), ys.indexOf(from.y), 2);
  const distances = new Map([[first, 0]]), previous = new Map<number, number>();
  const heap: { key: number; score: number }[] = [];
  const push = (item: { key: number; score: number }) => { heap.push(item); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p].score <= item.score) break; heap[i] = heap[p]; i = p; } heap[i] = item; };
  const pop = () => { const top = heap[0], end = heap.pop()!; if (heap.length) { let i = 0; while (i * 2 + 1 < heap.length) { let c = i * 2 + 1; if (c + 1 < heap.length && heap[c + 1].score < heap[c].score) c++; if (end.score <= heap[c].score) break; heap[i] = heap[c]; i = c; } heap[i] = end; } return top; };
  const closed = new Set<number>();
  push({ key: first, score: 0 });
  for (let count = 0; heap.length && count < 12000; count++) {
    const { key } = pop(); if (closed.has(key)) continue; closed.add(key);
    const cell = decode(key), a = { x: xs[cell.x], y: ys[cell.y] };
    if (a.x === to.x && a.y === to.y) {
      const path = [a]; let cursor = key;
      while (previous.has(cursor)) { cursor = previous.get(cursor)!; const c = decode(cursor); path.unshift({ x: xs[c.x], y: ys[c.y] }); }
      const points = [start, ...path, end];
      return points.filter((p, i) => !i || i === points.length - 1 || !((points[i - 1].x === p.x && p.x === points[i + 1].x) || (points[i - 1].y === p.y && p.y === points[i + 1].y)));
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = cell.x + dx, y = cell.y + dy;
      if (x < 0 || y < 0 || x >= xs.length || y >= ys.length) continue;
      const b = { x: xs[x], y: ys[y] };
      if (obstacles.some(r => crosses(a, b, r, 12))) continue;
      const direction = dx ? 0 : 1, next = encode(x, y, direction);
      const distance = distances.get(key)! + Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + (cell.direction !== 2 && cell.direction !== direction ? 24 : 0);
      if (distance >= (distances.get(next) ?? Infinity)) continue;
      distances.set(next, distance); previous.set(next, key);
      push({ key: next, score: distance + Math.abs(b.x - to.x) + Math.abs(b.y - to.y) });
    }
  }
  return route.points;
}
function linesFor(text: string) {
  const lines: string[] = [];
  for (const word of text.trim().split(/\s+/)) {
    if (!word) continue;
    if (!lines.length || lines.at(-1)!.length + word.length + 1 > 31) lines.push(word);
    else lines[lines.length - 1] += ` ${word}`;
  }
  return lines.slice(0, 3).map((line, i) => line.length > 31 ? `${line.slice(0, 29)}…` : i === 2 && lines.length > 3 ? `${line.slice(0, 28)}…` : line);
}

/** Labels occupy free lanes; cross-links travel outside the teaching column. */
export function routeConnections(edges: CanvasSourceEdge[], boxes: Record<string, CanvasBounds>): Record<string, ConnectionRoute> {
  const routes: Record<string, ConnectionRoute> = {};
  const cards = Object.values(boxes);
  const outerRight = Math.max(0, ...cards.map(b => b.x + b.width)) + 64;
  let crossLane = 0;
  for (const edge of edges) {
    const a = boxes[edge.source], b = boxes[edge.target];
    if (!a || !b) continue;
    const sideways = edge.relation === 'hierarchy' && b.x >= a.x + a.width + 90;
    if (sideways) {
      const start = { x: a.x + a.width, y: a.y + a.height / 2 }, end = { x: b.x, y: b.y + b.height / 2 };
      const trunk = a.x + a.width + 42;
      routes[edge.id] = { sourceHandle: 'out', targetHandle: 'in', points: [start, { x: trunk, y: start.y }, { x: trunk, y: end.y }, end] };
    } else {
      const lane = outerRight + crossLane++ * 30;
      const downward = b.y >= a.y;
      const start = { x: a.x + a.width / 2, y: downward ? a.y + a.height : a.y };
      const end = { x: b.x + b.width / 2, y: downward ? b.y : b.y + b.height };
      // For upward/manual links use the right handles, keeping reconnect endpoints honest.
      if (!downward) {
        const from = { x: a.x + a.width, y: a.y + a.height / 2 }, to = { x: b.x, y: b.y + b.height / 2 };
        routes[edge.id] = { sourceHandle: 'out', targetHandle: 'in', points: [from, { x: lane, y: from.y }, { x: lane, y: b.y - 28 }, { x: b.x - 28, y: b.y - 28 }, { x: b.x - 28, y: to.y }, to] };
      } else routes[edge.id] = { sourceHandle: 'out-bottom', targetHandle: 'in-top', points: [start, { x: start.x, y: start.y + 25 }, { x: lane, y: start.y + 25 }, { x: lane, y: end.y - 25 }, { x: end.x, y: end.y - 25 }, end] };
    }
  }
  for (const edge of edges) if (routes[edge.id]) routes[edge.id].points = detour(routes[edge.id], boxes, edge);
  const labels: CanvasBounds[] = [];
  const hierarchyLabels = new Set(edges.filter(e => e.relation === 'hierarchy').map(e => e.label.trim().toLowerCase()));
  const segments = Object.values(routes).flatMap(r => r.points.slice(1).map((p, i) => segmentBox(r.points[i], p)));
  for (const edge of [...edges].sort((a, b) => Number(b.relation === 'hierarchy') - Number(a.relation === 'hierarchy'))) {
    const route = routes[edge.id], target = boxes[edge.target];
    if (!route || !target || !edge.label.trim()) continue;
    // The semantic relationship remains in the edge title and editor; show repeated wording once.
    if (edge.relation !== 'hierarchy' && hierarchyLabels.has(edge.label.trim().toLowerCase())) continue;
    const lines = linesFor(edge.label), height = lines.length * 17, width = 218;
    const end = route.points.at(-1)!;
    const x = edge.relation === 'hierarchy' ? target.x - width - 22 : Math.max(...route.points.map(p => p.x)) + 14;
    const preferred = edge.relation === 'hierarchy' ? end.y - height - 14 : (route.points[0].y + end.y) / 2 - height / 2;
    for (const offset of [0, -22, 22, -44, 44, -66, 66]) {
      const candidate = { x, y: preferred + offset, width, height };
      if ([...cards, ...labels].some(b => intersects(candidate, b, 12)) || segments.some(b => intersects(candidate, b, 4))) continue;
      route.label = { ...candidate, lines }; labels.push(candidate); break;
    }
  }
  return routes;
}

export function roundedConnectionPath(points: CanvasPoint[], radius = 18) {
  if (!points.length) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1], b = points[i], c = points[i + 1];
    const before = Math.hypot(b.x - a.x, b.y - a.y), after = Math.hypot(c.x - b.x, c.y - b.y);
    if (!before || !after) { d += ` L ${b.x} ${b.y}`; continue; }
    const r = Math.min(radius, before / 2, after / 2);
    const p = { x: b.x + (a.x - b.x) / before * r, y: b.y + (a.y - b.y) / before * r };
    const q = { x: b.x + (c.x - b.x) / after * r, y: b.y + (c.y - b.y) / after * r };
    d += ` L ${p.x} ${p.y} Q ${b.x} ${b.y} ${q.x} ${q.y}`;
  }
  const end = points.at(-1)!;
  return `${d} L ${end.x} ${end.y}`;
}
