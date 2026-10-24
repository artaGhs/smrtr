import { useEffect, useMemo, useState } from "react";
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps, type ReactFlowInstance } from "@xyflow/react";
import { ArrowUpRight, Check } from "lucide-react";
import type { Lesson } from "@/lib/contracts";
import "@xyflow/react/dist/style.css";

type ConceptNode = Node<{
  title: string;
  summary: string;
  order: number;
  active: boolean;
  practiced: boolean;
  review: boolean;
  onOpen: () => void;
}, "concept">;

function MapConcept({ data }: NodeProps<ConceptNode>) {
  return <><Handle type="target" position={Position.Left} /><button className="concept-node-button nodrag nopan nowheel" onClick={data.onOpen} aria-pressed={data.active}><span className="node-index">{String(data.order).padStart(2, "0")} / CONCEPT{data.practiced && <Check size={12} aria-label="Practiced" />}</span><strong>{data.title}<ArrowUpRight size={14} /></strong><span className="node-summary">{data.summary}</span>{data.review && <span className="node-review">Suggested review</span>}</button><Handle type="source" position={Position.Right} /></>;
}

const nodeTypes = { concept: MapConcept };
const relationColor = { prerequisite: "#8293bd", related: "#b8c1d0", contrast: "#d3aa7b", example: "#95a9e4" };

export function ConceptMap({ lesson, selectedConceptId, onSelectConcept, practiced, needsReview, overviewVersion }: {
  lesson: Lesson;
  selectedConceptId: string;
  onSelectConcept: (id: string) => void;
  practiced: Set<string>;
  needsReview: Set<string>;
  overviewVersion: number;
}) {
  const [instance, setInstance] = useState<ReactFlowInstance<ConceptNode, Edge> | null>(null);
  const nodes: ConceptNode[] = useMemo(() => {
    // Prerequisites advance left-to-right; other links never imply learning order.
    const levels = new Map(lesson.concepts.map((concept) => [concept.id, 0]));
    for (let iteration = 0; iteration < lesson.concepts.length; iteration++) {
      let changed = false;
      for (const relation of lesson.relations.filter((item) => item.type === "prerequisite")) {
        if (!levels.has(relation.source) || !levels.has(relation.target)) continue;
        const next = Math.min(lesson.concepts.length - 1, (levels.get(relation.source) ?? 0) + 1);
        if (next > (levels.get(relation.target) ?? 0)) { levels.set(relation.target, next); changed = true; }
      }
      if (!changed) break;
    }
    const rows = new Map<number, number>();
    return lesson.concepts.map((concept, index) => {
      const level = levels.get(concept.id) ?? 0;
      const row = rows.get(level) ?? 0;
      rows.set(level, row + 1);
      return { id: concept.id, type: "concept", position: { x: level * 310, y: row * 195 + (level % 2) * 80 }, data: { title: concept.title, summary: concept.summary, order: lesson.path.indexOf(concept.id) >= 0 ? lesson.path.indexOf(concept.id) + 1 : index + 1, active: concept.id === selectedConceptId, practiced: practiced.has(concept.id), review: needsReview.has(concept.id), onOpen: () => onSelectConcept(concept.id) }, className: `concept-node ${concept.id === selectedConceptId ? "active" : ""}`, style: { width: 218 }, draggable: false, selectable: false, focusable: false };
    });
  }, [lesson, selectedConceptId, onSelectConcept, practiced, needsReview]);
  const edges: Edge[] = lesson.relations.map((relation) => {
    const highlighted = relation.source === selectedConceptId || relation.target === selectedConceptId;
    const directed = relation.type === "prerequisite" || relation.type === "example";
    // Edge labels compete with node text at overview scale. The legend and selected
    // concept's connection list explain semantics without obscuring the canvas.
    return { id: relation.id, source: relation.source, target: relation.target, type: "smoothstep", animated: highlighted && relation.type === "prerequisite", style: { stroke: relationColor[relation.type], strokeWidth: highlighted ? 2 : 1.4, strokeDasharray: relation.type === "related" || relation.type === "contrast" ? "5 5" : relation.type === "example" ? "2 4" : undefined }, markerEnd: directed ? { type: MarkerType.ArrowClosed, color: relationColor[relation.type], width: 15, height: 15 } : undefined };
  });
  useEffect(() => { if (instance) void instance.fitView({ padding: 0.18, duration: 250 }); }, [instance, overviewVersion, lesson.id, lesson.revision]);

  return <div className="flow-map" aria-label="Connected concept map. Use the concept buttons to explore; drag the background to pan."><ReactFlow<ConceptNode> nodes={nodes} edges={edges} nodeTypes={nodeTypes} onInit={setInstance} fitView fitViewOptions={{ padding: 0.18 }} minZoom={0.25} maxZoom={1.6} nodesDraggable={false} nodesConnectable={false} edgesFocusable={false} panOnScroll zoomOnDoubleClick={false} preventScrolling={false}><Background gap={22} size={1} color="#e0e5ee" /><Controls showInteractive={false} position="bottom-left" /></ReactFlow><div className="map-hint" aria-hidden="true">Drag to explore · select an idea</div></div>;
}
