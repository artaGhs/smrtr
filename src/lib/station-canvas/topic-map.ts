import type { CanvasId } from "./types";

export type TopicElement = {
  id: string;
  title: string;
  eyebrow: string;
  summary: string;
  explanation: string;
  relation?: string;
  children: string[];
  kind: "topic" | "branch" | "term" | "example" | "comparison";
  canvas?: CanvasId;
};

export const topicElements: TopicElement[] = [
  { id: "sorting", title: "Sorting", eyebrow: "Start here", summary: "Make an order out of a collection.", explanation: "Sorting rearranges items according to a chosen rule. The items stay the same; their positions change. Think of a contact list, a bookshelf, or products ordered by price.", children: ["meaning", "methods", "cost"], kind: "topic" },
  { id: "meaning", title: "What counts as ordered?", eyebrow: "The goal", summary: "Choose what to compare, then choose a direction.", explanation: "There is no single correct order until we choose a rule. A bookshelf can be ordered by author, height, or publication date.", relation: "first, define the goal", children: ["key", "direction"], kind: "branch" },
  { id: "key", title: "The sorting key", eyebrow: "A definition", summary: "The property that decides an item’s place.", explanation: "For a shop’s “price: low to high”, price is the key. For contacts A–Z, the name is the key. Colour in our book example tracks identity; the printed number is the key.", relation: "compare one property", children: [], kind: "term" },
  { id: "direction", title: "Same items. Different order.", eyebrow: "In everyday life", summary: "Low → high, or high → low?", explanation: "Ascending means smaller values first. Descending reverses that rule. Neither adds or removes an item. The example below uses ascending order.", relation: "choose a direction", children: [], kind: "term" },
  { id: "methods", title: "How do we get there?", eyebrow: "The approach", summary: "Different algorithms reach the same ordered result.", explanation: "An algorithm is a precise set of steps. Some repair neighbouring pairs; others divide the collection into smaller problems. These are two approaches, not a complete list of sorting algorithms.", relation: "then, choose a strategy", children: ["bubble", "divide"], kind: "branch" },
  { id: "bubble", title: "Repair neighbouring pairs", eyebrow: "Bubble sort · Live example", summary: "Compare two neighbours. Swap only if the left is larger.", explanation: "Imagine straightening books on a shelf without taking them all off. One local repair is easy; repeating it across the shelf moves the largest remaining value to the right edge.", relation: "one small repair, repeated", children: ["pair", "pass-rule", "practice"], kind: "example", canvas: "compare" },
  { id: "pair", title: "A comparison is a question", eyebrow: "The local rule", summary: "Is the left value larger than the right?", explanation: "Yes → exchange the two items. No → leave them in place. Equal values also stay in place, preserving their original relative order in this implementation.", relation: "understand one decision", children: [], kind: "term", canvas: "compare" },
  { id: "pass-rule", title: "One pass gives a guarantee", eyebrow: "Why it works", summary: "The largest remaining item reaches the right edge.", explanation: "After each comparison and decision, the larger value is on the right. Carry that result across the open region. A full pass fixes its last position, so the next pass can be shorter.", relation: "connect the move to the result", children: [], kind: "term", canvas: "invariant" },
  { id: "practice", title: "Try the rule on a new shelf", eyebrow: "Try it", summary: "Predict a move before the animation reveals it.", explanation: "A different starting order tests whether the rule makes sense beyond the first example. Keep track of the same items as their positions change.", relation: "apply it somewhere new", children: [], kind: "term", canvas: "transfer" },
  { id: "divide", title: "Divide the problem", eyebrow: "Another approach", summary: "Work on smaller parts instead of only repairing neighbours.", explanation: "Merge Sort sorts smaller halves, then merges them. Quicksort partitions around a pivot, then sorts the partitions. The dividing step and the way parts come together are different.", relation: "or, work in smaller parts", children: ["merge", "quick"], kind: "branch" },
  { id: "merge", title: "Merge Sort", eyebrow: "Split → sort → merge", summary: "Like merging two already alphabetized contact lists.", explanation: "Repeatedly split the collection. When combining two sorted parts, take the smaller front item each time. Standard array Merge Sort guarantees O(n log n) work and uses extra storage.", relation: "combine ordered parts", children: [], kind: "term" },
  { id: "quick", title: "Quicksort", eyebrow: "Pivot → partition → repeat", summary: "Put smaller and larger values on different sides of a pivot.", explanation: "Then sort each partition. Standard Quicksort takes O(n log n) work on average, but an unlucky sequence of partitions can take O(n²). A pivot is a chosen reference value.", relation: "separate around a reference", children: [], kind: "term" },
  { id: "cost", title: "How much work?", eyebrow: "The tradeoffs", summary: "Look at growth and tradeoffs, not just one tiny example.", explanation: "A strategy that is easy to watch with five books may be expensive with a million. Compare growth, extra storage, and whether equal items keep their original order.", relation: "ask how it scales", children: ["growth", "tradeoffs"], kind: "branch" },
  { id: "growth", title: "Growth, not a stopwatch", eyebrow: "Big O", summary: "n is the number of items. Big O describes how work grows.", explanation: "For standard versions, Bubble Sort has O(n²) worst-case work; Merge Sort has O(n log n); Quicksort averages O(n log n) but can reach O(n²). The optimized Bubble Sort here stops after a swap-free pass, taking O(n) on already ordered input.", relation: "compare growth rates", children: [], kind: "comparison" },
  { id: "tradeoffs", title: "Fastest by which measure?", eyebrow: "Beyond speed", summary: "Growth · extra memory · preserving ties", explanation: "Stable means equal keys keep their original relative order. In-place describes an algorithm’s use of extra storage. These properties answer different questions from running time.", relation: "include the other constraints", children: [], kind: "term", canvas: "stability" },
];

export const topicById = new Map(topicElements.map((element) => [element.id, element]));
export type TopicPlacement = { element: TopicElement; x: number; y: number; width: number; height: number };

/** Lay out the visible tree using actual node heights. Hidden descendants reserve no space. */
export function layoutTopicMap(expanded: ReadonlySet<string>, heights: Record<string, number> = {}): TopicPlacement[] {
  const placements: TopicPlacement[] = [];
  const gap = 64;
  const heightOf = (id: string) => heights[id] ?? (id === "sorting" ? 180 : id === "bubble" ? 390 : 186);
  const visibleChildren = (id: string) => expanded.has(id) ? topicById.get(id)!.children : [];
  const span = (id: string): number => Math.max(heightOf(id), visibleChildren(id).reduce((sum, child, index) => sum + span(child) + (index ? gap : 0), 0));
  const place = (id: string, depth: number, top: number) => {
    const element = topicById.get(id)!;
    const height = heightOf(id);
    const subtree = span(id);
    placements.push({ element, x: depth === 0 ? 0 : 420 + (depth - 1) * 530, y: top + (subtree - height) / 2, width: id === "sorting" ? 260 : id === "bubble" ? 410 : 330, height });
    let childTop = top;
    for (const child of visibleChildren(id)) { place(child, depth + 1, childTop); childTop += span(child) + gap; }
  };
  place("sorting", 0, 0);
  return placements;
}

export function descendantCount(id: string): number {
  return (topicById.get(id)?.children ?? []).reduce((sum, child) => sum + 1 + descendantCount(child), 0);
}
