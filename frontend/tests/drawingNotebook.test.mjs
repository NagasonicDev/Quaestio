import test from "node:test";
import assert from "node:assert/strict";
import { MAX_MARKING_IMAGE_PAGES, touchedDrawingPages } from "../src/lib/drawingNotebook.ts";

const stroke = {
  stroke_id: "s1",
  kind: "pen",
  color: "#000000",
  width: 2,
  points: [{ x: 0.1, y: 0.2, pressure: 0.5, time: 1 }],
};

const page = (id, strokes) => ({
  page_id: id,
  question_id: "q1",
  position: 0,
  title: id,
  background: "plain",
  strokes,
});

const notebook = (pages) => ({ question_id: "q1", pages });

test("touchedDrawingPages drops blank and fully erased pages", () => {
  const pages = touchedDrawingPages(notebook([
    page("blank", []),
    page("erased", []),
    page("written", [stroke]),
  ]));
  assert.deepEqual(pages.map((entry) => entry.page_id), ["written"]);
});

test("touchedDrawingPages keeps highlighter-only pages", () => {
  const highlighter = { ...stroke, kind: "highlighter" };
  const pages = touchedDrawingPages(notebook([page("highlight", [highlighter])]));
  assert.deepEqual(pages.map((entry) => entry.page_id), ["highlight"]);
});

test("touchedDrawingPages preserves page order and caps at the marking allowance", () => {
  const pages = touchedDrawingPages(notebook(
    Array.from({ length: MAX_MARKING_IMAGE_PAGES + 1 }, (_, index) => page(`p${index}`, [stroke]))
  ));
  assert.equal(pages.length, MAX_MARKING_IMAGE_PAGES);
  assert.deepEqual(pages.map((entry) => entry.page_id), ["p0", "p1", "p2", "p3", "p4"]);
});
