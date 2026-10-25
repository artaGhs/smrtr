'use client';
import { useEffect, type RefObject } from 'react';
import type { ReactFlowInstance } from '@xyflow/react';
import { attachCanvasGestures } from '@/lib/canvas-presentation/gestures';

export function useCanvasGestures(area: RefObject<HTMLDivElement | null>, flow: Pick<ReactFlowInstance, 'getViewport' | 'setViewport'>) {
  useEffect(() => {
    if (!area.current) return;
    return attachCanvasGestures(area.current, flow, /Mac|iPhone|iPad/.test(navigator.platform));
  }, [area, flow]);
}
