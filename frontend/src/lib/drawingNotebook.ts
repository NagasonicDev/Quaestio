import type { DrawingNotebook, DrawingPage } from "../api/types";
export type { DrawingNotebook, DrawingPage, DrawingPoint, DrawingStroke, DrawingTool } from "../api/types";

export const MAX_DRAWING_NOTEBOOK_PAGES = 12;

export function validateDrawingPage(questionId: string, page: DrawingPage): void {
  if (!questionId || page.question_id !== questionId || !page.page_id || !page.title.trim()) {
    throw new Error("Invalid drawing page");
  }
  if (!Number.isInteger(page.position) || page.position < 0) throw new Error("Invalid page position");
  if (!("plain ruled grid dotted".split(" ").includes(page.background))) throw new Error("Invalid page background");
  if (!Array.isArray(page.strokes)) throw new Error("Invalid drawing strokes");
  for (const stroke of page.strokes) {
    if (!stroke.stroke_id || !(stroke.kind === "pen" || stroke.kind === "highlighter") || !stroke.color ||
        !Number.isFinite(stroke.width) || stroke.width <= 0 || !Array.isArray(stroke.points)) {
      throw new Error("Invalid drawing stroke");
    }
    for (const point of stroke.points) {
      if (!Number.isFinite(point.x) || point.x < 0 || point.x > 1 || !Number.isFinite(point.y) || point.y < 0 || point.y > 1 ||
          !Number.isFinite(point.pressure) || point.pressure < 0 || point.pressure > 1 ||
          !Number.isFinite(point.time) || point.time < 0) throw new Error("Invalid drawing point");
    }
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
