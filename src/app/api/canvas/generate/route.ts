import { CanvasRunRequestSchema } from "@/lib/canvas-generation/contracts";
import { generateProgressiveCanvas } from "@/lib/server/canvas-generate";
import { chatError, readChatJson } from "@/lib/server/chat-http";
import { GenerationError } from "@/lib/server/errors";

export const runtime = "nodejs";
export const maxDuration = 180;
export async function POST(request: Request) {
  try {
    const parsed = CanvasRunRequestSchema.safeParse(await readChatJson(request));
    if (!parsed.success) throw new GenerationError("INVALID_INPUT", "Provide an educational topic or lecture of 2–40,000 characters.", 400);
    if (!/[\p{L}\p{N}]/u.test(parsed.data.text)) throw new GenerationError("INSUFFICIENT_INPUT", "Add a recognizable educational topic.", 422);
    const cancellation = new AbortController();
    const signal = AbortSignal.any([request.signal, cancellation.signal]);
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try { await generateProgressiveCanvas(parsed.data, { signal, onEvent: (event) => { if (!signal.aborted) controller.enqueue(encoder.encode(JSON.stringify(event) + "\n")); } }); }
        finally { if (!signal.aborted) controller.close(); }
      },
      cancel() { cancellation.abort(); },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" } });
  } catch (error) { return chatError(error); }
}
