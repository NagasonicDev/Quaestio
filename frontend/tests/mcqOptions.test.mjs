import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

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

const { mcqOptionBlocks } = await import("../src/lib/examLayout.ts");

function question(mcq_options) {
  return { question_id: "q1", body: [], parts: [], mcq_options };
}

test("text-only options keep the single flat list block", () => {
  const blocks = mcqOptionBlocks(question([
    { content: [{ block_type: "text", content: { text: "alpha" } }] },
    { content: [{ block_type: "text", content: { text: "beta" } }] },
  ]));
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].block_type, "list");
  assert.deepEqual(blocks[0].content.items, ["(A) alpha", "(B) beta"]);
});

test("an option carrying an image renders every option as labelled blocks", () => {
  const blocks = mcqOptionBlocks(question([
    { content: [{ block_type: "text", content: { text: "alpha" } }] },
    { content: [{ block_type: "image", content: { asset_path: "fig.png" } }] },
  ]));
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].block_type, "text");
  assert.equal(blocks[0].content.text, "(A) alpha");
  assert.equal(blocks[0].block_id, "q1-mcq-0-0");
  assert.equal(blocks[1].block_type, "text");
  assert.equal(blocks[1].content.text, "(B)");
  assert.equal(blocks[2].block_type, "image");
  assert.equal(blocks[2].content.asset_path, "fig.png");
  assert.equal(blocks[2].block_id, "q1-mcq-1-1");
});

test("an option leading with an image gets a standalone label block", () => {
  const blocks = mcqOptionBlocks(question([
    { content: [{ block_type: "graph", content: { asset_path: "g.png" } }] },
  ]));
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].block_type, "text");
  assert.equal(blocks[0].content.text, "(A)");
  assert.equal(blocks[1].block_type, "graph");
});

test("no options yields no blocks", () => {
  assert.deepEqual(mcqOptionBlocks(question([])), []);
});