import type { BfsActivity, Question } from "../contracts";
import { validateBfs } from "./validation";
import { createBfsTrace } from "../simulation/bfs";

// Matches the activity contract: alphabetical ASCII labels, discovered on enqueue.
// This is deliberately computed server-side; no model-authored traversal keys are trusted.
export function computeBfs(activity: BfsActivity) {
  validateBfs(activity);
  const final = createBfsTrace(activity).frames.at(-1)!;
  return { order: [...final.expanded], distances: new Map(Object.entries(final.distances)) };
}

function graphDescription(activity: BfsActivity) {
  const arrow = activity.directed ? "→" : "—";
  const edges = activity.edges.map((edge) => `${edge.source}${arrow}${edge.target}`).join(", ") || "none";
  return `Generated example: ${activity.directed ? "directed" : "undirected"}, unweighted graph. Nodes: ${activity.nodes.join(", ")}. Edges: ${edges}. Start: ${activity.start}. Visit neighbors in ASCII alphabetical order; mark visited when enqueued.`;
}

export function createBfsQuestions(activity: BfsActivity, conceptId: string, moduleId: string): { example: string; moduleQuestion: Question; finalQuestion: Question } {
  const { order, distances } = computeBfs(activity);
  const example = graphDescription(activity);
  const answer = order.join(", ");
  const alternatives = [
    [...order].reverse().join(", "),
    [...activity.nodes].sort().join(", "),
    [...activity.nodes].filter((id) => id !== activity.start).concat(activity.start).join(", "),
    `${answer}, ${activity.start}`,
  ].filter((value, index, all) => value !== answer && all.indexOf(value) === index).slice(0, 2);
  const traversalOptions = [answer, ...alternatives];
  // Vary the correct position without allowing random changes to the algorithm.
  if (activity.nodes.length % 2 === 0) traversalOptions.reverse();
  const moduleQuestion: Question = {
    id: `${moduleId}-computed-order`, conceptIds: [conceptId],
    prompt: `${example}\nIn what order does BFS expand the reachable nodes?`,
    options: traversalOptions.map((text, index) => ({ id: `order-${index}`, text })),
    correctOptionIds: [`order-${traversalOptions.indexOf(answer)}`],
    explanation: `The FIFO queue expands nodes as ${answer}. Only nodes reachable from ${activity.start} are expanded; each is enqueued once.`,
  };
  const target = [...activity.nodes].sort().filter((id) => id !== activity.start).at(-1)!;
  const distance = distances.get(target);
  const distanceAnswer = distance === undefined ? "Unreachable from the start" : `${distance} edge${distance === 1 ? "" : "s"}`;
  const distanceOptions = ["Unreachable from the start", "0 edges", "1 edge", "2 edges", `${activity.nodes.length} edges`, distanceAnswer].filter((value, index, all) => all.indexOf(value) === index);
  const wrong = distanceOptions.filter((value) => value !== distanceAnswer).slice(0, 2);
  const choices = [wrong[0], distanceAnswer, wrong[1]];
  const finalQuestion: Question = {
    id: `${moduleId}-computed-distance`, conceptIds: [conceptId],
    prompt: `${example}\nWhat is the minimum number of edges from ${activity.start} to ${target}?`,
    options: choices.map((text, index) => ({ id: `distance-${index}`, text })),
    correctOptionIds: ["distance-1"],
    explanation: distance === undefined ? `BFS never discovers ${target}, so no path from ${activity.start} reaches it in this graph.` : `BFS first discovers ${target} in layer ${distance}. In an unweighted graph, this is the minimum number of edges; it does not minimize arbitrary weighted costs.`,
  };
  return { example, moduleQuestion, finalQuestion };
}
