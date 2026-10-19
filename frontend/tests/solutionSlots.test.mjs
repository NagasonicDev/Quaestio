import test from "node:test";
import assert from "node:assert/strict";
import { markingCriteriaBlocks, solutionSlots } from "../src/lib/criteria.ts";

const list = (items) => ({ block_id: "b1", slot: "marking_criteria", position: 0, block_type: "list", content: { items } });

test("a marking criteria list becomes a Marks/Criteria table", () => {
  const out = markingCriteriaBlocks([list([
    "1 mark: uses the correct formula",
    "2 marks: correct working shown",
  ])]);
  assert.equal(out.length, 1);
  assert.equal(out[0].block_type, "table");
  assert.deepEqual(out[0].content.columns, ["Marks", "Criteria"]);
  assert.deepEqual(out[0].content.rows, [
    ["1", "uses the correct formula"],
    ["2", "correct working shown"],
  ]);
  assert.equal(out[0].block_id, "b1:criteria-table");
});

test("a mark range keeps both endpoints", () => {
  const out = markingCriteriaBlocks([list(["1-2 marks: explains with a reason"])]);
  assert.deepEqual(out[0].content.rows, [["1\u20132", "explains with a reason"]]);
});

test("non-criteria marking blocks are returned unchanged", () => {
  const blocks = [{ block_id: "x", slot: "marking_criteria", position: 0, block_type: "equation", content: { latex: "x=1" } }];
  assert.equal(markingCriteriaBlocks(blocks), blocks);
});

test("solutionSlots flattens parts and tables each marking criteria", () => {
  const q = {
    question_id: "q1",
    answer: [{ block_id: "a", slot: "answer", position: 0, block_type: "text", content: { text: "72" } }],
    solution: [],
    marking_criteria: [list(["1 mark: correct"])],
    parts: [{ part_label: "a", answer: [], solution: [], marking_criteria: [list(["1 mark: part"])], parts: [] }],
  };
  const slots = solutionSlots(q);
  assert.deepEqual(slots.map((slot) => slot.label), [
    "Answer", "Solution", "Marking criteria",
    "Answer", "Solution", "Marking criteria",
  ]);
  assert.deepEqual(slots.map((slot) => slot.heading), [
    "Overview", undefined, undefined,
    "(a)", undefined, undefined,
  ]);
  assert.equal(slots[3].sub, true);
  assert.equal(slots[2].blocks[0].block_type, "table");
  assert.equal(slots[5].blocks[0].block_type, "table");
});

const equation = (position) => ({ block_id: "eq", slot: "marking_criteria", position, block_type: "equation", content: { latex: "x=1" } });
const criteriaList = (position) => ({ ...list(["1 mark: correct"]), position });

test("a figure or equation before the criteria keeps its place", () => {
  const out = markingCriteriaBlocks([equation(0), criteriaList(1)]);
  assert.deepEqual(out.map((block) => block.block_type), ["equation", "table"]);
  assert.equal(out[1].block_id, "b1:criteria-table");
  assert.equal(out[1].position, 1);
});

test("a block after the criteria stays after the table", () => {
  const out = markingCriteriaBlocks([criteriaList(0), equation(1)]);
  assert.deepEqual(out.map((block) => block.block_type), ["table", "equation"]);
});

test("a part without a label falls back to 'Part'", () => {
  const q = { question_id: "q2", answer: [], solution: [], marking_criteria: [], parts: [{ answer: [], solution: [], marking_criteria: [], parts: [] }] };
  assert.deepEqual(solutionSlots(q).map((slot) => slot.label), [
    "Answer", "Solution", "Marking criteria",
    "Answer", "Solution", "Marking criteria",
  ]);
  assert.deepEqual(solutionSlots(q).map((slot) => slot.heading), [
    "Overview", undefined, undefined,
    "Part", undefined, undefined,
  ]);
});
