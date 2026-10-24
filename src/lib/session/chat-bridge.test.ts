import assert from "node:assert/strict";
import test from "node:test";
import { sampleLesson } from "../fixtures/sample-lesson";
import { importChatLesson, waitForChatLesson } from "./chat-bridge";

const request = {
  id: "chat-request",
  status: "waiting" as const,
  createdAt: "2026-10-24T18:00:00Z",
};
test("a completed chat result keeps its real source and revision", async () => {
  const lesson = {
    ...sampleLesson,
    mode: "generated" as const,
    origin: "chat" as const,
    revision: "chat-revision",
  };
  const updates: string[] = [];
  const result = await waitForChatLesson(
    { ...request, status: "completed", lesson },
    new AbortController().signal,
    (update) => updates.push(update.status),
  );
  assert.equal(result.origin, "chat");
  assert.equal(result.revision, "chat-revision");
  assert.deepEqual(updates, ["completed"]);
});
test("canceling a waiting bridge rejects without accepting a later completion", async () => {
  const controller = new AbortController();
  let reads = 0;
  await assert.rejects(
    waitForChatLesson(
      request,
      controller.signal,
      () => controller.abort(),
      async () => {
        reads++;
        return { ...request, status: "completed", lesson: sampleLesson };
      },
    ),
    (error) => error instanceof DOMException && error.name === "AbortError",
  );
  assert.equal(reads, 0);
});
test("failed and incomplete chat completions stay explicit", async () => {
  await assert.rejects(
    waitForChatLesson(
      { ...request, status: "error", error: "This request was cancelled." },
      new AbortController().signal,
      () => {},
    ),
    /cancelled/,
  );
  await assert.rejects(
    waitForChatLesson(
      { ...request, status: "completed" },
      new AbortController().signal,
      () => {},
    ),
    /without a valid lesson/,
  );
  await assert.rejects(
    importChatLesson(request.id, "{bad-json"),
    /complete lesson JSON/,
  );
});

test("new chat requests carry an immutable snapshot of confidence settings before fulfillment", async () => {
  const { createChatRequest } = await import("./chat-bridge");
  const originalFetch = globalThis.fetch;
  let body: Record<string, unknown> | undefined;
  globalThis.fetch = (async (_url, options) => {
    body = JSON.parse(options?.body as string);
    return Response.json(request);
  }) as typeof fetch;
  const profile = {
    overall: "recognize" as const,
    topics: [{ id: "topic-queue", label: "Queues", level: "new" as const }],
  };
  try {
    await createChatRequest(
      "profile-request",
      "Teach breadth first search",
      new AbortController().signal,
      profile,
    );
    profile.topics[0].label = "Changed later";
    assert.deepEqual(body?.learnerProfile, {
      overall: "recognize",
      topics: [{ id: "topic-queue", label: "Queues", level: "new" }],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
