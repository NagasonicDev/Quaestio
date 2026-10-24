import test from "node:test";
import assert from "node:assert/strict";
import { claimQuestionId } from "../src/lib/id.ts";

test("claimQuestionId keeps a free imported id", () => {
  const used = new Set();
  assert.equal(claimQuestionId("source-question-17", used), "source-question-17");
  assert.deepEqual([...used], ["source-question-17"]);
});

test("claimQuestionId replaces a missing or already used id", () => {
  const used = new Set(["source-question-17"]);
  const duplicate = claimQuestionId("source-question-17", used);
  const missing = claimQuestionId(null, used);
  assert.notEqual(duplicate, "source-question-17");
  assert.notEqual(missing, "source-question-17");
  assert.equal(new Set([duplicate, missing, ...used]).size, 3);
});
