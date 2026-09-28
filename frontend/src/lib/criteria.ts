import type { ContentBlock, Source } from "../api/types";

export interface CriteriaRow {
  criteria: string;
  marks: string;
}

export const MARKS_PREFIX_RE =
  /^(\d+(?:\.\d+)?)\s*(?:(?:-\s*|–\s*|—\s*|\bto\b\s+|\bor\b\s+|\/\s*)(\d+(?:\.\d+)?))?\s*marks?\b/i;

export const MARKS_TRAIL_RE =
  /\s*[([](\d+(?:\.\d+)?(?:\s*[-\u2013\u2014/]\s*\d+(?:\.\d+)?)?)\s*marks?\s*[)]]\s*$/i;

function stripAllocationChars(s: string): string {
  return s.replace(/^[:–—:-]+/, "").trim();
}

/** Splits a marking-guide line into (allocation, clean text). */
export function splitAllocation(text: string): { allocation: string; clean: string } {
  const prefix = MARKS_PREFIX_RE.exec(text);
  if (prefix) {
    const low = prefix[1];
    const high = prefix[2];
    const allocation = high ? `${low}\u2013${high}` : low;
    const clean = stripAllocationChars(text.slice(prefix[0].length));
    return { allocation, clean };
  }
  const trail = MARKS_TRAIL_RE.exec(text);
  if (trail) {
    const group = trail[1].replace(/\s+/g, "");
    return { allocation: group, clean: text.slice(0, trail.index).trim() };
  }
  return { allocation: "", clean: text };
}

/**
 * Port of exam_export.py criteria_rows: list items and non-empty text blocks
 * become <criteria, alloc> rows; every other block type is supplementary.
 */
export function criteriaRows(
  marking: ContentBlock[]
): { rows: CriteriaRow[]; hasRows: boolean; supplementary: ContentBlock[] } {
  const sorted = [...marking].sort((a, b) => a.position - b.position);
  const rows: CriteriaRow[] = [];
  const supplementary: ContentBlock[] = [];
  for (const block of sorted) {
    if (block.block_type === "list") {
      const content = block.content ?? {};
      const items: unknown = content.items;
      if (Array.isArray(items)) {
        for (const item of items) {
          const text = String(item ?? "");
          const { allocation, clean } = splitAllocation(text);
          rows.push({ criteria: clean, marks: allocation });
        }
      }
      continue;
    }
    if (block.block_type === "text" && String(block.content?.text ?? "").trim()) {
      const text = String(block.content.text);
      const { allocation, clean } = splitAllocation(text);
      rows.push({ criteria: clean, marks: allocation });
      continue;
    }
    supplementary.push(block);
  }
  return { rows, hasRows: rows.length > 0, supplementary };
}

/** {marks:g} equivalent — integers print bare, floats trimmed. */
export function formatMarks(marks: number | null | undefined): string {
  if (marks === null || marks === undefined) return "";
  if (Number.isInteger(marks)) return String(marks);
  return String(Number(marks.toFixed(2)));
}

export function marksLabel(marks: number | null | undefined): string {
  const m = formatMarks(marks);
  if (!m) return "";
  return `${m} mark${marks === 1 ? "" : "s"}`;
}

/** Source attribution for generated test papers, e.g. "(Trial Examination, 2025)". */
export function formatSourceBracket(source: Source | null | undefined): string | null {
  if (!source?.name) return null;
  const institution = source.institution?.trim();
  const name = source.name.trim();
  // Institution is the editable, course-managed label. Avoid repeating it
  // when older imports already included it in the source name.
  const conciseName = institution && name.toLocaleLowerCase().startsWith(institution.toLocaleLowerCase())
    ? name.slice(institution.length).replace(/^[\s,:–—-]+/, "")
    : name;
  const inner = [institution, conciseName, source.year != null ? String(source.year) : null]
    .filter(Boolean)
    .join(", ");
  return `(${inner})`;
}

export function contentOf(block: ContentBlock, key: string, fallback: unknown = null): any {
  const c = block.content ?? {};
  const v = c[key];
  return v === undefined || v === null ? fallback : v;
}

/** Turn both plain and structured table cell values into renderable text. */
export function tableCellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(tableCellText).join("");
  if (typeof value !== "object") return "";

  const cell = value as Record<string, unknown>;
  const content = cell.content;
  if (cell.block_type === "equation" && content && typeof content === "object") {
    const latex = (content as Record<string, unknown>).latex;
    return typeof latex === "string" ? `$${latex}$` : "";
  }
  if (typeof cell.text === "string") return cell.text;
  if (typeof cell.latex === "string") return `$${cell.latex}$`;
  if (typeof content === "string") return content;
  if (content && typeof content === "object") {
    const nested = content as Record<string, unknown>;
    if (typeof nested.text === "string") return nested.text;
    if (typeof nested.latex === "string") return `$${nested.latex}$`;
    if (Array.isArray(nested.blocks)) return tableCellText(nested.blocks);
  }
  if (Array.isArray(cell.blocks)) return tableCellText(cell.blocks);
  return "";
}

/** Normalize the row encodings used by imported and editor-created tables. */
export function tableRows(rows: unknown, columns: unknown): unknown[][] {
  if (!Array.isArray(rows)) return [];
  const headers = Array.isArray(columns) ? columns : [];
  return rows.map((row) => {
    if (Array.isArray(row)) return row;
    if (!row || typeof row !== "object") return [];
    const record = row as Record<string, unknown>;
    for (const key of ["cells", "values", "data"]) {
      if (Array.isArray(record[key])) return record[key] as unknown[];
    }
    return headers.map((header, index) => {
      const key = tableCellText(header);
      return record[key] ?? record[String(index)] ?? "";
    });
  });
}
