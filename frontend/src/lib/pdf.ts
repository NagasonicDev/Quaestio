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
import { contentOf, formatMarks, formatSourceBracket, marksLabel, solutionSlots, tableCellText, tableColumnAligns, tableColumnWidths, tableRows, type SolutionSlot } from "./criteria";
import { inlineMathImageId, resolveEquations, resolveImages, yieldToUi, type ResolvedImage } from "./resolvers";
import { latexToPlain, mathPtSize, splitRichTokens, MATH_FONT_PX } from "./mathText";
import { logTiming } from "./timing";
import type { DocSection } from "./docx";
import {
  EXAM,
  buildExamPaperPlan,
  formatMcOption,
  formatPageNumber,
  generalInstructionsLines,
  isMcOptionLine,
  mcqOptionBlocks,
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
interface TableItem { text?: string; image?: PDFImage; w: number; h: number }
interface TableLine { items: TableItem[]; w: number; h: number }
interface TableCellLayout { lines: TableLine[]; height: number }
const TABLE_PAD_V = 4;
const rowHeightOf = (laid: TableCellLayout[]) => Math.max(20, ...laid.map((cell) => cell.height)) + TABLE_PAD_V * 2;


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

  /**
   * Lay a cell's text and inline-math images out into wrapped lines. Maths is
   * sized from the expression's own rendered height, so tall fractions grow the
   * line instead of being squashed to fit.
   */
  private async layoutCell(
    text: string,
    cellWidth: number,
    size: number,
    font: PDFFont,
    images: Map<string, ResolvedImage>,
    blockId: string,
    index: { value: number },
  ): Promise<TableCellLayout> {
    const lineH = LINE_H(size);
    const avail = Math.max(1, cellWidth - 8);
    const lines: TableLine[] = [];
    let items: TableItem[] = [];
    let lineW = 0;
    let lineHeight = lineH;
    const flush = () => {
      if (items.length) lines.push({ items, w: lineW, h: lineHeight });
      items = [];
      lineW = 0;
      lineHeight = lineH;
    };
    const add = (item: TableItem, isSpace: boolean) => {
      if (lineW + item.w > avail && items.length && !isSpace) flush();
      if (isSpace && !items.length) return;
      items.push(item);
      lineW += item.w;
      lineHeight = Math.max(lineHeight, item.h);
    };
    const addWords = (words: string) => {
      for (const word of words.split(/(\s+)/)) {
        if (!word) continue;
        add({ text: word, w: font.widthOfTextAtSize(word, size), h: lineH }, /^\s+$/.test(word));
      }
    };
    for (const token of splitRichTokens(text)) {
      if ("math" in token) {
        const resolved = images.get(inlineMathImageId(blockId, index.value++));
        if (resolved) {
          const embedded = await this.embedImage(resolved.data);
          const sized = mathPtSize(resolved.widthPx, resolved.heightPx, size);
          add({ image: embedded, w: sized.width, h: sized.height }, false);
        } else addWords(latexToPlain(token.math));
      } else addWords(token.text);
    }
    flush();
    return { lines, height: lines.reduce((sum, line) => sum + line.h, 0) };
  }

  /** Paint one laid-out table row, borders and all, from the current `y`. */
  private drawTableRow(
    laid: TableCellLayout[],
    widths: number[],
    aligns: Array<"left" | "center" | "right">,
    opts: { fill?: boolean; center?: boolean } = {},
  ) {
    const size = 9;
    const rowHeight = rowHeightOf(laid);
    const x0 = MARGIN_L;
    const rowTop = this.y;
    const totalW = widths.reduce((sum, width) => sum + width, 0);
    if (opts.fill) this.page.page.drawRectangle({ x: x0, y: rowTop - rowHeight, width: totalW, height: rowHeight, color: HEADER_BG });
    let cx = x0;
    for (let i = 0; i < widths.length; i++) {
      const cellW = widths[i];
      const align = opts.center ? "center" : aligns[i];
      let lineTop = rowTop - TABLE_PAD_V;
      for (const line of laid[i]?.lines ?? []) {
        let lx = cx + 4;
        if (align === "center") lx = cx + (cellW - line.w) / 2;
        else if (align === "right") lx = cx + cellW - 4 - line.w;
        const baseline = lineTop - line.h / 2 - 0.35 * size;
        for (const item of line.items) {
          if (item.image) {
            this.page.page.drawImage(item.image, { x: lx, y: lineTop - line.h / 2 - item.h / 2, width: item.w, height: item.h });
          } else if (item.text?.trim()) {
            drawSafeText(this.page.page, item.text, { x: lx, y: baseline, size, font: this.fonts.reg, color: BLACK });
          }
          lx += item.w;
        }
        lineTop -= line.h;
      }
      cx += cellW;
    }
    this.page.page.drawRectangle({ x: x0, y: rowTop - rowHeight, width: totalW, height: rowHeight, borderColor: BORDER, borderWidth: 0.5 });
    let vx = x0;
    for (const width of widths.slice(0, -1)) {
      vx += width;
      this.page.page.drawLine({ start: { x: vx, y: rowTop }, end: { x: vx, y: rowTop - rowHeight }, thickness: 0.5, color: BORDER });
    }
    this.y -= rowHeight;
  }

  /**
   * Draw a table sized to the text column. The header row repeats on each
   * continuation page and is never left alone at the foot of a page.
   */
  async table(block: ContentBlock, images: Map<string, ResolvedImage>) {
    const columns = contentOf(block, "columns", []);
    const rawRows = contentOf(block, "rows", []);
    if (!Array.isArray(columns) || columns.length === 0) return;
    const rows = tableRows(rawRows, columns);
    const widths = tableColumnWidths(block, BODY_W);
    const aligns = tableColumnAligns(block);
    const index = { value: 0 };
    // Lay every row out once, in order, so inline-math image indices advance
    // exactly once even when the header is redrawn on a new page.
    const buildRow = async (cells: string[]): Promise<TableCellLayout[]> =>
      Promise.all(cells.map((cell, i) => this.layoutCell(cell, widths[i], 9, this.fonts.reg, images, block.block_id, index)));
    const header = await buildRow(columns.map(tableCellText));
    const body: TableCellLayout[][] = [];
    for (const row of rows) {
      if (!row.length) continue;
      body.push(await buildRow(row.slice(0, columns.length).map(tableCellText)));
    }
    this.spacer(4);
    this.ensure(rowHeightOf(header) + (body.length ? rowHeightOf(body[0]) : 0));
    this.drawTableRow(header, widths, aligns, { fill: true, center: true });
    for (const laid of body) {
      if (this.y - rowHeightOf(laid) < BOTTOM) {
        this.newPage();
        this.drawTableRow(header, widths, aligns, { fill: true, center: true });
      }
      this.drawTableRow(laid, widths, aligns);
    }
    this.spacer(8);
  }

  async richText(text: string, images: Map<string, ResolvedImage>, blockId: string, opts: { indent?: number; size?: number; font?: PDFFont; mathIndex?: { value: number }; hang?: number } = {}) {
    const size = opts.size ?? EXAM.font.bodyPt;
    const font = opts.font ?? this.fonts.reg;
    text = pdfSafeText(text, font);
    const indent = opts.indent ?? 0;
    const hang = opts.hang ?? 0;
    const firstX = MARGIN_L + indent;
    const contX = MARGIN_L + indent + hang;
    const maxW = Math.max(1, BODY_W - indent - hang);
    const mathIndex = opts.mathIndex ?? { value: 0 };
    type Atom = { text?: string; image?: PDFImage; w: number; h: number };
    const atoms: Atom[] = [];
    const addWords = (words: string) => {
      for (const word of words.split(/(\s+)/)) {
        if (word) atoms.push({ text: word, w: font.widthOfTextAtSize(word, size), h: LINE_H(size) });
      }
    };
    for (const token of splitRichTokens(text)) {
      if ("math" in token) {
        const resolved = images.get(inlineMathImageId(blockId, mathIndex.value++));
        if (resolved) {
          const embedded = await this.embedImage(resolved.data);
          const sized = mathPtSize(resolved.widthPx, resolved.heightPx, size);
          atoms.push({ image: embedded, w: sized.width, h: sized.height });
        } else addWords(latexToPlain(token.math));
      } else addWords(token.text);
    }
    // Wrap into lines; a line grows to fit the tallest inline-math image so
    // fractions are never squashed to the surrounding text height.
    const lines: Array<Array<{ text?: string; image?: PDFImage; w: number; h: number }>> = [];
    let line: Array<{ text?: string; image?: PDFImage; w: number; h: number }> = [];
    let lineW = 0;
    for (const atom of atoms) {
      const isSpace = atom.text !== undefined && /^\s+$/.test(atom.text);
      if (lineW + atom.w > maxW && line.length && !isSpace) {
        lines.push(line);
        line = [];
        lineW = 0;
      }
      if (isSpace && !line.length) continue;
      line.push(atom);
      lineW += atom.w;
    }
    if (line.length) lines.push(line);
    for (let i = 0; i < lines.length; i++) {
      const items = lines[i];
      const h = Math.max(LINE_H(size), ...items.map((atom) => atom.h));
      this.ensure(h);
      let x = i === 0 ? firstX : contX;
      const baseline = this.y - h / 2 - 0.35 * size;
      for (const atom of items) {
        if (atom.image) this.page.page.drawImage(atom.image, { x, y: this.y - h / 2 - atom.h / 2, width: atom.w, height: atom.h });
        else if (atom.text?.trim()) drawSafeText(this.page.page, atom.text, { x, y: baseline, size, font, color: BLACK });
        x += atom.w;
      }
      this.y -= h;
    }
    if (!lines.length) this.y -= LINE_H(size);
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

  /**
   * Draw a display equation at body-text scale. Sizing comes from the stored
   * CSS pixels (KaTeX at MATH_FONT_PX), so the glyphs match the surrounding
   * text; only an expression wider than the text column is scaled down.
   */
  async equationImage(resolved: ResolvedImage, targetPt = EXAM.font.bodyPt) {
    const embedded = await this.embedImage(resolved.data);
    const scale = targetPt / MATH_FONT_PX;
    let dw = resolved.widthPx * scale;
    let dh = resolved.heightPx * scale;
    if (dw > BODY_W) {
      const fit = BODY_W / dw;
      dw *= fit;
      dh *= fit;
    }
    const x = MARGIN_L + (BODY_W - dw) / 2;
    this.ensure(dh + 10);
    this.spacer(2);
    this.page.page.drawImage(embedded, { x, y: this.y - dh, width: dw, height: dh });
    this.y -= dh + 6;
  }
}

/** Port of docx.ts renderBlock → PDF. Renders one block and returns. */
async function renderBlock(w: Writer, b: ContentBlock, images: Map<string, ResolvedImage>): Promise<boolean> {
  switch (b.block_type) {
    case "text": {
      const eq = images.get(b.block_id);
      if (eq) { await w.equationImage(eq); return true; }
      const t = contentOf(b, "text", "");
      if (typeof t === "string" && t) await w.richText(t, images, b.block_id);
      return true;
    }
    case "heading": {
      const eq = images.get(b.block_id);
      if (eq) { await w.equationImage(eq); return true; }
      const t = contentOf(b, "text", "");
      if (typeof t === "string" && t) await w.richText(t, images, b.block_id, { font: w.fonts.bold, size: 13 });
      return true;
    }
    case "equation": {
      const img = images.get(b.block_id);
      if (!img) {
        const latex = contentOf(b, "latex", "");
        if (typeof latex === "string" && latex) w.text(latexToPlain(latex), { font: w.fonts.italic, size: 11, color: GRAY, align: contentOf(b, "display", true) !== false ? "center" : "left" });
        return true;
      }
      await w.equationImage(img);
      return true;
    }
    case "image":
    case "diagram":
    case "graph":
    case "function": {
      const img = images.get(b.block_id);
      if (!img) {
        const path = contentOf(b, "asset_path", "");
        w.text(b.block_type === "function" ? `y = ${String(contentOf(b, "expression", ""))}` : `[missing image: ${typeof path === "string" ? path : ""}]`, { font: w.fonts.italic, size: 10, color: GRAY });
        w.y -= LINE_H(11);
        return true;
      }
      const embedded = await w.embedImage(img.data, img.mime);
      w.fitImage(embedded, { maxW: 4.5 * PT, maxH: 4.5 * PT });
      w.y -= LINE_H(11);
      return true;
    }
    case "table": {
      await w.table(b, images);
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
          const lead = prefix ? `${prefix}  ` : "";
          // Hanging indent: continuation lines line up with the text, not the bullet.
          const hang = lead ? w.fonts.reg.widthOfTextAtSize(lead, EXAM.font.bodyPt) : 0;
          await w.richText(`${lead}${item}`, images, b.block_id, { indent: prefix ? 12 : 20, hang, mathIndex });
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
      const eq = images.get(block.block_id);
      if (eq) return eq.heightPx * (EXAM.font.bodyPt / MATH_FONT_PX) + 8;
      const text = contentOf(block, "text", "");
      if (typeof text !== "string" || !text) return 0;
      const size = block.block_type === "heading" ? 13 : EXAM.font.bodyPt;
      return textHeight(text, size, block.block_type === "heading" ? w.fonts.bold : w.fonts.reg);
    }
    case "equation": {
      const eq = images.get(block.block_id);
      return eq ? eq.heightPx * (EXAM.font.bodyPt / MATH_FONT_PX) + 8 : LINE_H(10);
    }
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
      const colWidths = tableColumnWidths(block, BODY_W);
      const rowHeight = (cells: unknown[], size: number, font: PDFFont) => {
        const lines = Math.max(1, ...cells.map((cell, i) => wrapText(font, tableCellText(cell), size, Math.max(1, colWidths[i] - 8)).length));
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
  const optionBlocks = q.mcq_options?.length ? mcqOptionBlocks(q) : [];
  const blocks: ContentBlock[] = [...questionBody, ...optionBlocks];
  for (const part of q.parts) blocks.push(...part.body);
  const ids = sharedImages ?? new Map<string, ResolvedImage>([
    ...(await resolveImages(blocks)),
    ...(await resolveEquations(blocks)),
  ]);
  await renderBlocks(w, questionBody, ids);
  if (optionBlocks.length) await renderBlocks(w, optionBlocks, ids);
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

export interface PdfStimulusItem {
  stimulus: import("../api/types").StimulusWithContent;
  questionNumbers: number[];
}

export interface PdfOptions {
  title: string;
  courseName: string;
  achievedMarks: number;
  sections: DocSection[];
  resolvedImages?: Map<string, ResolvedImage>;
  stimuli?: PdfStimulusItem[];
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
  const allBlocks = [
    ...options.sections.flatMap((section) => section.questions.flatMap((q) => [
      ...q.body,
      ...(q.mcq_options?.length ? mcqOptionBlocks(q) : []),
      ...q.parts.flatMap((part) => part.body),
    ])),
    ...(options.stimuli ?? []).flatMap((item) => item.stimulus.blocks),
  ];
  const sharedImages = options.resolvedImages ?? new Map<string, ResolvedImage>([
    ...(await resolveImages(allBlocks)),
    ...(await resolveEquations(allBlocks)),
  ]);
  await writeHscCover(w, plan);
  w.newPage();

  let qn = 0;
  let planIdx = 0;
  const totalQuestions = options.sections.reduce((sum, item) => sum + item.questions.length, 0);
  for (let si = 0; si < options.sections.length; si++) {
    const section = options.sections[si];
    if (!section.questions.length) continue;
    const secPlan = plan.sections[planIdx++];
    if (!secPlan) continue;
    if (planIdx > 1) w.newPage();
    writeSectionHeader(w, secPlan);

    for (const q of section.questions) {
      const questionBody = q.body;
      const mcqBlocks = q.mcq_options?.length ? mcqOptionBlocks(q) : [];
      const questionStartHeight = 6 + LINE_H(EXAM.font.bodyPt)
        + estimateBlocksHeight(w, questionBody, sharedImages)
        + estimateBlocksHeight(w, mcqBlocks, sharedImages);
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
      options.onQuestionProgress?.(qn, totalQuestions);
      // Let the UI paint the updated generation percentage before rendering
      // the next question. Without yielding a frame, a long paper can keep the
      // browser displaying the previous phase until the export is complete.
      if (options.onQuestionProgress) {
        await yieldToUi();
      }
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
  if (options.stimuli?.length) {
    w.newPage();
    w.spacer(10);
    w.text("Stimulus Material", { font: w.fonts.bold, size: EXAM.font.titlePt });
    w.rule();
    for (let i = 0; i < options.stimuli.length; i++) {
      const item = options.stimuli[i];
      const label = item.stimulus.title ? `Stimulus ${i + 1}: ${item.stimulus.title}` : `Stimulus ${i + 1}`;
      const refs = item.questionNumbers.length
        ? ` (Referenced by Question${item.questionNumbers.length > 1 ? "s" : ""}: ${item.questionNumbers.join(", ")})`
        : "";
      w.spacer(8);
      w.text(`${label}${refs}`, { font: w.fonts.bold, size: EXAM.font.bodyPt });
      await renderBlocks(w, item.stimulus.blocks, sharedImages);
      if (i < options.stimuli.length - 1) {
        w.spacer(6);
        w.rule(HR);
        w.spacer(6);
      }
    }
    w.ensure(LINE_H(EXAM.font.bodyPt) * 2);
    w.spacer(8);
    w.text("End of Stimulus Material", { font: w.fonts.bold, size: EXAM.font.bodyPt, align: "center" });
  }
  w.drawPageFooter();
  const bytes = await pdf.save();
  return new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
}

/** Build a separate answer and marking guide for a previously generated paper. */
export async function buildPdfSolutions(title: string, sections: DocSection[], onProgress?: (completed: number, total: number) => void): Promise<Blob> {
  const pdf = await PDFDocument.create();
  const fontsStart = performance.now();
  const fonts = await embedUnicodeFonts(pdf);
  logTiming("solutions:fonts", fontsStart);
  const w = new Writer(pdf, fonts);
  // Resolve every question's figures and equations in one shared pass: the
  // per-question write loop below only paints, so image work stays parallel.
  const questions = sections.flatMap((section) => section.questions);
  const slotsByQuestion = new Map(questions.map((q) => [q, solutionSlots(q)] as const));
  const solutionBlocks = questions.flatMap((q) => (slotsByQuestion.get(q) ?? []).flatMap((slot) => slot.blocks));
  // Progress counts real work: each resolved figure/equation, then each written
  // question, plus one unit held back until the PDF is actually saved.
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
  const [imageMap, equationMap] = await Promise.all([
    resolveImages(solutionBlocks, track(0)),
    resolveEquations(solutionBlocks, track(1)),
  ]);
  logTiming("solutions:resolve", resolveStart, `${resolveTotals[0]} figures, ${resolveTotals[1]} equations`);
  const images = new Map<string, ResolvedImage>([...imageMap, ...equationMap]);
  w.text(title, { font: w.fonts.bold, size: 20, align: "center" });
  w.spacer(6);
  w.text("Solutions and marking guide", { font: w.fonts.bold, size: 13, align: "center" });
  w.rule();
  const appendSlot = async (slot: SolutionSlot) => {
    if (!slot.blocks.length) return;
    if (slot.heading) {
      // Keep the heading with at least a couple of lines of what follows.
      w.ensure(LINE_H(slot.sub ? 12 : 13) + LINE_H(EXAM.font.bodyPt) * 2);
      w.spacer(slot.sub ? 8 : 12);
      w.text(slot.heading, { font: w.fonts.bold, size: slot.sub ? 11.5 : 13 });
      w.spacer(4);
    }
    w.ensure(LINE_H(11) + LINE_H(EXAM.font.bodyPt) * 2);
    w.spacer(slot.sub ? 6 : 10);
    w.text(slot.label, { font: w.fonts.bold, size: slot.sub ? 11 : EXAM.font.bodyPt });
    w.spacer(2);
    await renderBlocks(w, slot.blocks, images);
  };
  let number = 0;
  const writeStart = performance.now();
  for (const section of sections) {
    if (section.label) {
      w.ensure(LINE_H(15) * 2);
      w.spacer(8);
      w.text(section.label, { font: w.fonts.bold, size: 15 });
      w.rule();
    }
    for (const q of section.questions) {
      number++;
      if (number > 1 && q !== section.questions[0]) { w.ensure(LINE_H(13) * 5); w.spacer(14); w.rule(); w.spacer(8); }
      w.ensure(LINE_H(13) * 2);
      const headerY = w.y;
      w.text(`Question ${number}`, { font: w.fonts.bold, size: 13 });
      // Total marks sit at the right edge of the text column, matching the paper.
      const totalMarks = q.marks != null ? marksLabel(q.marks) : "";
      if (totalMarks) {
        const size = 10;
        const tw = w.fonts.reg.widthOfTextAtSize(totalMarks, size);
        drawSafeText(w.page.page, totalMarks, { x: MARGIN_L + BODY_W - tw, y: headerY, size, font: w.fonts.reg, color: GRAY });
      }
      w.spacer(3);
      drawSourceLine(w, q);
      for (const slot of slotsByQuestion.get(q) ?? []) await appendSlot(slot);
      questionsDone++;
      report();
      if (onProgress) await yieldToUi();
    }
  }
  w.drawPageFooter();
  logTiming("solutions:write", writeStart, `${questions.length} questions`);
  const saveStart = performance.now();
  const bytes = await pdf.save();
  const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
  logTiming("solutions:save", saveStart);
  onProgress?.(totalWork(), totalWork());
  return blob;
}

