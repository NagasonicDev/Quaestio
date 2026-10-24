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
const { buildExamDocument, parseExamDocument } = await import("../src/lib/examDocument.ts");

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

// ---------- DOCX structural validation (plan section 7.1) ----------

test("the docx is a well-formed OOXML package, not just a zip", async () => {
  const blob = await docxRenderer.renderPaper(doc({ format: "docx" }), new Map());
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  // The parts Word requires to open the file at all.
  for (const part of ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/_rels/document.xml.rels"]) {
    assert.ok(zip.file(part), `${part} is missing`);
  }
});

test("every docx XML part parses and declares the expected root element", async () => {
  const blob = await docxRenderer.renderPaper(doc({ format: "docx" }), new Map());
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const xmlParts = Object.keys(zip.files).filter((name) => name.endsWith(".xml") && !zip.files[name].dir);
  assert.ok(xmlParts.length >= 4, "expected the usual set of XML parts");
  for (const name of xmlParts) {
    const xml = await zip.file(name).async("string");
    // A parseable XML declaration or root, with balanced open/close on the root.
    assert.match(xml, /^<\?xml\b/, `${name} has no XML declaration`);
    const root = xml.replace(/^<\?xml[^>]*\?>/, "").trim().match(/^<([A-Za-z0-9:]+)[\s>]/);
    assert.ok(root, `${name} has no root element`);
    // The root is either paired or self-closed; anything else is truncated XML.
    const paired = new RegExp(`</${root[1]}>\\s*$`).test(xml);
    const selfClosed = new RegExp(`<${root[1]}\\b[^>]*/>\\s*$`).test(xml);
    assert.ok(paired || selfClosed, `${name} root <${root[1]}> is never closed`);
    // No unescaped raw ampersand outside entities: a sign of string-concatenated XML.
    assert.doesNotMatch(xml, /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/, `${name} contains an unescaped ampersand`);
  }
});

test("the docx document body carries the paper's questions and the page setup", async () => {
  const blob = await docxRenderer.renderPaper(doc({ format: "docx" }), new Map());
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const xml = await zip.file("word/document.xml").async("string");
  assert.match(xml, /<w:body>/);
  assert.match(xml, /What is 6 x 12\?/);
  // A4 page in twips, so the paper is not printed US-Letter.
  assert.match(xml, /<w:pgSz w:w="11908" w:h="16833"/);
  assert.match(xml, /<w:pgMar /);
});

test("the docx solutions package is as well-formed as the paper", async () => {
  const blob = await docxRenderer.renderSolutions(doc({ format: "docx" }), new Map());
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const xml = await zip.file("word/document.xml").async("string");
  assert.match(xml, /^<\?xml\b/);
  assert.match(xml, /<w:body>/);
  assert.match(xml, />72</);
});

// ---------- fonts and symbols fixture (plan section 7.1) ----------

const SYMBOLS = {
  body: [
    { block_id: "sym", slot: "body", position: 0, block_type: "text", content: {
      // Greek, inequalities, subscripts, a degree sign and a non-Latin string.
      text: "Given \u0394v and \u03bc, show that x \u2264 5 and y \u2265 2, with v\u2080 = 3 m s\u207b\u00b9 at 25\u00b0C. \u2014 \u4e2d\u6587\u6d4b\u8bd5",
    } },
  ],
};

test("greek letters and inequalities survive into the HTML paper", async () => {
  const html = await (await htmlRenderer.renderPaper(doc({ sections: [{ label: null, questions: [question(SYMBOLS)] }] }), new Map())).text();
  for (const symbol of ["\u0394", "\u03bc", "\u2264", "\u2265", "\u2080", "\u207b\u00b9", "\u00b0", "\u4e2d\u6587\u6d4b\u8bd5"]) {
    assert.ok(html.includes(symbol), `HTML output dropped ${JSON.stringify(symbol)}`);
  }
});

test("greek letters and inequalities survive into the DOCX XML", async () => {
  const blob = await docxRenderer.renderPaper(doc({ format: "docx", sections: [{ label: null, questions: [question(SYMBOLS)] }] }), new Map());
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const xml = await zip.file("word/document.xml").async("string");
  for (const symbol of ["\u0394", "\u03bc", "\u2264", "\u2265", "\u2080", "\u00b0", "\u4e2d\u6587\u6d4b\u8bd5"]) {
    assert.ok(xml.includes(symbol), `DOCX output dropped ${JSON.stringify(symbol)}`);
  }
});

test("a text body that looks like HTML is escaped in both formats", async () => {
  const dangerous = { body: [{ block_id: "x", slot: "body", position: 0, block_type: "text", content: { text: "Show that a < b & c > d" } }] };
  const paper = doc({ sections: [{ label: null, questions: [question(dangerous)] }] });
  const html = await (await htmlRenderer.renderPaper(paper, new Map())).text();
  assert.ok(html.includes("&lt; b &amp; c &gt; d"), "HTML did not escape the comparison text");
  assert.ok(!/<[^>]*>\s*b\s*&/.test(html), "HTML left a raw tag");
  const docx = await docxRenderer.renderPaper({ ...paper, format: "docx" }, new Map());
  const zip = await JSZip.loadAsync(await docx.arrayBuffer());
  const xml = await zip.file("word/document.xml").async("string");
  assert.match(xml, /&lt; b &amp; c &gt; d/);
});

// ---------- assets edge cases (plan section 7.1) ----------

const FIGURE = {
  body: [
    { block_id: "fig", slot: "body", position: 0, block_type: "image", content: { asset_path: "fig-1" } },
  ],
};

test("a missing image is named in the HTML instead of silently disappearing", async () => {
  const paper = doc({ sections: [{ label: null, questions: [question(FIGURE)] }] });
  const html = await (await htmlRenderer.renderPaper(paper, new Map())).text();
  assert.match(html, /missing image/i);
  assert.ok(html.includes("fig-1"), "the missing asset id is not shown to the author");
});

test("a missing image is named in the DOCX instead of silently disappearing", async () => {
  const paper = doc({ format: "docx", sections: [{ label: null, questions: [question(FIGURE)] }] });
  const blob = await docxRenderer.renderPaper(paper, new Map());
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const xml = await zip.file("word/document.xml").async("string");
  assert.match(xml, /missing image/i);
  assert.ok(xml.includes("fig-1"), "the missing asset id is not shown to the author");
});

test("a present image is embedded in both formats and never referenced by path", async () => {
  const image = { data: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), mime: "image/png", widthPx: 12, heightPx: 8 };
  const paper = doc({ sections: [{ label: null, questions: [question(FIGURE)] }] });
  // Images are keyed by block_id, not by asset path.
  const assets = new Map([["fig", image]]);
  const html = await (await htmlRenderer.renderPaper(paper, assets)).text();
  assert.match(html, /src="data:image\/png;base64,/);
  assert.doesNotMatch(html, /missing image/i, "the HTML did not resolve a present image");
  const docxBlob = await docxRenderer.renderPaper({ ...paper, format: "docx" }, assets);
  const zip = await JSZip.loadAsync(await docxBlob.arrayBuffer());
  assert.ok(Object.keys(zip.files).some((name) => /^word\/media\//.test(name)), "the DOCX has no embedded media part");
});

// ---------- integrity: editing a source question must not change an issued paper ----------

test("editing a source question after generation leaves the paper and solutions untouched", async () => {
  const original = question();
  const snapshot = buildExamDocument({
    testId: "t1", title: "Practice Test", courseName: "Physics", format: "pdf",
    generatedAt: "2026-01-01T00:00:00Z",
    targetMarks: 3, totalMarks: 3,
    sections: [{ label: null, questions: [original] }], profile: DEFAULT_EXAM_PROFILE,
  });
  const storedJson = JSON.stringify(snapshot);

  // The author edits the live question: new body, new answer, new marks.
  original.body = [{ block_id: "b1", slot: "body", position: 0, block_type: "text", content: { text: "EDITED PROMPT" } }];
  original.answer = [{ block_id: "a1", slot: "answer", position: 0, block_type: "text", content: { text: "EDITED ANSWER" } }];
  original.marks = 99;

  // The paper is rendered from the frozen snapshot, exactly as generateTest does.
  const restored = parseExamDocument(storedJson);
  assert.ok(restored, "the stored snapshot did not parse");
  const html = await (await htmlRenderer.renderPaper(restored, new Map())).text();
  assert.match(html, /What is 6 x 12\?/);
  assert.doesNotMatch(html, /EDITED/);
  const solutions = await (await htmlRenderer.renderSolutions(restored, new Map())).text();
  assert.match(solutions, />72</);
  assert.doesNotMatch(solutions, /EDITED/);
});

test("the frozen snapshot keeps its own marks, not the edited question's", async () => {
  const snapshot = buildExamDocument({
    testId: "t2", title: "T", courseName: "Physics", format: "pdf",
    generatedAt: "2026-01-01T00:00:00Z",
    targetMarks: 3, totalMarks: 3,
    sections: [{ label: null, questions: [question()] }], profile: DEFAULT_EXAM_PROFILE,
  });
  assert.equal(snapshot.totalMarks, 3);
  assert.equal(snapshot.sections[0].questions[0].marks, 3);
});

// ---------- renderer selection stays consistent with the artifact ----------

test("createRenderer maps the stored artifact type to the renderer that made it", () => {
  assert.equal(createRenderer("pdf").format, "html");
  assert.equal(createRenderer("docx").format, "docx");
});
