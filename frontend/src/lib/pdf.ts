import {
  PDFDocument,
  PDFFont,
  PDFImage,
  PageSizes,
  rgb,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import notoSerifRegularUrl from "../assets/NotoSerif-Regular.ttf?url";
import notoSerifBoldUrl from "../assets/NotoSerif-Bold.ttf?url";
import notoSerifItalicUrl from "../assets/NotoSerif-Italic.ttf?url";
import type { ContentBlock, Question } from "../api/types";
import { contentOf, formatMarks, formatSourceBracket, marksLabel, tableCellText, tableRows } from "./criteria";
import { inlineMathImageId, resolveEquations, resolveImages, type ResolvedImage } from "./resolvers";
import type { DocSection } from "./docx";
import {
  EXAM,
  buildExamPaperPlan,
  formatMcOption,
  formatPageNumber,
  generalInstructionsLines,
  isMcOptionLine,
  sectionOpeningLines,
  sectionOverviewLines,
  type ExamPaperPlan,
} from "./examLayout";

const PT = 72;
const PAGE_W = EXAM.page.widthPt;
const PAGE_H = EXAM.page.heightPt;
const MARGIN_L = EXAM.margin.left;
const MARGIN_R = EXAM.margin.right;
const MARGIN_T = EXAM.margin.top;
const MARGIN_B = EXAM.margin.bottom;
const MARKS_COL = EXAM.margin.marks;
const BODY_W = PAGE_W - MARGIN_L - MARGIN_R - MARKS_COL;
const TOP = PAGE_H - MARGIN_T;
const BOTTOM = MARGIN_B + 20;
const FOOTER_Y = MARGIN_B - 4;

const BLACK = rgb(0, 0, 0);
const GRAY = rgb(0.42, 0.42, 0.39);
const BORDER = rgb(0.6, 0.6, 0.6);
const HR = rgb(0.8, 0.8, 0.8);
const HEADER_BG = rgb(0.945, 0.945, 0.933);

const LINE_H = (size: number) => size * EXAM.font.lineHeight;

interface Fonts {
  reg: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  mono: PDFFont;
}

async function embedUnicodeFonts(pdf: PDFDocument): Promise<Fonts> {
  pdf.registerFontkit(fontkit);
  const [reg, bold, italic] = await Promise.all([
    notoSerifRegularUrl,
    notoSerifBoldUrl,
    notoSerifItalicUrl,
  ].map(async (url) => new Uint8Array(await (await fetch(url)).arrayBuffer())));
  return {
    reg: await pdf.embedFont(reg, { subset: true }),
    bold: await pdf.embedFont(bold, { subset: true }),
    italic: await pdf.embedFont(italic, { subset: true }),
    mono: await pdf.embedFont(reg, { subset: true }),
  };
}

const charSets = new WeakMap<PDFFont, Set<number>>();
function pdfSafeText(text: string, font: PDFFont): string {
  let chars = charSets.get(font);
  if (!chars) { chars = new Set(font.getCharacterSet()); charSets.set(font, chars); }
  const replacements: Record<string, string> = { "√": "sqrt ", "−": "-", "→": "->" };
  return Array.from(text, (c) => chars!.has(c.codePointAt(0)!) ? c : replacements[c] ?? `[U+${c.codePointAt(0)!.toString(16).toUpperCase()}]`).join("");
}
function drawSafeText(page: ReturnType<PDFDocument["addPage"]>, text: string, opts: Parameters<ReturnType<PDFDocument["addPage"]>["drawText"]>[1] & { font: PDFFont }) {
  page.drawText(pdfSafeText(text, opts.font), opts);
}

function wrapText(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  text = pdfSafeText(text, font);
  const out: string[] = [];
  for (const rawLine of text.split("\n")) {
    const words = rawLine.split(/\s+/).filter(Boolean).flatMap((word) => {
      if (font.widthOfTextAtSize(word, size) <= maxWidth) return [word];
      const parts: string[] = [];
      let part = "";
      for (const ch of word) {
        if (part && font.widthOfTextAtSize(part + ch, size) > maxWidth) {
          parts.push(part);
          part = ch;
        } else part += ch;
      }
      if (part) parts.push(part);
      return parts;
    });
    if (!words.length) {
      out.push("");
      continue;
    }
    let line = "";
    for (const w of words) {
      const candidate = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) {
        line = candidate;
      } else {
        out.push(line);
        line = w;
      }
    }
    out.push(line);
  }
  return out;
}

class Writer {
  pdf: PDFDocument;
  fonts: Fonts;
  page: { page: ReturnType<PDFDocument["addPage"]>; w: number; h: number };
  y = TOP;
  private embeddedImages = new WeakMap<Uint8Array<ArrayBuffer>, Map<string, Promise<PDFImage>>>();

  constructor(pdf: PDFDocument, fonts: Fonts) {
    this.pdf = pdf;
    this.fonts = fonts;
    // Field initializers run before the constructor body, so `page` must be
    // created here — otherwise `this.pdf` is still undefined when addPage runs.
    this.page = this.newPageRef();
    this.pageHistory.push({ page: this.page.page, number: this.pageNumber });
  }

  embedImage(data: Uint8Array<ArrayBuffer>, mime = "image/png"): Promise<PDFImage> {
    let formats = this.embeddedImages.get(data);
    if (!formats) {
      formats = new Map();
      this.embeddedImages.set(data, formats);
    }
    let embedded = formats.get(mime);
    if (!embedded) {
      embedded = mime === "image/jpeg" ? this.pdf.embedJpg(data) : this.pdf.embedPng(data);
      formats.set(mime, embedded);
    }
    return embedded;
  }

  pageNumber = 1;
  pageHistory: Array<{ page: ReturnType<PDFDocument["addPage"]>; number: number }> = [];

  private newPageRef() {
    const p = this.pdf.addPage(PageSizes.A4);
    const w = p.getWidth();
    const h = p.getHeight();
    return { page: p, w, h };
  }

  drawPageFooter() {
    const label = formatPageNumber(this.pageNumber);
    const size = EXAM.font.smallPt;
    const font = this.fonts.reg;
    const tw = font.widthOfTextAtSize(label, size);
    drawSafeText(this.page.page, label, {
      x: MARGIN_L + (BODY_W + MARKS_COL - tw) / 2,
      y: FOOTER_Y,
      size,
      font,
      color: BLACK,
    });
    const brand = "Made with Quaestio";
    drawSafeText(this.page.page, brand, {
      x: MARGIN_L,
      y: FOOTER_Y,
      size,
      font,
      color: GRAY,
    });
  }

  newPage() {
    this.drawPageFooter();
    this.pageNumber += 1;
    this.page = this.newPageRef();
    this.pageHistory.push({ page: this.page.page, number: this.pageNumber });
    this.y = TOP;
  }

  drawQuestionContinuation(questionNumber: number, fromPage: number, toPage: number) {
    const text = `Question ${questionNumber} Continues on Page ${toPage}`;
    const size = EXAM.font.smallPt;
    const font = this.fonts.bold;
    for (const entry of this.pageHistory) {
      if (entry.number < fromPage || entry.number >= toPage) continue;
      const width = font.widthOfTextAtSize(text, size);
      drawSafeText(entry.page, text, {
        x: MARGIN_L + (BODY_W + MARKS_COL - width) / 2,
        y: FOOTER_Y + 12,
        size,
        font,
        color: BLACK,
      });
    }
  }

  ensure(space: number) {
    if (this.y - space < BOTTOM) this.newPage();
  }

  /** Marks sit in the right-hand margin (NESA Principle 12). */
  drawMarks(marks: string, lineY?: number) {
    if (!marks) return;
    const size = EXAM.font.bodyPt;
    const font = this.fonts.reg;
    marks = pdfSafeText(marks, font);
    const y = lineY ?? this.y;
    const tw = font.widthOfTextAtSize(marks, size);
    drawSafeText(this.page.page, marks, {
      x: MARGIN_L + BODY_W + MARKS_COL - tw - 2,
      y,
      size,
      font,
      color: BLACK,
    });
  }

  /** Draw a border around content written since `startY` (top baseline). */
  finishBox(startY: number, pad = 10) {
    const height = startY - this.y + pad;
    if (height < 8) return;
    this.page.page.drawRectangle({
      x: MARGIN_L,
      y: this.y - pad / 2,
      width: BODY_W + MARKS_COL,
      height,
      borderColor: BORDER,
      borderWidth: 0.75,
    });
    this.y -= pad / 2;
  }

  text(text: string, opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; align?: "left" | "right" | "center"; indent?: number } = {}) {
    const size = opts.size ?? EXAM.font.bodyPt;
    const font = opts.font ?? this.fonts.reg;
    const color = opts.color ?? BLACK;
    const align = opts.align ?? "left";
    const indent = opts.indent ?? 0;
    const maxW = BODY_W - indent;
    for (const line of wrapText(font, text, size, maxW)) {
      this.ensure(LINE_H(size));
      const x =
        align === "left"
          ? MARGIN_L + indent
          : align === "right"
            ? MARGIN_L + BODY_W - font.widthOfTextAtSize(line, size)
            : MARGIN_L + (BODY_W - font.widthOfTextAtSize(line, size)) / 2;
      drawSafeText(this.page.page, line, { x, y: this.y, size, font, color });
      this.y -= LINE_H(size);
    }
  }

  textLine(line: string, opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; x?: number; align?: "left" | "right" | "center" }) {
    const size = opts.size ?? EXAM.font.bodyPt;
    const font = opts.font ?? this.fonts.reg;
    line = pdfSafeText(line, font);
    const x =
      opts.x ??
      (opts.align === "right"
        ? MARGIN_L + BODY_W - font.widthOfTextAtSize(line, size)
        : opts.align === "center"
          ? MARGIN_L + (BODY_W - font.widthOfTextAtSize(line, size)) / 2
          : MARGIN_L);
    this.ensure(LINE_H(size));
    drawSafeText(this.page.page, line, { x, y: this.y, size, font, color: opts.color ?? BLACK });
    this.y -= LINE_H(size);
  }

  rule(color = HR) {
    this.ensure(6);
    this.page.page.drawLine({
      start: { x: MARGIN_L, y: this.y + 3 },
      end: { x: MARGIN_L + BODY_W + MARKS_COL, y: this.y + 3 },
      thickness: 0.75,
      color,
    });
    this.y -= 9;
  }

  spacer(h: number) {
    this.ensure(h);
    this.y -= h;
  }

  async gridRow(cells: string[], widths: number[], opts: { font?: PDFFont; fill?: ReturnType<typeof rgb>; align?: "right" | "center"; inline?: { images: Map<string, ResolvedImage>; blockId: string; index: { value: number } } } = {}) {
    const x0 = MARGIN_L;
    const font = opts.font ?? this.fonts.reg;
    const size = 9;
    const lineH = LINE_H(size);
    const normalized = widths.map((_, i) => cells[i] ?? "");
    const wrapped = normalized.map((cell, i) => wrapText(font, cell, size, Math.max(1, widths[i] - 8)));
    const lineCount = Math.max(1, ...wrapped.map((lines) => lines.length));
    const height = Math.max(20, lineCount * lineH + 8);
    this.ensure(height);
    const rowTop = this.y;
    let cx = x0;
    for (let i = 0; i < normalized.length; i++) {
      const cellW = widths[i];
      if (opts.fill) {
        this.page.page.drawRectangle({ x: cx, y: this.y - height, width: cellW, height, color: opts.fill });
      }
      const lines = wrapped[i];
      const textH = lines.length * lineH;
      let ty = rowTop - (height - textH) / 2 - lineH;
      if (opts.inline && /\$[^$]+\$/.test(normalized[i])) {
        const parts: Array<{ text: string; image?: PDFImage }> = [];
        const re = /\$([^$]+)\$/g;
        let last = 0;
        let match: RegExpExecArray | null;
        while ((match = re.exec(normalized[i]))) {
          if (match.index > last) parts.push({ text: normalized[i].slice(last, match.index) });
          const resolved = opts.inline.images.get(inlineMathImageId(opts.inline.blockId, opts.inline.index.value++));
          parts.push(resolved ? { text: "", image: await this.embedImage(resolved.data) } : { text: match[1] });
          last = re.lastIndex;
        }
        if (last < normalized[i].length) parts.push({ text: normalized[i].slice(last) });
        const widthsOfParts = parts.map((part) => part.image ? (part.image.width / part.image.height) * size * 1.2 : font.widthOfTextAtSize(part.text, size));
        let px = cx + (cellW - widthsOfParts.reduce((sum, value) => sum + value, 0)) / 2;
        for (let pi = 0; pi < parts.length; pi++) {
          const part = parts[pi];
          const partWidth = widthsOfParts[pi];
          if (part.image) this.page.page.drawImage(part.image, { x: px, y: ty - size * 0.25, width: partWidth, height: size * 1.2 });
          else if (part.text) drawSafeText(this.page.page, part.text, { x: px, y: ty, size, font, color: BLACK });
          px += partWidth;
        }
      } else for (const line of lines) {
        const textW = font.widthOfTextAtSize(line, size);
        const lx =
          opts.align === "right"
            ? cx + cellW - 3 - textW
            : opts.align === "center"
              ? cx + (cellW - textW) / 2
              : cx + (cellW - textW) / 2;
        drawSafeText(this.page.page, line, { x: lx, y: ty, size, font, color: BLACK });
        ty -= lineH;
      }
      cx += cellW;
    }
    this.page.page.drawRectangle({
      x: x0,
      y: rowTop - height,
      width: widths.reduce((sum, width) => sum + width, 0),
      height,
      borderColor: BORDER,
      borderWidth: 0.5,
    });
    let vx = x0;
    for (const width of widths.slice(0, -1)) {
      vx += width;
      this.page.page.drawLine({ start: { x: vx, y: rowTop }, end: { x: vx, y: rowTop - height }, thickness: 0.5, color: BORDER });
    }
    this.y -= height;
  }

  async richText(text: string, images: Map<string, ResolvedImage>, blockId: string, opts: { indent?: number; size?: number; font?: PDFFont; mathIndex?: { value: number } } = {}) {
    const size = opts.size ?? EXAM.font.bodyPt;
    const font = opts.font ?? this.fonts.reg;
    text = pdfSafeText(text, font);
    const maxW = BODY_W - (opts.indent ?? 0);
    const x0 = MARGIN_L + (opts.indent ?? 0);
    const tokens: Array<{ text: string; image?: ResolvedImage }> = [];
    const re = /\$([^$]+)\$/g;
    let last = 0;
    let match: RegExpExecArray | null;
    const mathIndex = opts.mathIndex ?? { value: 0 };
    while ((match = re.exec(text))) {
      tokens.push(...text.slice(last, match.index).split(/(\s+)/).filter(Boolean).map((t) => ({ text: t })));
      const math = images.get(inlineMathImageId(blockId, mathIndex.value++));
      tokens.push(math ? { text: "", image: math } : { text: match[1] });
      last = re.lastIndex;
    }
    tokens.push(...text.slice(last).split(/(\s+)/).filter(Boolean).map((t) => ({ text: t })));
    let x = x0;
    let lineHasContent = false;
    const newLine = () => { this.y -= LINE_H(size); x = x0; lineHasContent = false; };
    for (const token of tokens) {
      const embedded = token.image ? await this.embedImage(token.image.data) : null;
      const width = embedded ? (embedded.width / embedded.height) * size * 1.2 : font.widthOfTextAtSize(token.text, size);
      if (x + width > x0 + maxW && lineHasContent) newLine();
      this.ensure(LINE_H(size));
      if (embedded) this.page.page.drawImage(embedded, { x, y: this.y - size * 0.25, width, height: size * 1.2 });
      else if (token.text.trim()) drawSafeText(this.page.page, token.text, { x, y: this.y, size, font, color: BLACK });
      x += width;
      lineHasContent ||= Boolean(token.text.trim() || embedded);
    }
    this.y -= LINE_H(size);
  }

  fitImage(img: PDFImage, opts: { maxW: number; maxH?: number }) {
    const w = img.width;
    const h = img.height;
    let dw = opts.maxW;
    let dh = (h / w) * dw;
    if (opts.maxH && dh > opts.maxH) {
      dh = opts.maxH;
      dw = (w / h) * dh;
    }
    const x = MARGIN_L + (BODY_W - dw) / 2;
    this.ensure(dh + 4);
    this.page.page.drawImage(img, { x, y: this.y - dh, width: dw, height: dh });
    this.y -= dh + 4;
  }
}

/** Port of docx.ts renderBlock → PDF. Renders one block and returns. */
async function renderBlock(w: Writer, b: ContentBlock, images: Map<string, ResolvedImage>): Promise<boolean> {
  switch (b.block_type) {
    case "text": {
      const t = contentOf(b, "text", "");
      if (typeof t === "string" && t) await w.richText(t, images, b.block_id);
      return true;
    }
    case "heading": {
      const t = contentOf(b, "text", "");
      if (typeof t === "string" && t) await w.richText(t, images, b.block_id, { font: w.fonts.bold, size: 13 });
      return true;
    }
    case "equation": {
      const img = images.get(b.block_id);
      if (!img) {
        const latex = contentOf(b, "latex", "");
        if (typeof latex === "string" && latex) w.text(latex.replace(/\\(?:left|right)\b/g, "").replace(/\\(?:,|;|!|quad|qquad)/g, " "), { font: w.fonts.italic, size: 10, color: GRAY, align: contentOf(b, "display", true) !== false ? "center" : "left" });
        return true;
      }
      const embedded = await w.embedImage(img.data);
      w.fitImage(embedded, { maxW: 3 * PT, maxH: 0.32 * PT });
      return true;
    }
    case "image":
    case "diagram":
    case "graph": {
      const img = images.get(b.block_id);
      if (!img) {
        const path = contentOf(b, "asset_path", "");
        w.text(`[missing image: ${typeof path === "string" ? path : ""}]`, { font: w.fonts.italic, size: 10, color: GRAY });
        w.y -= LINE_H(11);
        return true;
      }
      const embedded = await w.embedImage(img.data, img.mime);
      w.fitImage(embedded, { maxW: 4.5 * PT, maxH: 4.5 * PT });
      w.y -= LINE_H(11);
      return true;
    }
    case "table": {
      const cols = contentOf(b, "columns", []);
      const rawRows = contentOf(b, "rows", []);
      if (!Array.isArray(cols) || cols.length === 0) return true;
      const rows = tableRows(rawRows, cols);
      const width = BODY_W;
      const widths = cols.map(() => width / cols.length);
      const header = cols.map(tableCellText);
      const inline = { images, blockId: b.block_id, index: { value: 0 } };
      await w.gridRow(header, widths, { font: w.fonts.bold, fill: HEADER_BG, align: "center", inline });
      for (const row of rows) {
        const cells = row.map(tableCellText);
        if (cells.length === 0) continue;
        await w.gridRow(cells.slice(0, cols.length), widths, { align: "center", inline });
      }
      // The next block's baseline must sit below the table's bottom border;
      // without this, labels (especially part headings) can overlap the last row.
      w.spacer(12);
      return true;
    }
    case "list": {
      const items = contentOf(b, "items", []);
      const ordered = contentOf(b, "ordered", false) === true;
      if (Array.isArray(items)) {
        const mc = !ordered && items.length > 0 && items.every((it) => isMcOptionLine(String(it)));
        const mathIndex = { value: 0 };
        if (mc) {
          const optionLines = items.reduce(
            (sum, item) => sum + wrapText(w.fonts.reg, formatMcOption(String(item)), EXAM.font.bodyPt, BODY_W - 20).length,
            0
          );
          w.ensure(optionLines * LINE_H(EXAM.font.bodyPt));
        }
        for (let i = 0; i < items.length; i++) {
          const raw = String(items[i]);
          const item = mc ? formatMcOption(raw) : raw;
          const prefix = ordered ? `${i + 1}.` : mc ? "" : "•";
          await w.richText(`${prefix ? `${prefix}  ` : ""}${item}`, images, b.block_id, { indent: prefix ? 12 : 20, mathIndex });
        }
      }
      return true;
    }
    case "code": {
      const code = contentOf(b, "code", "");
      if (typeof code === "string") {
        for (const line of code.split("\n")) {
          for (const piece of wrapText(w.fonts.mono, line || " ", 9, BODY_W)) {
            w.textLine(piece, { font: w.fonts.mono, size: 9 });
          }
        }
      }
      return true;
    }
    case "answer_area": {
      const lines = typeof contentOf(b, "lines", 3) === "number" ? contentOf(b, "lines", 3) : 3;
      const h = (lines + 1) * 22;
      w.ensure(h);
      for (let i = 0; i < lines; i++) {
        w.page.page.drawLine({
          start: { x: MARGIN_L, y: thisY(w, i) },
          end: { x: MARGIN_L + BODY_W, y: thisY(w, i) },
          thickness: 0.75,
          color: BORDER,
        });
      }
      w.y -= h;
      return true;
    }
    case "page_break": {
      w.newPage();
      return true;
    }
    default:
      return true;
  }
}

function thisY(w: Writer, i: number) {
  return w.y - 6 - i * 22;
}

async function renderBlocks(w: Writer, blocks: ContentBlock[], ids: Map<string, ResolvedImage>) {
  for (const b of blocks) await renderBlock(w, b, ids);
}

function estimateBlockHeight(w: Writer, block: ContentBlock, images: Map<string, ResolvedImage>, indent = 0): number {
  const bodyWidth = BODY_W - indent;
  const textHeight = (text: string, size: number, font = w.fonts.reg, width = bodyWidth) =>
    wrapText(font, text, size, width).length * LINE_H(size);
  switch (block.block_type) {
    case "text":
    case "heading": {
      const text = contentOf(block, "text", "");
      if (typeof text !== "string" || !text) return 0;
      const size = block.block_type === "heading" ? 13 : EXAM.font.bodyPt;
      return textHeight(text, size, block.block_type === "heading" ? w.fonts.bold : w.fonts.reg);
    }
    case "equation":
      return 0.32 * PT + 4;
    case "image":
    case "diagram":
    case "graph": {
      const image = images.get(block.block_id);
      if (!image) return LINE_H(10);
      const scale = Math.min((4.5 * PT) / image.widthPx, (4.5 * PT) / image.heightPx);
      return image.heightPx * scale + 4 + LINE_H(11);
    }
    case "table": {
      const columns = contentOf(block, "columns", []);
      const rawRows = contentOf(block, "rows", []);
      if (!Array.isArray(columns) || !columns.length) return 0;
      const rows = tableRows(rawRows, columns).map((row) => row.map(tableCellText));
      const colWidth = BODY_W / columns.length;
      const rowHeight = (cells: unknown[], size: number, font: PDFFont) => {
        const lines = Math.max(1, ...cells.map((cell) => wrapText(font, tableCellText(cell), size, colWidth - 8).length));
        return Math.max(20, lines * LINE_H(size) + 8);
      };
      return rowHeight(columns, 9, w.fonts.bold)
        + rows.reduce((sum, row) => sum + (row.length ? rowHeight(row.slice(0, columns.length), 9, w.fonts.reg) : 0), 0)
        + 12;
    }
    case "list": {
      const items = contentOf(block, "items", []);
      if (!Array.isArray(items)) return 0;
      const mc = contentOf(block, "ordered", false) !== true && items.length > 0 && items.every((item) => isMcOptionLine(String(item)));
      return items.reduce((sum, item, index) => {
        const raw = String(item);
        const text = mc ? formatMcOption(raw) : `${contentOf(block, "ordered", false) === true ? `${index + 1}.  ` : "•  "}${raw}`;
        return sum + textHeight(text, EXAM.font.bodyPt, w.fonts.reg, BODY_W - (mc ? 20 : 12));
      }, 0);
    }
    case "code": {
      const code = contentOf(block, "code", "");
      return typeof code === "string" ? code.split("\n").reduce((sum, line) => sum + textHeight(line || " ", 9, w.fonts.mono), 0) : 0;
    }
    case "answer_area": {
      const lines = contentOf(block, "lines", 3);
      return ((typeof lines === "number" ? lines : 3) + 1) * 22;
    }
    case "page_break":
      return TOP - BOTTOM + 1;
    default:
      return 0;
  }
}

function estimateBlocksHeight(w: Writer, blocks: ContentBlock[], images: Map<string, ResolvedImage>, indent = 0): number {
  return blocks.reduce((sum, block) => sum + estimateBlockHeight(w, block, images, indent), 0);
}

function startOnNextPageIfNeeded(w: Writer, height: number) {
  const pageCapacity = TOP - BOTTOM;
  if (height <= pageCapacity && height > w.y - BOTTOM) w.newPage();
}

const SOURCE_LINE_PT = 8;

function drawSourceLine(w: Writer, question: Question) {
  const text = [formatSourceBracket(question.source), `Question ID: ${question.question_id}`].filter(Boolean).join(" · ");
  w.text(text, { font: w.fonts.italic, size: SOURCE_LINE_PT, color: GRAY });
}

async function renderPaperQuestion(w: Writer, q: Question, sharedImages?: Map<string, ResolvedImage>, beforePart?: (part: Question["parts"][number]) => void) {
  const questionBody = q.body;
  const blocks: ContentBlock[] = [...questionBody];
  for (const part of q.parts) blocks.push(...part.body);
  const ids = sharedImages ?? new Map<string, ResolvedImage>([
    ...(await resolveImages(blocks)),
    ...(await resolveEquations(blocks)),
  ]);
  await renderBlocks(w, questionBody, ids);
  if (q.mcq_options?.length) {
    const items = q.mcq_options.map((option, i) => {
      const label = String.fromCharCode(65 + i);
      const text = option.content.map((block) => String(block.content.text ?? block.content.latex ?? "")).join(" ");
      return `(${label}) ${text}`;
    });
    await renderBlocks(w, [{ block_id: `${q.question_id}-mcq-options`, slot: "body", position: 0, block_type: "list", content: { ordered: false, items } } as ContentBlock], ids);
  }
  for (const part of q.parts) {
    beforePart?.(part);
    const label = part.part_label ? `(${part.part_label})` : "";
    const marks = marksLabel(part.marks);
    const head = [label, marks ? `[${marks}]` : ""].filter(Boolean).join("  ");
    if (head) w.text(head, { font: w.fonts.bold, indent: 22 });
    await renderBlocks(w, part.body, ids);
  }
  drawSourceLine(w, q);
}

export interface PdfOptions {
  title: string;
  courseName: string;
  achievedMarks: number;
  sections: DocSection[];
  resolvedImages?: Map<string, ResolvedImage>;
  onQuestionProgress?: (completed: number, total: number) => void;
}

async function writeHscCover(w: Writer, plan: ExamPaperPlan) {
  w.spacer(24);
  w.text(EXAM.certificateLine, { font: w.fonts.bold, size: EXAM.font.bodyPt, align: "center" });
  w.spacer(8);
  w.text(plan.subjectLine, { font: w.fonts.bold, size: EXAM.font.coverTitlePt, align: "center" });
  if (plan.paperTitle && plan.paperTitle !== plan.subjectLine) {
    w.text(plan.paperTitle, { font: w.fonts.reg, size: EXAM.font.bodyPt, align: "center" });
  }
  w.spacer(16);

  const idBoxTop = w.y;
  w.spacer(8);
  w.text("Centre Number", { size: EXAM.font.smallPt, indent: 12 });
  w.spacer(14);
  w.text("Student Number", { size: EXAM.font.smallPt, indent: 12 });
  w.finishBox(idBoxTop);
  w.spacer(12);

  const instrTop = w.y;
  w.spacer(8);
  for (const line of generalInstructionsLines(plan)) {
    if (line === "General Instructions") {
      w.text(line, { font: w.fonts.bold, size: EXAM.font.bodyPt, indent: 12 });
    } else if (line === "") {
      w.spacer(6);
    } else {
      w.text(line, { size: EXAM.font.bodyPt, indent: 12 });
    }
  }
  w.finishBox(instrTop);

  w.spacer(12);
  w.text("Examination structure", { font: w.fonts.bold, size: EXAM.font.bodyPt });
  w.spacer(6);
  for (const sec of plan.sections) {
    for (const line of sectionOverviewLines(sec)) {
      if (line === "") w.spacer(4);
      else w.text(line, { size: EXAM.font.bodyPt, indent: 12 });
    }
    w.spacer(8);
  }
  w.text(plan.examDate, { size: EXAM.font.smallPt, color: GRAY, align: "center" });
}

function writeSectionHeader(w: Writer, sec: ReturnType<typeof buildExamPaperPlan>["sections"][number]) {
  w.spacer(10);
  const opening = sectionOpeningLines(sec);
  for (const line of opening) {
    if (line === "") w.spacer(4);
    else if (line === sec.title) {
      w.text(line, { font: w.fonts.bold, size: EXAM.font.titlePt });
      w.rule();
    }
    else if (line.endsWith(" marks")) w.text(line, { font: w.fonts.bold, size: EXAM.font.bodyPt });
    else {
      w.text(line, { size: EXAM.font.bodyPt });
      if (line.startsWith("Allow about ")) w.rule();
    }
  }
  w.spacer(8);
}

export async function buildPdfPaper(options: PdfOptions): Promise<Blob> {
  const pdf = await PDFDocument.create();
  const fonts = await embedUnicodeFonts(pdf);
  const w = new Writer(pdf, fonts);
  const plan = buildExamPaperPlan(options);
  const allBlocks = options.sections.flatMap((section) => section.questions.flatMap((q) => [
    ...q.body,
    ...(q.mcq_options?.length ? [{ block_id: `${q.question_id}-mcq-options`, slot: "body" as const, position: q.body.length, block_type: "list" as const, content: { ordered: false, items: q.mcq_options.map((option, i) => `(${String.fromCharCode(65 + i)}) ${option.content.map((b) => String(b.content.text ?? b.content.latex ?? "")).join(" ")}`) } }] : []),
    ...q.parts.flatMap((part) => part.body),
  ]));
  const sharedImages = options.resolvedImages ?? new Map<string, ResolvedImage>([
    ...(await resolveImages(allBlocks)),
    ...(await resolveEquations(allBlocks)),
  ]);
  await writeHscCover(w, plan);
  w.newPage();

  let qn = 0;
  let planIdx = 0;
  for (let si = 0; si < options.sections.length; si++) {
    const section = options.sections[si];
    if (!section.questions.length) continue;
    const secPlan = plan.sections[planIdx++];
    if (!secPlan) continue;
    if (planIdx > 1) w.newPage();
    writeSectionHeader(w, secPlan);

    for (const q of section.questions) {
      const questionBody = q.body;
      const mcqBlock = q.mcq_options?.length ? [{
        block_id: `${q.question_id}-mcq-options`,
        slot: "body" as const,
        position: q.body.length,
        block_type: "list" as const,
        content: { ordered: false, items: q.mcq_options.map((option, i) => `(${String.fromCharCode(65 + i)}) ${option.content.map((b) => String(b.content.text ?? b.content.latex ?? "")).join(" ")}`) },
      } as ContentBlock] : [];
      const questionStartHeight = 6 + LINE_H(EXAM.font.bodyPt)
        + estimateBlocksHeight(w, questionBody, sharedImages)
        + estimateBlocksHeight(w, mcqBlock, sharedImages);
      startOnNextPageIfNeeded(w, questionStartHeight);
      qn += 1;
      w.spacer(6);
      const markText = formatMarks(q.marks);
      const headerY = w.y;
      w.textLine(`Question ${qn}`, { font: w.fonts.bold, size: EXAM.font.bodyPt });
      w.drawMarks(markText, headerY);
      const questionStartPage = w.pageNumber;
      const beforePart = (part: Question["parts"][number]) => {
        const label = part.part_label ? `(${part.part_label})` : "";
        const marks = marksLabel(part.marks);
        const partHeader = [label, marks ? `[${marks}]` : ""].filter(Boolean).join("  ");
        const height = (partHeader ? LINE_H(EXAM.font.bodyPt) : 0)
          + estimateBlocksHeight(w, part.body, sharedImages, 22);
        startOnNextPageIfNeeded(w, height);
      };
      await renderPaperQuestion(w, q, sharedImages, beforePart);
      if (w.pageNumber > questionStartPage) {
        w.drawQuestionContinuation(qn, questionStartPage, w.pageNumber);
      }
      w.spacer(10);
      options.onQuestionProgress?.(qn, options.sections.reduce((sum, item) => sum + item.questions.length, 0));
    }
    const isFinalSection = planIdx === plan.sections.length;
    w.ensure(LINE_H(EXAM.font.bodyPt) * 2);
    w.spacer(8);
    w.text(isFinalSection ? "End of Exam" : `End of ${secPlan.title}`, {
      font: w.fonts.bold,
      size: EXAM.font.bodyPt,
      align: "center",
    });
  }
  w.drawPageFooter();
  const bytes = await pdf.save();
  return new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
}

/** Build a separate answer and marking guide for a previously generated paper. */
export async function buildPdfSolutions(title: string, sections: DocSection[]): Promise<Blob> {
  const pdf = await PDFDocument.create();
  const fonts = await embedUnicodeFonts(pdf);
  const w = new Writer(pdf, fonts);
  const questions = sections.flatMap((section) => section.questions);
  const solutionBlocks = questions.flatMap((q) => [
    ...q.answer, ...q.solution, ...q.marking_criteria,
    ...q.parts.flatMap((part) => [...part.answer, ...part.solution, ...part.marking_criteria]),
  ]);
  const images = new Map<string, ResolvedImage>([
    ...(await resolveImages(solutionBlocks)),
    ...(await resolveEquations(solutionBlocks)),
  ]);
  w.text(title, { font: w.fonts.bold, size: 20, align: "center" });
  w.spacer(6);
  w.text("Solutions and marking guide", { font: w.fonts.bold, size: 13, align: "center" });
  w.rule();
  const appendSlot = async (label: string, blocks: ContentBlock[]) => {
    if (!blocks.length) return;
    w.ensure(LINE_H(EXAM.font.bodyPt) * 2);
    w.text(label, { font: w.fonts.bold, size: EXAM.font.bodyPt });
    await renderBlocks(w, blocks, images);
    w.spacer(4);
  };
  let number = 0;
  for (const section of sections) {
    if (section.label) {
      w.ensure(LINE_H(15) * 2);
      w.text(section.label, { font: w.fonts.bold, size: 15 });
      w.rule();
    }
    for (const q of section.questions) {
      number++;
      w.ensure(LINE_H(13) * 2);
      w.text(`Question ${number}`, { font: w.fonts.bold, size: 13 });
      w.spacer(3);
      await appendSlot("Answer", q.answer);
      await appendSlot("Solution", q.solution);
      await appendSlot("Marking criteria", q.marking_criteria);
      for (const part of q.parts) {
        const label = part.part_label ? `(${part.part_label})` : "Part";
        await appendSlot(`${label} — Answer`, part.answer);
        await appendSlot(`${label} — Solution`, part.solution);
        await appendSlot(`${label} — Marking criteria`, part.marking_criteria);
      }
    }
  }
  w.drawPageFooter();
  const bytes = await pdf.save();
  return new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
}

