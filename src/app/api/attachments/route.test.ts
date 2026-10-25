import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "./route";

function upload(file: File, headers: Record<string, string> = {}) {
  const form = new FormData();
  form.append("file", file);
  return new Request("http://localhost/api/attachments", { method: "POST", headers, body: form });
}

test("attachment route returns lecture text and never caches private notes", async () => {
  const response = await POST(upload(new File(["Gravity restores a displaced pendulum toward equilibrium."], "lecture.txt")));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { name: "lecture.txt", text: "Gravity restores a displaced pendulum toward equilibrium." });
});

test("cross-origin uploads and oversized announced bodies are rejected before parsing", async () => {
  const crossOrigin = await POST(upload(new File(["Lecture notes"], "lecture.txt"), { origin: "https://unrelated.example" }));
  assert.equal(crossOrigin.status, 403);
  const oversized = await POST(new Request("http://localhost/api/attachments", { method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=test", "Content-Length": "50000000" }, body: "small actual body" }));
  assert.equal(oversized.status, 413);
});

test("unsupported files and malformed multipart uploads return actionable errors", async () => {
  const unsupported = await POST(upload(new File(["file content"], "lecture.exe")));
  assert.equal(unsupported.status, 415);
  assert.equal((await unsupported.json()).code, "UNSUPPORTED_FILE");
  const malformed = await POST(new Request("http://localhost/api/attachments", { method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=test" }, body: "not a multipart upload" }));
  assert.equal(malformed.status, 400);
});
