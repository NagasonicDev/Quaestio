// The library modules use bundler-style imports (no file extension, plus a
// KaTeX CSS import), which Node cannot resolve by itself. This hook lets the
// HTML writer run here so its output can be checked without a browser.
import { registerHooks } from "node:module";
registerHooks({
  resolve(specifier, context, next) {
    if (
      specifier.startsWith(".") &&
      !context.parentURL?.includes("node_modules") &&
      !/\.[cm]?[jt]sx?$/.test(specifier) &&
      !specifier.endsWith(".css") &&
      !specifier.endsWith(".json")
    ) {
      return next(`${specifier}.ts`, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith(".css")) return { format: "module", source: "export default {};", shortCircuit: true };
    return next(url, context);
  },
});

import test from "node:test";
import assert from "node:assert/strict";

const { renderPaperHtml, renderSolutionsHtml } = await import("../src/lib/examHtml.ts");

const png = new Uint8Array([137, 80, 78, 71]);
const image = (blockId, extra = {}) => [
  blockId,
  { data: png, mime: "image/png", widthPx: 400, heightPx: 200, ...extra },
];

function question(over = {}) {
  return {
    question_id: "q1",
    marks: 3,
    body: [{ block_id: "q1-t", slot: "body", position: 0, block_type: "text", content: { text: "Explain the change." } }],
    mcq_options: undefined,
    hint: [],
    answer: [{ block_id: "q1-a", slot: "answer", position: 0, block_type: "text", content: { text: "72" } }],
    solution: [],
    marking_criteria: [{ block_id: "q1-m", slot: "marking_criteria", position: 0, block_type: "list", content: { items: ["1 mark: correct formula"] } }],
    assets: [],
    source: null,
    parts: [],
    ...over,
  };
}

const paper = (sections, extra = {}) =>
  renderPaperHtml({
    title: "Practice Test",
    courseName: "Physics",
    achievedMarks: sections.flatMap((s) => s.questions).reduce((n, q) => n + (q.marks ?? 0), 0),
    sections,
    resolvedImages: new Map(),
    ...extra,
  });

test("a self-contained document: one stylesheet, no scripts, no external asset URLs", () => {
  const html = paper([{ label: null, questions: [question()] }]);
  assert.match(html, /^<!DOCTYPE html>/i);
  assert.equal((html.match(/<style/g) ?? []).length, 1);
  assert.ok(!html.includes("<script"), "no scripts, so the stored page cannot execute anything");
  assert.ok(!/src="https?:/.test(html), "no external asset URLs");
  assert.ok(!/href="https?:/.test(html), "no external stylesheet URLs");
});

test("the cover carries the course, exam structure and general instructions", () => {
  const html = paper([{ label: null, questions: [question()] }]);
  assert.match(html, /HIGHER SCHOOL CERTIFICATE EXAMINATION/);
  assert.match(html, /Physics/);
  assert.match(html, /Examination structure/);
  assert.match(html, /General Instructions/);
  assert.match(html, /Reading time – 10 minutes/);
});

test("each section opens with its marks and allowed time", () => {
  const html = paper([
    { label: null, questions: [question()] },
    { label: "Extended response", questions: [question({ question_id: "q2", marks: 5 })] },
  ]);
  // The cover also lists every section, so the opening headers are the
  // `section-note` lines only.
  const openings = [...html.matchAll(/<p class="section-note">(.*?)<\/p>/g)].map((m) => m[1]);
  assert.deepEqual(openings, [
    "Attempt Question 1",
    "Allow about 5 minutes for this section",
    "Attempt Question 2",
    "Allow about 10 minutes for this section",
  ]);
  assert.match(html, /<h2 class="section-heading">Section I<\/h2>/);
  assert.match(html, /<h2 class="section-heading">Extended response<\/h2>/);
  assert.match(html, /<p class="section-marks">3 marks<\/p>/);
  assert.match(html, /<p class="section-marks">5 marks<\/p>/);
});

test("question numbers are assigned in order and marks sit in a right-hand column", () => {
  const html = paper([{ label: null, questions: [question(), question({ question_id: "q2" })] }]);
  assert.match(html, /Question 1/);
  assert.match(html, /Question 2/);
  assert.match(html, /class="question-marks"[^>]*>3</);
});

test("questions, parts and tables never split across a page", () => {
  const html = paper([{ label: null, questions: [question({ parts: [
    { question_id: "q1a", part_label: "a", marks: 2, body: [], answer: [], solution: [], marking_criteria: [], assets: [], source: null, parts: [] },
  ] })] }]);
  assert.match(html, /\.question \{[^}]*break-inside: avoid/);
  assert.match(html, /\.question-part \{[^}]*break-inside: avoid/);
  assert.match(html, /\.exam-table \{[^}]*break-inside: avoid/);
  assert.match(html, /\(a\)/);
  assert.match(html, /\[2 marks\]/);
});

test("answer lines come from the authored answer_area, two per mark by convention", () => {
  const html = paper([{ label: null, questions: [question({ body: [
    { block_id: "q1-area", slot: "body", position: 0, block_type: "answer_area", content: { lines: 6 } },
  ] })] }]);
  assert.equal((html.match(/class="answer-line"/g) ?? []).length, 6);
});

test("a page_break block becomes a break, and sections after the first start on a new page", () => {
  // Every paper breaks after the cover; only extra breaks are sections/body.
  const one = paper([{ label: null, questions: [question()] }]);
  assert.equal((one.match(/class="page-break"/g) ?? []).length, 1, "a single section adds no section break");
  const two = paper([{ label: null, questions: [question()] }, { label: null, questions: [question({ question_id: "q2" })] }]);
  assert.equal((two.match(/class="page-break"/g) ?? []).length, 2, "the second section starts on a new page");
  const inBody = paper([{ label: null, questions: [question({ body: [
    { block_id: "q1-pb", slot: "body", position: 0, block_type: "page_break", content: {} },
  ] })] }]);
  assert.equal((inBody.match(/class="page-break"/g) ?? []).length, 2);
});

test("a resolved figure is embedded as a data URL and never referenced by path", () => {
  const body = [{ block_id: "q1-fig", slot: "body", position: 0, block_type: "image", content: { asset_path: "fig.png", caption: "A graph" } }];
  const withImage = paper([{ label: null, questions: [question({ body })] }], {
    resolvedImages: new Map([image("q1-fig")]),
  });
  assert.match(withImage, /<img[^>]+src="data:image\/png;base64,/);
  assert.match(withImage, /A graph/);
  const missing = paper([{ label: null, questions: [question({ body })] }]);
  assert.match(missing, /\[missing image: fig\.png\]/);
});

test("maths renders as a resolved image, and falls back to Unicode when it failed", () => {
  const body = [
    { block_id: "q1-eq", slot: "body", position: 0, block_type: "equation", content: { latex: "\\frac{a}{b}", display: true } },
    { block_id: "q1-u", slot: "body", position: 1, block_type: "text", content: { text: "The time $t \\le \\sqrt{2}$ is short." } },
  ];
  const html = paper([{ label: null, questions: [question({ body })] }], {
    resolvedImages: new Map([image("q1-eq")]),
  });
  // The equation image resolved; its LaTeX is never printed.
  assert.ok(!html.includes("frac"));
  // The inline span had no image, so the Unicode fallback renders it.
  assert.match(html, /t ≤ √\(2\)/);
});

test("an inline maths image renders at its natural width, not halved", () => {
  // The rasteriser reports the image's CSS box (pixelRatio-independent), so the
  // img must carry that width. Halving it shrank every equation to ~half size.
  const body = [{ block_id: "q1-m", slot: "body", position: 0, block_type: "text", content: { text: "Speed $v$ is constant." } }];
  const html = paper([{ label: null, questions: [question({ body })] }], {
    resolvedImages: new Map([image("q1-m:inline-math:0", { widthPx: 30, heightPx: 20 })]),
  });
  assert.match(html, /<img class="math-img(?: math-inline-img)?"[^>]*width="30"/);
  assert.match(html, /<img class="math-img(?: math-inline-img)?"[^>]*height="20"/);
});

test("MCQ options are lettered, and the plain paper carries no answer key", () => {
  const mcq = question({
    body: [],
    type_key: "multiple_choice",
    mcq_options: [
      { position: 0, content: [{ block_type: "text", content: { text: "alpha" } }], is_correct: true },
      { position: 1, content: [{ block_type: "text", content: { text: "beta" } }], is_correct: false },
    ],
  });
  const html = paper([{ label: null, questions: [mcq] }]);
  assert.match(html, /A\. alpha/);
  assert.match(html, /B\. beta/);
  assert.ok(!html.includes("Correct answer"), "the paper never shows the key");
});

test("the solutions document marks the MCQ key and prints each question's slots", () => {
  const mcq = question({
    body: [],
    type_key: "multiple_choice",
    mcq_options: [
      { position: 0, content: [{ block_type: "text", content: { text: "alpha" } }], is_correct: false },
      { position: 1, content: [{ block_type: "text", content: { text: "beta" } }], is_correct: true },
    ],
  });
  const html = renderSolutionsHtml("Practice Test", [{ label: "Section A", questions: [mcq] }], new Map());
  assert.match(html, /Solutions and marking guide/);
  assert.match(html, /Correct answer: \(B\)/);
  // The marking guide folds into a Marks/Criteria table with the allocation
  // split from the criterion text.
  assert.match(html, /<th class="align-center"[^>]*>Marks<\/th><th class="align-center"[^>]*>Criteria<\/th>/);
  assert.match(html, /<td class="align-center"[^>]*>1<\/td><td class="align-left"[^>]*>correct formula<\/td>/);
  assert.match(html, /Question ID: q1/);
});

test("a stimulus reference is rendered with its title", () => {
  const html = paper([{ label: null, questions: [question()] }], {
    stimuli: [{
      stimulus: {
        stimulus_id: "s1",
        course_id: "c1",
        title: "Graph",
        created_at: "",
        updated_at: "",
        blocks: [{ block_id: "s1-b", slot: "body", position: 0, block_type: "text", content: { text: "See the graph." } }],
      },
      questionNumbers: [1],
    }],
  });
  assert.match(html, /Stimulus 1: Graph/);
  assert.match(html, /Referenced by Question: 1/);
});

test("text is escaped", () => {
  const html = paper([{ label: null, questions: [question({ body: [
    { block_id: "q1-x", slot: "body", position: 0, block_type: "text", content: { text: "<script>alert(1)</script> & 2 < 3" } },
  ] })] }]);
  assert.ok(!html.includes("<script>alert(1)</script>"));
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; 2 &lt; 3/);
});

test("page numbers and the footer come from native @page rules, not a script", () => {
  // The print engine resolves these, so they must survive as plain CSS.
  const html = paper([{ label: null, questions: [question()] }]);
  assert.match(html, /@page\s*\{[^}]*size:\s*A4/);
  assert.match(html, /@bottom-center\s*\{\s*content:\s*counter\(page\)/);
  assert.match(html, /@bottom-left\s*\{\s*content:\s*"Made with Quaestio"/);
  assert.match(html, /\.page-break\s*\{[^}]*break-before:\s*page/);
});
