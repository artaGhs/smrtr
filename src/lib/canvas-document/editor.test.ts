import test from 'node:test';
import assert from 'node:assert/strict';
import { compose, createDocument, commit, redo, undo, rebaseDocument, rebaseHistory, patchNode, connectionError, visibleNodes, deleteObjects, type History } from './model';
import { parseDocument, serializeDocument } from './serialization';
import { curatedSource } from './curated';
import { layoutDocument } from './layout';
import { loadDocument, saveDocument, saveBeforeSwitch, CanvasSaveConflictError } from './storage';
import { parseCanvasSource, type CanvasSource } from './source';

const source = (): CanvasSource => ({ schemaVersion: 1, id: 'lesson', revision: 'one', title: 'Trees', rootCanvasId: 'main', provenance: 'generated', status: 'outline', canvases: [{ id: 'main', title: 'Trees' }], nodes: [{ id: 'root', canvasId: 'main', kind: 'idea', role: 'topic', title: 'Root' }, { id: 'child', canvasId: 'main', kind: 'idea', role: 'concept', title: 'Original', summary: 'Before', parentId: 'root' }], edges: [{ id: 'branch', canvasId: 'main', source: 'root', target: 'child', label: 'contains', relation: 'hierarchy' }] });
test('curated adapter preserves every nested scene and sorting source passes shared validation', () => {
  const seed = curatedSource();
  assert.equal(seed.canvases.length, 8);
  assert.ok(seed.nodes.filter(n => n.kind === 'simulation').length > 10);
  assert.doesNotThrow(() => parseCanvasSource(seed));
  assert.deepEqual(parseDocument(serializeDocument(createDocument(seed))).source, JSON.parse(JSON.stringify(seed)));
});
test('personal content and placement never mutate source; a gesture is one undo transaction', () => {
  const original = source(), document = createDocument(original), before = JSON.stringify(original);
  let h: History = { past: [], present: document.overlay, future: [] };
  h = commit(h, patchNode(h.present, 'child', { title: 'My words', bounds: { x: 500, y: 200, width: 300, height: 100 } }));
  assert.equal(JSON.stringify(original), before);
  assert.equal(compose(document.source, h.present).nodes[1].title, 'My words');
  assert.equal(h.past.length, 1);
  assert.equal(compose(document.source, undo(h).present).nodes[1].title, 'Original');
  assert.equal(compose(document.source, redo(undo(h)).present).nodes[1].bounds?.x, 500);
});
test('same-document source arrivals preserve undo and redo while adopting new untouched fields', () => {
  const document = createDocument(source());
  const h = commit({ past: [], present: document.overlay, future: [] }, patchNode(document.overlay, 'child', { title: 'Mine' }));
  const next = source(); next.revision = 'two'; next.nodes[1].summary = 'New source summary';
  const rebased = rebaseHistory(h, document, next);
  assert.equal(rebased.history.past.length, 1);
  assert.equal(compose(rebased.document.source, undo(rebased.history).present).nodes[1].title, 'Original');
  assert.equal(compose(rebased.document.source, undo(rebased.history).present).nodes[1].summary, 'New source summary');
  const undone = undo(h), arrived = rebaseHistory(undone, document, next);
  assert.equal(compose(arrived.document.source, redo(arrived.history).present).nodes[1].title, 'Mine');
});
test('three-way conflict keeps learner wording and marks original change for review', () => {
  const document = createDocument(source()); document.overlay = patchNode(document.overlay, 'child', { title: 'Personal', bounds: { x: 800, y: 900, width: 330, height: 180 } });
  const next = source(); next.revision = 'two'; next.nodes[1].title = 'Revised original';
  const rebased = rebaseDocument(document, next);
  assert.equal(compose(rebased.source, rebased.overlay).nodes[1].title, 'Personal');
  assert.equal(rebased.conflicts.length, 1);
  assert.equal(rebased.overlay.nodes.child.bounds?.x, 800);
  assert.equal(rebased.source.nodes[1].title, 'Revised original');
});
test('deleted edited source objects remain tombstoned across regeneration and serialize', () => {
  const document = createDocument(source()); document.overlay = patchNode(document.overlay, 'child', { title: 'Mine' });
  document.overlay = deleteObjects(document.source, document.overlay, ['child'], []);
  const next = source(); next.nodes = next.nodes.slice(0, 1); next.edges = []; next.revision = 'two';
  const rebased = rebaseDocument(document, next);
  assert.equal(compose(rebased.source, rebased.overlay).nodes.length, 1);
  assert.doesNotThrow(() => parseDocument(serializeDocument(rebased)));
});
test('a removed edited idea survives as a detached copy', () => {
  const document = createDocument(source()); document.overlay = patchNode(document.overlay, 'child', { title: 'Mine' });
  const next = source(); next.nodes = next.nodes.slice(0, 1); next.edges = []; next.revision = 'two';
  const rebased = rebaseDocument(document, next);
  assert.equal(rebased.overlay.addedNodes[0].detached, true);
  assert.equal(rebased.overlay.addedNodes[0].title, 'Mine');
  assert.doesNotThrow(() => parseDocument(serializeDocument(rebased)));
});
test('hierarchy rejects cycles and multiple parents; related links may form cycles', () => {
  const { source: base, overlay } = createDocument(source()), g = compose(base, overlay);
  const candidate = { id: 'reverse', canvasId: 'main', source: 'child', target: 'root', label: '', relation: 'hierarchy' as const };
  assert.match(connectionError(g.nodes, g.edges, candidate)!, /ancestor/);
  assert.equal(connectionError(g.nodes, g.edges, { ...candidate, relation: 'related' }), null);
  assert.match(connectionError(g.nodes, g.edges, { ...candidate, source: 'root', target: 'root' })!, /itself/);
});
test('folding changes visibility without deleting personal text or descendant state', () => {
  const doc = createDocument(source()); doc.overlay = patchNode(doc.overlay, 'child', { explanation: 'A remembered note' });
  const g = compose(doc.source, doc.overlay);
  assert.equal(visibleNodes(g.nodes, g.edges, 'main', new Set()).length, 1);
  assert.equal(visibleNodes(g.nodes, g.edges, 'main', new Set(['root']))[1].explanation, 'A remembered note');
});
test('manual bounds remain exact during reflow; disclosure anchor stays fixed', () => {
  const doc = createDocument(source()); doc.overlay = patchNode(doc.overlay, 'child', { bounds: { x: 720, y: 410, width: 300, height: 160 } });
  const g = compose(doc.source, doc.overlay);
  const layout = layoutDocument(g.nodes, g.edges, doc.overlay, { root: 260 }, { id: 'root', x: 90, y: 100 });
  assert.equal(layout.root.x, 90); assert.equal(layout.root.y, 100);
  assert.equal(layout.child.x, 720); assert.equal(layout.child.y, 410);
});
test('delete branch promotes surviving children and removes incident connections atomically', () => {
  const doc = createDocument(source()), overlay = deleteObjects(doc.source, doc.overlay, ['root'], []);
  const g = compose(doc.source, overlay);
  assert.equal(g.nodes.length, 1); assert.equal(g.edges.length, 0);
  assert.equal(visibleNodes(g.nodes, g.edges, 'main', new Set()).length, 1);
});
test('import rejects unsupported versions, duplicate IDs, dangling edges and unsafe coordinates', () => {
  const doc = createDocument(source());
  assert.throws(() => parseDocument(JSON.stringify({ ...doc, version: 99 })), /Invalid/);
  const duplicate = structuredClone(doc); duplicate.source.nodes.push(duplicate.source.nodes[0]);
  assert.throws(() => parseDocument(serializeDocument(duplicate)), /unique|Duplicate/);
  const dangling = structuredClone(doc); dangling.overlay.addedEdges.push({ id: 'bad', canvasId: 'main', source: 'root', target: 'missing', label: '', relation: 'related' });
  assert.throws(() => parseDocument(serializeDocument(dangling)), /missing/);
  const huge = structuredClone(doc); huge.overlay.nodes.root = { bounds: { x: 1e10, y: 0, width: 300, height: 200 } };
  assert.throws(() => parseDocument(serializeDocument(huge)), /Invalid/);
});
test('import rejects cycles introduced by learner edge overrides and invalid groups', () => {
  const doc = createDocument(source());
  doc.overlay.addedEdges.push({ id: 'reverse', canvasId: 'main', source: 'child', target: 'root', label: '', relation: 'hierarchy' });
  assert.throws(() => parseDocument(serializeDocument(doc)), /ancestor/);
  doc.overlay.addedEdges = []; doc.overlay.nodes.child = { groupId: 'root' };
  assert.throws(() => parseDocument(serializeDocument(doc)), /group/);
});
test('JSON round-trip restores nested navigation, strokes and personal relations', () => {
  const doc = createDocument(curatedSource());
  doc.view.canvasId = 'compare'; doc.view.cameras['topic-map'] = { x: 21, y: 34, zoom: .7 }; doc.view.frames['sort:5,2,4,1,3'] = 4;
  doc.overlay.addedNodes.push({ id: 'ink:one', canvasId: 'compare', kind: 'ink', role: 'annotation', title: 'ink', points: [{ x: 0, y: 0 }, { x: 25, y: 30 }], bounds: { x: 300, y: 200, width: 25, height: 30 } });
  assert.deepEqual(parseDocument(serializeDocument(doc)), JSON.parse(JSON.stringify(doc)));
});
test('unavailable persistence rejects rather than silently claiming a save', async () => {
  await assert.rejects(saveDocument('test', createDocument(source())), /unavailable/);
  await assert.rejects(loadDocument('test'), /unavailable/);
});
test('a streaming outline grows around the original root position', () => {
  const doc = createDocument(source());
  const first = layoutDocument([doc.source.nodes[0]], [], doc.overlay, {});
  const anchor = { id: 'root', x: first.root.x, y: first.root.y };
  const full = layoutDocument(doc.source.nodes, doc.source.edges, doc.overlay, { child: 600 }, anchor);
  assert.equal(full.root.x, first.root.x); assert.equal(full.root.y, first.root.y);
  const folded = layoutDocument([doc.source.nodes[0]], [], doc.overlay, { root: 220 }, anchor);
  assert.equal(folded.root.x, first.root.x); assert.equal(folded.root.y, first.root.y);
});
test('switching after a competing save retains personal work in a separate recoverable canvas', async () => {
  const doc = createDocument(source());
  doc.overlay = patchNode(doc.overlay, 'child', { title: 'My unsaved explanation' });
  const writes: { key: string; json: string }[] = [];
  const notice = await saveBeforeSwitch('test', doc, async (key, value) => {
    if (key === 'test:lesson') throw new CanvasSaveConflictError('Another tab saved.');
    writes.push({ key, json: serializeDocument(value) });
  }, () => 'unique');
  assert.match(notice!, /separate canvas/);
  assert.equal(writes.length, 1);
  const restored = parseDocument(writes[0].json);
  assert.equal(restored.source.id, 'lesson:recovery:unique');
  assert.equal(restored.overlay.nodes.child.title, 'My unsaved explanation');
  assert.equal(doc.source.id, 'lesson');
  assert.deepEqual(restored.view, doc.view);
});
test('switching never discards the current document when saving its recovery copy fails', async () => {
  const doc = createDocument(source());
  const before = serializeDocument(doc);
  await assert.rejects(saveBeforeSwitch('test', doc, async key => {
    if (key === 'test:lesson') throw new CanvasSaveConflictError('Another tab saved.');
    throw new Error('Storage quota reached');
  }, () => 'unique'), /quota/);
  assert.equal(serializeDocument(doc), before);
});
