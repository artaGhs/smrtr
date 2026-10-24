import { cancelChatRequest, getChatRequest, publicChatRequest } from "@/lib/server/chat-store";
import { assertSameOrigin, chatError, chatJson } from "@/lib/server/chat-http";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try { return chatJson(publicChatRequest(await getChatRequest((await context.params).id))); }
  catch (error) { return chatError(error); }
}

export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    return chatJson(publicChatRequest(await cancelChatRequest((await context.params).id)));
  } catch (error) { return chatError(error); }
}
