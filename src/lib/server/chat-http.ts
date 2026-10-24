import { GenerationError, publicError } from "./errors";
import { MAX_CHAT_FILE_BYTES } from "./chat-store";

export function chatJson(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
}

export function chatError(error: unknown) {
  const safe = publicError(error);
  return chatJson({ error: safe.message, code: safe.code }, safe.status);
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new GenerationError("INVALID_ORIGIN", "Open the request from the same SMRTR app origin.", 403);
}

export async function readChatJson(request: Request): Promise<Record<string, unknown>> {
  assertSameOrigin(request);
  const limit = MAX_CHAT_FILE_BYTES + 5000;
  const contentLength = Number(request.headers.get("content-length"));
  if (contentLength > limit) throw new GenerationError("INPUT_TOO_LARGE", "The submitted lesson or notes exceed the request size limit.", 413);
  if (!request.body) throw new GenerationError("INVALID_JSON", "Send a JSON request body.", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) { await reader.cancel(); throw new GenerationError("INPUT_TOO_LARGE", "The submitted lesson or notes exceed the request size limit.", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  let parsed: unknown;
  try { parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new GenerationError("INVALID_JSON", "Send a valid JSON object.", 400); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new GenerationError("INVALID_JSON", "Send a valid JSON object.", 400);
  return parsed as Record<string, unknown>;
}
