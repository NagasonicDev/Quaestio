import test from "node:test";
import assert from "node:assert/strict";
import { dedupeBlocks, dedupeOptions, dedupeQuestion } from "../src/lib/questionDedupe.ts";

const text = (value) => ({ block_type: "text", content: { text: value } });

test("adjacent duplicate body blocks collapse, positions reindex", () => {
  const out = dedupeBlocks([text("A"), text("B"), text("B"), text("C")]);
  assert.deepEqual(out.map((block) => block.content.text), ["A", "B", "C"]);
  assert.deepEqual(out.map((block) => block.position), [0, 1, 2]);
});

test("a repeated contiguous run collapses to one copy", () => {
  const out = dedupeBlocks([text("A"), text("B"), text("A"), text("B")]);
  assert.deepEqual(out.map((block) => block.content.text), ["A", "B"]);
});

test("three identical blocks collapse to one", () => {
  const out = dedupeBlocks([text("A"), text("A"), text("A")]);
  assert.equal(out.length, 1);
});

test("duplicate options collapse and keep the correct answer", () => {
  const out = dedupeOptions([
    { content: [text("A")], is_correct: false },
    { content: [text("B")], is_correct: false },
    { content: [text("C")], is_correct: false },
    { content: [text("A")], is_correct: true },
  ]);
  assert.equal(out.length, 3);
  assert.equal(out[0].content[0].content.text, "A");
  assert.equal(out[0].is_correct, true);
  assert.equal(out[2].position, 2);
});

test("an MCQ whose every option is identical is left alone", () => {
  const options = [{ content: [text("A")] }, { content: [text("A")] }];
  assert.equal(dedupeOptions(options), options);
});

test("an MCQ that would collapse to two choices is left alone", () => {
  const options = [
    { content: [text("A")] },
    { content: [text("B")] },
    { content: [text("A")] },
    { content: [text("B")] },
  ];
  assert.equal(dedupeOptions(options), options);
});

test("parts are cleaned recursively and the original is untouched", () => {
  const source = {
    body: [text("stem"), text("stem")],
    parts: [{ body: [text("part"), text("part")] }],
  };
  const out = dedupeQuestion(source);
  assert.equal(source.body.length, 2);
  assert.equal(source.parts[0].body.length, 2);
  assert.equal(out.body.length, 1);
  assert.equal(out.parts[0].body.length, 1);
});
