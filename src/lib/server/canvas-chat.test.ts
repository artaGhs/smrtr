import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createChatRequest, getChatRequest, submitCanvasStage, cancelChatRequest, getChatGenerationInstructions } from "./chat-store";
import { canvasFixture } from "../canvas-generation/fixtures";

test("staged chat commits early, deduplicates retries and validates full completion", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "smrtr-canvas-chat-"));
  const options = { directory };
  try {
    const fixture = canvasFixture("photosynthesis");
    let request = await createChatRequest({ text: fixture.text, canvas: true }, options);
    assert.equal(request.canvasEvents!.length, 1);
    assert.ok("outlineSchema" in getChatGenerationInstructions(request));
    const outline = { revision: request.revision, expectedSeq: 1, stage: { type: "outline", outline: fixture.outline } };
    request = await submitCanvasStage(request.id, outline, options);
    request = await submitCanvasStage(request.id, outline, options);
    assert.equal(request.canvasEvents!.length, 2);
    assert.equal(request.state, "pending");
    await assert.rejects(submitCanvasStage(request.id, { ...outline, expectedSeq: 2, stage: { type: "finished", outcome: "complete", missing: [] } }, options));
    for (const unit of fixture.units) request = await submitCanvasStage(request.id, { revision: request.revision, expectedSeq: request.canvasEvents!.length, stage: { type: "unit", unit } }, options);
    const finish = { revision: request.revision, expectedSeq: request.canvasEvents!.length, stage: { type: "finished", outcome: "complete", missing: [] } };
    request = await submitCanvasStage(request.id, finish, options);
    assert.equal(request.state, "completed"); assert.equal(request.lesson!.modules.length, 3);
    assert.equal((await submitCanvasStage(request.id, finish, options)).canvasEvents!.length, request.canvasEvents!.length);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test("staged chat rejects stale revisions, competing sequence writes and post-cancel writes", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "smrtr-canvas-chat-"));
  const options = { directory };
  try {
    const fixture = canvasFixture("photosynthesis");
    const request = await createChatRequest({ text: fixture.text, canvas: true }, options);
    await assert.rejects(submitCanvasStage(request.id, { revision: "stale", expectedSeq: 1, stage: { type: "outline", outline: fixture.outline } }, options));
    await submitCanvasStage(request.id, { revision: request.revision, expectedSeq: 1, stage: { type: "outline", outline: fixture.outline } }, options);
    const outcomes = await Promise.allSettled(fixture.units.slice(0, 2).map((unit) => submitCanvasStage(request.id, { revision: request.revision, expectedSeq: 2, stage: { type: "unit", unit } }, options)));
    assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
    await cancelChatRequest(request.id, options);
    const current = await getChatRequest(request.id, options);
    await assert.rejects(submitCanvasStage(request.id, { revision: request.revision, expectedSeq: current.canvasEvents!.length, stage: { type: "unit", unit: fixture.units[2] } }, options));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
