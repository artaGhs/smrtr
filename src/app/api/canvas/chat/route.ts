import { createChatRequest } from "@/lib/server/chat-store";
import { chatError, chatJson, readChatJson } from "@/lib/server/chat-http";
import { CanvasRunRequestSchema } from "@/lib/canvas-generation/contracts";
import { GenerationError } from "@/lib/server/errors";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const parsed = CanvasRunRequestSchema.safeParse({ ...await readChatJson(request), mode: "provider" });
    if (!parsed.success) throw new GenerationError("INVALID_INPUT", "Provide a topic or lecture of 2–40,000 characters.", 400);
    const created = await createChatRequest({ requestId: parsed.data.requestId, text: parsed.data.text, canvas: true });
    return chatJson({ id: created.id, revision: created.revision, events: created.canvasEvents, state: created.state }, 201);
  } catch (error) { return chatError(error); }
}
