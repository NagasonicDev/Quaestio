/**
 * Exam policy and wording for the printed form (NESA/HSC by default).
 *
 * Kept free of layout decisions (fonts, margins, page size) — those stay with
 * each renderer. Stored in the ExamDocument snapshot so a paper re-rendered
 * later uses the profile it was issued under, even if defaults change.
 */
export interface ExamProfile {
  id: "nesa-hsc";
  coverTitle: string;
  readingTimeMinutes: number;
  minutesPerMark: number;
  /** Static lines shown under the dynamic reading/working/marks lines. */
  generalInstructions: string[];
  showCentreStudentBox: boolean;
}

/** ~1.8 min/mark for a 100-mark, 3-hour paper */
export const DEFAULT_EXAM_PROFILE: ExamProfile = {
  id: "nesa-hsc",
  coverTitle: "HIGHER SCHOOL CERTIFICATE EXAMINATION",
  readingTimeMinutes: 10,
  minutesPerMark: 1.8,
  generalInstructions: [
    "Write using black pen",
    "Draw diagrams using pencil",
    "Approved calculators may be used unless stated otherwise",
  ],
  showCentreStudentBox: true,
};
