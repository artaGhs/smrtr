import test from 'node:test';
import assert from 'node:assert/strict';
import { intersects, routeConnections, roundedConnectionPath } from './connections';
import { separateMovingCards } from './motion';
import { canvasFixture } from '../canvas-generation/fixtures';
import { createDraft, reduceEvent } from '../canvas-generation/reducer';
import { projectDraft } from '../canvas-generation/projection';
import { createDocument, compose, visibleNodes } from '../canvas-document/model';
import { layoutDocument } from '../canvas-document/layout';
import type { CanvasBounds } from '../canvas-document/source';
import { curatedSource } from '../canvas-document/curated';
import { fitReadingArea } from './viewport';
import { resolveRevealPhases } from './reveal';
import { zoomAbout, pinchWheelFactor, attachCanvasGestures } from './gestures';

for (const topic of ['sorting', 'photosynthesis'] as const) test(`${topic}: connector descriptions occupy separate lanes outside the cards`, () => {
  const fixture = canvasFixture(topic);
  let draft = createDraft('test'); let seq = 0;
  const send = (payload: object) => { draft = reduceEvent(draft, { v: 2, requestId: 'test', runId: 'run', sourceRevision: 'revision', seq: ++seq, ...payload }); };
  send({ type: 'started', mode: 'simulated', text: fixture.text });
  send({ type: 'outline', outline: fixture.outline });
  for (const unit of fixture.units) send({ type: 'unit', unit });
  send({ type: 'finished', outcome: 'complete', missing: [] });
  const doc = createDocument(projectDraft(draft)!);
  const graph = compose(doc.source, doc.overlay);
  const nodes = visibleNodes(graph.nodes, graph.edges, doc.view.canvasId, new Set(doc.view.expanded));
  for (const tall of [170, 400, 680]) {
    const heights = Object.fromEntries(nodes.map((n, i) => [n.id, i === 2 ? tall : 210]));
    const boxes = layoutDocument(nodes, graph.edges, doc.overlay, heights);
    const ids = new Set(nodes.map(n => n.id));
    const edges = graph.edges.filter(e => ids.has(e.source) && ids.has(e.target));
    const routes = routeConnections(edges, boxes);
    const labels = Object.values(routes).flatMap(r => r.label ? [r.label] : []);
    assert.equal(labels.length, 3, 'each main branch keeps its meaning; repeated cross-link text is not painted twice');
    for (const label of labels) {
      assert.ok(Object.values(boxes).every(card => !intersects(label, card, 10)));
      assert.ok(labels.every(other => label === other || !intersects(label, other, 10)));
    }
    for (const edge of edges.filter(e => e.relation !== 'hierarchy')) {
      const route = routes[edge.id];
      assert.equal(route.sourceHandle, 'out-bottom'); assert.equal(route.targetHandle, 'in-top');
      assert.ok(Math.max(...route.points.map(p => p.x)) > Math.max(...Object.values(boxes).map(b => b.x + b.width)));
    }
    assert.match(roundedConnectionPath(Object.values(routes)[0].points), /^M /);
  }
});

test('growth cannot overlap adjacent animated cards and never moves the interaction anchor', () => {
  const current: Record<string, CanvasBounds> = { a: { x: 600, y: 0, width: 330, height: 200 }, b: { x: 600, y: 260, width: 330, height: 500 }, c: { x: 600, y: 520, width: 330, height: 200 } };
  const targets = { ...current, a: { ...current.a, y: -100 }, c: { ...current.c, y: 900 } };
  const result = separateMovingCards(current, targets, new Set(), 'b');
  assert.equal(result.b.y, current.b.y);
  assert.ok(result.a.y + result.a.height + 72 <= result.b.y);
  assert.ok(result.b.y + result.b.height + 72 <= result.c.y);
  assert.deepEqual(separateMovingCards(current, targets, new Set(['a', 'b', 'c']), 'b'), current);
});

test('expanded curated map routes keep labels and cross-links outside unrelated cards', () => {
  const doc = createDocument(curatedSource());
  const graph = compose(doc.source, doc.overlay);
  const nodes = visibleNodes(graph.nodes, graph.edges, doc.view.canvasId, new Set(graph.nodes.map(n => n.id)));
  const boxes = layoutDocument(nodes, graph.edges, doc.overlay, {});
  const ids = new Set(nodes.map(n => n.id));
  const edges = graph.edges.filter(e => ids.has(e.source) && ids.has(e.target));
  const routes = routeConnections(edges, boxes);
  const labels = Object.values(routes).flatMap(r => r.label ? [r.label] : []);
  for (const label of labels) assert.ok(Object.values(boxes).every(card => !intersects(label, card, 10)));
  for (const edge of edges) for (let i = 1; i < routes[edge.id].points.length; i++) {
    const a = routes[edge.id].points[i - 1], b = routes[edge.id].points[i];
    const segment = { x: Math.min(a.x, b.x) - .1, y: Math.min(a.y, b.y) - .1, width: Math.abs(a.x - b.x) + .2, height: Math.abs(a.y - b.y) + .2 };
    for (const [id, card] of Object.entries(boxes)) if (id !== edge.source && id !== edge.target) assert.ok(!intersects(segment, card), `${edge.id} passes through ${id}`);
  }
});

test('explicit Fit leaves the header and status footer outside the graph on desktop and phone', () => {
  const boxes = [{ x: 80, y: 100, width: 280, height: 170 }, { x: 700, y: -200, width: 330, height: 900 }];
  for (const [width, height] of [[1280, 900], [390, 844]]) for (const editing of [false, true]) {
    const camera = fitReadingArea(boxes, width, height, editing);
    const top = width <= 700 ? editing ? 165 : 148 : editing ? 144 : 112;
    for (const box of boxes) {
      assert.ok(box.y * camera.zoom + camera.y >= top + 20);
      assert.ok((box.y + box.height) * camera.zoom + camera.y <= height - (editing ? 156 : 104) - 20);
    }
  }
});

test('the first render of newly unfolded ideas is queued, never briefly open', () => {
  const nodes = createDocument(curatedSource()).source.nodes;
  const root = nodes.find(n => n.role === 'topic')!, children = nodes.filter(n => n.parentId === root.id);
  const known = { [root.id]: 'open' as const };
  const phases = resolveRevealPhases([root, ...children], known, false, false, false, false);
  assert.equal(phases[root.id], 'open');
  for (const child of children) assert.equal(phases[child.id], 'queued');
  assert.ok(Object.values(resolveRevealPhases([root, ...children], {}, true, false, false, false)).every(p => p === 'open'));
  assert.ok(Object.values(resolveRevealPhases([root, ...children], {}, false, true, true, false)).every(p => p === 'open'));
  const oldRun = Object.fromEntries([root, ...children].map(n => [n.id, 'open' as const]));
  const restarted = resolveRevealPhases([root, ...children], oldRun, true, true, false, false);
  for (const child of children) assert.equal(restarted[child.id], 'queued', 'a new run must not inherit the old presentation clock');
});

test('pinch zoom keeps the same content under the cursor and clamps both limits', () => {
  const camera = { x: 40, y: -80, zoom: .7 }, cursor = { x: 300, y: 420 };
  for (const factor of [1.1, .8, 100, .001]) {
    const next = zoomAbout(camera, cursor, factor);
    assert.ok(next.zoom >= .15 && next.zoom <= 2);
    assert.ok(Math.abs((cursor.x - camera.x) / camera.zoom - (cursor.x - next.x) / next.zoom) < 1e-9);
    assert.ok(Math.abs((cursor.y - camera.y) / camera.zoom - (cursor.y - next.y) / next.zoom) < 1e-9);
  }
  assert.ok(pinchWheelFactor(-5, 0, true) > 1);
  assert.ok(pinchWheelFactor(5, 0, true) < 1);
  const moved = { x: 320, y: 450 }, next = zoomAbout(camera, cursor, 1.2, moved);
  assert.ok(Math.abs((cursor.x - camera.x) / camera.zoom - (moved.x - next.x) / next.zoom) < 1e-9);
});

test('pinch capture handles card controls before their nopan/nowheel filters and leaves ordinary scroll alone', () => {
  const listeners = new Map<string, EventListener>();
  let captured = false;
  const element = {
    getBoundingClientRect: () => ({ left: 20, top: 30 }),
    addEventListener: (type: string, listener: EventListener, options: { capture: boolean; passive: boolean }) => { listeners.set(type, listener); captured = options.capture && !options.passive; },
    removeEventListener: (type: string) => listeners.delete(type),
  } as unknown as HTMLElement;
  let camera = { x: 20, y: 40, zoom: 1 }, updates = 0, prevented = 0, stopped = 0;
  const detach = attachCanvasGestures(element, { getViewport: () => camera, setViewport: next => { camera = next; updates++; } }, true);
  const event = { ctrlKey: true, deltaY: -5, deltaMode: 0, clientX: 200, clientY: 300, target: { closest: () => ({ className: 'nodrag nopan nowheel' }) }, preventDefault: () => prevented++, stopPropagation: () => stopped++ };
  listeners.get('wheel')!(event as unknown as Event);
  assert.equal(captured, true); assert.equal(prevented, 1); assert.equal(stopped, 1); assert.ok(camera.zoom > 1);
  listeners.get('wheel')!({ ...event, ctrlKey: false } as unknown as Event);
  assert.equal(updates, 1); assert.equal(prevented, 1);
  const touch = (x: number, y: number) => ({ clientX: x, clientY: y });
  listeners.get('touchstart')!({ ...event, touches: [touch(100, 200), touch(200, 200)] } as unknown as Event);
  const beforeTouch = camera.zoom;
  listeners.get('touchmove')!({ ...event, touches: [touch(75, 200), touch(225, 200)] } as unknown as Event);
  assert.ok(camera.zoom > beforeTouch);
  listeners.get('touchend')!({ touches: [] } as unknown as Event);
  const afterTouch = updates;
  listeners.get('touchmove')!({ ...event, touches: [touch(75, 200), touch(225, 200)] } as unknown as Event);
  assert.equal(updates, afterTouch);
  detach(); assert.equal(listeners.size, 0);
});
