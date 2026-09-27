import test from "node:test";
import assert from "node:assert/strict";
import { selectQuestionIndexes } from "../src/lib/questionSelection.ts";

function selectedMarks(result, marks) {
  return result.indexes.reduce((sum, index) => sum + Math.round(marks[index] * 100), 0);
}

test("selects the requested count directly for equal-mark questions", () => {
  const marks = Array(5000).fill(1);
  const result = selectQuestionIndexes(marks, 2000);
  assert.equal(result.indexes.length, 20);
  assert.equal(selectedMarks(result, marks), 2000);
  assert.equal(result.selectionLimited, false);
});

test("greedy restarts and swaps can solve a combination the first pass can miss", () => {
  const marks = [6, 5, 5];
  const result = selectQuestionIndexes(marks, 1000, {
    toleranceUnits: 0,
    random: () => 0,
  });
  assert.equal(selectedMarks(result, marks), 1000);
});

test("returns the closest available total when the pool cannot reach the target", () => {
  const marks = [2, 3];
  const result = selectQuestionIndexes(marks, 1000, { random: () => 0 });
  assert.deepEqual(result.indexes.sort(), [0, 1]);
  assert.equal(selectedMarks(result, marks), 500);
});

test("keeps the closest single-question fallback for an overshooting pool", () => {
  const marks = [8, 8];
  const result = selectQuestionIndexes(marks, 1000, { toleranceUnits: 0, random: () => 0 });
  assert.equal(selectedMarks(result, marks), 800);
});

test("honours an expired selection deadline and still returns a fallback", () => {
  const marks = [2, 3, 4];
  const result = selectQuestionIndexes(marks, 1000, { deadline: performance.now() - 1 });
  assert.equal(result.selectionLimited, true);
  assert.ok(result.indexes.length > 0);
});
