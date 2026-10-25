import type { GenerationPreview } from "./generation-preview";
import {
  GenerationEventSchema,
  GenerationResponseSchema,
  type GenerationRequest,
  type Lesson,
} from "../contracts";

/** Consume complete validated events; incomplete transport chunks are only buffered. */
export async function generateLesson(
  request: GenerationRequest,
  signal: AbortSignal,
  onProgress: (lesson: Lesson) => void,
  fetcher: typeof fetch = fetch,
  onPreview?: (preview: GenerationPreview) => void,
): Promise<Lesson> {
  const response = await fetcher("/api/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(onPreview ? { "x-smrtr-preview": "1" } : {}),
      Accept: "application/x-ndjson, application/json",
    },
    body: JSON.stringify(request),
    signal,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : "Could not create your study map. Try again.",
    );
  }
  if (!response.headers.get("content-type")?.includes("application/x-ndjson")) {
    const result = GenerationResponseSchema.parse(await response.json());
    if (result.requestId !== request.requestId)
      throw new Error("Generation response did not match this request.");
    return result.lesson;
  }
  if (!response.body) throw new Error("Generation returned an empty stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let totalBytes = 0;
  let current: Lesson | null = null;
  let complete: Lesson | null = null;
  const consume = (line: string) => {
    if (!line.trim()) return;
    if (signal.aborted)
      throw new DOMException("Generation canceled.", "AbortError");
    const event = GenerationEventSchema.parse(JSON.parse(line));
    if (event.requestId !== request.requestId)
      throw new Error("Generation response did not match this request.");
    if (event.type === "preview" && !current) onPreview?.(event.preview);
    if (event.type === "error") throw new Error(event.error);
    if (event.type === "plan") {
      current = event.lesson;
      onProgress(current);
    }
    if (event.type === "module") {
      if (!current)
        throw new Error("A learning module arrived before its plan.");
      if (!current.concepts.some((c) => c.id === event.module.conceptId))
        throw new Error("A learning module references an unknown concept.");
      current = {
        ...current,
        modules: [
          ...current.modules.filter(
            (m) => m.conceptId !== event.module.conceptId,
          ),
          event.module,
        ],
      };
      onProgress(current);
    }
    if (event.type === "complete") complete = event.lesson;
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      totalBytes += value?.byteLength ?? 0;
      if (totalBytes > 2_000_000)
        throw new Error("Generation stream exceeded the response limit.");
      buffer += decoder.decode(value, { stream: !done });
      if (buffer.length > 2_000_000)
        throw new Error("Generation stream exceeded the response limit.");
      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        consume(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
      }
      if (done) break;
    }
    consume(buffer);
    if (!complete)
      throw new Error(
        "Generation stopped before the lesson was complete. Please try again.",
      );
    return complete;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
