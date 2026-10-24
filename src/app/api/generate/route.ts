import { generateLesson } from "@/lib/server/generate";
import type { GenerationEvent } from "@/lib/contracts";
import { GenerationError, publicError } from "@/lib/server/errors";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(request: Request) {
  let input: unknown;
  try {
    const body = await request.text();
    if (body.length > 250_000) throw new GenerationError("INPUT_TOO_LARGE", "Study notes exceed the request size limit.", 413);
    try { input = JSON.parse(body); }
    catch { throw new GenerationError("INVALID_JSON", "Send a JSON object containing requestId and text.", 400); }
  } catch (error) {
    const safe = publicError(error);
    return Response.json({ error: safe.message, code: safe.code }, { status: safe.status });
  }
  if (request.headers.get("accept")?.includes("application/x-ndjson")) {
    const encoder = new TextEncoder();
    const cancelController = new AbortController();
    const signal = AbortSignal.any([request.signal, cancelController.signal]);
    const requestId = typeof input === "object" && input !== null && "requestId" in input && typeof input.requestId === "string" ? input.requestId.slice(0, 200) : "";
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = (event: GenerationEvent) => { if (!signal.aborted) controller.enqueue(encoder.encode(JSON.stringify(event) + "\n")); };
        try { await generateLesson(input, { signal, onEvent: emit }); }
        catch (error) { emit({ type: "error", requestId, error: publicError(error).message }); }
        finally { if (!signal.aborted) controller.close(); }
      },
      cancel() { cancelController.abort(); },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" } });
  }
  try {
    const result = await generateLesson(input, { signal: request.signal });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const safe = publicError(error);
    return Response.json({ error: safe.message, code: safe.code }, { status: safe.status, headers: { "Cache-Control": "no-store" } });
  }
}
