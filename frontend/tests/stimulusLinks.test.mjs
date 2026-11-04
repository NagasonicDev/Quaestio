import test from "node:test";
import assert from "node:assert/strict";
import { resolveStimulusLinks } from "../src/lib/stimulus.ts";

test("maps authored ids, skips unknown ids and collapses duplicates", () => {
  const questions = new Map([["authored-q", "claimed-q"]]);
  const stimuli = new Map([["authored-s", "claimed-s"]]);
  assert.deepEqual(
    resolveStimulusLinks([
      { question_id: "authored-q", stimulus_id: "authored-s" },
      { question_id: "authored-q", stimulus_id: "authored-s" },
      { question_id: "missing-q", stimulus_id: "authored-s" },
      { question_id: "authored-q", stimulus_id: "missing-s" },
    ], questions, stimuli),
    { links: [["claimed-q", "claimed-s"]], skipped: 2 }
  );
  assert.deepEqual(resolveStimulusLinks(undefined, questions, stimuli), { links: [], skipped: 0 });
});

test("treats blank and missing authored ids as unknown", () => {
  const questions = new Map([["q", "claimed-q"]]);
  const stimuli = new Map([["s", "claimed-s"]]);
  assert.deepEqual(
    resolveStimulusLinks([
      { question_id: "   ", stimulus_id: "s" },
      { question_id: "q", stimulus_id: "   " },
      { question_id: "", stimulus_id: "s" },
      { stimulus_id: "s" },
      { question_id: "q" },
      {},
    ], questions, stimuli),
    { links: [], skipped: 6 }
  );
});

test("matches authored ids after trimming whitespace", () => {
  const questions = new Map([["authored-q", "claimed-q"]]);
  const stimuli = new Map([["authored-s", "claimed-s"]]);
  assert.deepEqual(
    resolveStimulusLinks([
      { question_id: " authored-q ", stimulus_id: " authored-s\n" },
    ], questions, stimuli),
    { links: [["claimed-q", "claimed-s"]], skipped: 0 }
  );
});

test("tolerates non-array links", () => {
  const questions = new Map([["authored-q", "claimed-q"]]);
  const stimuli = new Map([["authored-s", "claimed-s"]]);
  for (const links of [null, undefined, {}, "authored-q", 3, true]) {
    assert.deepEqual(resolveStimulusLinks(links, questions, stimuli), { links: [], skipped: 0 });
  }
});
