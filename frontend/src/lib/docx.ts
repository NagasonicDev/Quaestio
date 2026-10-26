import {
  AlignmentType,
  BorderStyle,
  ShadingType,
  Document,
  Footer,
  ImageRun,
  LevelFormat,
  Packer,
  PageBreak,
  Paragraph,
  Tab,
  TabStopType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  convertInchesToTwip,
  type ParagraphChild,
} from "docx";
import type { ContentBlock, Question } from "../api/types";
import { contentOf, formatMarks, formatSourceBracket, marksLabel, solutionSlots, tableCellText, tableColumnAligns, tableColumnWidths, tableRows } from "./criteria";
import { inlineMathImageId, resolveEquations, resolveImages, yieldToUi, type ResolvedImage } from "./resolvers";
import { latexToPlain, splitRichTokens } from "./mathText";
import { logTiming } from "./timing";
import { DEFAULT_EXAM_PROFILE, type ExamProfile } from "./examProfile";
import {
  EXAM,
  buildExamPaperPlan,
  formatMcOption,
  generalInstructionsLines,
  isMcOptionLine,
  mcqOptionBlocks,
  sectionOpeningLines,
  sectionOverviewLines,
} from "./examLayout";

const GRAY = "6B6B64";
const RULE_COLOR = "999999";

const ptH = (pt: number) => pt * 2;
const inches = (n: number) => convertInchesToTwip(n);
/** A4 */
const PAGE_W_IN = 8.27;
const PAGE_H_IN = 11.69;
const MARGIN_IN = 0.75;
const MARKS_TAB_IN = 7.05;

export interface DocSection {
  label: string | null;
  questions: Question[];
}

export interface DocStimulusItem {
  stimulus: import("../api/types").StimulusWithContent;
  questionNumbers: number[];
}

export interface DocOptions {
  title: string;
  courseName: string;
  achievedMarks: number;
  sections: DocSection[];
  /** Exam policy for the cover and timings; defaults to the NESA HSC profile. */
  profile?: ExamProfile;
  resolvedImages?: Map<string, ResolvedImage>;
  stimuli?: DocStimulusItem[];
  onQuestionProgress?: (completed: number, total: number) => void;
}

function runProps(opts: {
  text: string;
  bold?: boolean;
  italics?: boolean;
  color?: string;
  sizePt?: number;
    font?: string;
}): TextRun {
  return new TextRun({
    text: opts.text,
    bold: opts.bold,
    italics: opts.italics,
    color: opts.color,
    size: opts.sizePt !== undefined ? ptH(opts.sizePt) : ptH(EXAM.font.bodyPt),
    font: { name: opts.font ?? EXAM.font.family },
  });
}

function borderBottom(color = RULE_COLOR, size = 6, space = 1) {
  return { style: BorderStyle.SINGLE, size, space, color };
}

function tableGridBorders() {
  const all = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
  return {
    top: all,
    bottom: all,
    left: all,
    right: all,
    insideHorizontal: all,
    insideVertical: all,
  };
}

function imageRun(img: ResolvedImage): ImageRun {
  const ext = (img.mime.split("/")[1] ?? "png").replace("jpeg", "jpg");
  const type = (ext === "png" || ext === "jpg" || ext === "gif" ? ext : "png") as
    | "png"
    | "jpg"
    | "gif";
  return new ImageRun({
    type,
    data: img.data,
    transformation: { width: img.widthPx, height: img.heightPx },
  });
}

function inlineMathRun(img: ResolvedImage): ImageRun {
  // The math rasterizer uses the body font size, so its natural CSS-pixel box
  // already matches the surrounding Word text. Preserve that size in DOCX.
  return imageRun(img);
}

function inlineRuns(blockId: string, text: string, images: Map<string, ResolvedImage>, index: { value: number }): ParagraphChild[] {
  const children: ParagraphChild[] = [];
  for (const token of splitRichTokens(text)) {
    if ("text" in token) {
      if (token.text) children.push(runProps({ text: token.text }));
      continue;
    }
    const math = images.get(inlineMathImageId(blockId, index.value++));
    // Rendered at MATH_FONT_PX (16px = 12pt at 96dpi), which is the body size,
    // so the natural pixel size lands correctly beside Word's 12pt text.
    if (math) children.push(inlineMathRun(math));
    else children.push(runProps({ text: latexToPlain(token.math) }));
  }
  return children.length ? children : [runProps({ text })];
}

// ---------- block rendering ----------

function blocksOfQuestion(question: Question): ContentBlock[] {
  return question.body;
}

function renderBlock(
  block: ContentBlock,
  opts: { indentIn: number; images: Map<string, ResolvedImage> }
): Array<Paragraph | Table> {
  const { indentIn, images } = opts;
  const out: Array<Paragraph | Table> = [];
  const left = inches(indentIn);
  switch (block.block_type) {
    case "text": {
      const resolvedEq = images.get(block.block_id);
      if (resolvedEq) {
        out.push(new Paragraph({ children: [imageRun(resolvedEq)], alignment: AlignmentType.CENTER }));
        break;
      }
      const text = contentOf(block, "text", "");
      if (typeof text === "string" && text) {
        out.push(
          new Paragraph({ children: inlineRuns(block.block_id, text, images, { value: 0 }), indent: { left } })
        );
      }
      break;
    }
    case "heading": {
      const resolvedEq = images.get(block.block_id);
      if (resolvedEq) {
        out.push(new Paragraph({ children: [imageRun(resolvedEq)], alignment: AlignmentType.CENTER }));
        break;
      }
      const text = contentOf(block, "text", "");
      if (typeof text === "string" && text) {
        out.push(
          new Paragraph({
            children: inlineRuns(block.block_id, text, images, { value: 0 }),
            indent: { left },
          })
        );
      }
      break;
    }
    case "equation": {
      const latex = contentOf(block, "latex", "");
      const display = contentOf(block, "display", true) !== false;
      const resolved = images.get(block.block_id);
      if (resolved) {
        const para = new Paragraph({
          children: [display ? imageRun(resolved) : inlineMathRun(resolved)],
          alignment: display ? AlignmentType.CENTER : AlignmentType.START,
          indent: display ? undefined : { left },
        });
        out.push(para);
      } else {
        out.push(
          new Paragraph({
            children: [
              runProps({
                text: typeof latex === "string" ? latexToPlain(latex) : "",
                font: EXAM.font.family,
                sizePt: 11,
              }),
            ],
            alignment: display ? AlignmentType.CENTER : AlignmentType.START,
            indent: display ? undefined : { left },
          })
        );
      }
      break;
    }
    case "image":
    case "diagram":
    case "graph":
    case "function": {
      const path = contentOf(block, "asset_path");
      const caption = contentOf(block, "caption");
      const resolved = images.get(block.block_id);
      if (!resolved) {
        out.push(
          new Paragraph({
            children: [
              runProps({
                text: block.block_type === "function" ? `y = ${String(contentOf(block, "expression", ""))}` : `[missing image: ${typeof path === "string" ? path : ""}]`,
                italics: true,
              }),
            ],
            spacing: { after: inches(0.18) },
          })
        );
      } else {
        const targetIn = Math.min(4.5, 6.5 - indentIn);
        const maxHeightIn = 4.5;
        const scale = Math.min(
          (targetIn * 96) / resolved.widthPx,
          (maxHeightIn * 96) / resolved.heightPx,
        );
        const widthPx = Math.max(1, Math.round(resolved.widthPx * scale));
        const heightPx = Math.max(1, Math.round(resolved.heightPx * scale));
        const img = { ...resolved, widthPx, heightPx };
        out.push(
          new Paragraph({
            children: [imageRun(img)],
            alignment: AlignmentType.CENTER,
            spacing: caption ? undefined : { after: inches(0.18) },
          })
        );
        if (caption) {
          out.push(
            new Paragraph({
              children: [runProps({ text: caption, italics: true, sizePt: 9, color: GRAY })],
              alignment: AlignmentType.CENTER,
              spacing: { after: inches(0.18) },
            })
          );
        }
      }
      break;
    }
    case "table": {
      const columns: unknown = contentOf(block, "columns", []);
      const rawRows: unknown = contentOf(block, "rows", []);
      if (Array.isArray(columns)) {
        const rows = tableRows(rawRows, columns);
        const widthIn = 6.5 - indentIn;
        const columnWidths = tableColumnWidths(block, widthIn * 96);
        const columnAligns = tableColumnAligns(block);
        const colWidthTwips = columnWidths.map((w) => Math.round(inches(w / 96)));
        const inlineMathIndex = { value: 0 };
        const align = (index: number) =>
          columnAligns[index] === "center"
            ? AlignmentType.CENTER
            : columnAligns[index] === "right"
              ? AlignmentType.RIGHT
              : AlignmentType.LEFT;
        const buildRow = (cells: unknown[], header: boolean): TableRow => {
          const normalized = Array.from({ length: columns.length }, (_, i) => cells[i]);
          const cellChildren = normalized.map((c, i) => {
            const val = tableCellText(c);
            return new TableCell({
              children: [
                new Paragraph({
                  children: inlineRuns(block.block_id, val, images, inlineMathIndex),
                  alignment: header ? AlignmentType.CENTER : align(i),
                }),
              ],
              width: { size: colWidthTwips[i], type: WidthType.DXA },
              margins: { top: 80, bottom: 80, left: 100, right: 100 },
              verticalAlign: "center",
              ...(header ? { shading: { type: ShadingType.CLEAR, color: "auto", fill: "F1F1EE" } } : {}),
            });
          });
          // cantSplit keeps a criteria row whole instead of breaking mid-cell.
          return new TableRow({ children: cellChildren, tableHeader: header, cantSplit: true });
        };
        const headerCells = columns.map(tableCellText);
        const bodyRows = rows.map((r) => r.map(tableCellText));
        out.push(
          new Table({
            alignment: AlignmentType.CENTER,
            borders: tableGridBorders(),
            columnWidths: colWidthTwips,
            width: { size: inches(widthIn), type: WidthType.DXA },
            layout: "fixed",
            rows: [buildRow(headerCells, true), ...bodyRows.map((r) => buildRow(r, false))],
          })
        );
      }
      break;
    }
    case "list": {
      const items: unknown = contentOf(block, "items", []);
      const ordered = contentOf(block, "ordered", false) === true;
      if (Array.isArray(items)) {
        const mc =
          !ordered && items.length > 0 && items.every((it) => isMcOptionLine(String(it ?? "")));
        const inlineMathIndex = { value: 0 };
        for (const item of items) {
          const text = mc ? formatMcOption(String(item ?? "")) : String(item ?? "");
          if (mc) {
            out.push(
              new Paragraph({
                indent: { left: inches(indentIn + 0.35) },
                children: inlineRuns(block.block_id, text, images, inlineMathIndex),
              })
            );
          } else {
            out.push(
              new Paragraph({
                numbering: {
                  reference: ordered ? "listNumber" : "listBullet",
                  level: 0,
                },
                indent: { left: inches(indentIn + 0.25) },
                children: inlineRuns(block.block_id, text, images, inlineMathIndex),
              })
            );
          }
        }
      }
      break;
    }
    case "code": {
      const code = contentOf(block, "code", "");
      const language = contentOf(block, "language");
      const text = typeof code === "string" ? code : "";
      const parts2 = typeof language === "string" && language ? ` (${language})` : "";
      const intro = parts2
        ? new Paragraph({
            children: [
              runProps({
                text: parts2.trim(),
                italics: true,
                sizePt: 8,
                color: GRAY,
              }),
            ],
            indent: { left: inches(indentIn + 0.15) },
          })
        : null;
      if (intro) out.push(intro);
      for (const line of text.split("\n")) {
        out.push(
          new Paragraph({
            children: [runProps({ text: line, font: "Courier New", sizePt: 10 })],
            indent: { left: inches(indentIn + 0.15) },
          })
        );
      }
      break;
    }
    case "answer_area": {
      const lines = Math.max(1, Number(contentOf(block, "lines", 3)) || 1);
      for (let i = 0; i < lines; i++) {
        const p = new Paragraph({
          children: [runProps({ text: "" })],
          spacing: { after: 14 * 20 },
          border: { bottom: borderBottom() },
          indent: { left },
          keepNext: i < lines - 1,
        });
        out.push(p);
      }
      break;
    }
    case "page_break": {
      out.push(new Paragraph({ children: [new PageBreak()] }));
      break;
    }
  }
  return out;
}

function renderBlocks(
  blocks: ContentBlock[],
  opts: { indentIn: number; images: Map<string, ResolvedImage> }
): Array<Paragraph | Table> {
  const sorted = [...blocks].sort((a, b) => a.position - b.position);
  const out: Array<Paragraph | Table> = [];
  for (const b of sorted) out.push(...renderBlock(b, opts));
  return out;
}

function questionHeader(question: Question, counter: { n: number }): Paragraph {
  counter.n += 1;
  const n = counter.n;
  const marks = formatMarks(question.marks);
  const children: ParagraphChild[] = [runProps({ text: `Question ${n}`, bold: true })];
  if (marks) {
    children.push(new Tab());
    children.push(runProps({ text: marks }));
  }
  return new Paragraph({
    children,
    spacing: { before: 14 * 20 },
    keepNext: true,
    tabStops: [
      {
        type: TabStopType.RIGHT,
        position: inches(MARKS_TAB_IN),
      },
    ],
  });
}

function renderQuestion(
  question: Question,
  counter: { n: number },
  images: Map<string, ResolvedImage>
): Array<Paragraph | Table> {
  const out: Array<Paragraph | Table> = [];
  out.push(questionHeader(question, counter));
  const questionBody = question.body;
  out.push(...renderBlocks(questionBody, { indentIn: 0, images }));
  if (question.mcq_options?.length) out.push(...renderBlocks(mcqOptionBlocks(question), { indentIn: 0, images }));
  const renderParts = (parts: Question[], depth = 1) => {
  for (const part of parts) {
    const labelText = part.part_label ?? "";
    const marks = marksLabel(part.marks);
    const headChildren = [
      runProps({
        text: labelText ? `(${labelText})` : "",
        bold: true,
        sizePt: 12,
      }),
    ];
    if (marks) headChildren.push(runProps({ text: `  [${marks}]`, sizePt: 9 }));
    out.push(
      new Paragraph({ children: headChildren, indent: { left: inches(0.3 * depth) }, keepNext: true })
    );
    out.push(...renderBlocks(part.body, { indentIn: 0.3 * depth, images }));
    renderParts(part.parts, depth + 1);
  }
  };
  renderParts(question.parts);
  const src = formatSourceBracket(question.source);
  out.push(new Paragraph({
    children: [runProps({
      text: [src, `Question ID: ${question.question_id}`].filter(Boolean).join(" · "),
      italics: true,
      sizePt: 8,
      color: GRAY,
    })],
  }));
  return out;
}

// ---------- cover ----------

function boxedParagraphs(lines: string[]): Table {
  const cellParas = lines.map((line) =>
    new Paragraph({
      children: [
        runProps({
          text: line,
          bold: line === "General Instructions",
          sizePt: line === "General Instructions" ? EXAM.font.bodyPt : EXAM.font.bodyPt,
        }),
      ],
      spacing: { after: line === "" ? 80 : 40 },
    })
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableGridBorders(),
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children: cellParas,
            margins: { top: 120, bottom: 120, left: 160, right: 160 },
          }),
        ],
      }),
    ],
  });
}

function hscCoverPage(children: Array<Paragraph | Table>, opts: DocOptions): void {
  const plan = buildExamPaperPlan(opts);
  children.push(
    new Paragraph({
      children: [runProps({ text: DEFAULT_EXAM_PROFILE.coverTitle, bold: true })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
    }),
    new Paragraph({
      children: [runProps({ text: plan.subjectLine, bold: true, sizePt: EXAM.font.coverTitlePt })],
      alignment: AlignmentType.CENTER,
    })
  );
  if (plan.paperTitle && plan.paperTitle !== plan.subjectLine) {
    children.push(
      new Paragraph({
        children: [runProps({ text: plan.paperTitle })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      })
    );
  } else {
    children.push(new Paragraph({ spacing: { after: 200 } }));
  }

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: tableGridBorders(),
      rows: [
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({ children: [runProps({ text: "Centre Number", sizePt: EXAM.font.smallPt })] }),
                new Paragraph({ spacing: { after: 240 } }),
                new Paragraph({ children: [runProps({ text: "Student Number", sizePt: EXAM.font.smallPt })] }),
                new Paragraph({ spacing: { after: 240 } }),
                new Paragraph({ children: [runProps({ text: "Candidate Name", sizePt: EXAM.font.smallPt })] }),
                new Paragraph({ spacing: { after: 160 } }),
              ],
              margins: { top: 120, bottom: 120, left: 160, right: 160 },
            }),
          ],
        }),
      ],
    })
  );

  children.push(
    new Paragraph({ spacing: { after: 180 } }),
    boxedParagraphs(generalInstructionsLines(plan)),
    new Paragraph({ spacing: { before: 240 } }),
    new Paragraph({
      children: [runProps({ text: "Examination structure", bold: true })],
      spacing: { after: 80 },
    })
  );

  for (const sec of plan.sections) {
    for (const line of sectionOverviewLines(sec)) {
      children.push(
        new Paragraph({
          children: [runProps({ text: line || " ", sizePt: EXAM.font.bodyPt })],
          indent: line ? { left: inches(0.35) } : undefined,
          spacing: { after: line === "" ? 60 : 40 },
        })
      );
    }
    children.push(new Paragraph({ spacing: { after: 120 } }));
  }

  children.push(
    new Paragraph({
      children: [runProps({ text: plan.examDate, sizePt: EXAM.font.smallPt, color: GRAY })],
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({ children: [new PageBreak()] })
  );
}

function appendSectionHeader(children: Array<Paragraph | Table>, sec: ReturnType<typeof buildExamPaperPlan>["sections"][number]) {
  for (const line of sectionOpeningLines(sec)) {
    if (line === "") {
      children.push(new Paragraph({ spacing: { after: 60 } }));
    } else if (line === sec.title) {
      children.push(
        new Paragraph({
          children: [runProps({ text: line, bold: true, sizePt: EXAM.font.titlePt })],
          spacing: { before: 240, after: 80 },
          keepNext: true,
        })
      );
      children.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "777777", space: 1 } }, spacing: { after: 100 } }));
    } else if (line.endsWith(" marks")) {
      children.push(new Paragraph({ children: [runProps({ text: line, bold: true })], spacing: { after: 80 } }));
    } else {
      children.push(new Paragraph({ children: [runProps({ text: line })], spacing: { after: 60 } }));
      if (line.startsWith("Allow about ")) children.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "777777", space: 1 } }, spacing: { after: 100 } }));
    }
  }
}

function pack(children: Array<Paragraph | Table>): Promise<Blob> {
  const numbering = {
    config: [
      {
        reference: "listNumber",
        levels: [
          {
            level: 0,
            format: LevelFormat.DECIMAL,
            text: "%1.",
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: inches(0.5) } } },
          },
        ],
      },
      {
        reference: "listBullet",
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: "\u2022",
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: inches(0.5) } } },
          },
        ],
      },
    ],
  };
  const doc = new Document({
    numbering,
    styles: {
      default: {
        document: {
          run: { font: EXAM.font.family, size: ptH(EXAM.font.bodyPt) },
        },
      },
    },
    sections: [
      {
        footers: {
          default: new Footer({
            children: [new Paragraph({
              children: [runProps({ text: "Made with Quaestio", sizePt: EXAM.font.smallPt, color: GRAY })],
              alignment: AlignmentType.CENTER,
            })],
          }),
        },
        properties: {
          page: {
            size: { width: inches(PAGE_W_IN), height: inches(PAGE_H_IN) },
            margin: {
              top: inches(MARGIN_IN),
              bottom: inches(MARGIN_IN),
              left: inches(MARGIN_IN),
              right: inches(MARGIN_IN),
            },
          },
        },
        children,
      },
    ],
  });
  return Packer.toBlob(doc);
}

// ---------- public builders ----------

export async function collectImages(
  sections: DocSection[],
  stimuli: DocStimulusItem[] = []
): Promise<Map<string, ResolvedImage>> {
  const blocks: ContentBlock[] = [];
  for (const sec of sections) {
    for (const q of sec.questions) {
      blocks.push(...blocksOfQuestion(q));
      if (q.mcq_options?.length) blocks.push(...mcqOptionBlocks(q));
      const collectParts = (parts: Question[]) => { for (const part of parts) {
        blocks.push(...blocksOfQuestion(part));
        collectParts(part.parts);
      } };
      collectParts(q.parts);
    }
  }
  for (const item of stimuli) blocks.push(...item.stimulus.blocks);
  const [images, equations] = await Promise.all([resolveImages(blocks), resolveEquations(blocks)]);
  for (const [id, img] of equations) images.set(id, img);
  return images;
}

function renderStimulusSection(stimuli: DocStimulusItem[], images: Map<string, ResolvedImage>): Array<Paragraph | Table> {
  const children: Array<Paragraph | Table> = [];
  if (!stimuli?.length) return children;
  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(
    new Paragraph({
      children: [runProps({ text: "Stimulus Material", bold: true, sizePt: EXAM.font.titlePt })],
      spacing: { before: 240, after: 80 },
    })
  );
  children.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "777777", space: 1 } }, spacing: { after: 100 } }));
  for (let i = 0; i < stimuli.length; i++) {
    const item = stimuli[i];
    const label = item.stimulus.title ? `Stimulus ${i + 1}: ${item.stimulus.title}` : `Stimulus ${i + 1}`;
    const refs = item.questionNumbers.length
      ? ` (Referenced by Question${item.questionNumbers.length > 1 ? "s" : ""}: ${item.questionNumbers.join(", ")})`
      : "";
    children.push(
      new Paragraph({
        children: [runProps({ text: `${label}${refs}`, bold: true })],
        spacing: { before: 160, after: 60 },
      })
    );
    children.push(...renderBlocks(item.stimulus.blocks, { indentIn: 0, images }));
    if (i < stimuli.length - 1) {
      children.push(new Paragraph({ spacing: { after: 80 } }));
      children.push(new Paragraph({ border: { bottom: borderBottom("DDDDDD") }, spacing: { after: 80 } }));
    }
  }
  children.push(
    new Paragraph({
      children: [runProps({ text: "End of Stimulus Material", bold: true })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 8 * 20, after: 8 * 20 },
    })
  );
  return children;
}

export async function buildDocxPaper(opts: DocOptions): Promise<Blob> {
  const images = opts.resolvedImages ?? await collectImages(opts.sections, opts.stimuli);
  const plan = buildExamPaperPlan(opts);
  const children: Array<Paragraph | Table> = [];
  hscCoverPage(children, opts);
  const counter = { n: 0 };
  let planIdx = 0;
  const totalQuestions = opts.sections.reduce((sum, item) => sum + item.questions.length, 0);
  for (const sec of opts.sections) {
    if (!sec.questions.length) continue;
    const secPlan = plan.sections[planIdx++];
    if (!secPlan) continue;
    if (planIdx > 1) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }
    appendSectionHeader(children, secPlan);
    for (const q of sec.questions) {
      children.push(...renderQuestion(q, counter, images));
      if (opts.onQuestionProgress) {
        opts.onQuestionProgress(counter.n, totalQuestions);
        await yieldToUi();
      }
    }
    const isFinalSection = planIdx === plan.sections.length;
    children.push(
      new Paragraph({
        children: [runProps({ text: isFinalSection ? "End of Exam" : `End of ${secPlan.title}`, bold: true })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 8 * 20, after: 8 * 20 },
      })
    );
  }
  children.push(...renderStimulusSection(opts.stimuli ?? [], images));
  return pack(children);
}

/** Build a separate answer and marking guide for a previously generated paper. */
export async function buildDocxSolutions(title: string, sections: DocSection[], onProgress?: (completed: number, total: number) => void): Promise<Blob> {
  // Resolve every question's figures and equations in one shared pass: the
  // per-question write loop below only paints, so image work stays parallel.
  const questions = sections.flatMap((section) => section.questions);
  const slotsByQuestion = new Map(questions.map((q) => [q, solutionSlots(q)] as const));
  const solutionBlocks = questions.flatMap((q) => (slotsByQuestion.get(q) ?? []).flatMap((slot) => slot.blocks));
  // Progress counts real work: each resolved figure/equation, then each written
  // question, plus one unit held back until the .docx is actually packed.
  const resolveTotals = [0, 0];
  const resolveDone = [0, 0];
  let questionsDone = 0;
  const totalWork = () => resolveTotals[0] + resolveTotals[1] + questions.length + 1;
  const report = () => onProgress?.(resolveDone[0] + resolveDone[1] + questionsDone, totalWork());
  const track = (i: number) => (completed: number, total: number) => {
    resolveTotals[i] = total;
    resolveDone[i] = completed;
    report();
  };
  const resolveStart = performance.now();
  const [images, equations] = await Promise.all([resolveImages(solutionBlocks, track(0)), resolveEquations(solutionBlocks, track(1))]);
  logTiming("solutions:resolve", resolveStart, `${resolveTotals[0]} figures, ${resolveTotals[1]} equations`);
  for (const [id, image] of equations) images.set(id, image);
  const children: Array<Paragraph | Table> = [
    new Paragraph({ children: [runProps({ text: title, bold: true, sizePt: 20 })], alignment: AlignmentType.CENTER }),
    new Paragraph({ children: [runProps({ text: "Solutions and marking guide", bold: true, sizePt: 14 })], alignment: AlignmentType.CENTER, spacing: { after: 240 } }),
  ];
  const appendSlot = (slot: { label: string; blocks: ContentBlock[]; heading?: string; sub?: boolean }) => {
    if (!slot.blocks.length) return;
    if (slot.heading) {
      children.push(new Paragraph({ children: [runProps({ text: slot.heading, bold: true, sizePt: slot.sub ? 12 : 13 })], spacing: { before: 280, after: 80 } }));
    }
    children.push(new Paragraph({ children: [runProps({ text: slot.label, bold: !slot.sub, sizePt: 11 })], spacing: { before: slot.sub ? 120 : 240, after: 80 } }));
    children.push(...renderBlocks(slot.blocks, { indentIn: slot.sub ? 0.25 : 0, images }));
  };
  const divider = () => children.push(new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE_COLOR, space: 1 } },
    spacing: { before: 140, after: 180 },
  }));
  let number = 0;
  let sectionCount = 0;
  const writeStart = performance.now();
  for (const section of sections) {
    if (section.label) {
      children.push(new Paragraph({ children: [runProps({ text: section.label, bold: true, sizePt: 15 })], spacing: { before: 360, after: 120 }, pageBreakBefore: sectionCount > 0, keepNext: true }));
      sectionCount++;
    }
    for (const q of section.questions) {
      number++;
      if (number > 1) divider();
      children.push(new Paragraph({ children: [runProps({ text: `Question ${number}${q.marks != null ? ` (${formatMarks(q.marks)})` : ""}`, bold: true, sizePt: 13 })], spacing: { after: 60 }, keepNext: true }));
      const src = [formatSourceBracket(q.source), `Question ID: ${q.question_id}`].filter(Boolean).join(" · ");
      if (src) children.push(new Paragraph({ children: [runProps({ text: src, italics: true, sizePt: 8, color: GRAY })], spacing: { after: 100 } }));
      for (const slot of slotsByQuestion.get(q) ?? []) appendSlot(slot);
      questionsDone++;
      report();
      if (onProgress) await yieldToUi();
    }
  }
  logTiming("solutions:write", writeStart, `${questions.length} questions`);
  const packStart = performance.now();
  const blob = await pack(children);
  logTiming("solutions:pack", packStart);
  onProgress?.(totalWork(), totalWork());
  return blob;
}

