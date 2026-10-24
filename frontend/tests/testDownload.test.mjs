// downloadTestFile branches on the stored blob: an HTML artifact is rasterised
// into a real PDF file and downloaded, while DOCX and legacy PDF blobs download
// as-is. Node has no DOM or IndexedDB, so both are stubbed.
import { registerHooks } from "node:module";

let stored = null;

const stubs = {
  "/src/lib/db/indexeddb.ts":
    "export const __set = (blob) => { globalThis.__stored = blob; };\n" +
    "export async function getTestFile() { return globalThis.__stored ?? null; }\n" +
    "export async function putTestFile() {}\n" +
    "export async function deleteTestFiles() {}\n",
  // The rasteriser is DOM-only; this stub records how it was called.
  "/src/lib/htmlToPdf.ts":
    "export async function htmlBlobToPdfBlob(blob) {\n" +
    "  globalThis.__pdfInput = blob;\n" +
    "  return new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], { type: 'application/pdf' });\n" +
    "}\n",
};

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
    for (const [suffix, source] of Object.entries(stubs)) {
      if (url.endsWith(suffix)) return { format: "module", source, shortCircuit: true };
    }
    if (url.endsWith(".css")) return { format: "module", source: "export default {};", shortCircuit: true };
    return next(url, context);
  },
});

import test from "node:test";
import assert from "node:assert/strict";

// Minimal DOM stand-ins: an <a> that records a click. The HTML→PDF rasteriser is
// stubbed out (see above) because it needs a real browser.
const clicks = [];
globalThis.document = {
  createElement(tag) {
    const a = { href: "", download: "", clicked: false, click() { this.clicked = true; clicks.push(this); }, remove() {}, };
    return a;
  },
  body: { appendChild() {} },
};
globalThis.URL.createObjectURL = () => "blob:test";
globalThis.URL.revokeObjectURL = () => {};

const { downloadTestFile } = await import("../src/lib/tests.ts");

test("an HTML artifact is rasterised to a PDF and downloaded as a file", async () => {
  clicks.length = 0;
  globalThis.__stored = new Blob(["<!DOCTYPE html><p>x</p>"], { type: "text/html" });
  globalThis.__pdfInput = null;
  await downloadTestFile("t1", "test", "pdf");
  assert.equal(globalThis.__pdfInput?.type, "text/html", "the rasteriser received the HTML artifact");
  assert.equal(clicks.length, 1, "a download link was clicked");
  assert.equal(clicks[0].download, "test-paper.pdf", "the file is a PDF");
});

test("a DOCX artifact downloads with a .docx filename", async () => {
  clicks.length = 0;
  globalThis.__stored = new Blob([new Uint8Array([0x50, 0x4b])], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  await downloadTestFile("t1", "test", "docx");
  assert.equal(clicks.length, 1, "a download link was clicked");
  assert.equal(clicks[0].download, "test-paper.docx");
});

test("a legacy PDF artifact still downloads as a .pdf", async () => {
  clicks.length = 0;
  globalThis.__stored = new Blob([new Uint8Array([0x25, 0x50])], { type: "application/pdf" });
  await downloadTestFile("t1", "solutions", "pdf");
  assert.equal(clicks.length, 1);
  assert.equal(clicks[0].download, "test-solutions.pdf");
});

test("a SOLUTIONS HTML artifact downloads as test-solutions.pdf", async () => {
  clicks.length = 0;
  globalThis.__stored = new Blob(["<!DOCTYPE html><p>x</p>"], { type: "text/html" });
  await downloadTestFile("t1", "solutions", "pdf");
  assert.equal(clicks.length, 1);
  assert.equal(clicks[0].download, "test-solutions.pdf");
});

test("a missing file is a clear error, not a silent no-op", async () => {
  clicks.length = 0;
  globalThis.__stored = null;
  await assert.rejects(() => downloadTestFile("t1", "test", "pdf"), /no longer available/);
  assert.equal(clicks.length, 0);
});
