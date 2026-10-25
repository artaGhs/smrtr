import { CanvasEventSchema, type CanvasEvent, type CanvasOutline, type CanvasUnit } from "./contracts";
import { validateComplete, validateOutline, validateUnit } from "./validation";

export type GenerationDraft = {
  requestId: string; runId?: string; sourceRevision?: string; mode?: "provider" | "simulated" | "chat"; text: string;
  seq: number; seen: Record<number, string>; outline?: CanvasOutline; units: Record<string, CanvasUnit>;
  failures: Record<string, string>; status: "preparing" | "outline" | "enriching" | "complete" | "partial" | "stopped" | "failed";
  terminal: boolean; error?: string;
};
export function createDraft(requestId: string): GenerationDraft {
  return { requestId, text: "", seq: 0, seen: {}, units: {}, failures: {}, status: "preparing", terminal: false };
}
/** Both transport adapters and the staged store use the same lifecycle checks. */
export function reduceEvent(current: GenerationDraft, raw: unknown): GenerationDraft {
  const event = CanvasEventSchema.parse(raw);
  if (event.requestId !== current.requestId || (current.runId && event.runId !== current.runId) || (current.sourceRevision && event.sourceRevision !== current.sourceRevision)) throw new Error("A stale generation event was rejected.");
  const encoded = JSON.stringify(event);
  if (event.seq <= current.seq) {
    if (current.seen[event.seq] === encoded) return current;
    throw new Error("Conflicting duplicate generation event.");
  }
  if (current.terminal) throw new Error("Generation sent data after its terminal event.");
  if (event.seq !== current.seq + 1) throw new Error("Generation stream has a sequence gap. The partial map is kept.");
  if (event.type !== "started" && !current.runId) throw new Error("Generation must start before sending content.");
  const next: GenerationDraft = { ...current, seq: event.seq, seen: { ...current.seen, [event.seq]: encoded } };
  switch (event.type) {
    case "started":
      if (current.runId) throw new Error("Generation was started twice.");
      return { ...next, runId: event.runId, sourceRevision: event.sourceRevision, text: event.text, mode: event.mode };
    case "outline":
      if (current.outline) throw new Error("A committed outline cannot be replaced.");
      return { ...next, outline: validateOutline(event.outline, current.text), status: "outline" };
    case "unit": {
      if (!current.outline) throw new Error("A teaching unit arrived before its outline.");
      const unit = validateUnit(event.unit, current.outline, Object.values(current.units), current.text, current.mode === "simulated");
      const failures = { ...current.failures }; delete failures[unit.module.conceptId];
      return { ...next, units: { ...current.units, [unit.module.conceptId]: unit }, failures, status: "enriching" };
    }
    case "unit-failed":
      if (!current.outline?.concepts.some((concept) => concept.id === event.conceptId) || current.units[event.conceptId]) throw new Error("Failure references an unknown or completed unit.");
      return { ...next, failures: { ...current.failures, [event.conceptId]: event.error } };
    case "finished": {
      if (!current.outline) throw new Error("Generation finished without an outline.");
      const missing = current.outline.concepts.filter((concept) => !current.units[concept.id]).map((concept) => concept.id).sort();
      if (new Set(event.missing).size !== event.missing.length || JSON.stringify([...event.missing].sort()) !== JSON.stringify(missing)) throw new Error("Generation completion has an inconsistent manifest.");
      if (event.outcome === "complete") {
        if (missing.length) throw new Error("An incomplete map cannot be marked complete.");
        validateComplete(current.outline, Object.values(current.units), current.text);
      } else if (event.outcome === "partial" && !missing.length) throw new Error("Partial completion needs a missing unit.");
      return { ...next, terminal: true, status: event.outcome === "cancelled" ? "stopped" : event.outcome };
    }
    case "failed": return { ...next, terminal: true, status: current.outline ? "partial" : "failed", error: event.error };
  }
}
export function stopDraft(draft: GenerationDraft): GenerationDraft { return { ...draft, terminal: true, status: "stopped" }; }
export function failDraft(draft: GenerationDraft, error: string): GenerationDraft { return { ...draft, terminal: true, status: draft.outline ? "partial" : "failed", error }; }
