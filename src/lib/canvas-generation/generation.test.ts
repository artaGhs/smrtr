import assert from "node:assert/strict";
import test from "node:test";
import { CanvasEventSchema, type CanvasEvent, type CanvasEventPayload } from "./contracts";
import { canvasFixture } from "./fixtures";
import { createDraft, reduceEvent, stopDraft } from "./reducer";
import { projectDraft } from "./projection";
import { consumeCanvasStream } from "./stream";
import { validateComplete, validateOutline } from "./validation";
import { generateProgressiveCanvas } from "../server/canvas-generate";
import { GenerationError } from "../server/errors";
import { endLegacySource, projectLegacyLesson } from "./legacy";

function events(name: "sorting" | "photosynthesis" = "sorting") {
  const fixture = canvasFixture(name);
  const payloads: CanvasEventPayload[] = [{ type: "started", mode: "simulated", text: fixture.text }, { type: "outline", outline: fixture.outline }, ...[0, 2, 1].map((i) => ({ type: "unit" as const, unit: fixture.units[i] })), { type: "finished", outcome: "complete", missing: [] }];
  return payloads.map((payload, i) => CanvasEventSchema.parse({ ...payload, v: 2, requestId: "request", runId: "run", sourceRevision: "revision", seq: i + 1 }));
}
function response(data: unknown[], size = 17) {
  const bytes = new TextEncoder().encode(data.map((event) => JSON.stringify(event) + "\n").join(""));
  return new Response(new ReadableStream({ start(controller) { for (let i = 0; i < bytes.length; i += size) controller.enqueue(bytes.slice(i, i + size)); controller.close(); } }), { headers: { "Content-Type": "application/x-ndjson" } });
}
test("both fixtures project validated stable snapshots; only sorting gets its curated demonstration", () => {
  for (const name of ["sorting", "photosynthesis"] as const) {
    let draft = createDraft("request"), id: string | undefined;
    for (const event of events(name)) {
      draft = reduceEvent(draft, event);
      const source = projectDraft(draft);
      if (source) { id ??= source.id; assert.equal(source.id, id); assert.equal(source.provenance, "simulated"); }
    }
    assert.equal(draft.status, "complete");
    const source = projectDraft(draft)!;
    assert.equal(source.nodes.some((node) => node.activity?.kind === "sorting"), name === "sorting");
    assert.equal(source.canvases.length, 4);
  }
});
test("duplicate, stale, gapped, premature and after-terminal events cannot corrupt a draft", () => {
  const list = events();
  let draft = reduceEvent(createDraft("request"), list[0]);
  assert.equal(reduceEvent(draft, list[0]), draft);
  assert.throws(() => reduceEvent(draft, { ...list[0], text: "Changed" }), /duplicate/);
  assert.throws(() => reduceEvent(draft, { ...list[1], runId: "stale" }), /stale/);
  assert.throws(() => reduceEvent(draft, list[2]), /gap/);
  assert.throws(() => reduceEvent(draft, { ...list[2], seq: 2 }), /before its outline/);
  draft = reduceEvent(draft, list[1]);
  assert.throws(() => reduceEvent(draft, { ...list[5], seq: 3, missing: [] }), /manifest/);
  draft = list.slice(2).reduce(reduceEvent, draft);
  assert.throws(() => reduceEvent(draft, { ...list[2], seq: 7 }), /terminal/);
  assert.throws(() => reduceEvent(stopDraft(draft), { ...list[2], seq: 7 }), /terminal/);
});
test("outline parent cycles and unknown dependencies fail before a graph can render", () => {
  const fixture = canvasFixture("sorting");
  fixture.outline.concepts[0].parentId = fixture.outline.concepts[1].id;
  fixture.outline.concepts[1].parentId = fixture.outline.concepts[0].id;
  assert.throws(() => validateOutline(fixture.outline, fixture.text), /cyclic/);
});
test("a failed branch retains usable units and a truthful partial manifest", () => {
  const list = events();
  let draft = list.slice(0, 3).reduce(reduceEvent, createDraft("request"));
  draft = reduceEvent(draft, { ...list[0], seq: 4, type: "unit-failed", conceptId: "method", error: "Could not finish this branch.", retryable: true });
  draft = reduceEvent(draft, { ...list[5], seq: 5, outcome: "partial", missing: ["method", "cost"] });
  assert.equal(draft.status, "partial");
  assert.equal(Object.keys(draft.units).length, 1);
  assert.equal(projectDraft(draft)!.nodes.find((node) => node.id === "concept-method")!.readiness, "failed");
});
test("stopped and broken streams never project missing content as still preparing", () => {
  const list = events("photosynthesis");
  const early = list.slice(0, 3).reduce(reduceEvent, createDraft("request"));
  const stopped = projectDraft(stopDraft(early))!;
  const missing = stopped.nodes.filter((node) => node.role === "branch" && node.readiness !== "ready");
  assert.equal(missing.length, 2);
  for (const node of missing) { assert.equal(node.readiness, "failed"); assert.match(node.eyebrow!, /Stopped/); assert.equal(node.activity, undefined); assert.equal(node.detailCanvasId, undefined); }
  const failed = reduceEvent(early, { ...list[0], seq: 4, type: "failed", error: "Connection ended." });
  assert.ok(projectDraft(failed)!.nodes.filter((node) => node.role === "branch").every((node) => node.readiness !== "pending"));
  const acceptedOnly = stopDraft(reduceEvent(createDraft("request"), list[0]));
  assert.equal(projectDraft(acceptedOnly)!.nodes[0].readiness, "failed");
});
test("stream consumer handles split UTF-8, duplicate lines and mandatory terminal state", async () => {
  const list = events();
  list[1] = { ...list[1], ...(list[1].type === "outline" ? { outline: { ...list[1].outline, title: "Sorting · règles 🌿" } } : {}) } as CanvasEvent;
  const received: string[] = [];
  const draft = await consumeCanvasStream(response([list[0], list[0], ...list.slice(1)], 1), "request", new AbortController().signal, (value) => received.push(value.status));
  assert.equal(draft.status, "complete");
  assert.equal(received.length, 6);
  await assert.rejects(consumeCanvasStream(response(list.slice(0, 3)), "request", new AbortController().signal, () => {}), /before generation finished/);
  await assert.rejects(consumeCanvasStream(response([list[0], { wrong: true }]), "request", new AbortController().signal, () => {}));
});
test("simulated generation cannot invoke an injected external provider", async () => {
  const received: CanvasEvent[] = [];
  await generateProgressiveCanvas({ requestId: "demo", text: "Sorting", mode: "simulated", fixture: "sorting" }, { signal: new AbortController().signal, onEvent: (event) => received.push(event), delay: async () => {}, provider: { generate: async () => { throw new Error("External calls forbidden"); } } });
  assert.deepEqual(received.map((event) => event.type), ["started", "outline", "unit", "unit", "unit", "finished"]);
});
test("small outline publishes while all provider teaching units are still blocked", async () => {
  const fixture = canvasFixture("photosynthesis");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const received: CanvasEvent[] = [];
  let sawOutline!: () => void;
  const outlineSeen = new Promise<void>((resolve) => { sawOutline = resolve; });
  const pending = generateProgressiveCanvas({ requestId: "live", text: fixture.text, mode: "provider" }, {
    signal: new AbortController().signal, onEvent: (event) => { received.push(event); if (event.type === "outline") sawOutline(); },
    provider: { generate: async (request) => {
      if (request.schemaName === "canvas_outline") return fixture.outline;
      await gate;
      const task = JSON.parse(request.input).task as string;
      return fixture.units.find((unit) => task.includes(`for concept ${unit.module.conceptId}.`))!;
    } },
  });
  await outlineSeen;
  assert.deepEqual(received.map((event) => event.type), ["started", "outline"]);
  release(); await pending;
  assert.equal(received.at(-1)!.type, "finished");
});
test("provider unit failures do not discard successful sibling content", async () => {
  const fixture = canvasFixture("photosynthesis");
  const draft = await generateProgressiveCanvas({ requestId: "partial", text: fixture.text, mode: "provider" }, { signal: new AbortController().signal, onEvent: () => {}, delay: async () => {}, provider: { generate: async (request) => {
    if (request.schemaName === "canvas_outline") return fixture.outline;
    const task = JSON.parse(request.input).task as string;
    if (task.includes("for concept capture.")) throw new GenerationError("PROVIDER_REFUSED", "This branch could not be generated.");
    return fixture.units.find((unit) => task.includes(`for concept ${unit.module.conceptId}.`));
  } } });
  assert.equal(draft.status, "partial"); assert.equal(Object.keys(draft.units).length, 2);
});
test("cancellation rejects late provider content even when it ignores AbortSignal", async () => {
  const controller = new AbortController();
  const fixture = canvasFixture("photosynthesis");
  const received: CanvasEvent[] = [];
  await generateProgressiveCanvas({ requestId: "cancel", text: fixture.text, mode: "provider" }, { signal: controller.signal, onEvent: (event) => received.push(event), provider: { generate: async () => { controller.abort(); return fixture.outline; } } });
  assert.deepEqual(received.map((event) => event.type), ["started"]);
});
test("bounded provider retries and one repair never leak invalid units", async () => {
  const fixture = canvasFixture("photosynthesis");
  let outlineCalls = 0;
  const calls = new Map<string, number>();
  const received: CanvasEvent[] = [];
  const draft = await generateProgressiveCanvas({ requestId: "retry", text: fixture.text, mode: "provider" }, { signal: new AbortController().signal, onEvent: (event) => received.push(event), delay: async () => {}, provider: { generate: async (request) => {
    if (request.schemaName === "canvas_outline") {
      if (++outlineCalls < 3) throw new GenerationError("PROVIDER_RATE_LIMITED", "Try again.");
      return fixture.outline;
    }
    const task = JSON.parse(request.input).task as string;
    const unit = fixture.units.find((item) => task.includes(`for concept ${item.module.conceptId}.`))!;
    const count = (calls.get(unit.module.conceptId) ?? 0) + 1; calls.set(unit.module.conceptId, count);
    if (unit.module.conceptId === "capture" && count === 1) return { ...unit, module: { ...unit.module, id: "wrong-id" } };
    return unit;
  } } });
  assert.equal(draft.status, "complete"); assert.equal(outlineCalls, 3); assert.equal(calls.get("capture"), 2);
  assert.equal(received.filter((event) => event.type === "unit").length, 3);
});
test("a timeout yields an explicit terminal error while retaining the outline", async () => {
  const fixture = canvasFixture("photosynthesis");
  const draft = await generateProgressiveCanvas({ requestId: "timeout", text: fixture.text, mode: "provider" }, { signal: new AbortController().signal, timeoutMs: 30, onEvent: () => {}, provider: { generate: async (request) => {
    if (request.schemaName === "canvas_outline") return fixture.outline;
    await new Promise<void>((_, reject) => request.signal.addEventListener("abort", () => reject(request.signal.reason), { once: true }));
    return null;
  } } });
  assert.equal(draft.status, "partial"); assert.equal(draft.terminal, true); assert.match(draft.error!, /too long/);
});
test("v1 adapter preserves lesson identity and supported activity types", () => {
  const fixture = canvasFixture("photosynthesis");
  const lesson = validateComplete(fixture.outline, fixture.units, fixture.text);
  const first = projectLegacyLesson({ ...lesson, modules: [] });
  const complete = projectLegacyLesson(lesson, true);
  assert.equal(first.id, complete.id);
  assert.equal(first.status, "outline"); assert.equal(complete.status, "complete");
  assert.ok(complete.nodes.every((node) => node.activity?.kind !== "sorting"));
  assert.ok(endLegacySource(first, "stopped").nodes.every((node) => node.readiness !== "pending"));
});
