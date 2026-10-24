import test from "node:test";
import assert from "node:assert/strict";
import { parseQuestionIdList } from "../src/lib/testHistory.ts";

test("parseQuestionIdList reads a well-formed id array", () => {
  assert.deepEqual(parseQuestionIdList('["q1","q2"]'), ["q1", "q2"]);
});

test("parseQuestionIdList drops non-string entries instead of failing", () => {
  assert.deepEqual(parseQuestionIdList('["q1",5,null,{"a":1},"q2"]'), ["q1", "q2"]);
});

test("parseQuestionIdList returns empty for malformed JSON rather than throwing", () => {
  assert.deepEqual(parseQuestionIdList("not json"), []);
  assert.deepEqual(parseQuestionIdList(""), []);
});

test("parseQuestionIdList returns empty when the JSON is not an array", () => {
  assert.deepEqual(parseQuestionIdList('{"question_ids":["q1"]}'), []);
  assert.deepEqual(parseQuestionIdList("null"), []);
});
