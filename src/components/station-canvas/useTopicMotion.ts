"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { TopicPlacement } from "@/lib/station-canvas/topic-map";
import { anchorTopicLayout, clearAnchorColumn, settleAxis, type LayoutAnchor } from "@/lib/station-canvas/topic-motion";

export type MovingPlacement = TopicPlacement & { opacity: number; exiting: boolean };
type Body = MovingPlacement & { targetX: number; targetY: number; vx: number; vy: number; vo: number; revealAt: number; moveAt: number };

/** Animate the graph coordinates themselves so connectors follow their nodes. */
export function useTopicMotion(layout: TopicPlacement[], reducedMotion: boolean) {
  const [rendered, setRendered] = useState<MovingPlacement[]>(() => layout.map((node) => ({ ...node, opacity: 1, exiting: false })));
  const bodies = useRef(new Map<string, Body>());
  const anchor = useRef<LayoutAnchor | null>(null);
  const animate = useRef(false);
  const raf = useRef<number | null>(null);
  const lastTime = useRef(0);

  const pin = useCallback((id: string, shouldAnimate = true) => {
    const body = bodies.current.get(id);
    if (body) anchor.current = { id, x: body.x, y: body.y };
    animate.current = shouldAnimate;
  }, []);

  useLayoutEffect(() => {
    const target = anchorTopicLayout(layout, anchor.current);
    const now = performance.now();
    const visible = new Set(target.map((node) => node.element.id));
    const snap = reducedMotion || !animate.current;
    if (snap) {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      raf.current = null;
      bodies.current = new Map(target.map((node) => [node.element.id, { ...node, opacity: 1, exiting: false, targetX: node.x, targetY: node.y, vx: 0, vy: 0, vo: 0, revealAt: 0, moveAt: 0 }]));
      setRendered(target.map((node) => ({ ...node, opacity: 1, exiting: false })));
      return;
    }

    let removed = false;
    for (const [id, body] of bodies.current) if (!visible.has(id) && !body.exiting) {
      body.exiting = true;
      body.targetX = body.x; body.targetY = body.y;
      body.vx = 0; body.vy = 0;
      removed = true;
    }
    for (const node of target) {
      const body = bodies.current.get(node.element.id);
      if (body) {
        body.element = node.element; body.width = node.width; body.height = node.height;
        body.targetX = node.x; body.targetY = node.y; body.exiting = false;
        if (removed) body.moveAt = now + 110;
      } else {
        bodies.current.set(node.element.id, { ...node, x: node.x - 18, opacity: 0, exiting: false, targetX: node.x, targetY: node.y, vx: 0, vy: 0, vo: 0, revealAt: now + 100, moveAt: now });
      }
    }

    // Retarget a running animation in place; preserve positions AND velocities.
    if (raf.current !== null) return;
    lastTime.current = now;
    const tick = (time: number) => {
      const dt = Math.min((time - lastTime.current) / 1000, 0.05);
      lastTime.current = time;
      let active = false;
      for (const [id, body] of bodies.current) {
        if (time >= body.moveAt) {
          const x = settleAxis(body.x, body.vx, body.targetX, dt);
          const y = settleAxis(body.y, body.vy, body.targetY, dt);
          body.x = x.position; body.vx = x.velocity;
          body.y = y.position; body.vy = y.velocity;
        }
        const opacityTarget = body.exiting || time < body.revealAt ? 0 : 1;
        const opacity = settleAxis(body.opacity, body.vo, opacityTarget, dt, body.exiting ? 25 : 19);
        body.opacity = Math.max(0, Math.min(1, opacity.position)); body.vo = opacity.velocity;
        if (body.exiting && body.opacity < 0.01) { bodies.current.delete(id); continue; }
        const moving = Math.abs(body.x - body.targetX) + Math.abs(body.y - body.targetY) > 0.08 || Math.abs(body.vx) + Math.abs(body.vy) > 0.2;
        const fading = Math.abs(body.opacity - opacityTarget) > 0.005 || time < body.revealAt;
        if (moving || fading || body.exiting || time < body.moveAt) active = true;
        else { body.x = body.targetX; body.y = body.targetY; body.opacity = opacityTarget; body.vx = 0; body.vy = 0; body.vo = 0; }
      }
      const pinned = anchor.current && bodies.current.get(anchor.current.id);
      if (pinned) {
        const column = [...bodies.current.values()].filter((body) => !body.exiting && body.targetX === pinned.targetX).sort((a, b) => a.targetY - b.targetY);
        const separated = clearAnchorColumn(column.map((body) => ({ id: body.element.id, y: body.y, height: body.height })), pinned.element.id);
        for (const row of separated) {
          const body = bodies.current.get(row.id)!;
          if (Math.abs(body.y - row.y) > 0.01) { body.y = row.y; body.vy = 0; active = true; }
        }
      }
      setRendered([...bodies.current.values()].map(({ element, x, y, width, height, opacity, exiting }) => ({ element, x, y, width, height, opacity, exiting })));
      raf.current = active ? requestAnimationFrame(tick) : null;
    };
    raf.current = requestAnimationFrame(tick);
  }, [layout, reducedMotion]);

  useEffect(() => () => { if (raf.current !== null) cancelAnimationFrame(raf.current); raf.current = null; }, []);
  return { rendered, pin };
}
