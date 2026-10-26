import type { ContentBlock, Question } from "../api/types";
import {
  contentOf,
  formatMarks,
  formatSourceBracket,
  marksLabel,
  solutionSlots,
  tableCellText,
  tableColumnAligns,
  tableColumnWidths,
  tableRows,
  type SolutionSlot,
} from "./criteria";
import {
  EXAM,
  buildExamPaperPlan,
  formatMcOption,
  generalInstructionsLines,
  isMcOptionLine,
  mcqOptionBlocks,
  sectionOpeningLines,
  sectionOverviewLines,
  type ExamSectionPlan,
} from "./examLayout";
import type { DocOptions, DocSection, DocStimulusItem } from "./docx";
import { DEFAULT_EXAM_PROFILE, type ExamProfile } from "./examProfile";
import { latexToPlain, splitRichTokens } from "./mathText";
import { inlineMathImageId, type ResolvedImage } from "./resolvers";

/**
 * Plain HTML rendering of an examination paper and its solutions.
 *
 * The output is one self-contained document: inline stylesheet, images as data
 * URLs, no scripts and no external references, so it can be stored and shown
 * as-is in the preview iframe. Pagination is left to the print engine (and
 * Paged.js, when the app loads it), which is why page counters and the footer
 * appear only once the document is paged.
 *
 * Pure by design: no DOM, no storage, no randomness.
 */

const esc = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const pt = (value: number): string => `${Number(value.toFixed(2))}pt`;

function toBase64(data: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < data.length; i += chunk) {
    binary += String.fromCharCode(...data.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function dataUrl(image: ResolvedImage): string {
  return `data:${image.mime};base64,${toBase64(image.data)}`;
}

/** The kind of content a block/asset is keyed by, for missing-image messages. */
type ImageKind = "figure" | "graph" | "math" | "math-inline";

function imageHtml(image: ResolvedImage, kind: ImageKind = "figure"): string {
  // widthPx/heightPx are the rasteriser's CSS box (pixelRatio-independent), so
  // an inline maths image is placed at its natural size to sit beside the text.
  const scale = kind === "math-inline" ? 0.9 : 1;
  const width = kind === "math" || kind === "math-inline" ? image.widthPx * scale : Math.min(image.widthPx, 640);
  const cls = kind === "math" || kind === "math-inline" ? `math-img${kind === "math-inline" ? " math-inline-img" : ""}` : "figure-img";
  return `<img class="${cls}" src="${dataUrl(image)}" width="${Math.max(1, Math.round(width))}" height="${Math.max(1, Math.round(image.heightPx * (width / image.widthPx)))}" alt="">`;
}

// ---------- inline runs ----------

function inlineHtml(
  blockId: string,
  text: string,
  images: Map<string, ResolvedImage>,
  index: { value: number }
): string {
  const parts: string[] = [];
  for (const token of splitRichTokens(text)) {
    if ("text" in token) {
      if (token.text) parts.push(esc(token.text));
      continue;
    }
    const math = images.get(inlineMathImageId(blockId, index.value++));
    parts.push(math ? imageHtml(math, "math-inline") : esc(latexToPlain(token.math)));
  }
  return parts.length ? parts.join("") : esc(text);
}

// ---------- block rendering ----------

function renderBlock(block: ContentBlock, images: Map<string, ResolvedImage>, indent: number): string {
  const style = indent ? ` style="margin-left:${indent}in"` : "";
  switch (block.block_type) {
    case "text":
    case "heading": {
      const resolved = images.get(block.block_id);
      if (resolved) return `<p class="figure">${imageHtml(resolved)}</p>`;
      const text = contentOf(block, "text", "");
      if (typeof text !== "string" || !text) return "";
      const cls = block.block_type === "heading" ? "block-heading" : "block-text";
      return `<p class="${cls}"${style}>${inlineHtml(block.block_id, text, images, { value: 0 })}</p>`;
    }
    case "equation": {
      const latex = contentOf(block, "latex", "");
      const display = contentOf(block, "display", true) !== false;
      const resolved = images.get(block.block_id);
      const body = resolved
        ? imageHtml(resolved, display ? "math" : "math-inline")
        : esc(typeof latex === "string" ? latexToPlain(latex) : "");
      return `<p class="${display ? "equation-display" : "equation-inline"}"${display ? "" : style}>${body}</p>`;
    }
    case "image":
    case "diagram":
    case "graph":
    case "function": {
      const resolved = images.get(block.block_id);
      const caption = contentOf(block, "caption");
      if (!resolved) {
        const missing = block.block_type === "function"
          ? `y = ${String(contentOf(block, "expression", ""))}`
          : `[missing image: ${String(contentOf(block, "asset_path", ""))}]`;
        return `<p class="missing-figure"${style}>${esc(missing)}</p>`;
      }
      const cap = caption ? `<p class="figure-caption">${esc(caption)}</p>` : "";
      return `<div class="figure-block"${style}>${imageHtml(resolved)}${cap}</div>`;
    }
    case "table": {
      const columns: unknown = contentOf(block, "columns", []);
      if (!Array.isArray(columns) || !columns.length) return "";
      const rows = tableRows(contentOf(block, "rows", []), columns);
      const widths = tableColumnWidths(block, 100);
      const aligns = tableColumnAligns(block);
      const index = { value: 0 };
      const cell = (value: unknown, i: number, header: boolean) =>
        `<${header ? "th" : "td"} class="align-${header ? "center" : aligns[i]}" style="width:${widths[i].toFixed(2)}%">${inlineHtml(block.block_id, tableCellText(value), images, index)}</${header ? "th" : "td"}>`;
      const head = `<tr>${columns.map((c, i) => cell(c, i, true)).join("")}</tr>`;
      const body = rows.map((row) => `<tr>${row.map((c, i) => cell(c, i, false)).join("")}</tr>`).join("");
      return `<table class="exam-table"${style}><thead>${head}</thead><tbody>${body}</tbody></table>`;
    }
    case "list": {
      const items: unknown = contentOf(block, "items", []);
      if (!Array.isArray(items) || !items.length) return "";
      const ordered = contentOf(block, "ordered", false) === true;
      const mcq = !ordered && items.every((item) => isMcOptionLine(String(item ?? "")));
      const index = { value: 0 };
      if (mcq) {
        return items
          .map((item) => `<p class="mcq-option"${style}>${inlineHtml(block.block_id, formatMcOption(String(item ?? "")), images, index)}</p>`)
          .join("");
      }
      const tag = ordered ? "ol" : "ul";
      return `<${tag} class="block-list"${style}>${items
        .map((item) => `<li>${inlineHtml(block.block_id, String(item ?? ""), images, index)}</li>`)
        .join("")}</${tag}>`;
    }
    case "code": {
      const code = contentOf(block, "code", "");
      const language = contentOf(block, "language");
      const intro = typeof language === "string" && language ? `<p class="code-language"${style}>(${esc(language)})</p>` : "";
      const lines = String(code ?? "").split("\n").map((line) => `<p class="code-line"${style}>${esc(line) || "&nbsp;"}</p>`).join("");
      return intro + lines;
    }
    case "answer_area": {
      const lines = Math.max(1, Number(contentOf(block, "lines", 3)) || 1);
      return `<div class="answer-area"${style}>${Array.from({ length: lines }, () => `<div class="answer-line"></div>`).join("")}</div>`;
    }
    case "page_break":
      return `<div class="page-break"></div>`;
    default:
      return "";
  }
}

function renderBlocks(blocks: ContentBlock[], images: Map<string, ResolvedImage>, indent = 0): string {
  return [...blocks]
    .sort((a, b) => a.position - b.position)
    .map((block) => renderBlock(block, images, indent))
    .join("");
}

// ---------- questions ----------

function renderQuestion(question: Question, n: number, images: Map<string, ResolvedImage>): string {
  const marks = formatMarks(question.marks);
  const header = `<div class="question-head"><span class="question-number">Question ${n}</span><span class="question-marks">${esc(marks)}</span></div>`;
  const body = renderBlocks(question.body, images);
  const options = question.mcq_options?.length ? renderBlocks(mcqOptionBlocks(question), images) : "";
  const renderParts = (children: Question[], depth = 0): string => children
    .map((part) => {
      const label = part.part_label ? `(${esc(part.part_label)})` : "";
      const labelMarks = marksLabel(part.marks);
      const head = `<div class="part-head"><span class="part-label">${label}</span>${labelMarks ? `<span class="part-marks">[${esc(labelMarks)}]</span>` : ""}</div>`;
      return `<div class="question-part" style="margin-left:${0.3 + depth * 0.3}in">${head}${renderBlocks(part.body, images, 0.3 + depth * 0.3)}${renderParts(part.parts, depth + 1)}</div>`;
    })
    .join("");
  const parts = renderParts(question.parts);
  const source = [formatSourceBracket(question.source), `Question ID: ${question.question_id}`].filter(Boolean).join(" · ");
  return `<div class="question">${header}${body}${options}${parts}<p class="question-source">${esc(source)}</p></div>`;
}

function renderStimulusSection(stimuli: DocStimulusItem[], images: Map<string, ResolvedImage>): string {
  if (!stimuli.length) return "";
  const items = stimuli
    .map((item, i) => {
      const label = item.stimulus.title ? `Stimulus ${i + 1}: ${item.stimulus.title}` : `Stimulus ${i + 1}`;
      const refs = item.questionNumbers.length
        ? ` (Referenced by Question${item.questionNumbers.length > 1 ? "s" : ""}: ${item.questionNumbers.join(", ")})`
        : "";
      return `<div class="stimulus"><h3 class="stimulus-title">${esc(`${label}${refs}`)}</h3>${renderBlocks(item.stimulus.blocks as ContentBlock[], images)}</div>`;
    })
    .join("");
  return `<div class="page-break"></div><h2 class="section-heading">Stimulus Material</h2>${items}<p class="end-note">End of Stimulus Material</p>`;
}

// ---------- document shell ----------

function stylesheet(footer: string): string {
  const { margin, font } = EXAM;
  const family = `"${font.family}", serif`;
  return `@page {
  size: A4;
  margin: ${pt(margin.top)} ${pt(margin.right)} ${pt(margin.bottom)} ${pt(margin.left)};
  @bottom-center { content: counter(page); font-family: ${family}; font-size: ${pt(font.smallPt)}; color: #6b6b64; }
  @bottom-left { content: "${footer.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"; font-family: ${family}; font-size: ${pt(font.smallPt)}; color: #6b6b64; }
}
html { font-family: ${family}; font-size: ${pt(font.bodyPt)}; line-height: ${font.lineHeight}; color: #000; background: #fff; }
body { margin: 0; background: #fff; color: #000; }
p { margin: 0 0 6pt 0; }
h1, h2, h3 { margin: 0; font-weight: bold; }
.cover { text-align: center; }
.cover-title { font-size: ${pt(font.bodyPt)}; }
.cover-subject { font-size: ${pt(font.coverTitlePt)}; margin-top: 6pt; }
.cover-paper { margin-top: 12pt; }
.cover-box { border: 1pt solid #000; padding: 8pt; margin: 18pt 0; text-align: left; }
.cover-box p { margin: 0 0 6pt 0; }
.cover-box.bare { margin: 18pt 0; }
.cover-date { color: #6b6b64; font-size: ${pt(font.smallPt)}; margin-top: 18pt; }
.structure { text-align: left; }
.structure h2 { margin-bottom: 6pt; }
.structure .section-overview { margin-left: 0.35in; margin-bottom: 6pt; }
.section { break-before: page; page-break-before: always; }
.paper-section:first-of-type { break-before: auto; page-break-before: auto; }
.section-heading { font-size: ${pt(font.titlePt)}; border-bottom: 1pt solid #777; padding-bottom: 4pt; margin: 0 0 8pt; break-after: avoid; page-break-after: avoid; }
.section-marks { font-weight: bold; margin-bottom: 4pt; }
.section-note { margin-bottom: 4pt; }
.question { margin-top: 14pt; }
.question-head { display: flex; justify-content: space-between; font-weight: bold; margin-bottom: 4pt; break-after: avoid; page-break-after: avoid; }
.question-number { font-weight: bold; }
.question-marks { font-weight: normal; }
.question-part { margin: 0; }
.part-head { margin: 6pt 0 4pt 0; break-after: avoid; page-break-after: avoid; }
.part-label { font-weight: bold; }
.part-marks { font-size: ${pt(9)}; margin-left: 6pt; }
.block-heading { font-weight: bold; }
.block-list { margin: 0 0 6pt 0; padding-left: 0.5in; }
.mcq-option { margin-left: 0.35in; }
.equation-display { text-align: center; }
.equation-inline { margin: 0 0 6pt 0; }
.figure-block { text-align: center; margin: 6pt 0; break-inside: avoid; page-break-inside: avoid; }
.figure { text-align: center; break-inside: avoid; page-break-inside: avoid; }
.figure-caption { text-align: center; font-style: italic; font-size: ${pt(9)}; color: #6b6b64; }
.missing-figure { font-style: italic; }
.math-img { vertical-align: middle; }
.math-inline-img { vertical-align: -0.12em; }
.exam-table { width: 100%; border-collapse: collapse; break-inside: avoid; page-break-inside: avoid; margin: 6pt 0; }
.exam-table th, .exam-table td { border: 0.5pt solid #000; padding: 3pt 4pt; vertical-align: middle; }
.exam-table th { background: #f1f1ee; text-align: center; }
.exam-table .align-left { text-align: left; }
.exam-table .align-center { text-align: center; }
.exam-table .align-right { text-align: right; }
.code-language { font-style: italic; font-size: ${pt(8)}; color: #6b6b64; }
.code-line { font-family: "Courier New", monospace; font-size: ${pt(10)}; margin: 0; }
.answer-area { break-inside: avoid; page-break-inside: avoid; }
.answer-line { border-bottom: 0.5pt solid #999; height: 20pt; box-sizing: border-box; }
.question-source { font-style: italic; font-size: ${pt(8)}; color: #6b6b64; }
.page-break { break-before: page; page-break-before: always; }
.end-note { text-align: center; font-weight: bold; margin: 8pt 0; }
.solutions-title { text-align: center; font-size: ${pt(20)}; }
.solutions-subtitle { text-align: center; font-size: ${pt(14)}; margin: 6pt 0 12pt; }
.solutions-section { font-size: ${pt(15)}; margin: 18pt 0 6pt; break-before: page; page-break-before: always; break-after: avoid; page-break-after: avoid; }
.solutions-section:first-of-type { break-before: auto; page-break-before: auto; }
.solutions-question { margin-top: 12pt; padding-top: 6pt; }
.solutions-question.first { border-top: 0; margin-top: 0; padding-top: 0; }
.solutions-question:not(.first) { border-top: 0.5pt solid #999; }
.solutions-qtitle { font-size: ${pt(13)}; }
.slot-heading { font-weight: bold; font-size: ${pt(13)}; margin: 10pt 0 4pt; }
.slot-heading.sub { font-size: ${pt(12)}; }
.slot-label { font-size: ${pt(11)}; margin: 8pt 0 4pt; }
.slot-label.sub { font-weight: normal; }
`;
}

function documentShell(title: string, body: string, footer = "Made with Quaestio"): string {
  return `<!DOCTYPE html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
${stylesheet(footer)}
</style>
</head>
<body>
${body}
</body>
</html>`;
}

// ---------- cover and sections ----------

function coverHtml(plan: ReturnType<typeof buildExamPaperPlan>, profile: ExamProfile): string {
  const parts: string[] = [`<h1 class="cover-title">${esc(profile.coverTitle)}</h1>`, `<p class="cover-subject">${esc(plan.subjectLine)}</p>`];
  if (plan.paperTitle && plan.paperTitle !== plan.subjectLine) parts.push(`<p class="cover-paper">${esc(plan.paperTitle)}</p>`);
  if (profile.showCentreStudentBox) {
    parts.push(`<div class="cover-box bare"><p>Centre Number</p><p>Student Number</p></div>`);
  }
  parts.push(`<div class="cover-box">${generalInstructionsLines(plan, profile).map((line) => `<p>${line ? esc(line) : "&nbsp;"}</p>`).join("")}</div>`);
  parts.push(`<div class="structure"><h2>Examination structure</h2>${plan.sections
    .map((sec) => `<div class="section-overview">${sectionOverviewLines(sec).map((line) => line ? `<p>${esc(line)}</p>` : `<p>&nbsp;</p>`).join("")}</div>`)
    .join("")}</div>`);
  parts.push(`<p class="candidate-name">Candidate name: ____________________________________</p>`);
  parts.push(`<p class="cover-date">${esc(plan.examDate)}</p>`);
  return `<div class="cover">${parts.join("")}</div><div class="page-break"></div>`;
}

function sectionHeaderHtml(sec: ExamSectionPlan): string {
  const lines = sectionOpeningLines(sec);
  return lines
    .map((line) => {
      if (!line) return "";
      if (line === sec.title) return `<h2 class="section-heading">${esc(line)}</h2>`;
      if (line.endsWith(" marks")) return `<p class="section-marks">${esc(line)}</p>`;
      return `<p class="section-note">${esc(line)}</p>`;
    })
    .join("");
}

// ---------- public API ----------

export function renderPaperHtml(opts: DocOptions): string {
  const profile = opts.profile ?? DEFAULT_EXAM_PROFILE;
  const images = opts.resolvedImages ?? new Map<string, ResolvedImage>();
  const plan = buildExamPaperPlan({ ...opts, profile });
  const body: string[] = [coverHtml(plan, profile)];
  const totalQuestions = opts.sections.reduce((sum, section) => sum + section.questions.length, 0);
  let counter = 0;
  let planIndex = 0;
  for (const section of opts.sections) {
    if (!section.questions.length) continue;
    const secPlan = plan.sections[planIndex++];
    if (!secPlan) continue;
    body.push(`<section class="section paper-section">${sectionHeaderHtml(secPlan)}`);
    for (const question of section.questions) {
      counter += 1;
      body.push(renderQuestion(question, counter, images));
      opts.onQuestionProgress?.(counter, totalQuestions);
    }
    const finalSection = planIndex === plan.sections.length;
    body.push(`<p class="end-note">${esc(finalSection ? "End of Exam" : `End of ${secPlan.title}`)}</p></section>`);
  }
  body.push(renderStimulusSection(opts.stimuli ?? [], images));
  return documentShell(plan.paperTitle || plan.subjectLine, body.join("\n"));
}

function appendSolutionSlot(slot: SolutionSlot, images: Map<string, ResolvedImage>): string {
  if (!slot.blocks.length) return "";
  const heading = slot.heading ? `<h3 class="slot-heading${slot.sub ? " sub" : ""}">${esc(slot.heading)}</h3>` : "";
  const label = `<p class="slot-label${slot.sub ? " sub" : ""}">${esc(slot.label)}</p>`;
  return `${heading}${label}${renderBlocks(slot.blocks, images, slot.sub ? 0.25 : 0)}`;
}

function totalQuestions(sections: DocSection[]): number {
  return sections.reduce((sum, section) => sum + section.questions.length, 0);
}

export function renderSolutionsHtml(
  title: string,
  sections: DocSection[],
  images: Map<string, ResolvedImage> = new Map(),
  onProgress?: (completed: number, total: number) => void
): string {
  const body: string[] = [`<h1 class="solutions-title">${esc(title)}</h1>`, `<p class="solutions-subtitle">Solutions and marking guide</p>`];
  let number = 0;
  for (const section of sections) {
    if (section.label) body.push(`<h2 class="solutions-section">${esc(section.label)}</h2>`);
    for (const question of section.questions) {
      number += 1;
      const source = [formatSourceBracket(question.source), `Question ID: ${question.question_id}`].filter(Boolean).join(" · ");
      body.push(
        `<div class="solutions-question${number === 1 ? " first" : ""}">`,
        `<h3 class="solutions-qtitle">Question ${number}${question.marks != null ? ` <span class="question-marks">(${esc(formatMarks(question.marks))})</span>` : ""}</h3>`,
        `<p class="question-source">${esc(source)}</p>`,
        ...solutionSlots(question).map((slot) => appendSolutionSlot(slot, images)),
        `</div>`
      );
      onProgress?.(number, totalQuestions(sections));
    }
  }
  return documentShell(title, body.join("\n"), "Solutions · Made with Quaestio");
}
