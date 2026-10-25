import { z } from "zod";
import { ActivitySpecSchema, SourceRecordSchema } from "@/lib/contracts";
import type { VisualMode } from "@/lib/station-canvas/types";

/** Shared boundary between generated content and the editable canvas. */
export type CanvasPoint = { x: number; y: number };
export type CanvasBounds = CanvasPoint & { width: number; height: number };
export type CanvasActivity = z.infer<typeof ActivitySpecSchema> | {
  kind: "sorting";
  values: number[];
  mode?: VisualMode;
};
export type CanvasSourceNode = {
  id: string;
  canvasId: string;
  parentId?: string;
  kind: "idea" | "text" | "rectangle" | "ellipse" | "ink" | "group" | "simulation";
  role: "topic" | "branch" | "concept" | "example" | "annotation";
  title: string;
  summary?: string;
  explanation?: string;
  eyebrow?: string;
  detailCanvasId?: string;
  activity?: CanvasActivity;
  readiness?: "pending" | "ready" | "failed";
  sourceIds?: string[];
  bounds?: CanvasBounds;
  points?: CanvasPoint[];
  style?: { fill?: string; stroke?: string; color?: string; strokeWidth?: number };
};
export type CanvasSourceEdge = {
  id: string;
  canvasId: string;
  source: string;
  target: string;
  label: string;
  relation: "hierarchy" | "related" | "contrast" | "example" | "prerequisite";
};
export type CanvasSourceScene = {
  id: string;
  title: string;
  parentCanvasId?: string;
  entryNodeId?: string;
};
export type CanvasSource = {
  schemaVersion: 1;
  id: string;
  revision: string;
  title: string;
  rootCanvasId: string;
  canvases: CanvasSourceScene[];
  nodes: CanvasSourceNode[];
  edges: CanvasSourceEdge[];
  provenance: "curated" | "generated" | "simulated";
  status: "outline" | "enriching" | "complete" | "partial" | "stopped";
  sources?: z.infer<typeof SourceRecordSchema>[];
};

const identifier = z.string().min(1).max(300);
const coordinate = z.number().finite().min(-1_000_000).max(1_000_000);
const point = z.object({ x: coordinate, y: coordinate }).strict();
const color = z.string().regex(/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i);
const bounds = point.extend({ width: z.number().finite().min(16).max(10_000), height: z.number().finite().min(16).max(10_000) });
const activity = z.union([ActivitySpecSchema, z.object({ kind: z.literal("sorting"), values: z.array(z.number().finite()).max(128), mode: z.enum(["problem", "compare", "swap", "pass", "invariant", "transfer"]).optional() }).strict()]);

/** Validate external/imported source data before it can enter the editable graph. */
export const CanvasSourceSchema = z.object({
  schemaVersion: z.literal(1),
  id: identifier,
  revision: identifier,
  title: z.string().max(500),
  rootCanvasId: identifier,
  canvases: z.array(z.object({ id: identifier, title: z.string().max(500), parentCanvasId: identifier.optional(), entryNodeId: identifier.optional() }).strict()).min(1).max(100),
  nodes: z.array(z.object({
    id: identifier, canvasId: identifier, parentId: identifier.optional(),
    kind: z.enum(["idea", "text", "rectangle", "ellipse", "ink", "group", "simulation"]),
    role: z.enum(["topic", "branch", "concept", "example", "annotation"]),
    title: z.string().max(500), summary: z.string().max(5000).optional(), explanation: z.string().max(40_000).optional(), eyebrow: z.string().max(300).optional(),
    detailCanvasId: identifier.optional(), activity: activity.optional(), readiness: z.enum(["pending", "ready", "failed"]).optional(), sourceIds: z.array(identifier).max(100).optional(),
    bounds: bounds.optional(), points: z.array(point).max(20_000).optional(),
    style: z.object({ fill: color.optional(), stroke: color.optional(), color: color.optional(), strokeWidth: z.number().finite().min(0.25).max(30).optional() }).strict().optional(),
  }).strict()).max(1500),
  edges: z.array(z.object({ id: identifier, canvasId: identifier, source: identifier, target: identifier, label: z.string().max(1000), relation: z.enum(["hierarchy", "related", "contrast", "example", "prerequisite"]) }).strict()).max(4000),
  provenance: z.enum(["curated", "generated", "simulated"]),
  status: z.enum(["outline", "enriching", "complete", "partial", "stopped"]),
  sources: z.array(SourceRecordSchema).max(100).optional(),
}).strict().superRefine((source, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  const scenes = new Map(source.canvases.map((scene) => [scene.id, scene]));
  const nodes = new Map(source.nodes.map((node) => [node.id, node]));
  if (scenes.size !== source.canvases.length || nodes.size !== source.nodes.length || new Set(source.edges.map((edge) => edge.id)).size !== source.edges.length) fail("Canvas, element and connection identities must be unique.");
  if (!scenes.has(source.rootCanvasId)) fail("The root canvas does not exist.");
  if (scenes.get(source.rootCanvasId)?.parentCanvasId) fail("The root canvas cannot have a parent.");
  for (const scene of source.canvases) {
    if (scene.parentCanvasId && !scenes.has(scene.parentCanvasId)) fail("A canvas refers to an unknown parent.");
    if (scene.entryNodeId && nodes.get(scene.entryNodeId)?.canvasId !== scene.id) fail("A canvas entry must be an element on that canvas.");
    const seen = new Set<string>([scene.id]);
    let parent = scene.parentCanvasId;
    while (parent) { if (seen.has(parent)) { fail("Canvas ancestry cannot contain a cycle."); break; } seen.add(parent); parent = scenes.get(parent)?.parentCanvasId; }
  }
  let pointCount = 0;
  for (const node of source.nodes) {
    if (!scenes.has(node.canvasId)) fail("An element refers to an unknown canvas.");
    if (node.detailCanvasId && !scenes.has(node.detailCanvasId)) fail("A detail link refers to an unknown canvas.");
    if (node.parentId && nodes.get(node.parentId)?.canvasId !== node.canvasId) fail("An element's branch owner must exist on the same canvas.");
    const seen = new Set<string>([node.id]);
    let parent = node.parentId;
    while (parent) { if (seen.has(parent)) { fail("Branch ownership cannot contain a cycle."); break; } seen.add(parent); parent = nodes.get(parent)?.parentId; }
    if (node.kind === "simulation" && !node.activity) fail("A simulation needs a validated activity.");
    if (node.activity?.kind === "bfs") {
      const activityNodes = new Set(node.activity.nodes);
      if (activityNodes.size !== node.activity.nodes.length || !activityNodes.has(node.activity.start) || node.activity.edges.some((edge) => !activityNodes.has(edge.source) || !activityNodes.has(edge.target))) fail("A graph activity has invalid identities or endpoints.");
    }
    pointCount += node.points?.length ?? 0;
  }
  if (pointCount > 200_000) fail("The document has too many drawing points.");
  const hierarchyOwners = new Map<string, string>();
  for (const edge of source.edges) {
    const from = nodes.get(edge.source), to = nodes.get(edge.target);
    if (!scenes.has(edge.canvasId) || from?.canvasId !== edge.canvasId || to?.canvasId !== edge.canvasId || edge.source === edge.target) fail("Connections need distinct existing endpoints on the same canvas.");
    if (edge.relation === "hierarchy") {
      if (hierarchyOwners.has(edge.target)) fail("An element may have only one hierarchy owner.");
      hierarchyOwners.set(edge.target, edge.source);
      if (to?.parentId !== edge.source) fail("A hierarchy connection must match branch ownership.");
    }
  }
});

export function parseCanvasSource(input: unknown): CanvasSource {
  return CanvasSourceSchema.parse(input);
}
