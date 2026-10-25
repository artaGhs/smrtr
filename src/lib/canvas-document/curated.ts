import { parseCanvasSource, type CanvasSource, type CanvasSourceNode } from './source';
import { topicElements, layoutTopicMap } from '../station-canvas/topic-map';
import { getCanvas, SORTING_VALUES, TRANSFER_VALUES, STABILITY_VALUES } from '../station-canvas/model';
import type { CanvasId } from '../station-canvas/types';

export function curatedSource(): CanvasSource {
  const placements = layoutTopicMap(new Set(topicElements.map(n => n.id)));
  const nodes: CanvasSourceNode[] = placements.map(({ element: e, x, y, width, height }) => ({
    id: e.id, canvasId: 'topic-map', title: e.title, summary: e.summary, explanation: e.explanation, eyebrow: e.eyebrow,
    kind: e.kind === 'example' ? 'simulation' : 'idea', role: e.kind === 'topic' ? 'topic' : e.kind === 'branch' ? 'branch' : e.kind === 'example' ? 'example' : 'concept',
    bounds: { x, y, width, height }, detailCanvasId: e.canvas,
    ...(e.kind === 'example' ? { activity: { kind: 'sorting' as const, values: SORTING_VALUES, mode: 'problem' as const } } : {}),
  }));
  const source: CanvasSource = { schemaVersion: 1, id: 'curated-sorting-editor', revision: 'sorting-editor-v1', title: 'Sorting', rootCanvasId: 'topic-map', provenance: 'curated', status: 'complete', nodes,
    canvases: [{ id: 'topic-map', title: 'Sorting' }],
    edges: topicElements.flatMap(e => e.children.map(id => ({ id: `${e.id}-${id}`, canvasId: 'topic-map', source: e.id, target: id, label: topicElements.find(n => n.id === id)?.relation ?? 'explore', relation: 'hierarchy' as const }))),
  };
  source.edges.push({ id: 'bubble-growth', canvasId: 'topic-map', source: 'bubble', target: 'growth', label: 'the same strategy, measured', relation: 'related' });
  for (const canvasId of ['sorting', 'compare', 'swap', 'pass', 'invariant', 'transfer', 'stability'] as CanvasId[]) {
    const canvas = getCanvas(canvasId);
    source.canvases.push({ id: canvasId, title: canvas.title, parentCanvasId: canvas.parent ?? 'topic-map', entryNodeId: `${canvasId}:${canvas.stations[0].id}` });
    for (const station of canvas.stations) source.nodes.push({ id: `${canvasId}:${station.id}`, canvasId, title: station.title, summary: station.question, explanation: station.caption, eyebrow: station.note ?? station.kind, kind: 'simulation', role: station.kind === 'concept' ? 'concept' : 'example', bounds: { x: station.x, y: station.y, width: station.width, height: station.height }, detailCanvasId: station.detailCanvas,
      activity: { kind: 'sorting', mode: station.visual, values: canvasId === 'stability' ? STABILITY_VALUES : canvasId === 'transfer' || station.visual === 'transfer' ? TRANSFER_VALUES : SORTING_VALUES } });
    for (const edge of canvas.connections) source.edges.push({ id: `${canvasId}:${edge.id}`, canvasId, source: `${canvasId}:${edge.source}`, target: `${canvasId}:${edge.target}`, label: edge.label, relation: 'related' });
  }
  for (const edge of source.edges) if (edge.relation === 'hierarchy') source.nodes.find(n => n.id === edge.target)!.parentId = edge.source;
  return parseCanvasSource(source);
}
