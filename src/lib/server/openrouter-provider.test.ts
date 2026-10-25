import assert from "node:assert/strict";
import test from "node:test";
import { createOpenRouterProvider } from "./openrouter-provider";
import { GenerationError } from "./errors";
import type { ProviderRequest } from "./provider";

const request: ProviderRequest = { schemaName: "study_plan", jsonSchema: { type: "object" }, instructions: "Return a lesson", input: "Explain photosynthesis", signal: new AbortController().signal, maxOutputTokens: 1000 };

test("OpenRouter uses a server-only key, strict schema and compatible routing", async () => {
  let body: Record<string, unknown> = {};
  const provider = createOpenRouterProvider({ apiKey: "server-test-secret", model: "openai/gpt-4.1", fetch: (async (url, options) => {
    assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
    assert.equal((options!.headers as Record<string, string>).Authorization, "Bearer server-test-secret");
    assert.equal(options!.signal, request.signal);
    body = JSON.parse(options!.body as string);
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"title":"Photosynthesis"}' } }] });
  }) as typeof fetch });
  assert.deepEqual(await provider.generate(request), { title: "Photosynthesis" });
  assert.deepEqual(body.response_format, { type: "json_schema", json_schema: { name: "study_plan", strict: true, schema: request.jsonSchema } });
  assert.deepEqual(body.provider, { require_parameters: true });
  assert.equal(JSON.stringify(body).includes("server-test-secret"), false);
});

test("missing keys and upstream failures remain explicit and never leak private response bodies", async () => {
  assert.throws(() => createOpenRouterProvider({ apiKey: "" }), (error: unknown) => error instanceof GenerationError && error.code === "PROVIDER_NOT_CONFIGURED");
  for (const [status, code] of [[401, "PROVIDER_AUTH_FAILED"], [402, "PROVIDER_RATE_LIMITED"], [429, "PROVIDER_RATE_LIMITED"], [400, "PROVIDER_CONFIGURATION_ERROR"], [500, "PROVIDER_UNAVAILABLE"]]) {
    const provider = createOpenRouterProvider({ apiKey: "server-test-secret", fetch: (async () => new Response("PRIVATE NOTES server-test-secret", { status: Number(status) })) as typeof fetch });
    await assert.rejects(provider.generate(request), (error: unknown) => error instanceof GenerationError && error.code === code && !error.message.includes("PRIVATE") && !error.message.includes("server-test-secret"));
  }
});

test("truncated, refused, and invalid model responses cannot become lessons", async () => {
  for (const payload of [null, { error: { message: "private" } }, { choices: [] }, { choices: [{ finish_reason: "length" }] }, { choices: [{ finish_reason: "content_filter" }] }, { choices: [{ finish_reason: "stop", message: { content: "invalid JSON" } }] }]) {
    const provider = createOpenRouterProvider({ apiKey: "test", fetch: (async () => Response.json(payload)) as typeof fetch });
    await assert.rejects(provider.generate(request), GenerationError);
  }
});

test("the configured factory selects OpenRouter when its final-step key is present", async () => {
  const { createConfiguredProvider } = await import("./provider");
  const previous = { router: process.env.OPENROUTER_API_KEY, openai: process.env.OPENAI_API_KEY, fetch: globalThis.fetch };
  process.env.OPENROUTER_API_KEY = "router-server-secret";
  process.env.OPENAI_API_KEY = "older-openai-secret";
  globalThis.fetch = (async (url, init) => {
    assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
    assert.equal((init!.headers as Record<string, string>).Authorization, "Bearer router-server-secret");
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"connected":true}' } }] });
  }) as typeof fetch;
  try { assert.deepEqual(await createConfiguredProvider().generate(request), { connected: true }); }
  finally {
    globalThis.fetch = previous.fetch;
    if (previous.router === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = previous.router;
    if (previous.openai === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous.openai;
  }
});
