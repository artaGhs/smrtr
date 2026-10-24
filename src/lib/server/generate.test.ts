import assert from "node:assert/strict";
import test from "node:test";
import { GenerationEventSchema, GenerationResponseSchema, type BfsActivity, type GenerationEvent } from "../contracts";
import { generateLesson } from "./generate";
import { GenerationError } from "./errors";
import type { LessonProvider, ProviderRequest } from "./provider";
import { computeBfs, createBfsQuestions } from "./bfs-questions";
import { validateLesson } from "./validation";

function lessonParts(topic: string) {
  const plan = { title: `${topic} study map`, summary: `Learn ${topic} through connected ideas.`, concepts: [
    { id: "foundation", title: `${topic} foundations`, summary: `Start with ${topic}.`, objective: `Explain ${topic}.`, sourceIds: ["source-input"] },
    { id: "application", title: `${topic} in practice`, summary: `Apply ${topic}.`, objective: `Use ${topic} in an example.`, sourceIds: ["source-input"] },
  ], relations: [{ id: "foundation-application", source: "foundation", target: "application", type: "prerequisite" }], path: ["foundation", "application"], teachingPlan: {
    openingQuestion: `What would you notice in a concrete example of ${topic}?`,
    bigPicture: `Use a concrete ${topic} situation to recognize a pattern, then explain the mechanism and apply it.`,
    sequence: [{ conceptId: "foundation", approach: "example", purpose: `Notice the ${topic} pattern in a small concrete case.` }, { conceptId: "application", approach: "practice", purpose: `Apply the ${topic} pattern to a new situation.` }],
  } };
  const question = (id: string, conceptId: string) => ({ id, conceptIds: [conceptId], prompt: `Which statement explains ${topic}?`, options: [{ id: "a", text: `An accurate ${topic} statement` }, { id: "b", text: "An unrelated claim" }], correctOptionIds: ["a"], explanation: `The first option explains ${topic}.` });
  const content = {
    modules: plan.concepts.map((concept) => ({ id: `module-${concept.id}`, conceptId: concept.id, explanation: `Explanation of ${topic}.`, example: `Generated example of ${topic}.`, sourceIds: ["source-input"], activity: { kind: "concept", prompt: `Explore ${topic}`, steps: [{ title: "Observe", body: `An observation about ${topic}.` }] }, questions: [question(`question-${concept.id}`, concept.id)] })),
    finalQuestions: [question("final-application", "application")],
  };
  return { plan, content };
}

function providerFor(topic: string, requests: ProviderRequest[] = []): LessonProvider {
  const parts = lessonParts(topic);
  return { async generate(request) { requests.push(request); return request.schemaName === "study_plan" ? { status: "ready", reason: "", plan: parts.plan } : { module: parts.content.modules.find((module) => module.conceptId === JSON.parse(request.input).targetConceptId) }; } };
}

test("fresh topics produce distinct generated lessons, exact sources, and validated progressive events", async () => {
  const events: GenerationEvent[] = [];
  const requests: ProviderRequest[] = [];
  const original = "  Photosynthesis uses light energy.\r\nChlorophyll absorbs light.  ";
  const biology = await generateLesson({ requestId: "biology", text: original }, { provider: providerFor("Photosynthesis", requests), onEvent: (event) => events.push(event) });
  const economics = await generateLesson({ requestId: "economics", text: "Supply and demand determine market prices." }, { provider: providerFor("Supply and demand") });
  assert.ok(GenerationResponseSchema.safeParse(biology).success);
  assert.equal(biology.lesson.sources[0].text, original);
  assert.equal(JSON.parse(requests[0].input).source.text, original.trim().replace(/\r\n/g, "\n"));
  assert.notEqual(biology.lesson.title, economics.lesson.title);
  assert.notEqual(biology.lesson.revision, economics.lesson.revision);
  assert.equal(biology.lesson.mode, "generated");
  assert.ok(biology.lesson.modules.every((module) => module.activity.kind === "concept"));
  assert.deepEqual(events.map((event) => event.type), ["plan", "module", "module", "complete"]);
  assert.ok(events.every((event) => GenerationEventSchema.safeParse(event).success));
  assert.equal(events[0].type === "plan" && events[0].lesson.modules.length, 0);
  assert.equal(requests.length, 3);
});

test("invalid references get one bounded repair before any complete event", async () => {
  const parts = lessonParts("Biology");
  let calls = 0;
  const requests: ProviderRequest[] = [];
  const provider: LessonProvider = { async generate(request) {
    requests.push(request); calls++;
    if (calls === 1) return { status: "ready", reason: "", plan: { ...parts.plan, path: ["ghost"] } };
    if (calls === 2) return { status: "ready", reason: "", plan: parts.plan };
    return { module: parts.content.modules.find((module) => module.conceptId === JSON.parse(request.input).targetConceptId) };
  } };
  const result = await generateLesson({ requestId: "repair", text: "Biology investigates living organisms." }, { provider });
  assert.equal(result.lesson.path[0], "foundation");
  assert.ok(JSON.parse(requests[1].input).correction.length);
  assert.equal(calls, 4);
});

test("modules publish independently as they finish and final lesson retains planned order", async () => {
  const parts = lessonParts("Biology");
  const arrivals: string[] = [];
  let active = 0;
  let activeWhenFirstModule = 0;
  const provider: LessonProvider = { async generate(request) {
    if (request.schemaName === "study_plan") return { status: "ready", reason: "", plan: parts.plan };
    const id = JSON.parse(request.input).targetConceptId;
    active++;
    await new Promise((resolve) => setTimeout(resolve, id === "foundation" ? 15 : 1));
    active--;
    return { module: parts.content.modules.find((module) => module.conceptId === id) };
  } };
  const result = await generateLesson({ requestId: "parallel", text: "Biology investigates living organisms." }, { provider, onEvent: (event) => {
    if (event.type === "module") { if (!arrivals.length) activeWhenFirstModule = active; arrivals.push(event.module.conceptId); }
  } });
  assert.deepEqual(arrivals, ["application", "foundation"]);
  assert.equal(activeWhenFirstModule, 1);
  assert.deepEqual(result.lesson.modules.map((module) => module.conceptId), ["foundation", "application"]);
});

test("teaching order can introduce an example before its prerequisite without changing the concept path", async () => {
  const parts = lessonParts("Biology");
  const teachingPlan = { ...parts.plan.teachingPlan, sequence: [
    { conceptId: "application", approach: "example", purpose: "Predict what happens in a familiar living system before naming the mechanism." },
    { conceptId: "foundation", approach: "explanation", purpose: "Explain the hidden mechanism responsible for the pattern just observed." },
  ] };
  const moduleRequests: Record<string, unknown>[] = [];
  const provider: LessonProvider = { async generate(request) {
    if (request.schemaName === "study_plan") return { status: "ready", reason: "", plan: { ...parts.plan, teachingPlan } };
    const payload = JSON.parse(request.input);
    moduleRequests.push(payload);
    const original = parts.content.modules.find((module) => module.conceptId === payload.targetConceptId)!;
    return { module: { ...original, explanation: `Teaching purpose: ${payload.teachingStep.purpose}` } };
  } };
  const { lesson } = await generateLesson({ requestId: "teaching-order", text: "Biology investigates living organisms." }, { provider });
  assert.deepEqual(lesson.path, ["foundation", "application"]);
  assert.deepEqual(lesson.teachingPlan, teachingPlan);
  assert.deepEqual(lesson.modules.map((module) => module.conceptId), ["application", "foundation"]);
  assert.deepEqual(moduleRequests.map((payload) => payload.teachingPosition), [0, 1]);
  assert.deepEqual(moduleRequests[0].teachingStep, teachingPlan.sequence[0]);
  assert.match(lesson.modules[0].explanation, /familiar living system/);
  assert.equal(lesson.relations[0].source, "foundation");
});

test("new plans without teaching strategy get one repair instead of silently copying prerequisite order", async () => {
  const parts = lessonParts("Biology");
  let planCalls = 0;
  const provider: LessonProvider = { async generate(request) {
    if (request.schemaName === "study_plan") {
      planCalls++;
      if (planCalls === 1) { const { teachingPlan: omitted, ...legacyPlan } = parts.plan; void omitted; return { status: "ready", reason: "", plan: legacyPlan }; }
      return { status: "ready", reason: "", plan: parts.plan };
    }
    return { module: parts.content.modules.find((module) => module.conceptId === JSON.parse(request.input).targetConceptId) };
  } };
  const { lesson } = await generateLesson({ requestId: "teaching-repair", text: "Biology investigates living organisms." }, { provider });
  assert.equal(planCalls, 2);
  assert.deepEqual(lesson.teachingPlan, parts.plan.teachingPlan);
});

test("teaching metadata validates references and purposeful text while older lessons stay compatible", async () => {
  const { lesson } = await generateLesson({ requestId: "teaching-validation", text: "Biology investigates living organisms." }, { provider: providerFor("Biology") });
  const legacy = structuredClone(lesson); delete legacy.teachingPlan;
  assert.doesNotThrow(() => validateLesson(legacy, lesson.sources[0].text));
  const mutations = [
    (copy: typeof lesson) => { copy.teachingPlan!.sequence[0].conceptId = "unknown"; },
    (copy: typeof lesson) => { copy.teachingPlan!.sequence[1].conceptId = copy.teachingPlan!.sequence[0].conceptId; },
    (copy: typeof lesson) => { copy.teachingPlan!.sequence.pop(); },
    (copy: typeof lesson) => { copy.teachingPlan!.openingQuestion = "   "; },
    (copy: typeof lesson) => { copy.teachingPlan!.bigPicture = "   "; },
    (copy: typeof lesson) => { copy.teachingPlan!.sequence[0].purpose = "  "; },
  ];
  for (const mutate of mutations) {
    const copy = structuredClone(lesson); mutate(copy);
    assert.throws(() => validateLesson(copy, lesson.sources[0].text));
  }
});

test("module generation has at most three provider calls in flight", async () => {
  const parts = lessonParts("Biology");
  const concepts = Array.from({ length: 5 }, (_, index) => ({ ...parts.plan.concepts[0], id: `concept-${index}` }));
  const plan = { ...parts.plan, concepts, path: concepts.map((concept) => concept.id), relations: concepts.slice(1).map((concept, index) => ({ id: `relation-${index}`, source: concepts[index].id, target: concept.id, type: "prerequisite" })), teachingPlan: { ...parts.plan.teachingPlan, sequence: concepts.map((concept) => ({ conceptId: concept.id, approach: "example", purpose: "Recognize a concrete biological pattern before naming it." })) } };
  let active = 0;
  let peak = 0;
  const provider: LessonProvider = { async generate(request) {
    if (request.schemaName === "study_plan") return { status: "ready", reason: "", plan };
    const id = JSON.parse(request.input).targetConceptId;
    active++; peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active--;
    return { module: { ...parts.content.modules[0], id: `module-${id}`, conceptId: id, questions: parts.content.modules[0].questions.map((question) => ({ ...question, id: `question-${id}`, conceptIds: [id] })) } };
  } };
  const result = await generateLesson({ requestId: "bounded", text: "Biology investigates living organisms." }, { provider });
  assert.equal(peak, 3);
  assert.equal(result.lesson.modules.length, 5);
});

test("a failed module aborts pending sibling provider calls", async () => {
  const parts = lessonParts("Biology");
  let siblingAborted = false;
  const provider: LessonProvider = { async generate(request) {
    if (request.schemaName === "study_plan") return { status: "ready", reason: "", plan: parts.plan };
    if (JSON.parse(request.input).targetConceptId === "foundation") throw new GenerationError("PROVIDER_RATE_LIMITED", "Provider quota", 429);
    return new Promise((_, reject) => request.signal.addEventListener("abort", () => { siblingAborted = true; reject(request.signal.reason); }, { once: true }));
  } };
  await assert.rejects(generateLesson({ requestId: "failure", text: "Biology investigates living organisms." }, { provider }), (error: unknown) => error instanceof GenerationError && error.code === "PROVIDER_RATE_LIMITED");
  assert.equal(siblingAborted, true);
});

test("persistent invalid content fails after one repair and never emits complete", async () => {
  const parts = lessonParts("Biology");
  let calls = 0;
  const events: GenerationEvent[] = [];
  const provider: LessonProvider = { async generate(request) { calls++; return request.schemaName === "study_plan" ? { status: "ready", reason: "", plan: parts.plan } : { module: null }; } };
  await assert.rejects(generateLesson({ requestId: "invalid", text: "Biology investigates living organisms." }, { provider, onEvent: (event) => events.push(event) }), (error: unknown) => error instanceof GenerationError && error.code === "INVALID_GENERATED_LESSON");
  assert.ok(calls >= 3 && calls <= 5);
  assert.deepEqual(events.map((event) => event.type), ["plan"]);
});

test("insufficient input never falls back to a sample", async () => {
  const provider: LessonProvider = { async generate() { return { status: "insufficient", reason: "No topic is present", plan: null }; } };
  await assert.rejects(generateLesson({ requestId: "empty", text: "do the thing now" }, { provider }), (error: unknown) => error instanceof GenerationError && error.code === "INSUFFICIENT_INPUT");
});

test("input validation happens before provider work", async () => {
  const provider: LessonProvider = { async generate() { assert.fail("Provider must not run"); } };
  for (const input of [{ requestId: "a", text: "short" }, { requestId: "", text: "Long enough notes" }, { requestId: "a", text: "!".repeat(20) }, { requestId: "a", text: "a".repeat(40001) }]) {
    await assert.rejects(generateLesson(input, { provider }), GenerationError);
  }
});

test("caller abort and generation timeout cancel the provider", async () => {
  const waiting: LessonProvider = { generate: ({ signal }) => new Promise((_, reject) => { signal.addEventListener("abort", () => reject(signal.reason), { once: true }); }) };
  const controller = new AbortController();
  const pending = generateLesson({ requestId: "abort", text: "Biology investigates living organisms." }, { provider: waiting, signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, (error: unknown) => error instanceof GenerationError && error.code === "REQUEST_ABORTED");
  await assert.rejects(generateLesson({ requestId: "timeout", text: "Biology investigates living organisms." }, { provider: waiting, timeoutMs: 10 }), (error: unknown) => error instanceof GenerationError && error.code === "GENERATION_TIMEOUT");
});

const graph: BfsActivity = { kind: "bfs", nodes: ["S", "A", "B", "C", "T", "U"], edges: [{ source: "S", target: "B" }, { source: "S", target: "A" }, { source: "A", target: "C" }, { source: "B", target: "T" }, { source: "C", target: "T" }], start: "S", directed: true, neighborOrder: "alphabetical", visitedOn: "enqueue" };

test("BFS answers use the shared simulation core, including unreachable nodes", () => {
  const trace = computeBfs(graph);
  assert.deepEqual(trace.order, ["S", "A", "B", "C", "T"]);
  assert.equal(trace.distances.get("T"), 2);
  const questions = createBfsQuestions(graph, "bfs", "module-bfs");
  const correct = (question: typeof questions.moduleQuestion) => question.options.find((option) => question.correctOptionIds.includes(option.id))?.text;
  assert.equal(correct(questions.moduleQuestion), "S, A, B, C, T");
  assert.equal(correct(questions.finalQuestion), "Unreachable from the start");
  assert.match(questions.finalQuestion.prompt, /unweighted/);
});

test("BFS model answer keys are replaced by computed questions", async () => {
  const parts = lessonParts("BFS");
  const provider: LessonProvider = { async generate(request) {
    const module = parts.content.modules.find((item) => item.conceptId === JSON.parse(request.input).targetConceptId);
    return request.schemaName === "study_plan" ? { status: "ready", reason: "", plan: parts.plan } : { module: module?.conceptId === "foundation" ? { ...module, activity: graph, questions: [] } : module };
  } };
  const { lesson } = await generateLesson({ requestId: "bfs", text: "Breadth-first search (BFS) explores an unweighted graph in layers." }, { provider });
  assert.equal(lesson.modules[0].questions[0].id, "module-foundation-computed-order");
  assert.equal(lesson.finalQuestions[0].id, "module-foundation-computed-distance");
});

test("semantic validation rejects invented sources, bad options, prerequisite cycles and unverified links", async () => {
  const { lesson } = await generateLesson({ requestId: "valid", text: "Biology investigates living organisms." }, { provider: providerFor("Biology") });
  const mutations = [
    (copy: typeof lesson) => { copy.sources[0].text = "invented"; },
    (copy: typeof lesson) => { copy.modules[0].questions[0].correctOptionIds = ["missing"]; },
    (copy: typeof lesson) => { copy.relations.push({ id: "cycle", source: "application", target: "foundation", type: "prerequisite" }); },
    (copy: typeof lesson) => { copy.modules[0].explanation = "Read https://invented.example"; },
    (copy: typeof lesson) => { copy.modules[0].sourceIds = ["made-up"]; },
  ];
  for (const mutate of mutations) {
    const copy = structuredClone(lesson); mutate(copy);
    assert.throws(() => validateLesson(copy, lesson.sources[0].text));
  }
});
