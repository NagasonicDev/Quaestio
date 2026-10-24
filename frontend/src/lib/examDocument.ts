import type { Question, StimulusWithContent } from "../api/types";
import { DEFAULT_EXAM_PROFILE, type ExamProfile } from "./examProfile";

/**
 * A frozen snapshot of an issued exam paper: the questions exactly as selected
 * and ordered at generation time, so papers and solutions built later never
 * diverge from what students sat. Contains no layout decisions.
 */
export interface ExamDocument {
  schemaVersion: 1;
  testId: string;
  title: string;
  /** Subject/course display line for the cover page. */
  courseName?: string;
  format: string;
  generatedAt: string;
  /** Seeded selection randomness; 0 until selection is reproducible. */
  seed: number;
  /** Exam policy used when issued; absent only in pre-profile snapshots. */
  profile?: ExamProfile;
  targetMarks: number;
  totalMarks: number;
  sections: ExamSectionSnapshot[];
  stimuli: ExamStimulusSnapshot[];
  /** Built from current data after issuance (pre-snapshot legacy test). */
  legacy?: boolean;
}

export interface ExamSectionSnapshot {
  label: string | null;
  questions: Question[];
}

export interface ExamStimulusSnapshot {
  stimulus: StimulusWithContent;
  questionNumbers: number[];
}

export interface ExamDocumentInput {
  testId: string;
  title: string;
  courseName?: string;
  format: string;
  generatedAt: string;
  targetMarks: number;
  totalMarks: number;
  sections: ExamSectionSnapshot[];
  stimuli?: ExamStimulusSnapshot[];
  seed?: number;
  profile?: ExamProfile;
  legacy?: boolean;
}

export function buildExamDocument(input: ExamDocumentInput): ExamDocument {
  const doc: ExamDocument = {
    schemaVersion: 1,
    testId: input.testId,
    title: input.title,
    format: input.format,
    generatedAt: input.generatedAt,
    seed: input.seed ?? 0,
    profile: input.profile ?? DEFAULT_EXAM_PROFILE,
    targetMarks: input.targetMarks,
    totalMarks: input.totalMarks,
    sections: input.sections.map((section) => ({ label: section.label, questions: [...section.questions] })),
    stimuli: input.stimuli ?? [],
  };
  if (input.courseName) doc.courseName = input.courseName;
  if (input.legacy) doc.legacy = true;
  return doc;
}

/** Parses stored snapshot JSON; null for missing, malformed or unknown versions. */
export function parseExamDocument(json: string | null | undefined): ExamDocument | null {
  if (!json) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const doc = parsed as Partial<ExamDocument>;
  if (doc.schemaVersion !== 1 || !Array.isArray(doc.sections)) return null;
  // A truncated snapshot must fall back to the legacy rebuild rather than
  // crash a renderer that iterates section.questions.
  const sectionsOk = doc.sections.every((section) => {
    if (!section || typeof section !== "object") return false;
    const questions = (section as { questions?: unknown }).questions;
    return Array.isArray(questions) && questions.every((q) => Boolean(q) && typeof q === "object");
  });
  if (!sectionsOk) return null;
  return doc as ExamDocument;
}
