import test from "node:test";
import assert from "node:assert/strict";
import { validateQuestionForImport, clearQuestions } from "../src/lib/data.ts";
import { run, all, transaction, flush, isDirty } from "../src/lib/db/sqlite.ts";

test("import validation: MCQ with zero correct options is rejected", () => {
  const problems = validateQuestionForImport({
    question_id: "q-zero",
    type_key: "multiple_choice",
    marks: 1,
    mcq_options: [{ is_correct: false }, { is_correct: false }],
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /exactly one correct option \(found 0\)/);
});

test("import validation: MCQ with several correct options is rejected", () => {
  const problems = validateQuestionForImport({
    question_id: "q-many",
    type_key: "multiple_choice",
    marks: 1,
    mcq_options: [{ is_correct: true }, { is_correct: true }, { is_correct: false }],
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /exactly one correct option \(found 2\)/);
});

test("import validation: MCQ with exactly one correct option passes", () => {
  assert.deepEqual(
    validateQuestionForImport({
      question_id: "q-ok",
      type_key: "multiple_choice",
      marks: 2,
      mcq_options: [{ is_correct: true }, { is_correct: false }],
    }),
    []
  );
});

test("import validation: absurd marks are rejected, sane marks pass", () => {
  for (const bad of [-5, 0, 1e12, 2.5, "3", NaN]) {
    const problems = validateQuestionForImport({ question_id: "q-marks", type_key: "short_answer", marks: bad });
    assert.equal(problems.length, 1, `marks=${bad} should be rejected`);
    assert.match(problems[0], /marks must be a positive integer/);
  }
  assert.deepEqual(validateQuestionForImport({ question_id: "q-m", type_key: "short_answer", marks: 3 }), []);
  assert.deepEqual(validateQuestionForImport({ question_id: "q-m", type_key: "short_answer", marks: null }), []);
});

test("import validation: problems recurse into parts and name the question", () => {
  const problems = validateQuestionForImport({
    question_id: "parent",
    type_key: "short_answer",
    parts: [
      {
        question_id: "child",
        type_key: "multiple_choice",
        mcq_options: [{ is_correct: false }],
      },
    ],
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /Question 'child'/);
});

test("clearQuestions only deletes the given course", async () => {
  const a = "test-course-clear-a";
  const b = "test-course-clear-b";
  for (const id of [a, b]) {
    await run("INSERT INTO course (course_id, name, created_at, updated_at) VALUES (?, ?, datetime('now'), datetime('now'))", [id, id]);
  }
  await run(
    "INSERT INTO question (question_id, course_id, type_key, created_at, updated_at) VALUES (?, ?, 'short_answer', datetime('now'), datetime('now')), (?, ?, 'short_answer', datetime('now'), datetime('now'))",
    ["qa-1", a, "qb-1", b]
  );
  await run("INSERT INTO practice_attempt (attempt_id, question_id, status, created_at) VALUES (?, ?, 'seen', datetime('now')), (?, ?, 'seen', datetime('now'))", [
    "ata-1",
    "qa-1",
    "atb-1",
    "qb-1",
  ]);

  await clearQuestions(a);

  const remaining = await all("SELECT question_id FROM question ORDER BY question_id");
  assert.deepEqual(
    remaining.map((r) => r.question_id),
    ["qb-1"]
  );
  const attempts = await all("SELECT attempt_id FROM practice_attempt ORDER BY attempt_id");
  assert.deepEqual(
    attempts.map((r) => r.attempt_id),
    ["atb-1"]
  );

  await run("DELETE FROM course WHERE course_id IN (?, ?)", [a, b]);
});

test("flush defers while a transaction is open", async () => {
  await run("CREATE TABLE IF NOT EXISTS flush_probe (id TEXT)");
  let flushedDuringTx = null;
  await transaction(async () => {
    await run("INSERT INTO flush_probe (id) VALUES ('x')");
    await flush();
    flushedDuringTx = isDirty();
  });
  // flush() must not have persisted mid-transaction; the write stays dirty
  // until the transaction exits and the follow-up flush runs.
  assert.equal(flushedDuringTx, true);
  await flush();
  assert.equal(isDirty(), false);
  await run("DROP TABLE IF EXISTS flush_probe");
});
