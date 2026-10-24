import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// The lib uses extensionless relative imports (bundler style); map them to .ts.
registerHooks({
  resolve(specifier, context, next) {
    if (
      specifier.startsWith(".") &&
      !/\.[cm]?[jt]sx?$/.test(specifier) &&
      !specifier.endsWith(".css")
    ) {
      return next(`${specifier}.ts`, context);
    }
    return next(specifier, context);
  },
});

const { buildExamDocument, parseExamDocument } = await import("../src/lib/examDocument.ts");

const question = (id, extra = {}) => ({
  question_id: id,
  course_id: "c1",
  type_key: "short_answer",
  difficulty: null,
  marks: 4,
  parent_question_id: null,
  part_label: null,
  notes: null,
  review_status: "approved",
  classification_confidence: null,
  node_ids: [],
  tags: [],
  body: [{ block_id: "b", slot: "body", position: 0, block_type: "text", content: { text: "Q?" } }],
  hint: [],
  answer: [{ block_id: "a", slot: "answer", position: 0, block_type: "text", content: { text: "72" } }],
  solution: [],
  marking_criteria: [],
  assets: [],
  source: null,
  parts: [],
  created_at: "2026-01-01 00:00:00",
  updated_at: "2026-01-01 00:00:00",
  ...extra,
});

const baseInput = () => ({
  testId: "t1",
  title: "Paper 2",
  format: "pdf",
  generatedAt: "2026-10-19T00:00:00.000Z",
  targetMarks: 20,
  totalMarks: 20,
  sections: [
    { label: "Section I", questions: [question("q1"), question("q2")] },
    { label: "Section II", questions: [question("q3", { marks: 8 })] },
  ],
  stimuli: [],
});

test("buildExamDocument freezes the issued questions and sections", () => {
  const doc = buildExamDocument(baseInput());
  assert.equal(doc.schemaVersion, 1);
  assert.equal(doc.testId, "t1");
  assert.equal(doc.seed, 0);
  assert.equal(doc.legacy, undefined);
  assert.equal(doc.sections.length, 2);
  assert.deepEqual(doc.sections.map((s) => s.label), ["Section I", "Section II"]);
  assert.deepEqual(doc.sections[0].questions.map((q) => q.question_id), ["q1", "q2"]);
});

test("a built document round-trips through JSON independently of later edits", () => {
  const input = baseInput();
  const doc = buildExamDocument(input);
  const json = JSON.stringify(doc);
  // Simulate the source question being edited after generation.
  input.sections[0].questions[0].answer[0].content.text = "edited later";
  const restored = parseExamDocument(json);
  assert.ok(restored);
  assert.equal(restored.sections[0].questions[0].answer[0].content.text, "72");
  assert.deepEqual(restored, parseExamDocument(JSON.stringify(buildExamDocument(baseInput()))));
});

test("parseExamDocument rejects missing, malformed and future snapshots", () => {
  assert.equal(parseExamDocument(null), null);
  assert.equal(parseExamDocument(undefined), null);
  assert.equal(parseExamDocument(""), null);
  assert.equal(parseExamDocument("not json"), null);
  assert.equal(parseExamDocument(JSON.stringify({ schemaVersion: 99, sections: [] })), null);
  assert.equal(parseExamDocument(JSON.stringify({ schemaVersion: 1 })), null);
});

test("parseExamDocument rejects a snapshot whose sections the renderer cannot read", () => {
  // A truncated/corrupted snapshot must fall back to the legacy rebuild, not
  // crash deep inside a renderer iterating section.questions.
  assert.equal(parseExamDocument(JSON.stringify({ schemaVersion: 1, sections: "nope" })), null);
  assert.equal(parseExamDocument(JSON.stringify({ schemaVersion: 1, sections: [{}] })), null);
  assert.equal(parseExamDocument(JSON.stringify({ schemaVersion: 1, sections: [{ questions: null }] })), null);
  assert.equal(parseExamDocument(JSON.stringify({ schemaVersion: 1, sections: [{ questions: [null] }] })), null);
});

test("parseExamDocument accepts a well-formed snapshot with an empty section", () => {
  const doc = buildExamDocument({ ...baseInput(), sections: [{ label: null, questions: [] }] });
  assert.ok(parseExamDocument(JSON.stringify(doc)));
});

test("the legacy flag survives a round-trip", () => {
  const doc = buildExamDocument({ ...baseInput(), legacy: true });
  assert.equal(doc.legacy, true);
  assert.equal(parseExamDocument(JSON.stringify(doc)).legacy, true);
});
