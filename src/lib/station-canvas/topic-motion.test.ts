import test from "node:test";
import assert from "node:assert/strict";
import { layoutTopicMap } from "./topic-map";
import { anchorTopicLayout, clearAnchorColumn, settleAxis } from "./topic-motion";

test("opening a branch pins its origin without changing the tree's spacing", () => {
  const before = layoutTopicMap(new Set(["sorting"]));
  const origin = before.find((node) => node.element.id === "methods")!;
  const after = layoutTopicMap(new Set(["sorting", "methods"]));
  const anchored = anchorTopicLayout(after, { id: "methods", x: origin.x, y: origin.y });
  const pinned = anchored.find((node) => node.element.id === "methods")!;
  assert.equal(pinned.x, origin.x);
  assert.equal(pinned.y, origin.y);
  for (let i = 1; i < after.length; i++) {
    assert.equal(anchored[i].y - anchored[0].y, after[i].y - after[0].y);
  }
});

test("layout motion is continuous, settles without overshoot and handles a reversal", () => {
  let position = 0;
  let velocity = 0;
  for (let i = 0; i < 45; i++) {
    const next = settleAxis(position, velocity, 500, 1 / 60);
    assert.ok(next.position >= position && next.position < 500);
    position = next.position; velocity = next.velocity;
  }
  assert.ok(Math.abs(position - 500) < 0.3);
  const reversed = settleAxis(position, velocity, -100, 1 / 60);
  assert.ok(Math.abs(reversed.position - position) < 15, "reversal starts from the current location");
  for (let i = 0; i < 90; i++) ({ position, velocity } = settleAxis(position, velocity, -100, 1 / 60));
  assert.ok(Math.abs(position + 100) < 0.01);
  assert.ok(Math.abs(velocity) < 0.1);
});

test("settling does not depend on the display refresh rate", () => {
  const simulate = (rate: number) => {
    let state = { position: -200, velocity: 0 };
    for (let i = 0; i < rate / 2; i++) state = settleAxis(state.position, state.velocity, 300, 1 / rate);
    return state;
  };
  assert.ok(Math.abs(simulate(60).position - simulate(120).position) < 0.0001);
});

test("neighbours stay clear during growth while the interaction origin stays fixed", () => {
  const rows = [{ id: "above", y: 0, height: 200 }, { id: "origin", y: 260, height: 440 }, { id: "below", y: 520, height: 200 }];
  const result = clearAnchorColumn(rows, "origin");
  assert.equal(result[1].y, 260);
  for (let i = 1; i < result.length; i++) assert.ok(result[i].y - result[i - 1].y - result[i - 1].height >= 64);
  assert.equal(rows[2].y, 520, "input snapshots are unchanged");
  assert.deepEqual(clearAnchorColumn(result, "origin"), result, "settled rows do not drift");
});
