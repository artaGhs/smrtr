import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBubbleTrace, createSortItems, getCanvas, getFrameForMode, SORTING_VALUES } from "./model";
import type { CanvasId } from "./types";

test("bubble trace sorts different input families without mutating the input", () => {
  for (const values of [SORTING_VALUES, [], [1], [1, 2, 3], [5, 4, 3, 2, 1], [0, -3, 2, -3, 0]]) {
    const input = createSortItems(values);
    const original = structuredClone(input);
    const trace = buildBubbleTrace(input);
    assert.deepEqual(input, original);
    assert.equal(trace[0].phase, "ready");
    assert.equal(trace.at(-1)?.phase, "done");
    assert.deepEqual(trace.at(-1)?.items.map((item) => item.value), [...values].sort((a, b) => a - b));
    assert.equal(trace.at(-1)?.sortedIds.length, values.length);
    for (const frame of trace) {
      assert.deepEqual(frame.items.map((item) => item.id).sort(), original.map((item) => item.id).sort());
    }
  }
});

test("strict adjacent swaps preserve duplicate identities and their original order", () => {
  const items = createSortItems([2, 1, 2, 1, 2]);
  const trace = buildBubbleTrace(items);
  const final = trace.at(-1)!.items;
  assert.deepEqual(final.filter((item) => item.value === 2).map((item) => item.id), ["book-0", "book-2", "book-4"]);
  assert.deepEqual(final.filter((item) => item.value === 1).map((item) => item.id), ["book-1", "book-3"]);
  for (const frame of trace.filter((frame) => frame.phase === "swap")) {
    assert.equal(frame.activeIds.length, 2);
    const pair = frame.activeIds.map((id) => frame.items.find((item) => item.id === id)!.value);
    assert.notEqual(pair[0], pair[1]);
  }
});

test("each compare has a decision, each swap changes exactly one adjacent pair, and counters match", () => {
  const trace = buildBubbleTrace(createSortItems(SORTING_VALUES));
  let comparisonCount = 0;
  let swapCount = 0;
  trace.forEach((frame, index) => {
    if (frame.phase === "compare") {
      comparisonCount += 1;
      assert.ok(["swap", "keep"].includes(trace[index + 1].phase));
      assert.deepEqual(frame.activeIds, trace[index + 1].activeIds);
    }
    if (frame.phase === "swap") {
      swapCount += 1;
      const before = trace[index - 1];
      assert.equal(before.phase, "compare");
      const changed = frame.items.flatMap((item, position) => before.items[position].id === item.id ? [] : [position]);
      assert.equal(changed.length, 2);
      assert.equal(changed[1], changed[0] + 1);
      assert.equal(before.items[changed[0]].id, frame.items[changed[1]].id);
      assert.equal(before.items[changed[1]].id, frame.items[changed[0]].id);
    }
    if (frame.phase === "keep") assert.deepEqual(frame.items, trace[index - 1].items);
    assert.equal(frame.comparisons, comparisonCount);
    assert.equal(frame.swaps, swapCount);
  });
  assert.equal(trace.at(-1)?.swaps, 7);
});

test("settled suffix is sorted, dominates the open region and never moves again", () => {
  const trace = buildBubbleTrace(createSortItems([4, 2, 5, 1, 3]));
  trace.forEach((frame, index) => {
    if (frame.sortedIds.length === 0) return;
    const boundary = frame.items.length - frame.sortedIds.length;
    const suffix = frame.items.slice(boundary);
    assert.deepEqual(suffix.map((item) => item.id), frame.sortedIds);
    assert.deepEqual(suffix.map((item) => item.value), suffix.map((item) => item.value).sort((a, b) => a - b));
    if (boundary > 0) assert.ok(Math.max(...frame.items.slice(0, boundary).map((item) => item.value)) <= suffix[0].value);
    for (const later of trace.slice(index)) {
      assert.deepEqual(later.items.slice(boundary), suffix);
    }
  });
});

test("a no-swap pass stops early and snapshots do not share mutable arrays or items", () => {
  const trace = buildBubbleTrace(createSortItems([1, 2, 3, 4]));
  assert.equal(trace.at(-1)?.comparisons, 3);
  assert.equal(trace.at(-1)?.pass, 1);
  assert.equal(trace.at(-1)?.swaps, 0);
  trace[0].items[0].value = 99;
  trace[0].activeIds.push("unrelated");
  assert.equal(trace[1].items[0].value, 1);
  assert.ok(!trace[1].activeIds.includes("unrelated"));
});

test("invalid values and duplicate identities cannot produce an ambiguous animation trace", () => {
  assert.throws(() => createSortItems([Number.NaN]), /finite/);
  assert.throws(() => buildBubbleTrace([{ id: "x", value: Infinity, color: "blue" }]), /finite/);
  assert.throws(() => buildBubbleTrace([{ id: "x", value: 1, color: "blue" }, { id: "x", value: 2, color: "red" }]), /distinct/);
});

test("preview modes resolve meaningful trace events without inventing a swap", () => {
  const trace = buildBubbleTrace(createSortItems(SORTING_VALUES));
  assert.equal(getFrameForMode(trace, "problem"), 0);
  assert.equal(trace[getFrameForMode(trace, "compare")].phase, "compare");
  assert.equal(trace[getFrameForMode(trace, "swap")].phase, "swap");
  assert.equal(trace[getFrameForMode(trace, "pass")].phase, "pass");
  assert.equal(trace[getFrameForMode(trace, "invariant")].phase, "pass");
  const sortedTrace = buildBubbleTrace(createSortItems([1, 2]));
  assert.equal(sortedTrace[getFrameForMode(sortedTrace, "swap")].phase, "keep");
  assert.equal(getFrameForMode([], "swap"), 0);
});

test("every canvas is connected, contains visual stations and links only to defined canvases", () => {
  const ids: CanvasId[] = ["sorting", "compare", "swap", "pass", "invariant", "transfer", "stability"];
  for (const id of ids) {
    const canvas = getCanvas(id);
    assert.equal(canvas.id, id);
    assert.ok(canvas.stations.length >= 3);
    const stations = new Set(canvas.stations.map((station) => station.id));
    assert.equal(stations.size, canvas.stations.length);
    const reachable = new Set([canvas.stations[0].id]);
    for (let round = 0; round < canvas.stations.length; round += 1) {
      for (const edge of canvas.connections) {
        assert.ok(stations.has(edge.source) && stations.has(edge.target));
        assert.ok(edge.label.trim().length > 10);
        if (reachable.has(edge.source)) reachable.add(edge.target);
      }
    }
    assert.equal(reachable.size, canvas.stations.length);
    for (const station of canvas.stations) {
      if (station.detailCanvas) assert.ok(ids.includes(station.detailCanvas));
      assert.ok(station.question.endsWith("?"));
    }
    let parent = canvas.parent;
    const ancestors = new Set([id]);
    while (parent) {
      assert.ok(!ancestors.has(parent), "containment cannot cycle");
      ancestors.add(parent);
      parent = getCanvas(parent).parent;
    }
  }
  assert.equal(getCanvas("sorting").stations.length, 6);
  assert.match(getCanvas("transfer").subtitle, /starting order changes/);
});
