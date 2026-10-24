import { ChatRequestSchema, type ChatRequest } from "../contracts";

async function readResponse(response: Response): Promise<ChatRequest> {
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : "The local chat request could not be updated.",
    );
  return ChatRequestSchema.parse(data);
}
export async function createChatRequest(
  requestId: string,
  text: string,
  signal: AbortSignal,
) {
  return readResponse(
    await fetch("/api/chat/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, text }),
      signal,
    }),
  );
}
export async function getChatRequest(id: string, signal?: AbortSignal) {
  return readResponse(
    await fetch(`/api/chat/requests/${encodeURIComponent(id)}`, {
      signal,
      cache: "no-store",
    }),
  );
}
export async function cancelChatRequest(id: string) {
  await fetch(`/api/chat/requests/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
export async function importChatLesson(id: string, json: string) {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("Paste a complete lesson JSON object from your chat.");
  }
  const lesson =
    typeof data === "object" && data !== null && "lesson" in data
      ? data.lesson
      : data;
  return readResponse(
    await fetch(`/api/chat/requests/${encodeURIComponent(id)}/lesson`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lesson }),
    }),
  );
}
export async function copyChatRequest(id: string) {
  const response = await fetch(
    `/api/chat/requests/${encodeURIComponent(id)}/export`,
    { cache: "no-store" },
  );
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : "The request could not be exported.",
    );
  await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
}
function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Canceled", "AbortError"));
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException("Canceled", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}
export async function waitForChatLesson(
  initial: ChatRequest,
  signal: AbortSignal,
  onUpdate: (request: ChatRequest) => void,
  fetchRequest = getChatRequest,
) {
  let request = initial;
  while (true) {
    if (signal.aborted) throw new DOMException("Canceled", "AbortError");
    onUpdate(request);
    if (request.status === "error")
      throw new Error(
        request.error ??
          "The chat request could not be completed. Create a new request.",
      );
    if (request.status === "completed") {
      if (!request.lesson)
        throw new Error("The chat completed without a valid lesson.");
      return request.lesson;
    }
    await delay(1200, signal);
    request = await fetchRequest(request.id, signal);
  }
}
