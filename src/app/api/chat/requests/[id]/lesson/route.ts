import { publicChatRequest, submitChatLesson } from "@/lib/server/chat-store";
import { chatError, chatJson, readChatJson } from "@/lib/server/chat-http";
import { GenerationError } from "@/lib/server/errors";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const body = await readChatJson(request);
    const lesson = body.lesson;
    const revision = body.revision ?? (lesson && typeof lesson === "object" && "revision" in lesson ? lesson.revision : undefined);
    if (typeof revision !== "string") throw new GenerationError("CHAT_REQUEST_STALE", "Include the current revision from the exported request with your lesson.", 409);
    const updated = await submitChatLesson((await context.params).id, { revision, lesson });
    return chatJson(publicChatRequest(updated));
  } catch (error) { return chatError(error); }
}
