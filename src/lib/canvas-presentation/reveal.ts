import type { EditorNode } from '../canvas-document/model';
export type RevealPhase = 'queued' | 'connecting' | 'open';

/** Unknown children are hidden in the render that introduces them, before any effect runs. */
export function resolveRevealPhases(nodes: EditorNode[], known: Record<string, RevealPhase>, initialScene: boolean, progressive: boolean, reduced: boolean, editing: boolean): Record<string, RevealPhase> {
  return Object.fromEntries(nodes.map(node => [node.id, reduced || editing || node.role === 'topic' || (initialScene && !progressive) ? 'open' : initialScene ? 'queued' : known[node.id] ?? 'queued']));
}
