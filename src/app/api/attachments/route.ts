import { extractAttachment } from "@/lib/server/attachments";
import { assertSameOrigin } from "@/lib/server/chat-http";
import { GenerationError, publicError } from "@/lib/server/errors";
import { MAX_ATTACHMENT_BYTES } from "@/lib/session/learning-input";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.startsWith("multipart/form-data")) throw new GenerationError("INVALID_UPLOAD", "Choose a document to attach.", 400);
    const limit = MAX_ATTACHMENT_BYTES + 64 * 1024;
    if (Number(request.headers.get("content-length")) > limit) throw new GenerationError("FILE_TOO_LARGE", "Choose a file smaller than 10 MB.", 413);
    if (!request.body) throw new GenerationError("INVALID_UPLOAD", "Choose a document to attach.", 400);
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) { await reader.cancel(); throw new GenerationError("FILE_TOO_LARGE", "Choose a file smaller than 10 MB.", 413); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    let form: FormData;
    try { form = await new Response(new Uint8Array(Buffer.concat(chunks)), { headers: { "Content-Type": contentType } }).formData(); }
    catch { throw new GenerationError("INVALID_UPLOAD", "We couldn’t read that upload. Try attaching the file again.", 400); }
    const files = form.getAll("file");
    if (files.length !== 1 || !(files[0] instanceof File)) throw new GenerationError("INVALID_UPLOAD", "Attach one document at a time.", 400);
    return Response.json(await extractAttachment(files[0]), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const safe = publicError(error);
    return Response.json({ error: safe.message, code: safe.code }, { status: safe.status, headers: { "Cache-Control": "no-store" } });
  }
}
