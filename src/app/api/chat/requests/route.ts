import { createChatRequest, publicChatRequest } from "@/lib/server/chat-store";
import { chatError, chatJson, readChatJson } from "@/lib/server/chat-http";
import { GenerationError } from "@/lib/server/errors";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await readChatJson(request);
    if (typeof body.text !== "string" || (body.requestId !== undefined && typeof body.requestId !== "string")) throw new GenerationError("INVALID_INPUT", "Provide study text and an optional requestId.", 400);
    const created = await createChatRequest({ text: body.text, requestId: body.requestId as string | undefined });
    return chatJson(publicChatRequest(created), 201);
  } catch (error) { return chatError(error); }
}
