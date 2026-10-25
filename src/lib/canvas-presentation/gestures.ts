export type CanvasCamera = { x: number; y: number; zoom: number };
export type GesturePoint = { x: number; y: number };

export function zoomAbout(view: CanvasCamera, point: GesturePoint, factor: number, movedPoint = point): CanvasCamera {
  const zoom = Math.max(.15, Math.min(2, view.zoom * factor));
  const world = { x: (point.x - view.x) / view.zoom, y: (point.y - view.y) / view.zoom };
  return { x: movedPoint.x - world.x * zoom, y: movedPoint.y - world.y * zoom, zoom };
}

/** Match React Flow's trackpad curve, independent of the element under the cursor. */
export function pinchWheelFactor(deltaY: number, deltaMode: number, mac: boolean) {
  return Math.pow(2, -deltaY * (deltaMode === 1 ? .05 : deltaMode ? 1 : .002) * (mac ? 10 : 1));
}

export type GestureViewportApi = { getViewport: () => CanvasCamera; setViewport: (view: CanvasCamera, options: { duration: number }) => unknown };

export function attachCanvasGestures(element: HTMLElement, flow: GestureViewportApi, mac: boolean) {
    const local = (x: number, y: number) => { const r = element.getBoundingClientRect(); return { x: x - r.left, y: y - r.top }; };
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      // Capture before nopan/nowheel on cards and activity controls can reject the pinch.
      event.preventDefault(); event.stopPropagation();
      void flow.setViewport(zoomAbout(flow.getViewport(), local(event.clientX, event.clientY), pinchWheelFactor(event.deltaY, event.deltaMode, mac)), { duration: 0 });
    };
    let pinch: { view: CanvasCamera; center: GesturePoint; distance: number } | null = null;
    const pair = (touches: TouchList) => ({ center: local((touches[0].clientX + touches[1].clientX) / 2, (touches[0].clientY + touches[1].clientY) / 2), distance: Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY) });
    const start = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      const input = pair(event.touches); if (input.distance < 8) return;
      pinch = { ...input, view: flow.getViewport() };
      event.preventDefault(); event.stopPropagation();
    };
    const move = (event: TouchEvent) => {
      if (!pinch || event.touches.length !== 2) return;
      event.preventDefault(); event.stopPropagation();
      const next = pair(event.touches);
      void flow.setViewport(zoomAbout(pinch.view, pinch.center, next.distance / pinch.distance, next.center), { duration: 0 });
    };
    // Let touchend reach React Flow so an earlier one-finger pan/drag can clean up.
    const end = (event: TouchEvent) => { if (event.touches.length < 2) pinch = null; };
    const options = { capture: true, passive: false };
    element.addEventListener('wheel', wheel, options);
    element.addEventListener('touchstart', start, options); element.addEventListener('touchmove', move, options);
    element.addEventListener('touchend', end, options); element.addEventListener('touchcancel', end, options);
    return () => {
      element.removeEventListener('wheel', wheel, true);
      element.removeEventListener('touchstart', start, true); element.removeEventListener('touchmove', move, true);
      element.removeEventListener('touchend', end, true); element.removeEventListener('touchcancel', end, true);
    };
}
