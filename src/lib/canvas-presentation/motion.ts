import type { CanvasBounds } from '../canvas-document/source';
import { clearAnchorColumn } from '../station-canvas/topic-motion';

/** Constrain actual animated positions, not just their final layout destinations. */
export function separateMovingCards(current: Record<string, CanvasBounds>, targets: Record<string, CanvasBounds>, fixed: Set<string>, anchorId?: string) {
  const result = Object.fromEntries(Object.entries(current).map(([id, b]) => [id, { ...b }]));
  const columns = new Map<number, string[]>();
  for (const id of Object.keys(targets)) {
    if (!result[id] || fixed.has(id)) continue;
    const key = Math.round(targets[id].x);
    columns.set(key, [...(columns.get(key) ?? []), id]);
  }
  for (const ids of columns.values()) {
    ids.sort((a, b) => targets[a].y - targets[b].y);
    if (ids.length < 2) continue;
    const pivot = anchorId && ids.includes(anchorId) ? anchorId : ids[0];
    const rows = clearAnchorColumn(ids.map(id => ({ id, y: result[id].y, height: result[id].height })), pivot, 72);
    for (const row of rows) result[row.id].y = row.y;
  }
  return result;
}
