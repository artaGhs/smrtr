'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CanvasBounds } from '@/lib/canvas-document/source';
import { settleAxis } from '@/lib/station-canvas/topic-motion';

export function useCanvasMotion(targets: Record<string, CanvasBounds>, reduced: boolean, scene: string, direct: Set<string>) {
  const bodies = useRef<Record<string, CanvasBounds & { vx: number; vy: number }>>({});
  const [positions, setPositions] = useState<Record<string, CanvasBounds>>(targets);
  const frame = useRef<number | null>(null), previousScene = useRef(scene), last = useRef(0), targetRef = useRef(targets), directRef = useRef(direct);
  targetRef.current = targets; directRef.current = direct;
  useLayoutEffect(() => {
    const snap = reduced || previousScene.current !== scene || !Object.keys(bodies.current).length;
    previousScene.current = scene;
    for (const id of Object.keys(bodies.current)) if (!targets[id]) delete bodies.current[id];
    for (const [id, b] of Object.entries(targets)) {
      if (!bodies.current[id] || snap || direct.has(id)) bodies.current[id] = { ...b, vx: 0, vy: 0 };
      else { bodies.current[id].width = b.width; bodies.current[id].height = b.height; }
    }
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    setPositions(Object.fromEntries(Object.entries(bodies.current).map(([id, b]) => [id, { ...b }])));
    if (snap) return;
    last.current = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last.current) / 1000, 0.05); last.current = now;
      let moving = false;
      for (const [id, body] of Object.entries(bodies.current)) {
        const t = targetRef.current[id]; if (!t) continue;
        if (directRef.current.has(id)) { Object.assign(body, t, { vx: 0, vy: 0 }); continue; }
        const x = settleAxis(body.x, body.vx, t.x, dt), y = settleAxis(body.y, body.vy, t.y, dt);
        Object.assign(body, { x: x.position, y: y.position, vx: x.velocity, vy: y.velocity, width: t.width, height: t.height });
        if (Math.abs(body.x - t.x) + Math.abs(body.y - t.y) > 0.08 || Math.abs(body.vx) + Math.abs(body.vy) > 0.2) moving = true;
        else Object.assign(body, t, { vx: 0, vy: 0 });
      }
      setPositions(Object.fromEntries(Object.entries(bodies.current).map(([id, b]) => [id, { ...b }])));
      frame.current = moving ? requestAnimationFrame(tick) : null;
    };
    frame.current = requestAnimationFrame(tick);
    return () => { if (frame.current !== null) cancelAnimationFrame(frame.current); };
  }, [targets, reduced, scene, direct]);
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); }, []);
  return positions;
}
