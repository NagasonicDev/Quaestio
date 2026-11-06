import type { DrawingNotebook, DrawingPage } from "../api/types.ts";
export type { DrawingNotebook, DrawingPage, DrawingPoint, DrawingStroke, DrawingTool } from "../api/types.ts";

export const MAX_DRAWING_NOTEBOOK_PAGES = 12;
export const MAX_DRAWING_STROKES_PER_PAGE = 5000;
export const MAX_DRAWING_POINTS_PER_PAGE = 50000;
export const MAX_DRAWING_PAGE_BYTES = 5_000_000;
/** Pages marked per submission; mirrors the hosted daily page allowance. */
export const MAX_MARKING_IMAGE_PAGES = 5;

/** Only pages the student actually wrote on. Fully erased pages have no strokes. */
export function touchedDrawingPages(notebook: DrawingNotebook, limit = MAX_MARKING_IMAGE_PAGES): DrawingPage[] {
  return notebook.pages.filter((page) => page.strokes.length > 0).slice(0, limit);
}

export function validateDrawingPage(questionId: string, page: DrawingPage): void {
  if (!questionId || page.question_id !== questionId || !page.page_id || !page.title.trim()) {
    throw new Error("Invalid drawing page");
  }
  if (!Number.isInteger(page.position) || page.position < 0) throw new Error("Invalid page position");
  if (!("plain ruled grid dotted".split(" ").includes(page.background))) throw new Error("Invalid page background");
  if (!Array.isArray(page.strokes)) throw new Error("Invalid drawing strokes");
  if (page.strokes.length > MAX_DRAWING_STROKES_PER_PAGE) {
    throw new Error(`A drawing page can have no more than ${MAX_DRAWING_STROKES_PER_PAGE} strokes`);
  }
  let pointCount = 0;
  for (const stroke of page.strokes) {
    if (!stroke.stroke_id || !(stroke.kind === "pen" || stroke.kind === "highlighter") || !stroke.color ||
        !Number.isFinite(stroke.width) || stroke.width <= 0 || !Array.isArray(stroke.points)) {
      throw new Error("Invalid drawing stroke");
    }
    pointCount += stroke.points.length;
    if (pointCount > MAX_DRAWING_POINTS_PER_PAGE) {
      throw new Error(`A drawing page can have no more than ${MAX_DRAWING_POINTS_PER_PAGE} points`);
    }
    for (const point of stroke.points) {
      if (!Number.isFinite(point.x) || point.x < 0 || point.x > 1 || !Number.isFinite(point.y) || point.y < 0 || point.y > 1 ||
          !Number.isFinite(point.pressure) || point.pressure < 0 || point.pressure > 1 ||
          !Number.isFinite(point.time) || point.time < 0) throw new Error("Invalid drawing point");
    }
  }
  if (JSON.stringify(page.strokes).length > MAX_DRAWING_PAGE_BYTES) {
    throw new Error("This drawing page is too large");
  }
}
export function validateDrawingNotebooks(value: unknown): DrawingNotebook[] {
  if (!Array.isArray(value)) throw new Error("Invalid drawing notebooks");
  const pageIds = new Set<string>();
  for (const notebook of value as DrawingNotebook[]) {
    if (!notebook || typeof notebook.question_id !== "string" || !notebook.question_id || !Array.isArray(notebook.pages)) {
      throw new Error("Invalid drawing notebook");
    }
    if (notebook.pages.length > MAX_DRAWING_NOTEBOOK_PAGES) {
      throw new Error(`A drawing notebook can have no more than ${MAX_DRAWING_NOTEBOOK_PAGES} pages`);
    }
    const positions = new Set<number>();
    for (const page of notebook.pages) {
      validateDrawingPage(notebook.question_id, page);
      if (pageIds.has(page.page_id) || positions.has(page.position)) throw new Error("Duplicate drawing page id or position");
      pageIds.add(page.page_id);
      positions.add(page.position);
    }
  }
  return value as DrawingNotebook[];
}
