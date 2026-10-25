import test from "node:test";
import assert from "node:assert/strict";
import { parseCanvasSource } from "../canvas-document/source";
import { commit, compose, createDocument, deleteObjects, emptyOverlay, patchNode, rebaseDocument, undo, type History } from "../canvas-document/model";
import { canvasFixture } from "../canvas-generation/fixtures";
import { createDraft, projectDraft, reduceEvent } from "../canvas-generation/reducer";
import type { CanvasEventPayload } from "../canvas-generation/contracts";

for (const fixtureName of ["sorting", "photosynthesis"] as const) {
  test(`${fixtureName}: arriving units preserve personal text, placement, folds and camera`, () => {
    const fixture = canvasFixture(fixtureName);
    let draft = createDraft("integration-request");
    let seq = 0;
    const send = (payload: CanvasEventPayload) => {
      draft = reduceEvent(draft, { v: 2, requestId: "integration-request", runId: `integration-${fixtureName}`, sourceRevision: "source-1", seq: ++seq, ...payload });
    };
    send({ type: "started", mode: "simulated", text: fixture.text });
    send({ type: "outline", outline: fixture.outline });
    let document = createDocument(parseCanvasSource(projectDraft(draft)));
    const firstId = `concept-${fixture.outline.concepts[0].id}`;
    document.overlay = patchNode(document.overlay, firstId, { title: "My own explanation", bounds: { x: 640, y: 420, width: 330, height: 180 } });
    document.view.expanded = ["topic-root", firstId];
    document.view.explained = [firstId];
    document.view.cameras.overview = { x: 88, y: 42, zoom: 0.8 };
    const viewBefore = structuredClone(document.view);
    for (const unit of [...fixture.units].reverse()) {
      send({ type: "unit", unit });
      document = rebaseDocument(document, parseCanvasSource(projectDraft(draft)));
      const node = compose(document.source, document.overlay).nodes.find((node) => node.id === firstId)!;
      assert.equal(node.title, "My own explanation");
      assert.deepEqual(node.bounds, { x: 640, y: 420, width: 330, height: 180 });
      assert.deepEqual(document.view, viewBefore);
    }
    send({ type: "finished", outcome: "complete", missing: [] });
    document = rebaseDocument(document, parseCanvasSource(projectDraft(draft)));
    assert.equal(document.source.status, "complete");
    assert.equal(document.source.provenance, "simulated");
    const activities = document.source.nodes.flatMap((node) => node.activity ? [node.activity.kind] : []);
    assert.equal(activities.includes("sorting"), fixtureName === "sorting");
  });
}

test("undoing a personal edit after generation advances keeps the newly arrived content", () => {
  const fixture = canvasFixture("sorting");
  let draft = createDraft("undo-request"); let seq = 0;
  const send = (payload: CanvasEventPayload) => { draft = reduceEvent(draft, { v: 2, requestId: "undo-request", runId: "undo-run", sourceRevision: "source-1", seq: ++seq, ...payload }); };
  send({ type: "started", mode: "simulated", text: fixture.text });
  send({ type: "outline", outline: fixture.outline });
  let document = createDocument(parseCanvasSource(projectDraft(draft)));
  const firstId = `concept-${fixture.outline.concepts[0].id}`;
  let history: History = { past: [], present: emptyOverlay(), future: [] };
  history = commit(history, patchNode(history.present, firstId, { title: "My edit" }));
  document.overlay = history.present;
  send({ type: "unit", unit: fixture.units[0] });
  document = rebaseDocument(document, parseCanvasSource(projectDraft(draft)));
  history = undo(history);
  const graph = compose(document.source, history.present);
  assert.equal(graph.nodes.find((node) => node.id === firstId)!.title, fixture.outline.concepts[0].title);
  assert.ok(graph.nodes.some((node) => node.activity), "Undo must not roll back the provider's new teaching unit.");
  const deleted = deleteObjects(document.source, document.overlay, [firstId], []);
  const rebased = rebaseDocument({ ...document, overlay: deleted }, { ...document.source, revision: "next-revision" });
  assert.ok(!compose(rebased.source, rebased.overlay).nodes.some((node) => node.id === firstId), "A source revision must not resurrect a personal deletion.");
});
