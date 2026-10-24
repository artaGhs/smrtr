import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ChatRequestSchema, type Lesson } from "@/lib/contracts";
import { POST as create } from "./route";
import { GET as get, DELETE as cancel } from "./[id]/route";
import { GET as exportRequest } from "./[id]/export/route";
import { POST as submit } from "./[id]/lesson/route";

async function localStore(run: () => Promise<void>) {
  const previous = process.env.SMRTR_BRIDGE_DIR;
  const directory = await mkdtemp(path.join(os.tmpdir(), "smrtr-chat-api-test-"));
  process.env.SMRTR_BRIDGE_DIR = directory;
  try { await run(); }
  finally {
    if (previous === undefined) delete process.env.SMRTR_BRIDGE_DIR;
    else process.env.SMRTR_BRIDGE_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
}
const url = "http://localhost:3000/api/chat/requests";
const context = (id: string) => ({ params: Promise.resolve({ id }) });
const json = (value: unknown) => ({ method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" }, body: JSON.stringify(value) });

test("keyless HTTP create, export, validated import and poll complete without a provider key", async () => localStore(async () => {
  const text = "  Binary search halves a sorted search interval at every comparison.\n  ";
  const created = await create(new Request(url, json({ requestId: "browser-chat-1", text })));
  assert.equal(created.status, 201);
  const waiting = ChatRequestSchema.parse(await created.json());
  assert.equal(waiting.status, "waiting");
  assert.equal(created.headers.get("cache-control"), "no-store");
  const exported = await exportRequest(new Request(`${url}/${waiting.id}/export`), context(waiting.id));
  const payload = await exported.json();
  assert.equal(payload.untrustedInput.text, text);
  const lesson: Lesson = { ...payload.requiredMetadata, title: "Binary search", summary: "Reduce a sorted interval by half.", concepts: [{ id: "halving", title: "Halving the interval", summary: "Discard the impossible half", objective: "Explain why sorted order allows halving", sourceIds: ["source-input"] }], relations: [], path: ["halving"], modules: [{ id: "module-halving", conceptId: "halving", explanation: "Compare the target with the middle element of a sorted interval, then retain only the half that may contain it.", example: "Generated example: search for 7 in [1,3,5,7,9].", sourceIds: ["source-input"], activity: { kind: "concept", prompt: "Shrink the interval", steps: [{ title: "Compare", body: "Compare 7 with the middle value 5, then retain the upper half." }] }, questions: [{ id: "question-halving", conceptIds: ["halving"], prompt: "What assumption permits binary search to discard half?", options: [{ id: "sorted", text: "The input is sorted" }, { id: "random", text: "The input has random order" }], correctOptionIds: ["sorted"], explanation: "Sorted order determines which half can contain the target." }] }], finalQuestions: [{ id: "final-halving", conceptIds: ["halving"], prompt: "How does the candidate interval change after each comparison?", options: [{ id: "half", text: "It is approximately halved" }, { id: "double", text: "It doubles" }], correctOptionIds: ["half"], explanation: "One comparison identifies the half that may contain the target." }] };
  const submitted = await submit(new Request(`${url}/${waiting.id}/lesson`, json({ lesson })), context(waiting.id));
  assert.equal(submitted.status, 200);
  const complete = ChatRequestSchema.parse(await submitted.json());
  assert.equal(complete.status, "completed");
  assert.equal(complete.lesson!.origin, "chat");
  assert.equal(complete.lesson!.sources[0].text, text);
  const polled = await get(new Request(`${url}/${waiting.id}`), context(waiting.id));
  assert.equal(ChatRequestSchema.parse(await polled.json()).lesson?.revision, lesson.revision);
  const duplicate = await submit(new Request(`${url}/${waiting.id}/lesson`, json({ lesson })), context(waiting.id));
  assert.equal(duplicate.status, 409);
}));

test("browser cancel and stale import cannot complete the selected request", async () => localStore(async () => {
  const created = await create(new Request(url, json({ text: "Binary search requires sorted input." })));
  const waiting = await created.json();
  const stale = await submit(new Request(`${url}/${waiting.id}/lesson`, json({ revision: "old-revision", lesson: {} })), context(waiting.id));
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).code, "CHAT_REQUEST_STALE");
  const canceled = await cancel(new Request(`${url}/${waiting.id}`, { method: "DELETE", headers: { Origin: "http://localhost:3000" } }), context(waiting.id));
  assert.equal(ChatRequestSchema.parse(await canceled.json()).status, "error");
  const late = await submit(new Request(`${url}/${waiting.id}/lesson`, json({ revision: waiting.revision, lesson: {} })), context(waiting.id));
  assert.equal(late.status, 409);
  assert.equal((await late.json()).code, "CHAT_REQUEST_NOT_PENDING");
}));

test("chat HTTP endpoints reject malformed, oversized, cross-origin and traversal requests", async () => localStore(async () => {
  const malformed = await create(new Request(url, { method: "POST", body: "{" }));
  assert.equal(malformed.status, 400);
  const crossOrigin = await create(new Request(url, { ...json({ text: "Binary search requires sorted input." }), headers: { Origin: "https://other.example" } }));
  assert.equal(crossOrigin.status, 403);
  const oversized = await create(new Request(url, { method: "POST", headers: { "content-length": "9999999" }, body: "{}" }));
  assert.equal(oversized.status, 413);
  const traversal = await get(new Request(url), context("../../notes"));
  assert.equal(traversal.status, 404);
}));
