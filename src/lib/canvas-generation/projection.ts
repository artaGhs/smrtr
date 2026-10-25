import { parseCanvasSource, type CanvasSource } from "../canvas-document/source";
import type { GenerationDraft } from "./reducer";

/** Stable IDs and document identity let the editor preserve its learner overlay. */
export function projectDraft(draft: GenerationDraft): CanvasSource | undefined {
  const outline = draft.outline;
  if (!draft.runId) return undefined;
  if (!outline) return parseCanvasSource({ schemaVersion: 1, id: `generated-${draft.runId}`, revision: `${draft.sourceRevision}:${draft.seq}:${draft.status}`, title: draft.text.length <= 80 ? draft.text : "Your lecture", rootCanvasId: "overview", canvases: [{ id: "overview", title: "Your topic", entryNodeId: "topic-root" }], nodes: [{ id: "topic-root", canvasId: "overview", kind: "idea", role: "topic", title: draft.text.length <= 80 ? draft.text : "Your lecture", summary: draft.text.slice(0, 240), eyebrow: draft.status === "stopped" ? "Stopped" : draft.status === "failed" ? "Could not begin" : "Your input · organizing the topic", readiness: draft.terminal ? "failed" : "pending" }], edges: [], provenance: draft.mode === "simulated" ? "simulated" : "generated", status: draft.status === "stopped" ? "stopped" : draft.status === "failed" ? "partial" : "outline", sources: [{ id: "source-input", title: "Your submitted topic", text: draft.text }] });
  const scene = "overview";
  const nodes: CanvasSource["nodes"] = [{ id: "topic-root", canvasId: scene, kind: "idea", role: "topic", title: outline.title, summary: outline.summary, explanation: `${outline.centralQuestion}\n\n${outline.scenario.description}`, readiness: "ready", sourceIds: ["source-input"] }];
  const edges: CanvasSource["edges"] = [];
  const canvases: CanvasSource["canvases"] = [{ id: scene, title: outline.title }];
  for (const concept of outline.concepts) {
    const unit = draft.units[concept.id];
    const unfinished = !unit && draft.terminal;
    const unfinishedLabel = draft.status === "stopped" ? "Stopped · explanation not created" : "Incomplete · explanation not created";
    const nodeId = `concept-${concept.id}`;
    const detailCanvasId = `detail-${concept.id}`;
    const inlineActivity = unit?.demonstration ?? (unit?.module.activity.kind === "bfs" ? unit.module.activity : undefined);
    nodes.push({ id: nodeId, canvasId: scene, parentId: concept.parentId ? `concept-${concept.parentId}` : "topic-root", kind: inlineActivity ? "simulation" : "idea", role: concept.parentId ? "concept" : "branch", title: concept.title, summary: concept.summary, explanation: unit?.module.explanation, activity: inlineActivity, eyebrow: unit ? "Ready to explore" : unfinished ? unfinishedLabel : draft.failures[concept.id] ? "Could not finish" : "Explanation coming", readiness: unit ? "ready" : unfinished || draft.failures[concept.id] ? "failed" : "pending", sourceIds: concept.sourceIds, detailCanvasId: unit ? detailCanvasId : undefined });
    edges.push({ id: `contains-${concept.id}`, canvasId: scene, source: concept.parentId ? `concept-${concept.parentId}` : "topic-root", target: nodeId, label: concept.connection, relation: "hierarchy" });
    if (!unit) continue;
    const activityId = `activity-${concept.id}`;
    if (!inlineActivity) {
      nodes.push({ id: activityId, canvasId: scene, parentId: nodeId, kind: "simulation", role: "example", title: "Think it through", summary: unit.module.example.slice(0, 600), explanation: unit.module.example, activity: unit.module.activity, readiness: "ready", sourceIds: unit.module.sourceIds });
      edges.push({ id: `demonstrates-${concept.id}`, canvasId: scene, source: nodeId, target: activityId, label: "try the idea in this example", relation: "hierarchy" });
    }
    const detailRoot = `detail-root-${concept.id}`;
    canvases.push({ id: detailCanvasId, title: concept.title, parentCanvasId: scene, entryNodeId: detailRoot });
    nodes.push({ id: detailRoot, canvasId: detailCanvasId, kind: "idea", role: "topic", title: concept.title, summary: concept.summary, explanation: unit.module.explanation, readiness: "ready" });
    for (const detail of unit.details) {
      nodes.push({ id: `detail-node-${detail.id}`, canvasId: detailCanvasId, parentId: detailRoot, kind: "idea", role: "concept", title: detail.title, summary: detail.summary, explanation: detail.explanation, readiness: "ready" });
      edges.push({ id: `detail-link-${detail.id}`, canvasId: detailCanvasId, source: detailRoot, target: `detail-node-${detail.id}`, label: "look a little closer", relation: "hierarchy" });
    }
  }
  for (const relation of outline.relations) edges.push({ id: `relation-${relation.id}`, canvasId: scene, source: `concept-${relation.source}`, target: `concept-${relation.target}`, label: relation.meaning ?? relation.type, relation: relation.type });
  return parseCanvasSource({ schemaVersion: 1, id: `generated-${draft.runId}`, revision: `${draft.sourceRevision}:${draft.seq}:${draft.status}`, title: outline.title, rootCanvasId: scene, canvases, nodes, edges, provenance: draft.mode === "simulated" ? "simulated" : "generated", status: draft.status === "preparing" || draft.status === "failed" ? "partial" : draft.status, sources: [{ id: "source-input", title: draft.mode === "simulated" ? "Curated simulated topic" : "Your submitted notes or topic", text: draft.text }] });
}
