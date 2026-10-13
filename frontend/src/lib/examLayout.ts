import type { ContentBlock, Question } from "../api/types";
import type { DocSection } from "./docx";

/** Shared HSC-style examination paper layout (NESA conventions). */
export const EXAM = {
  /** A4 */
  page: { widthPt: 595.28, heightPt: 841.89 },
  margin: { top: 56.7, bottom: 62, left: 56.7, right: 56.7, marks: 32 },
  font: {
    family: "Times New Roman",
    bodyPt: 12,
    smallPt: 10,
    titlePt: 14,
    coverTitlePt: 16,
    lineHeight: 1.35,
  },
  /** ~1.8 min/mark for a 100-mark, 3-hour paper */
  minutesPerMark: 1.8,
  defaultReadingMinutes: 10,
  certificateLine: "HIGHER SCHOOL CERTIFICATE EXAMINATION",
} as const;

export interface ExamSectionPlan {
  /** Display title, e.g. "Section I" or a custom section name */
  title: string;
  marks: number;
  questionStart: number;
  questionEnd: number;
  minutesAllow: number;
  questionCount: number;
}

export interface ExamPaperPlan {
  subjectLine: string;
  paperTitle: string;
  totalMarks: number;
  totalQuestions: number;
  readingMinutes: number;
  workingMinutes: number;
  examDate: string;
  sections: ExamSectionPlan[];
}

function toRoman(n: number): string {
  const vals = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ] as const;
  let x = n;
  let out = "";
  for (const [v, s] of vals) {
    while (x >= v) {
      out += s;
      x -= v;
    }
  }
  return out || String(n);
}

export function defaultSectionTitle(index: number, custom: string | null): string {
  if (custom?.trim()) return custom.trim();
  return `Section ${toRoman(index + 1)}`;
}

/** Round section working time to a sensible whole number of minutes. */
export function minutesForMarks(marks: number): number {
  if (marks <= 0) return 0;
  const raw = marks * EXAM.minutesPerMark;
  if (raw < 15) return Math.max(5, Math.round(raw / 5) * 5);
  return Math.round(raw / 5) * 5;
}

export function formatDurationMinutes(totalMinutes: number): string {
  if (totalMinutes < 60) return `${totalMinutes} minutes`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (m === 0) return h === 1 ? "1 hour" : `${h} hours`;
  const hourPart = h === 1 ? "1 hour" : `${h} hours`;
  return `${hourPart} and ${m} minutes`;
}

export function formatPageNumber(page: number): string {
  return `– ${page} –`;
}

export function formatQuestionRange(start: number, end: number): string {
  if (start === end) return `Question ${start}`;
  return `Questions ${start}–${end}`;
}

export function buildExamPaperPlan(opts: {
  title: string;
  courseName: string;
  achievedMarks: number;
  sections: DocSection[];
  examDate?: Date;
}): ExamPaperPlan {
  const examDate =
    opts.examDate ??
    new Date();
  const dateStr = examDate.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const sections: ExamSectionPlan[] = [];
  let qn = 0;
  for (let i = 0; i < opts.sections.length; i++) {
    const sec = opts.sections[i];
    const count = sec.questions.length;
    if (count === 0) continue;
    const start = qn + 1;
    qn += count;
    const end = qn;
    const marks = sec.questions.reduce((s, q) => s + (q.marks ?? 0), 0);
    sections.push({
      title: defaultSectionTitle(i, sec.label),
      marks: Math.round(marks * 100) / 100,
      questionStart: start,
      questionEnd: end,
      questionCount: count,
      minutesAllow: minutesForMarks(marks),
    });
  }

  const totalQuestions = qn;
  const totalMarks = opts.achievedMarks;
  const workingMinutes = minutesForMarks(totalMarks);

  return {
    subjectLine: opts.courseName,
    paperTitle: opts.title,
    totalMarks,
    totalQuestions,
    readingMinutes: EXAM.defaultReadingMinutes,
    workingMinutes,
    examDate: dateStr,
    sections,
  };
}

export function generalInstructionsLines(plan: ExamPaperPlan): string[] {
  return [
    "General Instructions",
    "",
    `Reading time – ${plan.readingMinutes} minutes`,
    `Working time – ${formatDurationMinutes(plan.workingMinutes)}`,
    "Write using black pen",
    "Draw diagrams using pencil",
    "Approved calculators may be used unless stated otherwise",
    `Total marks – ${plan.totalMarks}`,
  ];
}

export function sectionOverviewLines(sec: ExamSectionPlan): string[] {
  const lines = [
    `${sec.title} – ${sec.marks} marks`,
    "",
    `Attempt ${formatQuestionRange(sec.questionStart, sec.questionEnd)}`,
    `Allow about ${formatDurationMinutes(sec.minutesAllow)} for this section`,
  ];
  return lines;
}

export function sectionOpeningLines(sec: ExamSectionPlan): string[] {
  return [
    sec.title,
    `${sec.marks} marks`,
    "",
    `Attempt ${formatQuestionRange(sec.questionStart, sec.questionEnd)}`,
    `Allow about ${formatDurationMinutes(sec.minutesAllow)} for this section`,
  ];
}

/** Detect multiple-choice option lines like "(A) …" for HSC-style lettering. */
export function isMcOptionLine(text: string): boolean {
  return /^\([A-Da-d]\)\s/.test(text.trim());
}

export function formatMcOption(text: string): string {
  const t = text.trim();
  const m = t.match(/^\(([A-Da-d])\)\s*(.*)$/);
  if (!m) return t;
  return `${m[1].toUpperCase()}. ${m[2]}`;
}

/**
 * Blocks that render a question's MCQ options for the paper builders.
 *
 * Options that are text/equation only keep the historical flat list block
 * (`(A) text`, "A. text" via formatMcOption). As soon as any option carries
 * an image/diagram/graph/function/table, the old flatten dropped it (those
 * blocks have no `text`/`latex`), so instead emit each option as a labelled
 * sequence of its real content blocks. Deterministic block_ids let the image
 * resolvers key and render each option's figures.
 */
export function mcqOptionBlocks(question: Question): ContentBlock[] {
  const options = question.mcq_options ?? [];
  if (!options.length) return [];
  const allTextual = options.every((option) =>
    (option.content ?? []).every((b) => b.block_type === "text" || b.block_type === "equation")
  );
  if (allTextual) {
    return [{
      block_id: `${question.question_id}-mcq-options`,
      slot: "body",
      position: question.body.length,
      block_type: "list",
      content: {
        ordered: false,
        items: options.map((option, i) =>
          `(${String.fromCharCode(65 + i)}) ${(option.content ?? []).map((b) => {
            const latex = b.content?.latex;
            // Equations are stored as latex; wrap so the exporters' inline math
            // parser renders them instead of printing raw `x^2`.
            if (b.block_type === "equation" && typeof latex === "string") return `$${latex}$`;
            return String(b.content?.text ?? latex ?? "");
          }).join(" ")}`
        ),
      },
    }];
  }
  const blocks: ContentBlock[] = [];
  options.forEach((option, i) => {
    const id = (j: number) => `${question.question_id}-mcq-${i}-${j}`;
    const content = option.content ?? [];
    if (!content.length) return;
    const label = `(${String.fromCharCode(65 + i)})`;
    const first = content[0];
    if (first.block_type === "text") {
      blocks.push({
        block_id: id(0), slot: "body", position: i * 100,
        block_type: "text",
        content: { ...(first.content ?? {}), text: `${label} ${String(first.content.text ?? "")}` },
      });
    } else {
      blocks.push({ block_id: id(0), slot: "body", position: i * 100, block_type: "text", content: { text: label } });
      blocks.push({
        block_id: id(1), slot: "body", position: i * 100 + 1,
        block_type: first.block_type, content: first.content ?? {},
      });
    }
    for (let j = 1; j < content.length; j++) {
      blocks.push({
        block_id: id(j + 1), slot: "body", position: i * 100 + j + 1,
        block_type: content[j].block_type, content: content[j].content ?? {},
      });
    }
  });
  return blocks;
}
