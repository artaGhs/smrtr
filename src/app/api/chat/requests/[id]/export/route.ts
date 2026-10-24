import { getChatGenerationInstructions, getChatRequest } from "@/lib/server/chat-store";
import { chatError, chatJson } from "@/lib/server/chat-http";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try { return chatJson(getChatGenerationInstructions(await getChatRequest((await context.params).id))); }
  catch (error) { return chatError(error); }
}
