import test from "node:test";
import assert from "node:assert/strict";
import { selectQuestionIndexes } from "../src/lib/questionSelection.ts";

function marksOf(result, marks) {
  return result.indexes.reduce((sum, index) => sum + marks[index], 0);
}

test("selects exactly the target marks whenever the pool allows it", () => {
  const marks = [5, 4, 3, 3, 2, 2, 1, 1];
  const result = selectQuestionIndexes(marks, 11);
  assert.equal(marksOf(result, marks), 11);
  assert.equal(result.infeasible, undefined);
});

test("handles a target that can only be hit by one combination", () => {
  const marks = [8, 7, 3, 2, 1];
  const result = selectQuestionIndexes(marks, 12);
  assert.equal(marksOf(result, marks), 12);
});

test("equal-mark pools select by count", () => {
  const marks = Array(5000).fill(1);
  const result = selectQuestionIndexes(marks, 20);
  assert.equal(result.indexes.length, 20);
  assert.equal(marksOf(result, marks), 20);
});

test("reports infeasible with the nearest totals above and below", () => {
  const marks = [2, 3, 4];
  const result = selectQuestionIndexes(marks, 20);
  assert.equal(result.infeasible, true);
  assert.equal(result.nearestBelow, 9);
  assert.equal(result.nearestAbove, null);
  assert.equal(marksOf(result, marks), 9);
});

test("an infeasible target still returns its nearest reachable total", () => {
  const marks = [7, 6];
  const result = selectQuestionIndexes(marks, 10);
  assert.equal(result.infeasible, true);
  assert.equal(result.nearestBelow, 7);
  assert.equal(result.nearestAbove, 13);
  assert.equal(marksOf(result, marks), 7);
});

test("selection is deterministic for the same pool and target", () => {
  const marks = [5, 5, 4, 4, 3, 3, 2, 2, 1, 1];
  const a = selectQuestionIndexes(marks, 10);
  const b = selectQuestionIndexes(marks, 10);
  assert.deepEqual(a.indexes, b.indexes);
});

test("the solver never picks the same index twice", () => {
  const marks = [3, 3, 3, 3, 3, 3];
  const result = selectQuestionIndexes(marks, 9);
  assert.equal(new Set(result.indexes).size, result.indexes.length);
});

test("respects exclusions and still hits the target from the rest", () => {
  const marks = [4, 4, 2, 3, 3, 2];
  const result = selectQuestionIndexes(marks, 7, { excludeIndexes: new Set([3]) });
  assert.equal(marksOf(result, marks), 7);
  assert.ok(!result.indexes.includes(3));
});

test("a target of zero selects nothing", () => {
  const result = selectQuestionIndexes([3, 2, 1], 0);
  assert.deepEqual(result.indexes, []);
  assert.equal(result.infeasible, undefined);
});

test("an empty pool reports infeasible without inventing questions", () => {
  const result = selectQuestionIndexes([], 10);
  assert.deepEqual(result.indexes, []);
  assert.equal(result.infeasible, true);
});

test("solves a large pool quickly", () => {
  const marks = Array.from({ length: 400 }, (_, i) => (i % 8) + 1);
  const start = performance.now();
  const result = selectQuestionIndexes(marks, 137);
  assert.equal(marksOf(result, marks), 137);
  assert.ok(performance.now() - start < 2000, "solver should run in well under 2s");
});

test("the nearest-below total is reachable and maximal", () => {
  const marks = [5, 5, 3];
  const result = selectQuestionIndexes(marks, 11);
  assert.equal(result.infeasible, true);
  assert.equal(result.nearestBelow, 10);
  assert.equal(marksOf(result, marks), 10);
});
