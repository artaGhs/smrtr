'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { EditorNode } from '@/lib/canvas-document/model';
import type { CanvasSourceEdge } from '@/lib/canvas-document/source';

import { resolveRevealPhases, type RevealPhase } from '@/lib/canvas-presentation/reveal';
/** A presentation clock, independent of source commits, history and the camera. */
export function useCanvasReveal(nodes: EditorNode[], edges: CanvasSourceEdge[], scene: string, progressive: boolean, paused: boolean, reduced: boolean, editing: boolean) {
  const [phases, setPhases] = useState<Record<string, RevealPhase>>({});
  const [busy, setBusy] = useState(false);
  const phaseRef = useRef(phases), sceneRef = useRef('');
  const inputs = useRef({ nodes, edges, progressive, paused, reduced, editing });
  inputs.current = { nodes, edges, progressive, paused, reduced, editing };
  const task = useRef<{ id: string; elapsed: number } | null>(null);
  const initialScene = sceneRef.current !== scene;
  const immediatePhases = useMemo(() => resolveRevealPhases(nodes, phases, initialScene, progressive, reduced, editing), [nodes, phases, initialScene, progressive, reduced, editing]);
  useLayoutEffect(() => {
    const freshScene = sceneRef.current !== scene;
    sceneRef.current = scene;
    const next = resolveRevealPhases(nodes, phaseRef.current, freshScene, progressive, reduced, editing);
    if (freshScene || reduced || editing || (task.current && !next[task.current.id])) task.current = null;
    phaseRef.current = next; setPhases(next);
    setBusy(Object.values(next).some(p => p !== 'open'));
  }, [nodes, scene, progressive, reduced, editing]);
  useEffect(() => {
    let frame: number;
    let previous = performance.now();
    const publish = () => setPhases({ ...phaseRef.current });
    const tick = (now: number) => {
      const input = inputs.current;
      const dt = Math.min(now - previous, 80); previous = now;
      if (!input.paused && !input.reduced && !input.editing) {
        if (!task.current) {
          const next = input.nodes.find(n => phaseRef.current[n.id] === 'queued');
          const parent = next && input.edges.find(e => e.relation === 'hierarchy' && e.target === next.id)?.source;
          if (next && (!parent || phaseRef.current[parent] === 'open') && (!input.progressive || next.readiness !== 'pending')) {
            task.current = { id: next.id, elapsed: 0 };
            phaseRef.current[next.id] = 'connecting'; publish();
          }
        }
        if (task.current) {
          task.current.elapsed += dt;
          const draw = 820;
          const settle = input.progressive ? 1550 : 1150;
          if (task.current.elapsed >= draw && phaseRef.current[task.current.id] !== 'open') { phaseRef.current[task.current.id] = 'open'; publish(); }
          if (task.current.elapsed >= settle) task.current = null;
        }
      }
      const pending = !!task.current || input.nodes.some(n => phaseRef.current[n.id] !== 'open');
      setBusy(value => value === pending ? value : pending);
      if (pending && !input.paused && !input.reduced && !input.editing) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [scene, nodes, paused, reduced, editing]);
  return { phases: immediatePhases, busy: busy || Object.values(immediatePhases).some(phase => phase !== 'open') };
}
