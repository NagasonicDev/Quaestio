// The resolvers rasterize equations and figures through the DOM, which Node
// cannot do. This hook swaps those modules for cheap stand-ins so the progress
// bookkeeping (one unit per job, completed never overshooting the total) can be
// checked here.
import { registerHooks } from "node:module";

const stubs = {
  "/src/lib/equations.ts":
    "export async function renderLatexPng() { return { data: new Uint8Array([1]), width: 10, height: 5 }; }\n" +
    "export function equationStats() { return { misses: 0, cached: 0, rasterMs: 0, fontEmbedMs: 0 }; }",
  "/src/lib/functionGraph.ts":
    "export function normalizedFunctionGraph(content) { return content; }\n" +
    "export async function renderFunctionGraphPng() { return { data: new Uint8Array([1]), width: 10, height: 10 }; }",
  "/src/lib/db/indexeddb.ts":
    "export let getAssetCalls = 0;\n" +
    "export async function getAsset(path) { getAssetCalls++; return path === \"present\" ? new Blob([new Uint8Array([1])], { type: \"image/png\" }) : null; }",
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

const { resolveImages, resolveEquations, yieldToUi } = await import("../src/lib/resolvers.ts");

test("a solutions document counts resolved figures, each question, and one pack unit", async () => {
  // The writer yields to the frame clock when reporting; Node has no rAF.
  globalThis.requestAnimationFrame ??= (cb) => setTimeout(() => cb(0), 0);
  const { buildDocxSolutions } = await import("../src/lib/docx.ts");
  const question = {
    question_id: "q1",
    source: { name: "Trial Exam", year: 2025 },
    answer: [{ block_id: "a", slot: "answer", position: 0, block_type: "text", content: { text: "the answer" } }],
    solution: [],
    marking_criteria: [{ block_id: "eq", slot: "marking_criteria", position: 0, block_type: "equation", content: { latex: "x=1", display: false } }],
    parts: [],
  };
  const seen = [];
  await buildDocxSolutions("My Test", [{ label: "Section A", questions: [question] }], (completed, total) => seen.push([completed, total]));
  assert.equal(seen[0][0], 0, "no work is reported before anything is done");
  assert.ok(seen.some(([completed, total]) => completed === 1 && total === 3), "the resolved equation is counted");
  assert.ok(seen.some(([completed, total]) => completed === 2 && total === 3), "the written question is counted");
  assert.ok(seen.slice(0, -1).every(([completed]) => completed < 3), "100% is held back until the file is packed");
  assert.deepEqual(seen[seen.length - 1], [3, 3], "100% means the equation, the question and the pack are all done");
});

test("resolveImages reports one unit per figure and counts an asset it cannot load", async () => {
  const seen = [];
  const blocks = [
    { block_id: "img", block_type: "image", position: 0, content: { asset_path: "missing" } },
    { block_id: "fn", block_type: "function", position: 1, content: {} },
  ];
  await resolveImages(blocks, (completed, total) => seen.push([completed, total]));
  assert.deepEqual(seen[0], [0, 2], "the total counts figures and function graphs up front");
  assert.deepEqual(seen[seen.length - 1], [2, 2], "a skipped asset still counts, so the pass completes");
  assert.deepEqual([...new Set(seen.map(([, total]) => total))], [2], "the total never changes once planned");
});

test("resolveEquations reports one unit per inline and block equation", async () => {
  const seen = [];
  const blocks = [
    { block_id: "txt", block_type: "text", position: 0, content: { text: "use $x=1$ and $y=2$" } },
    { block_id: "eq", block_type: "equation", position: 1, content: { latex: "z=3", display: true } },
  ];
  await resolveEquations(blocks, (completed, total) => seen.push([completed, total]));
  assert.deepEqual(seen[0], [0, 3], "every queued equation counts, including inline math");
  assert.deepEqual(seen[seen.length - 1], [3, 3]);
  const completedValues = seen.map(([completed]) => completed);
  assert.deepEqual(completedValues, [...completedValues].sort((a, b) => a - b), "completed never goes backwards");
});

test("resolveImages reads a shared asset once and remembers a missing one", async () => {
  const idb = await import("../src/lib/db/indexeddb.ts");
  const before = idb.getAssetCalls;
  const blocks = [
    { block_id: "i1", block_type: "image", position: 0, content: { asset_path: "cache-check-missing" } },
    { block_id: "i2", block_type: "image", position: 1, content: { asset_path: "cache-check-missing" } },
  ];
  await resolveImages(blocks, () => {});
  assert.equal(idb.getAssetCalls - before, 1, "the second occurrence reuses the cached lookup");
});

test("yieldToUi settles even when the frame clock stops (background tab)", async () => {
  const saved = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = () => 0; // frames never fire
  try {
    const winner = await Promise.race([
      yieldToUi().then(() => "yielded"),
      new Promise((resolve) => setTimeout(() => resolve("stuck"), 1000)),
    ]);
    assert.equal(winner, "yielded", "the timeout backstop released the yield");
  } finally {
    globalThis.requestAnimationFrame = saved;
  }
});
