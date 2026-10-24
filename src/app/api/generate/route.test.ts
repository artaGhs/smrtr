import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "./route";
import { GenerationEventSchema } from "../../../lib/contracts";

test("route returns malformed JSON and invalid input as non-2xx actionable errors", async () => {
  const malformed = await POST(new Request("http://localhost/api/generate", { method: "POST", body: "{" }));
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).code, "INVALID_JSON");
  const invalid = await POST(new Request("http://localhost/api/generate", { method: "POST", body: JSON.stringify({ requestId: "bad", text: "" }) }));
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).code, "INVALID_INPUT");
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
