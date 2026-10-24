import test from "node:test";
import assert from "node:assert/strict";
import { selectQuestionIndexes } from "../src/lib/questionSelection.ts";
import { recentlyUsedQuestionIds } from "../src/lib/testHistory.ts";

test("recentlyUsedQuestionIds reads ids from the most recent tests", () => {
  const rows = [
    { question_ids_json: JSON.stringify(["a", "b"]) },
    { question_ids_json: JSON.stringify(["b", "c"]) },
    { question_ids_json: "not json" },
  ];
  const used = recentlyUsedQuestionIds(rows, 3);
  assert.deepEqual([...used].sort(), ["a", "b", "c"]);
});

test("recentlyUsedQuestionIds honours the lookback window", () => {
  const rows = [
    { question_ids_json: JSON.stringify(["a"]) },
    { question_ids_json: JSON.stringify(["b"]) },
  ];
  const used = recentlyUsedQuestionIds(rows, 1);
  assert.deepEqual([...used], ["a"]);
});

test("recentlyUsedQuestionIds tolerates malformed and missing rows", () => {
  const used = recentlyUsedQuestionIds([{}, { question_ids_json: null }], 5);
  assert.equal(used.size, 0);
});

test("a kept question is never dropped and still counts toward the target", () => {
  const marks = [5, 4, 3, 3];
  const result = selectQuestionIndexes(marks, 8, { keepIndexes: new Set([0]) });
  assert.ok(result.indexes.includes(0));
  assert.equal(result.indexes.reduce((sum, i) => sum + marks[i], 0), 8);
});

test("kept questions that already meet the target select nothing else", () => {
  const marks = [5, 4, 3];
  const result = selectQuestionIndexes(marks, 5, { keepIndexes: new Set([0]) });
  assert.deepEqual(result.indexes, [0]);
});

test("kept questions make an otherwise-solvable target infeasible when they overshoot", () => {
  const marks = [6, 4, 3];
  const result = selectQuestionIndexes(marks, 5, { keepIndexes: new Set([0]) });
  assert.equal(result.infeasible, true);
  // Reachable totals from the whole pool at or below 5 are 0, 3 and 4.
  assert.equal(result.nearestBelow, 4);
  assert.equal(result.nearestAbove, 6);
});

test("excluding used questions still hits the target from the rest", () => {
  const marks = [5, 5, 4, 4, 3];
  const result = selectQuestionIndexes(marks, 8, { excludeIndexes: new Set([0, 1]) });
  assert.equal(result.indexes.reduce((sum, i) => sum + marks[i], 0), 8);
  assert.ok(!result.indexes.includes(0) && !result.indexes.includes(1));
});

test("a section with too few unused marks reports infeasible rather than reusing a question", () => {
  const marks = [5, 5, 4];
  const result = selectQuestionIndexes(marks, 10, { excludeIndexes: new Set([0]) });
  assert.equal(result.infeasible, true);
  assert.ok(!result.indexes.includes(0));
});

test("respects a difficulty cap by excluding ineligible questions", () => {
  // Hard questions (difficulty 3) are filtered out before selection.
  const marks = [5, 4, 4, 3];
  const hard = new Set([0]);
  const result = selectQuestionIndexes(marks, 8, { excludeIndexes: hard });
  assert.equal(result.indexes.reduce((sum, i) => sum + marks[i], 0), 8);
  assert.ok(!result.indexes.includes(0));
});

test("meets a per-topic minimum by keeping the required topic", () => {
  const marks = [4, 4, 3, 3];
  const topicKeep = new Set([0]); // 4 marks of the required topic
  const result = selectQuestionIndexes(marks, 7, { keepIndexes: topicKeep });
  assert.ok(result.indexes.includes(0));
  assert.equal(result.indexes.reduce((sum, i) => sum + marks[i], 0), 7);
});

test("an overshooting pin reports only totals reachable while keeping the pin", () => {
  // Pin is 6 marks for a 4-mark target. The free 3-mark item can reach 3, and
  // 6+3=9, but 5 is only reachable by dropping the pin — so 5 must not be offered.
  const marks = [6, 5, 3];
  const result = selectQuestionIndexes(marks, 4, { keepIndexes: new Set([0]) });
  assert.equal(result.infeasible, true);
  assert.equal(result.nearestAbove, 6);
});

test("a pinned target below the pin is reported as infeasible", () => {
  const marks = [7, 5];
  const result = selectQuestionIndexes(marks, 3, { keepIndexes: new Set([0]) });
  assert.equal(result.infeasible, true);
  assert.equal(result.nearestAbove, 7);
  // 3 is unreachable and no unpinned combination fits under it, so 0 is below.
  assert.equal(result.nearestBelow, 0);
});
