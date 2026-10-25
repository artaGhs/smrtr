import type { TopicPlacement } from "./topic-map";

export type LayoutAnchor = { id: string; x: number; y: number };

/** Keep an interaction's origin in world space; the camera never compensates. */
export function anchorTopicLayout(layout: TopicPlacement[], anchor: LayoutAnchor | null): TopicPlacement[] {
  const origin = anchor && layout.find((node) => node.element.id === anchor.id);
  if (!anchor || !origin) return layout;
  const dx = anchor.x - origin.x;
  const dy = anchor.y - origin.y;
  return layout.map((node) => ({ ...node, x: node.x + dx, y: node.y + dy }));
}

/** Exact critically damped step: continuous velocity on retarget, no oscillation. */
export function settleAxis(position: number, velocity: number, target: number, seconds: number, frequency = 13.5) {
  const distance = position - target;
  const impulse = velocity + frequency * distance;
  const decay = Math.exp(-frequency * seconds);
  return {
    position: target + (distance + impulse * seconds) * decay,
    velocity: (velocity - frequency * impulse * seconds) * decay,
  };
}

export const cameraEase = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** A growing disclosure must never outrun the space made by its neighbours. */
export function clearAnchorColumn(rows: { id: string; y: number; height: number }[], anchorId: string, gap = 64) {
  const result = rows.map((row) => ({ ...row }));
  const pivot = result.findIndex((row) => row.id === anchorId);
  if (pivot < 0) return result;
  for (let i = pivot - 1; i >= 0; i--) result[i].y = Math.min(result[i].y, result[i + 1].y - result[i].height - gap);
  for (let i = pivot + 1; i < result.length; i++) result[i].y = Math.max(result[i].y, result[i - 1].y + result[i - 1].height + gap);
  return result;
}
