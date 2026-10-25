export type CanvasId = "sorting" | "compare" | "swap" | "pass" | "invariant" | "transfer" | "stability";
export type VisualMode = "problem" | "compare" | "swap" | "pass" | "invariant" | "transfer";
export type SortItem = { id: string; value: number; color: string };
export type SortFrame = {
  id: string;
  items: SortItem[];
  phase: "ready" | "compare" | "swap" | "keep" | "pass" | "done";
  activeIds: string[];
  sortedIds: string[];
  pass: number;
  comparisons: number;
  swaps: number;
  description: string;
};
export type Station = {
  id: string;
  title: string;
  question: string;
  caption: string;
  kind: "problem" | "demonstration" | "concept" | "challenge";
  x: number;
  y: number;
  width: number;
  height: number;
  visual: VisualMode;
  detailCanvas?: CanvasId;
  note?: string;
};
export type StationConnection = { id: string; source: string; target: string; label: string; optional?: boolean };
export type StationCanvasDefinition = {
  id: CanvasId;
  title: string;
  subtitle: string;
  parent: CanvasId | null;
  stations: Station[];
  connections: StationConnection[];
};
export type SortDemonstrationProps = {
  mode: VisualMode;
  frame: SortFrame;
  previousFrame?: SortFrame;
  compact?: boolean;
  onOpenDetail?: () => void;
};
