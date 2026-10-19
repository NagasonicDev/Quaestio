import test from "node:test";
import assert from "node:assert/strict";
import { latexToPlain, mathExpressions, looksLikeStandaloneLatex, splitRichTokens } from "../src/lib/mathText.ts";

test("mathExpressions recognises every accepted math delimiter", () => {
  assert.deepEqual(mathExpressions("$E = mc^2$"), ["E = mc^2"]);
  assert.deepEqual(mathExpressions("$$E = mc^2$$"), ["E = mc^2"]);
  assert.deepEqual(mathExpressions("\\(E = mc^2\\)"), ["E = mc^2"]);
  assert.deepEqual(mathExpressions("\\[E = mc^2\\]"), ["E = mc^2"]);
});

test("mathExpressions returns an empty list when there is no maths", () => {
  assert.deepEqual(mathExpressions("The motor's torque. (b) About n = 200 turns."), []);
});

test("splitRichTokens keeps plain text and maths spans separate", () => {
  const tokens = splitRichTokens("v = $\\frac{a}{b}$ m/s");
  assert.deepEqual(tokens, [
    { text: "v = " },
    { math: "\\frac{a}{b}" },
    { text: " m/s" },
  ]);
});

test("standalone LaTeX blocks are recognised", () => {
  assert.equal(looksLikeStandaloneLatex("\\tau = 0.20\\,\\mathrm{N\\,m}"), true);
  assert.equal(looksLikeStandaloneLatex("t = \\dfrac{2.5 - 0}{3.5 - 0} = 0.714\\,\\mathrm{s}."), true);
  assert.equal(looksLikeStandaloneLatex("The motor's torque. (b) \\tau = 0.20"), false);
  assert.equal(looksLikeStandaloneLatex("Question 3 heading"), false);
});

test("latexToPlain converts fractions, greek letters, symbols and units", () => {
  assert.equal(latexToPlain("\\dfrac{GM T^{2}}{4\\pi^{2}}"), "(GM T\u00b2)/(4\u03c0\u00b2)");
  assert.equal(latexToPlain("y = ut + \\tfrac{1}{2}at^{2} = 0.5 \\times 9.8 \\times (0.714)^{2} = 2.5\\,\\mathrm{m}"), "y = ut + (1)/(2)at\u00b2 = 0.5 \u00d7 9.8 \u00d7 (0.714)\u00b2 = 2.5 m");
  assert.equal(latexToPlain("\\tau = 1.96 \\times 0.10 = 0.196 \\approx 0.20\\,\\mathrm{N\\,m}"), "\u03c4 = 1.96 \u00d7 0.10 = 0.196 \u2248 0.20 N m");
});
