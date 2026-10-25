import type {
  CanvasId,
  SortFrame,
  SortItem,
  Station,
  StationCanvasDefinition,
  StationConnection,
  VisualMode,
} from "./types";

export const SORTING_VALUES = [5, 2, 4, 1, 3];
export const TRANSFER_VALUES = [3, 1, 5, 2, 4];
export const STABILITY_VALUES = [3, 1, 3, 2];
const BOOK_COLORS = ["#eb9d83", "#9daecd", "#e3c372", "#a8b9a0", "#b8a4ca", "#9bbfc3"];

/** Identity is based on the input position, so equal values remain distinct books. */
export function createSortItems(values: number[]): SortItem[] {
  if (values.some((value) => !Number.isFinite(value))) {
    throw new RangeError("Sorting values must be finite numbers.");
  }
  return values.map((value, index) => ({
    id: `book-${index}`,
    value,
    color: BOOK_COLORS[index % BOOK_COLORS.length],
  }));
}

/** Bubble sort swaps strictly out-of-order neighbours, preserving equal-item order. */
export function buildBubbleTrace(input: SortItem[]): SortFrame[] {
  if (input.some((item) => !Number.isFinite(item.value))) {
    throw new RangeError("Sorting values must be finite numbers.");
  }
  if (new Set(input.map((item) => item.id)).size !== input.length) {
    throw new Error("Every sorting item needs a distinct identity.");
  }
  const items = input.map((item) => ({ ...item }));
  const frames: SortFrame[] = [];
  const sorted = new Set<string>();
  let comparisons = 0;
  let swaps = 0;
  let pass = 0;
  const record = (phase: SortFrame["phase"], activeIds: string[], description: string) => {
    frames.push({
      id: `frame-${frames.length}`,
      items: items.map((item) => ({ ...item })),
      phase,
      activeIds: [...activeIds],
      sortedIds: items.filter((item) => sorted.has(item.id)).map((item) => item.id),
      pass,
      comparisons,
      swaps,
      description,
    });
  };

  record("ready", [], "A mixed-up shelf. Put the smaller values on the left.");
  for (let end = items.length - 1; end > 0; end -= 1) {
    pass += 1;
    let changed = false;
    for (let index = 0; index < end; index += 1) {
      const left = items[index];
      const right = items[index + 1];
      const pair = [left.id, right.id];
      comparisons += 1;
      record("compare", pair, `Compare ${left.value} and ${right.value}. Which belongs on the left?`);
      if (left.value > right.value) {
        items[index] = right;
        items[index + 1] = left;
        swaps += 1;
        changed = true;
        record("swap", pair, `${left.value} is larger than ${right.value}. Swap this pair.`);
      } else {
        record("keep", pair, left.value === right.value
          ? `Both values are ${left.value}. Keep the earlier book first.`
          : `${left.value} is already before ${right.value}. Leave this pair in place.`);
      }
    }
    sorted.add(items[end].id);
    record("pass", [items[end].id], `${items[end].value} has reached its final place. The next pass can stop before it.`);
    if (!changed) break;
  }
  items.forEach((item) => sorted.add(item.id));
  record("done", [], items.length === 0
    ? "An empty shelf is already ordered."
    : "The shelf is ordered. Every value is no larger than the one after it.");
  return frames;
}

/** Preview one meaningful event without tying reading navigation to playback. */
export function getFrameForMode(trace: SortFrame[], mode: VisualMode): number {
  const phase: Partial<Record<VisualMode, SortFrame["phase"]>> = {
    compare: "compare",
    swap: "swap",
    pass: "pass",
    invariant: "pass",
  };
  const match = phase[mode];
  if (!match) return 0;
  const index = trace.findIndex((frame) => frame.phase === match);
  return index < 0 ? Math.max(0, trace.findIndex((frame) => frame.phase === "keep")) : index;
}

type StationInput = Omit<Station, "width" | "height"> & Partial<Pick<Station, "width" | "height">>;
const station = (value: StationInput): Station => ({ width: 440, height: 330, ...value });
const connection = (source: string, target: string, label: string, optional = false): StationConnection => ({
  id: `${source}-to-${target}`,
  source,
  target,
  label,
  ...(optional ? { optional: true } : {}),
});

const canvases: Record<CanvasId, StationCanvasDefinition> = {
  sorting: {
    id: "sorting",
    title: "Small moves. A sorted shelf.",
    subtitle: "Start with five books. Follow the connections to discover a sorting strategy.",
    parent: null,
    stations: [
      station({ id: "mixed-shelf", title: "A mixed-up shelf", question: "How would you put these in order?", caption: "Smaller on the left. Larger on the right. The same five books stay with us.", kind: "problem", x: 80, y: 130, width: 480, height: 370, visual: "problem", detailCanvas: "compare" }),
      station({ id: "look-at-two", title: "Look at just two", question: "Which neighbour belongs first?", caption: "Start small: compare one adjacent pair instead of the whole shelf.", kind: "demonstration", x: 780, y: 150, visual: "compare", detailCanvas: "compare" }),
      station({ id: "make-a-move", title: "Make one useful move", question: "What changes when they trade places?", caption: "Swap only when the left book is larger. Watch each book keep its identity.", kind: "demonstration", x: 1430, y: 150, visual: "swap", detailCanvas: "swap" }),
      station({ id: "one-pass", title: "Keep moving right", question: "Where does the largest book end up?", caption: "The larger of each pair moves on to meet the next neighbour.", kind: "demonstration", x: 1430, y: 780, visual: "pass", detailCanvas: "pass" }),
      station({ id: "why-it-works", title: "Places that stay settled", question: "How can a pass make the next one shorter?", caption: "After a complete pass, the largest remaining book is fixed at the right edge.", kind: "concept", x: 780, y: 780, visual: "invariant", detailCanvas: "invariant" }),
      station({ id: "new-shelf", title: "Your turn", question: "Can the same rule sort another shelf?", caption: "A new starting order. Predict a move before watching its result.", kind: "challenge", x: 80, y: 780, width: 480, visual: "transfer", detailCanvas: "transfer", note: "Transfer example: the starting order changes here." }),
    ],
    connections: [
      connection("mixed-shelf", "look-at-two", "Make the big problem smaller"),
      connection("look-at-two", "make-a-move", "An out-of-order pair needs a move"),
      connection("make-a-move", "one-pass", "Repeat the same local rule"),
      connection("one-pass", "why-it-works", "A whole pass gives a guarantee"),
      connection("why-it-works", "new-shelf", "Use the reasoning on a new order"),
    ],
  },
  compare: {
    id: "compare",
    title: "A big problem, two books at a time.",
    subtitle: "The same shelf, under a closer lens. A comparison tells us whether a move is needed.",
    parent: "sorting",
    stations: [
      station({ id: "pair", title: "Choose neighbours", question: "Why start with books side by side?", caption: "They can trade places with one local move. Keep every other book where it is.", kind: "problem", x: 90, y: 170, visual: "compare" }),
      station({ id: "compare-values", title: "Ask one question", question: "Is the left value larger?", caption: "Use the printed values. Colour belongs to the book, not its rank.", kind: "demonstration", x: 780, y: 170, visual: "compare", detailCanvas: "swap" }),
      station({ id: "equal", title: "What if they match?", question: "Should equal books change places?", caption: "No move is needed when values tie. Keeping their order will matter later.", kind: "concept", x: 780, y: 790, visual: "compare", detailCanvas: "stability", note: "Explore inside for a separate example with equal-height books." }),
      station({ id: "decision", title: "One decision at a time", question: "What does one comparison tell us?", caption: "A comparison checks one pair. Apply the rule, then move on to the next neighbours.", kind: "concept", x: 90, y: 790, visual: "swap", detailCanvas: "pass" }),
    ],
    connections: [
      connection("pair", "compare-values", "Inspect just their values"),
      connection("compare-values", "equal", "A tie needs its own rule", true),
      connection("compare-values", "decision", "Turn the answer into a move"),
      connection("equal", "decision", "Keep equal items in arrival order", true),
    ],
  },
  swap: {
    id: "swap",
    title: "Watch the books, not just the numbers.",
    subtitle: "A swap changes two positions. Every book keeps its value, colour and identity.",
    parent: "compare",
    stations: [
      station({ id: "before", title: "The local decision", question: "When should these neighbours trade places?", caption: "If the left value is larger, swap the pair. Otherwise, keep both books where they are.", kind: "problem", x: 90, y: 170, visual: "compare" }),
      station({ id: "cross", title: "Follow each identity", question: "Where does each book go during a swap?", caption: "When a swap happens, follow the two colours as they exchange positions. Every book stays itself.", kind: "demonstration", x: 790, y: 170, visual: "swap" }),
      station({ id: "after", title: "Look beyond this pair", question: "Does one local move order the whole shelf?", caption: "A swapped pair is ordered. Other neighbours may still need work before the shelf is sorted.", kind: "concept", x: 790, y: 790, visual: "swap", detailCanvas: "pass" }),
      station({ id: "ties", title: "Some moves do nothing useful", question: "Would swapping equal values help?", caption: "Equal values already satisfy the local rule. Leave their identities in order.", kind: "concept", x: 90, y: 790, visual: "compare", detailCanvas: "stability" }),
    ],
    connections: [
      connection("before", "cross", "If left is larger, exchange positions"),
      connection("cross", "after", "A local repair can leave other work"),
      connection("after", "ties", "Only make a swap when needed", true),
    ],
  },
  pass: {
    id: "pass",
    title: "A small rule becomes a whole pass.",
    subtitle: "Move the comparison window to the right. Watch what the larger book carries forward.",
    parent: "sorting",
    stations: [
      station({ id: "start-left", title: "Begin at the left", question: "Where does each new pass begin?", caption: "Start a new pass with the first two positions in the open part of the shelf.", kind: "problem", x: 90, y: 170, visual: "compare", detailCanvas: "compare" }),
      station({ id: "carry-largest", title: "Compare, then move right", question: "What survives each comparison and decision?", caption: "After keeping or swapping, the larger value is on the right. It can meet the next neighbour.", kind: "demonstration", x: 790, y: 170, visual: "swap", detailCanvas: "swap" }),
      station({ id: "right-edge", title: "Reach the right edge", question: "What does a complete pass guarantee?", caption: "After a complete pass, its largest value has reached its final position.", kind: "demonstration", x: 790, y: 790, visual: "pass", detailCanvas: "invariant" }),
      station({ id: "repeat", title: "Repeat on what remains", question: "Which positions may the next pass ignore?", caption: "After a complete pass, leave its settled right edge alone. The next pass has less shelf to inspect.", kind: "concept", x: 90, y: 790, visual: "invariant", detailCanvas: "invariant" }),
    ],
    connections: [
      connection("start-left", "carry-largest", "Apply the same comparison rule"),
      connection("carry-largest", "right-edge", "The largest keeps moving right"),
      connection("right-edge", "repeat", "A completed pass removes one position from the work"),
      connection("repeat", "start-left", "Begin the next, shorter pass", true),
    ],
  },
  invariant: {
    id: "invariant",
    title: "A reason to trust the movement.",
    subtitle: "The animation shows changes. This canvas explains what remains true after each pass.",
    parent: "pass",
    stations: [
      station({ id: "local", title: "A moving maximum", question: "Which value reaches the next comparison?", caption: "After checking and, if needed, swapping a pair, the right book is the largest seen in this pass.", kind: "concept", x: 90, y: 170, visual: "compare", detailCanvas: "compare" }),
      station({ id: "fixed", title: "A settled suffix", question: "Why can a complete pass settle the last open position?", caption: "A complete pass inspects the whole open region. Its largest book must finish on the right.", kind: "concept", x: 790, y: 170, visual: "invariant" }),
      station({ id: "shorter", title: "Less left to solve", question: "What gets smaller after every pass?", caption: "Each complete pass can fix one position. Later passes leave that settled end undisturbed.", kind: "demonstration", x: 790, y: 790, visual: "pass", detailCanvas: "pass" }),
      station({ id: "finish", title: "A stopping rule", question: "What if a pass makes no swaps?", caption: "If a complete pass makes no swaps, every adjacent pair is already ordered. The whole shelf is sorted.", kind: "concept", x: 90, y: 790, visual: "invariant", detailCanvas: "transfer" }),
    ],
    connections: [
      connection("local", "fixed", "Carry the largest all the way to the edge"),
      connection("fixed", "shorter", "Protect what is already final"),
      connection("shorter", "finish", "Repeat until no open disorder remains"),
    ],
  },
  transfer: {
    id: "transfer",
    title: "A new shelf. Your next move.",
    subtitle: "Transfer example: the starting order changes. Keep the comparison and swap rules.",
    parent: "sorting",
    stations: [
      station({ id: "new-start", title: "Read the new shelf", question: "Which pair would you inspect first?", caption: "Use a fresh order. Predict before advancing the demonstration.", kind: "challenge", x: 90, y: 170, visual: "transfer", note: "This is a different example from the main shelf." }),
      station({ id: "first-decision", title: "Choose a useful action", question: "Keep this pair, or swap it?", caption: "Use the values, not the colours. Give a reason before revealing the decision.", kind: "challenge", x: 790, y: 170, visual: "compare", detailCanvas: "compare" }),
      station({ id: "predict-pass", title: "Follow your predicted move", question: "Where will each of these two books go?", caption: "Track their identities, then check the move against your prediction.", kind: "challenge", x: 790, y: 790, visual: "swap", detailCanvas: "swap" }),
      station({ id: "explain", title: "Think beyond one move", question: "What will a full pass guarantee?", caption: "Predict the final open position before letting the pass finish. Explain why it can stay there.", kind: "challenge", x: 90, y: 790, visual: "invariant", detailCanvas: "invariant" }),
    ],
    connections: [
      connection("new-start", "first-decision", "Apply the same local rule"),
      connection("first-decision", "predict-pass", "Check your decision by tracking the move"),
      connection("predict-pass", "explain", "Extend the reasoning across a pass"),
    ],
  },
  stability: {
    id: "stability",
    title: "Equal height. Different books.",
    subtitle: "A tie-case example: two equal-height books. What happens to their original order?",
    parent: "compare",
    stations: [
      station({ id: "identity", title: "A book is more than its number", question: "How can we tell two equal books apart?", caption: "Their colours and identities stay distinct even when their printed values match.", kind: "problem", x: 90, y: 170, visual: "problem", note: "A separate tie-case example: 3, 1, 3, 2." }),
      station({ id: "strict-rule", title: "Only swap when larger", question: "What does our rule do at a tie?", caption: "Left equals right is not left larger than right. An equal pair stays in place.", kind: "concept", x: 790, y: 170, visual: "compare", detailCanvas: "swap" }),
      station({ id: "cannot-cross", title: "No way to cross", question: "Can equal books reverse their order?", caption: "Only adjacent swaps can let two books cross. Our rule never swaps an equal pair.", kind: "concept", x: 790, y: 790, visual: "swap" }),
      station({ id: "stable", title: "That property has a name", question: "What does a stable sort preserve?", caption: "Equal values retain their original relative order. This Bubble Sort is stable.", kind: "concept", x: 90, y: 790, visual: "invariant", detailCanvas: "invariant" }),
    ],
    connections: [
      connection("identity", "strict-rule", "Values decide order; identity remains"),
      connection("strict-rule", "cannot-cross", "Tied neighbours never exchange"),
      connection("cannot-cross", "stable", "Original tie order survives the sort"),
    ],
  },
};

export function getCanvas(id: CanvasId): StationCanvasDefinition {
  return canvases[id];
}
