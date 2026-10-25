import { parseCanvasSource, type CanvasSource } from "../canvas-document/source";
import type { GenerationRequest, Lesson } from "../contracts";
import { generateLesson } from "../session/generate-lesson";

/** v1 continues to use its existing complete-plan/module validation and parser. */
export function projectLegacyLesson(lesson: Lesson, complete = false): CanvasSource {
  const nodes: CanvasSource["nodes"] = [{ id: "topic-root", canvasId: "overview", kind: "idea", role: "topic", title: lesson.title, summary: lesson.summary, explanation: lesson.teachingPlan?.bigPicture, readiness: "ready" }];
  const edges: CanvasSource["edges"] = [];
  const canvases: CanvasSource["canvases"] = [{ id: "overview", title: lesson.title, entryNodeId: "topic-root" }];
  for (const concept of lesson.concepts) {
    const module = lesson.modules.find((item) => item.conceptId === concept.id);
    const nodeId = `concept-${concept.id}`;
    const sceneId = `detail-${concept.id}`;
    nodes.push({ id: nodeId, canvasId: "overview", parentId: "topic-root", kind: "idea", role: "branch", title: concept.title, summary: concept.summary, explanation: module?.explanation, detailCanvasId: module ? sceneId : undefined, readiness: module ? "ready" : "pending", eyebrow: module ? "Ready to explore" : "Explanation coming", sourceIds: concept.sourceIds });
    edges.push({ id: `contains-${concept.id}`, canvasId: "overview", source: "topic-root", target: nodeId, label: concept.objective.slice(0, 1000), relation: "hierarchy" });
    if (module) {
      const detailId = `detail-root-${concept.id}`;
      canvases.push({ id: sceneId, title: concept.title, parentCanvasId: "overview", entryNodeId: detailId });
      nodes.push({ id: detailId, canvasId: sceneId, kind: "idea", role: "topic", title: concept.title, summary: concept.summary, explanation: module.explanation, readiness: "ready" });
      nodes.push({ id: `activity-${concept.id}`, canvasId: sceneId, parentId: detailId, kind: "simulation", role: "example", title: "Explore the example", summary: module.example.slice(0, 5000), activity: module.activity, readiness: "ready" });
      edges.push({ id: `activity-link-${concept.id}`, canvasId: sceneId, source: detailId, target: `activity-${concept.id}`, label: "apply the idea", relation: "hierarchy" });
    }
  }
  for (const relation of lesson.relations) edges.push({ id: `relation-${relation.id}`, canvasId: "overview", source: `concept-${relation.source}`, target: `concept-${relation.target}`, label: relation.meaning ?? relation.type, relation: relation.type });
  return parseCanvasSource({ schemaVersion: 1, id: lesson.id, revision: `${lesson.revision}:${lesson.modules.length}:${complete}`, title: lesson.title, rootCanvasId: "overview", canvases, nodes, edges, provenance: lesson.mode === "sample" ? "curated" : "generated", status: complete ? "complete" : lesson.modules.length ? "enriching" : "outline", sources: lesson.sources });
}
export async function generateLegacyCanvas(request: GenerationRequest, signal: AbortSignal, onSource: (source: CanvasSource) => void, fetcher: typeof fetch = fetch) {
  const lesson = await generateLesson(request, signal, (partial) => onSource(projectLegacyLesson(partial)), fetcher);
  const source = projectLegacyLesson(lesson, true);
  onSource(source);
  return source;
}

export function endLegacySource(source: CanvasSource, status: "stopped" | "partial"): CanvasSource {
  return parseCanvasSource({ ...source, status, revision: `${source.revision}:${status}`, nodes: source.nodes.map((node) => node.readiness === "pending" ? { ...node, readiness: "failed", eyebrow: status === "stopped" ? "Stopped · explanation not created" : "Incomplete · explanation not created" } : node) });
}
