import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// Allow importing TS sources with extensionless relative specifiers.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[a-z]+$/.test(specifier.split("?")[0])) {
      try {
        return nextResolve(`${specifier}.ts`, context);
      } catch {
        // fall through to default resolution
      }
    }
    return nextResolve(specifier, context);
  },
});

const { DEFAULT_EXAM_PROFILE } = await import("../src/lib/examProfile.ts");
const { buildExamDocument, parseExamDocument } = await import("../src/lib/examDocument.ts");

test("default profile carries the NESA/HSC exam policy values", () => {
  assert.equal(DEFAULT_EXAM_PROFILE.id, "nesa-hsc");
  assert.equal(DEFAULT_EXAM_PROFILE.minutesPerMark, 1.8);
  assert.equal(DEFAULT_EXAM_PROFILE.readingTimeMinutes, 10);
  assert.equal(DEFAULT_EXAM_PROFILE.showCentreStudentBox, true);
  assert.ok(DEFAULT_EXAM_PROFILE.coverTitle.includes("HIGHER SCHOOL CERTIFICATE"));
  assert.ok(Array.isArray(DEFAULT_EXAM_PROFILE.generalInstructions));
  assert.ok(DEFAULT_EXAM_PROFILE.generalInstructions.length > 0);
});

test("buildExamDocument freezes the default profile into the snapshot", () => {
  const doc = buildExamDocument({
    testId: "t1",
    title: "Paper",
    format: "pdf",
    generatedAt: "2026-10-20T00:00:00Z",
    targetMarks: 20,
    totalMarks: 20,
    sections: [{ label: "Section I", questions: [] }],
  });
  assert.deepEqual(doc.profile, DEFAULT_EXAM_PROFILE);
  const roundTripped = parseExamDocument(JSON.stringify(doc));
  assert.deepEqual(roundTripped.profile, DEFAULT_EXAM_PROFILE);
});

test("buildExamDocument stores an explicit courseName and profile", () => {
  const profile = { ...DEFAULT_EXAM_PROFILE, minutesPerMark: 2, readingTimeMinutes: 15 };
  const doc = buildExamDocument({
    testId: "t2",
    title: "Paper",
    format: "docx",
    generatedAt: "2026-10-20T00:00:00Z",
    targetMarks: 10,
    totalMarks: 10,
    sections: [{ label: null, questions: [] }],
    courseName: "Physics Adv",
    profile,
  });
  assert.equal(doc.courseName, "Physics Adv");
  assert.deepEqual(doc.profile, profile);
});

test("parseExamDocument accepts Phase 1 snapshots without profile or courseName", () => {
  const legacy = JSON.stringify({
    schemaVersion: 1,
    testId: "t3",
    title: "Old Paper",
    format: "docx",
    generatedAt: "2026-10-01T00:00:00Z",
    seed: 0,
    targetMarks: 20,
    totalMarks: 20,
    sections: [{ label: null, questions: [] }],
    stimuli: [],
    legacy: true,
  });
  const doc = parseExamDocument(legacy);
  assert.ok(doc, "phase 1 snapshot must stay parseable");
  assert.equal(doc.profile, undefined);
  assert.equal(doc.courseName, undefined);
});

test("examLayout honours a custom profile for timing and instructions", async () => {
  const { minutesForMarks, buildExamPaperPlan, generalInstructionsLines } = await import(
    "../src/lib/examLayout.ts"
  );
  assert.equal(minutesForMarks(100), 180);
  const profile = {
    ...DEFAULT_EXAM_PROFILE,
    minutesPerMark: 2,
    readingTimeMinutes: 15,
    generalInstructions: ["Use a pencil for rough work."],
  };
  const plan = buildExamPaperPlan({
    title: "Paper",
    courseName: "Phys",
    achievedMarks: 40,
    sections: [{ label: null, questions: [{ marks: 40 }] }],
    profile,
  });
  assert.equal(plan.readingMinutes, 15);
  assert.equal(plan.workingMinutes, 80);
  assert.equal(plan.sections[0].minutesAllow, 80);
  const lines = generalInstructionsLines(plan, profile);
  assert.ok(lines.includes("Reading time – 15 minutes"));
  assert.ok(lines.includes("Use a pencil for rough work."));
  assert.ok(!lines.includes("Write using black pen"));
});

