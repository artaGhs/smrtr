import assert from "node:assert/strict";
import test from "node:test";
import { createOpenAIProvider, type ProviderRequest } from "./provider";
import { GenerationError, publicError } from "./errors";

const request: ProviderRequest = { schemaName: "study_plan", jsonSchema: { type: "object" }, instructions: "Return JSON", input: "Study biology", signal: new AbortController().signal, maxOutputTokens: 1000 };

test("provider sends server key only as authorization and uses structured output with storage disabled", async () => {
  let body: Record<string, unknown> | undefined;
  const provider = createOpenAIProvider({ apiKey: "test-server-secret", model: "gpt-4.1", fetch: (async (url, init) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer test-server-secret");
    body = JSON.parse(init!.body as string);
    return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: '{"status":"ready"}' }] }] });
  }) as typeof fetch });
  assert.deepEqual(await provider.generate(request), { status: "ready" });
  assert.equal(body?.model, "gpt-4.1");
  assert.equal(body?.store, false);
  assert.equal(JSON.stringify(body).includes("test-server-secret"), false);
  assert.deepEqual(body?.text, { format: { type: "json_schema", name: "study_plan", strict: true, schema: request.jsonSchema } });
});

test("no provider key means explicit setup failure, never a sample", () => {
  assert.throws(() => createOpenAIProvider({ apiKey: "" }), (error: unknown) => error instanceof GenerationError && error.code === "PROVIDER_NOT_CONFIGURED" && error.status === 503);
});

test("provider failures are actionable and never reveal upstream response text", async () => {
  for (const [status, code] of [[401, "PROVIDER_AUTH_FAILED"], [429, "PROVIDER_RATE_LIMITED"], [404, "PROVIDER_CONFIGURATION_ERROR"], [500, "PROVIDER_UNAVAILABLE"]] as const) {
    const provider = createOpenAIProvider({ apiKey: "test-server-secret", fetch: (async () => new Response("PRIVATE UPSTREAM DATA test-server-secret", { status })) as typeof fetch });
    await assert.rejects(provider.generate(request), (error: unknown) => error instanceof GenerationError && error.code === code && !error.message.includes("PRIVATE") && !error.message.includes("test-server-secret"));
  }
  assert.equal(publicError(new Error("test-server-secret")).message.includes("test-server-secret"), false);
});

test("refusal, incomplete and malformed provider output are rejected", async () => {
  const cases = [
    [{ status: "incomplete" }, "PROVIDER_INCOMPLETE"],
    [{ output: [{ type: "message", content: [{ type: "refusal" }] }] }, "PROVIDER_REFUSED"],
    [{ output: [{ type: "message", content: [{ type: "output_text", text: "not JSON" }] }] }, "PROVIDER_INVALID_OUTPUT"],
  ] as const;
  for (const [payload, code] of cases) {
    const provider = createOpenAIProvider({ apiKey: "test", fetch: (async () => Response.json(payload)) as typeof fetch });
    await assert.rejects(provider.generate(request), (error: unknown) => error instanceof GenerationError && error.code === code);
  }
});
