import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "./route";
import { GenerationEventSchema, GenerationResponseSchema } from "../../../lib/contracts";

test("route returns malformed JSON and invalid input as non-2xx actionable errors", async () => {
  const malformed = await POST(new Request("http://localhost/api/generate", { method: "POST", body: "{" }));
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).code, "INVALID_JSON");
  const invalid = await POST(new Request("http://localhost/api/generate", { method: "POST", body: JSON.stringify({ requestId: "bad", text: "" }) }));
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).code, "INVALID_INPUT");
});

test("real adapter and HTTP route deliver validated plan before module, then complete JSON", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "mock-server-only-key";
  const sourceText = "  Photosynthesis converts light into stored chemical energy.\n  ";
  const plan = { title: "Photosynthesis", summary: "Light to chemical energy", concepts: [{ id: "light", title: "Capturing light", summary: "Pigments absorb light", objective: "Explain light capture", sourceIds: ["source-input"] }], relations: [], path: ["light"], teachingPlan: { openingQuestion: "Why does a plant in the dark grow differently?", bigPicture: "Connect a familiar plant to light capture and the chemical energy that supports growth.", sequence: [{ conceptId: "light", approach: "example", purpose: "Compare leaves in light and shade before naming the pigment mechanism." }] } };
  const module = { id: "module-light", conceptId: "light", explanation: "Chlorophyll absorbs light energy.", example: "Generated example: compare a leaf in light and dark.", sourceIds: ["source-input"], activity: { kind: "concept", prompt: "Follow energy", steps: [{ title: "Absorb", body: "Pigments absorb light." }] }, questions: [{ id: "question-light-1", conceptIds: ["light"], prompt: "What do pigments absorb?", options: [{ id: "a", text: "Light energy" }, { id: "b", text: "Sound waves" }], correctOptionIds: ["a"], explanation: "Pigments absorb light." }] };
  let releaseModule!: () => void;
  const gate = new Promise<void>((resolve) => { releaseModule = resolve; });
  globalThis.fetch = (async (_url, init) => {
    const body = JSON.parse(init!.body as string);
    const isPlan = body.text.format.name === "study_plan";
    if (!isPlan) await gate;
    return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(isPlan ? { status: "ready", reason: "", plan } : { module }) }] }] });
  }) as typeof fetch;
  try {
    const body = JSON.stringify({ requestId: "photosynthesis-stream", text: sourceText });
    const stream = await POST(new Request("http://localhost/api/generate", { method: "POST", body, headers: { accept: "application/x-ndjson" } }));
    const reader = stream.body!.getReader();
    const first = await reader.read();
    const planEvent = GenerationEventSchema.parse(JSON.parse(new TextDecoder().decode(first.value).trim()));
    assert.equal(planEvent.type, "plan");
    assert.equal(planEvent.type === "plan" && planEvent.lesson.modules.length, 0);
    releaseModule();
    let tail = "";
    for (;;) { const chunk = await reader.read(); if (chunk.done) break; tail += new TextDecoder().decode(chunk.value); }
    const events = tail.trim().split("\n").map((line) => GenerationEventSchema.parse(JSON.parse(line)));
    assert.deepEqual(events.map((event) => event.type), ["module", "complete"]);
    const complete = events[1];
    assert.equal(complete.type === "complete" && complete.lesson.sources[0].text, sourceText);
    const jsonResponse = await POST(new Request("http://localhost/api/generate", { method: "POST", body: JSON.stringify({ requestId: "photosynthesis-json", text: sourceText }) }));
    assert.equal(jsonResponse.status, 200);
    const result = GenerationResponseSchema.parse(await jsonResponse.json());
    assert.equal(result.requestId, "photosynthesis-json");
    assert.equal(result.lesson.title, "Photosynthesis");
    assert.equal(result.lesson.finalQuestions.length, 1);
  } finally {
    releaseModule();
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

test("route keeps JSON setup errors and supports valid NDJSON error events", async () => {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "";
  try {
    const body = JSON.stringify({ requestId: "missing-key", text: "Photosynthesis transforms light into chemical energy." });
    const json = await POST(new Request("http://localhost/api/generate", { method: "POST", body }));
    assert.equal(json.status, 503);
    assert.equal((await json.json()).code, "PROVIDER_NOT_CONFIGURED");
    const stream = await POST(new Request("http://localhost/api/generate", { method: "POST", body, headers: { accept: "application/x-ndjson" } }));
    assert.match(stream.headers.get("content-type") ?? "", /application\/x-ndjson/);
    const event = GenerationEventSchema.parse(JSON.parse((await stream.text()).trim()));
    assert.equal(event.type, "error");
    assert.equal(event.requestId, "missing-key");
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
});
