import test from "node:test";
import assert from "node:assert/strict";
import { descendantCount, layoutTopicMap, topicElements } from "./topic-map";

test("folding a branch hides all descendants without changing another branch", () => {
  const expanded = new Set(topicElements.map((item) => item.id));
  const all = layoutTopicMap(expanded);
  expanded.delete("methods");
  const folded = layoutTopicMap(expanded);
  assert.equal(all.length - folded.length, descendantCount("methods"));
  assert.ok(folded.some((node) => node.element.id === "growth"));
  assert.ok(!folded.some((node) => node.element.id === "pair"));
  expanded.add("methods");
  assert.deepEqual(layoutTopicMap(expanded), all);
});

test("expanded explanations and branch restoration never overlap other visible nodes", () => {
  const expanded = new Set(topicElements.map((item) => item.id));
  const nodes = layoutTopicMap(expanded, { meaning: 480, key: 620, bubble: 550, growth: 560 });
  for (const [index, left] of nodes.entries()) for (const right of nodes.slice(index + 1)) {
    const overlapX = left.x < right.x + right.width && right.x < left.x + left.width;
    const overlapY = left.y < right.y + right.height && right.y < left.y + left.height;
    assert.ok(!(overlapX && overlapY), `${left.element.id} overlaps ${right.element.id}`);
  }
  const closed = layoutTopicMap(new Set());
  assert.equal(closed.length, 1);
  assert.equal(closed[0].element.id, "sorting");
  assert.equal(closed[0].y, 0);
});
