import type { CanvasBounds } from '../canvas-document/source';

export function fitReadingArea(boxes: CanvasBounds[], width: number, height: number, editing: boolean) {
  if (!boxes.length) return { x: 0, y: 0, zoom: 1 };
  const top = width <= 700 ? editing ? 165 : 148 : editing ? 144 : 112;
  const bottom = editing ? 156 : 104;
  const available = Math.max(100, height - top - bottom);
  const left = Math.min(...boxes.map(b => b.x)), upper = Math.min(...boxes.map(b => b.y));
  const right = Math.max(...boxes.map(b => b.x + b.width)), lower = Math.max(...boxes.map(b => b.y + b.height));
  const zoom = Math.max(.15, Math.min(1, (width - 72) / Math.max(1, right - left), (available - 56) / Math.max(1, lower - upper)));
  return { x: (width - (right - left) * zoom) / 2 - left * zoom, y: top + (available - (lower - upper) * zoom) / 2 - upper * zoom, zoom };
}
