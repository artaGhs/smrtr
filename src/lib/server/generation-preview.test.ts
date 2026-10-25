import assert from "node:assert/strict";
import test from "node:test";
import { generatePreview } from "./generation-preview";
import { sourcePreview } from "../session/generation-preview";
import type { LessonProvider } from "./provider";

const preview = { topic: "Photosynthesis", terms: [
  { label: "Chlorophyll", detail: "A pigment that absorbs light." },
  { label: "Chloroplast", detail: "The site of photosynthesis in plants." },
  { label: "Glucose", detail: "A sugar that stores chemical energy." },
] };

test("preview validates and sends source material as data with a small output budget", async () => {
  const provider: LessonProvider = { async generate(request) {
    assert.equal(request.schemaName, "study_preview");
    assert.equal(request.maxOutputTokens, 700);
    assert.equal(JSON.parse(request.input).source, "Explain photosynthesis");
    assert.match(request.instructions, /untrusted source material/);
    return preview;
  } };
  assert.deepEqual(await generatePreview(provider, "Explain photosynthesis", new AbortController().signal), preview);
});

test("preview failure, invalid content, and cancellation are optional failures", async () => {
  for (const provider of [
    { async generate() { throw new Error("Unavailable"); } },
    { async generate() { return { topic: "Invalid", terms: [] }; } },
    { async generate() { return { ...preview, terms: [preview.terms[0], preview.terms[0], preview.terms[0]] }; } },
  ]) assert.equal(await generatePreview(provider, "Photosynthesis", new AbortController().signal), null);
  assert.equal(await generatePreview({ async generate() { return preview; } }, "Photosynthesis", AbortSignal.abort()), null);
});

test("immediate terms come from the source, omit upload metadata, and preserve Unicode", () => {
  const result = sourcePreview("Help me understand the following lecture notes.\n\nAttached lecture: lecture-final-v2.pdf\nChlorophyll absorbs light. Chlorophyll drives photosynthesis. Énergie solaire.");
  assert.equal(result.terms[0].label, "Chlorophyll");
  assert.ok(result.terms.some((term) => term.label === "Énergie"));
  assert.ok(result.terms.every((term) => !/lecture|following|attached|final/i.test(term.label)));
  assert.equal(sourcePreview("Help me understand ATP.").topic, "ATP.");
  assert.equal(sourcePreview("?").terms.length, 0);
});
