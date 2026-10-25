import { createDraft, reduceEvent, type GenerationDraft } from "./reducer";
import type { CanvasRunRequest } from "./contracts";

/** Newlines frame events, not network chunks. UTF-8 may split anywhere. */
export async function consumeCanvasStream(response: Response, requestId: string, signal: AbortSignal, onDraft: (draft: GenerationDraft) => void): Promise<GenerationDraft> {
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(typeof error?.error === "string" ? error.error : "Could not start this learning map.");
  }
  if (!response.body || !response.headers.get("content-type")?.includes("application/x-ndjson")) throw new Error("Expected a progressive map response.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "", bytes = 0, draft = createDraft(requestId);
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", abort, { once: true });
  const consume = (line: string) => {
    if (!line.trim()) return;
    if (line.length > 200_000) throw new Error("A generation event exceeded its size limit.");
    signal.throwIfAborted();
    const next = reduceEvent(draft, JSON.parse(line));
    if (next !== draft) { draft = next; onDraft(draft); }
  };
  try {
    for (;;) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      bytes += value?.byteLength ?? 0;
      if (bytes > 2_000_000) throw new Error("The generation stream exceeded its size limit.");
      buffer += decoder.decode(value, { stream: !done });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) { consume(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1); }
      if (buffer.length > 200_000) throw new Error("A generation event exceeded its size limit.");
      if (done) break;
    }
    consume(buffer);
    if (!draft.terminal) throw new Error("Connection ended before generation finished. Your partial map is kept.");
    return draft;
  } finally { signal.removeEventListener("abort", abort); await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
export async function generateCanvas(request: CanvasRunRequest, signal: AbortSignal, onDraft: (draft: GenerationDraft) => void, fetcher: typeof fetch = fetch) {
  return consumeCanvasStream(await fetcher("/api/canvas/generate", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" }, body: JSON.stringify(request), signal }), request.requestId, signal, onDraft);
}
