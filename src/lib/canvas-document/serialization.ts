import { z } from 'zod';
import { ActivitySpecSchema } from '../contracts';
import { CanvasSourceSchema } from './source';
import { compose, connectionError, type CanvasDocument } from './model';

const id = z.string().min(1).max(240).refine(v => !['__proto__', 'prototype', 'constructor'].includes(v), 'Reserved identifier');
const text = z.string().max(40000);
const coordinate = z.number().finite().min(-1_000_000).max(1_000_000);
const point = z.object({ x: coordinate, y: coordinate });
const bounds = point.extend({ width: z.number().min(1).max(20000), height: z.number().min(1).max(20000) });
const color = z.string().regex(/^#[0-9a-fA-F]{3,8}$/);
const style = z.object({ fill: color.optional(), stroke: color.optional(), color: color.optional(), strokeWidth: z.number().min(0.1).max(40).optional() });
const activity = z.union([ActivitySpecSchema, z.object({ kind: z.literal('sorting'), values: z.array(z.number().finite().min(-100000).max(100000)).max(30), mode: z.enum(['problem', 'compare', 'swap', 'pass', 'invariant', 'transfer']).optional() })]);
const node = z.object({ id, canvasId: id, parentId: id.optional(), kind: z.enum(['idea', 'text', 'rectangle', 'ellipse', 'ink', 'group', 'simulation']), role: z.enum(['topic', 'branch', 'concept', 'example', 'annotation']), title: text, summary: text.optional(), explanation: text.optional(), eyebrow: text.optional(), detailCanvasId: id.optional(), activity: activity.optional(), readiness: z.enum(['pending', 'ready', 'failed']).optional(), sourceIds: z.array(id).max(1000).optional(), bounds: bounds.optional(), points: z.array(point).max(10000).optional(), style: style.optional(), groupId: z.string().max(240).optional(), detached: z.boolean().optional() });
const edge = z.object({ id, canvasId: id, source: id, target: id, label: text, relation: z.enum(['hierarchy', 'related', 'contrast', 'example', 'prerequisite']) });
const viewport = point.extend({ zoom: z.number().min(0.05).max(8) });
const schema = z.object({ version: z.literal(1), source: CanvasSourceSchema, overlay: z.object({ nodes: z.record(id, node.omit({ id: true, canvasId: true, kind: true, activity: true }).partial()), edges: z.record(id, edge.omit({ id: true, canvasId: true }).partial()), addedNodes: z.array(node).max(3000), addedEdges: z.array(edge).max(6000), deletedNodes: z.array(id).max(8000), deletedEdges: z.array(id).max(16000) }), view: z.object({ canvasId: id, expanded: z.array(id).max(8000), explained: z.array(id).max(8000), cameras: z.record(id, viewport), frames: z.record(id, z.number().int().min(0).max(100000)), anchors: z.record(id, point.extend({ id })).optional(), visits: z.array(z.object({ canvasId: id, viewport, frames: z.record(id, z.number().int().min(0).max(100000)).optional() })).max(200) }), conflicts: z.array(text).max(5000), updatedAt: z.string().max(100) });

export function parseDocument(raw: string): CanvasDocument {
  if (raw.length > 12_000_000) throw new Error('This file is too large (maximum 12 MB).');
  const result = schema.safeParse(JSON.parse(raw));
  if (!result.success) throw new Error(`Invalid canvas file: ${result.error.issues[0]?.message ?? 'unsupported format'}`);
  const doc = result.data as CanvasDocument;
  const scenes = new Set(doc.source.canvases.map(c => c.id));
  if (scenes.size !== doc.source.canvases.length || !scenes.has(doc.source.rootCanvasId) || !scenes.has(doc.view.canvasId)) throw new Error('Invalid canvas references.');
  const allNodes = [...doc.source.nodes, ...doc.overlay.addedNodes];
  const nodeIds = new Set(allNodes.map(n => n.id));
  const allEdges = [...doc.source.edges, ...doc.overlay.addedEdges];
  if (nodeIds.size !== allNodes.length || new Set(allEdges.map(e => e.id)).size !== allEdges.length) throw new Error('Duplicate object or connection IDs.');
  for (const n of allNodes) if (!scenes.has(n.canvasId) || n.detailCanvasId && !scenes.has(n.detailCanvasId)) throw new Error('An object references a missing canvas.');
  for (const e of allEdges) if (!nodeIds.has(e.source) || !nodeIds.has(e.target) || !scenes.has(e.canvasId)) throw new Error('A connection references a missing object.');
  if (Object.keys(doc.overlay.nodes).some(key => !nodeIds.has(key)) || Object.keys(doc.overlay.edges).some(key => !allEdges.some(e => e.id === key))) throw new Error('An edit references a missing object.');
  const graph = compose(doc.source, doc.overlay), accepted: typeof graph.edges = [];
  for (const e of graph.edges) {
    const error = connectionError(graph.nodes, accepted, e);
    if (error) throw new Error(error);
    accepted.push(e);
  }
  for (const n of graph.nodes) {
    const seen = new Set([n.id]); let current = n;
    while (current.groupId) {
      const group = graph.nodes.find(g => g.id === current.groupId);
      if (!group || group.kind !== 'group' || group.canvasId !== n.canvasId || seen.has(group.id)) throw new Error('Invalid group membership.');
      seen.add(group.id); current = group;
    }
  }
  return doc;
}
export const serializeDocument = (document: CanvasDocument) => JSON.stringify(document, null, 2);
