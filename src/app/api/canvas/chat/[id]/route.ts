import { cancelChatRequest, getChatRequest, submitCanvasStage } from "@/lib/server/chat-store";
import { assertSameOrigin, chatError, chatJson, readChatJson } from "@/lib/server/chat-http";
import { GenerationError } from "@/lib/server/errors";
import { CanvasStageSchema } from "@/lib/canvas-generation/contracts";
import { z } from "zod";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const stored = await getChatRequest((await context.params).id);
    if (!stored.canvasEvents) throw new GenerationError("CHAT_REQUEST_MODE", "This is not a progressive canvas request.", 409);
    const after = Number(new URL(request.url).searchParams.get("after") ?? 0);
    if (!Number.isInteger(after) || after < 0 || after > stored.canvasEvents.length) throw new GenerationError("INVALID_CURSOR", "Use a valid canvas event cursor.", 400);
    const expired = stored.state === "pending" && Date.parse(stored.expiresAt) <= Date.now();
    return chatJson({ id: stored.id, revision: stored.revision, events: stored.canvasEvents.filter((event) => event.seq > after), state: expired ? "failed" : stored.state, error: expired ? "This chat request expired. Your partial map is kept." : stored.error });
  } catch (error) { return chatError(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    const parsed = z.object({ revision: z.string().uuid(), expectedSeq: z.number().int().min(1).max(99), stage: CanvasStageSchema }).safeParse(await readChatJson(request));
    if (!parsed.success) throw new GenerationError("INVALID_CANVAS_STAGE", "Send a revision, expectedSeq and valid stage.", 422);
    const stored = await submitCanvasStage((await context.params).id, parsed.data);
    return chatJson({ id: stored.id, revision: stored.revision, state: stored.state, expectedSeq: stored.canvasEvents!.length });
  } catch (error) { return chatError(error); }
}
export async function DELETE(request: Request, context: Context) {
  try { assertSameOrigin(request); const stored = await cancelChatRequest((await context.params).id); return chatJson({ id: stored.id, state: stored.state }); }
  catch (error) { return chatError(error); }
}
