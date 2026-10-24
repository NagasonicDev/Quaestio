import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import JSZip from "jszip";

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith(".") && !context.parentURL?.includes("node_modules") && !/\.[cm]?[jt]sx?$/.test(specifier) && !specifier.endsWith(".css") && !specifier.endsWith(".json")) {
      return next(`${specifier}.ts`, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith(".css")) return { format: "module", source: "export default {};", shortCircuit: true };
    return next(url, context);
  },
});

const { createRenderer, htmlRenderer, docxRenderer } = await import("../src/lib/paperRenderer.ts");
const { DEFAULT_EXAM_PROFILE } = await import("../src/lib/examProfile.ts");

function question(over = {}) {
  return {
    question_id: "q1", course_id: "c1", type_key: "short_answer", difficulty: "medium", marks: 3,
    parent_question_id: null, part_label: null, notes: null, review_status: "approved",
    classification_confidence: null, node_ids: [], tags: [], body: [
      { block_id: "b1", slot: "body", position: 0, block_type: "text", content: { text: "What is 6 x 12?" } },
    ], mcq_options: null, hint: null,
    answer: [{ block_id: "a1", slot: "answer", position: 0, block_type: "text", content: { text: "72" } }],
    solution: [], marking_criteria: [], assets: [], source: null, parts: [], created_at: "", updated_at: "",
    ...over,
  };
}

function doc(over = {}) {
  return {
    schemaVersion: 1, testId: "t1", title: "Practice Test", courseName: "Physics", format: "pdf",
    generatedAt: "2026-01-01T00:00:00Z", seed: 0, targetMarks: 3, totalMarks: 3,
    sections: [{ label: null, questions: [question()] }],
    stimuli: [], profile: DEFAULT_EXAM_PROFILE,
    ...over,
  };
}

test("html renderer reports format html and renders the paper as a Blob", async () => {
  assert.equal(htmlRenderer.format, "html");
  const blob = await htmlRenderer.renderPaper(doc(), new Map());
  assert.equal(blob.type, "text/html");
  const html = await blob.text();
  assert.match(html, /<!DOCTYPE html>/);
  assert.match(html, /Question 1/);
  assert.match(html, /HIGHER SCHOOL CERTIFICATE EXAMINATION/);
});

test("html renderer renders solutions from the same snapshot", async () => {
  const blob = await htmlRenderer.renderSolutions(doc(), new Map());
  const html = await blob.text();
  assert.match(html, /Solutions and marking guide/);
  assert.match(html, />72</);
});

test("docx renderer still produces a docx zip and takes the same snapshot", async () => {
  assert.equal(docxRenderer.format, "docx");
  const blob = await docxRenderer.renderPaper(doc({ format: "docx" }), new Map());
  const bytes = new Uint8Array(await blob.arrayBuffer());
  // ZIP magic: PK\x03\x04
  assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
});

test("snapshot without courseName/profile falls back to defaults", async () => {
  const blob = await htmlRenderer.renderPaper(doc({ courseName: undefined, profile: undefined }), new Map());
  const html = await blob.text();
  assert.match(html, /HIGHER SCHOOL CERTIFICATE EXAMINATION/);
});

test("createRenderer picks the implementation by format", () => {
  assert.equal(createRenderer("pdf").format, "html");
  assert.equal(createRenderer("docx").format, "docx");
  // Unknown/absent formats keep the editable DOCX default.
  assert.equal(createRenderer("anything").format, "docx");
  assert.equal(createRenderer(undefined).format, "docx");
});

test("resolveImages is shared: renderers use the passed asset map", async () => {
  const image = { data: new Uint8Array([137, 80, 78, 71]), mime: "image/png", widthPx: 100, heightPx: 50 };
  const withFigure = doc({
    sections: [
      {
        label: null,
        questions: [
          question({
            body: [
              { block_id: "fig", slot: "body", position: 0, block_type: "image", content: { file_path: "fig.png" } },
            ],
          }),
        ],
      },
    ],
  });
  const html = await (await htmlRenderer.renderPaper(withFigure, new Map([["fig", image]]))).text();
  assert.match(html, /src="data:image\/png;base64,/);
});

test("an inline maths image is placed at its natural size in the docx", async () => {
  // Same box as the HTML test: 30x20 must survive into the docx extent, or the
  // maths prints smaller than the text it sits beside.
  const withMath = doc({
    sections: [
      {
        label: null,
        questions: [
          question({
            body: [
              { block_id: "q1-m", slot: "body", position: 0, block_type: "text", content: { text: "Speed $v$ is constant." } },
            ],
          }),
        ],
      },
    ],
  });
  const image = { data: new Uint8Array([137, 80, 78, 71]), mime: "image/png", widthPx: 30, heightPx: 20 };
  const blob = await docxRenderer.renderPaper(withMath, new Map([["q1-m:inline-math:0", image]]));
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const xml = await zip.file("word/document.xml").async("string");
  // docx stores extents in EMU at 9525 per CSS px.
  assert.match(xml, new RegExp(`<wp:extent cx="${30 * 9525}" cy="${20 * 9525}"`));
});
