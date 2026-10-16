// The library modules use bundler-style imports (no file extension, plus a
// KaTeX CSS import), which Node cannot resolve by itself. This hook lets the
// DOCX writer run here so its output can be checked without a browser.
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
// Already installed as a dependency of `docx`; used only to read the generated
// .docx (a zip) back out.
import JSZip from "jszip";

const { buildDocxSolutions } = await import("../src/lib/docx.ts");

const criteria = (items) => ({ block_id: "b1", slot: "marking_criteria", position: 0, block_type: "list", content: { items } });
const question = (id) => ({
  question_id: id,
  source: { name: "Trial Exam", year: 2025 },
  answer: [{ block_id: `${id}-a`, slot: "answer", position: 0, block_type: "text", content: { text: "72" } }],
  solution: [],
  marking_criteria: [criteria(["1 mark: correct formula", "2 marks: correct working"])],
  parts: [],
});

async function documentXml(questions) {
  const blob = await buildDocxSolutions("My Test", [{ label: "Section A", questions }]);
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  return zip.file("word/document.xml").async("string");
}

test("the solutions document holds a Marks/Criteria table, the criteria text and the question id", async () => {
  const xml = await documentXml([question("q1")]);
  assert.match(xml, /Marks/);
  assert.match(xml, /Criteria/);
  assert.match(xml, /correct formula/);
  assert.match(xml, /Question ID: q1/);
});

test("consecutive questions are separated by a rule, a lone question is not", async () => {
  const one = await documentXml([question("q1")]);
  const two = await documentXml([question("q1"), question("q2")]);
  assert.ok(!one.includes("pBdr"), "a single question draws no divider");
  assert.ok(two.includes("pBdr"), "the second question is preceded by a rule");
});
