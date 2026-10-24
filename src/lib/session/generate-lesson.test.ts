import assert from "node:assert/strict";
import test from "node:test";
import { sampleLesson } from "../fixtures/sample-lesson";
import { generateLesson } from "./generate-lesson";
import { RequestGate } from "./request-gate";
import { readSession, saveSession, SESSION_KEY } from "./storage";

const request = {
  requestId: "new-request",
  text: "Breadth-first search and queues",
};
const signal = () => new AbortController().signal;
const jsonFetch = (body: unknown, status = 200) =>
  (async () => Response.json(body, { status })) as typeof fetch;
function ndjsonFetch(events: unknown[], chunkSize = 17) {
  const bytes = new TextEncoder().encode(
    events.map((event) => JSON.stringify(event)).join("\n"),
  );
  return (async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          for (let i = 0; i < bytes.length; i += chunkSize)
            controller.enqueue(bytes.slice(i, i + chunkSize));
          controller.close();
        },
      }),
      { headers: { "Content-Type": "application/x-ndjson" } },
    )) as typeof fetch;
}

test("JSON transport validates the matching request and keeps provider failures explicit", async () => {
  assert.equal(
    (
      await generateLesson(
        request,
        signal(),
        () => {},
        jsonFetch({ requestId: request.requestId, lesson: sampleLesson }),
      )
    ).revision,
    sampleLesson.revision,
  );
  await assert.rejects(
    generateLesson(
      request,
      signal(),
      () => {},
      jsonFetch({ requestId: "stale", lesson: sampleLesson }),
    ),
    /did not match/,
  );
  await assert.rejects(
    generateLesson(
      request,
      signal(),
      () => {},
      jsonFetch(
        { error: "Provider key is missing", code: "PROVIDER_NOT_CONFIGURED" },
        503,
      ),
    ),
    /Provider key is missing/,
  );
});

test("stream parser buffers split UTF-8 and only delivers validated whole modules", async () => {
  const plan = { ...sampleLesson, title: "学び → connections", modules: [] };
  const updates: number[] = [];
  const result = await generateLesson(
    request,
    signal(),
    (lesson) => updates.push(lesson.modules.length),
    ndjsonFetch(
      [
        { type: "plan", requestId: request.requestId, lesson: plan },
        {
          type: "module",
          requestId: request.requestId,
          module: sampleLesson.modules[0],
        },
        {
          type: "complete",
          requestId: request.requestId,
          lesson: { ...sampleLesson, title: plan.title },
        },
      ],
      1,
    ),
  );
  assert.deepEqual(updates, [0, 1]);
  assert.equal(result.title, plan.title);
});

test("truncated streams and modules without a plan cannot be mistaken for completed lessons", async () => {
  await assert.rejects(
    generateLesson(
      request,
      signal(),
      () => {},
      ndjsonFetch([
        {
          type: "plan",
          requestId: request.requestId,
          lesson: { ...sampleLesson, modules: [] },
        },
      ]),
    ),
    /before the lesson was complete/,
  );
  await assert.rejects(
    generateLesson(
      request,
      signal(),
      () => {},
      ndjsonFetch([
        {
          type: "module",
          requestId: request.requestId,
          module: sampleLesson.modules[0],
        },
      ]),
    ),
    /before its plan/,
  );
  await assert.rejects(
    generateLesson(
      request,
      signal(),
      () => {},
      ndjsonFetch([
        { type: "complete", requestId: "old-request", lesson: sampleLesson },
      ]),
    ),
    /did not match/,
  );
});

test("newer requests invalidate older work even when upstream ignores cancellation", () => {
  const gate = new RequestGate();
  const oldSignal = gate.begin("old");
  const nextSignal = gate.begin("new");
  assert.equal(oldSignal.aborted, true);
  assert.equal(gate.isCurrent("old"), false);
  assert.equal(nextSignal.aborted, false);
  gate.finish("old");
  assert.equal(gate.isCurrent("new"), true);
  gate.cancel();
  assert.equal(nextSignal.aborted, true);
  assert.equal(gate.isCurrent("new"), false);
});

test("saved study sessions preserve attempt revision and tolerate corrupted storage", () => {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
  const attempt = {
    id: "a1",
    lessonId: sampleLesson.id,
    revision: "previous-revision",
    questionId: "q1",
    conceptIds: ["bfs"],
    selectedOptionIds: ["b"],
    correct: false,
    createdAt: "2026-10-24T12:00:00Z",
  };
  saveSession(storage, {
    lesson: sampleLesson,
    input: request.text,
    selectedConceptId: "bfs",
    attempts: [attempt],
  });
  assert.equal(readSession(storage)?.attempts[0].revision, "previous-revision");
  store.set(SESSION_KEY, "{broken-json");
  assert.equal(readSession(storage), null);
  store.set(
    SESSION_KEY,
    JSON.stringify({ lesson: { title: "Invalid lesson" } }),
  );
  assert.equal(readSession(storage), null);
  assert.doesNotThrow(() =>
    saveSession(
      {
        setItem() {
          throw new Error("Quota exceeded");
        },
      },
      {
        lesson: sampleLesson,
        input: request.text,
        selectedConceptId: "bfs",
        attempts: [],
      },
    ),
  );
});

test("an unfinished manual confidence edit cannot make the completed lesson unrecoverable", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (id: string) => values.get(id) ?? null,
    setItem: (id: string, value: string) => {
      values.set(id, value);
    },
  };
  saveSession(storage, {
    lesson: sampleLesson,
    input: request.text,
    selectedConceptId: "bfs",
    attempts: [],
    learnerProfile: {
      overall: "new",
      topics: [{ id: "stable-topic", label: "", level: null }],
    },
  });
  assert.equal(readSession(storage)?.lesson.id, sampleLesson.id);
  assert.equal(readSession(storage)?.learnerProfile, undefined);
});
