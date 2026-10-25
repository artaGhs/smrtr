import { z } from "zod";
import { CanvasEventSchema } from "./contracts";
import { createDraft, reduceEvent, stopDraft, type GenerationDraft } from "./reducer";

const responseSchema = z.object({ id: z.string().uuid(), revision: z.string().uuid(), events: z.array(CanvasEventSchema), state: z.enum(["pending", "completed", "failed", "cancelled"]), error: z.string().optional() });
async function read(response: Response) {
  const body = await response.json();
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Could not connect the chat request.");
  return responseSchema.parse(body);
}
function delay(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 1000);
    signal.addEventListener("abort", abort, { once: true });
  });
}
export async function generateChatCanvas(requestId: string, text: string, signal: AbortSignal, onDraft: (draft: GenerationDraft) => void, onRequest: (id: string) => void, fetcher: typeof fetch = fetch) {
  let response = await read(await fetcher("/api/canvas/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId, text }), signal }));
  const id = response.id, revision = response.revision;
  onRequest(id);
  let draft = createDraft(requestId);
  for (;;) {
    signal.throwIfAborted();
    if (response.id !== id || response.revision !== revision) throw new Error("The chat response belongs to a different request.");
    for (const event of response.events) { draft = reduceEvent(draft, event); onDraft(draft); }
    if (draft.terminal) return draft;
    if (response.state === "cancelled") { draft = stopDraft(draft); onDraft(draft); return draft; }
    if (response.state !== "pending") throw new Error(response.error ?? "The chat ended without a valid completion. Your partial map is kept.");
    await delay(signal);
    response = await read(await fetcher(`/api/canvas/chat/${encodeURIComponent(id)}?after=${draft.seq}`, { signal, cache: "no-store" }));
  }
}
