import type { DrawingPage, DrawingStroke } from "./drawingNotebook";

const WIDTH = 1024;
const HEIGHT = 768;
const LOGICAL_WIDTH = 640;
const LOGICAL_HEIGHT = 480;

function drawStroke(ctx: CanvasRenderingContext2D, stroke: DrawingStroke, scale: number) {
  const points = stroke.points;
  if (!points.length) return;
  const highlighter = stroke.kind === "highlighter";
  const width = (highlighter ? stroke.width * 2.7 : stroke.width) * scale;
  const x = (point: { x: number }) => point.x * LOGICAL_WIDTH * scale;
  const y = (point: { y: number }) => point.y * LOGICAL_HEIGHT * scale;

  ctx.save();
  ctx.globalAlpha = highlighter ? 0.42 : 1;
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = width;
  ctx.lineCap = highlighter ? "butt" : "round";
  ctx.lineJoin = highlighter ? "miter" : "round";

  if (points.length === 1) {
    const point = points[0];
    if (highlighter) {
      const markerWidth = stroke.width * scale;
      const markerHeight = stroke.width * 2.7 * scale;
      ctx.fillRect(x(point) - markerWidth / 2, y(point) - markerHeight / 2, markerWidth, markerHeight);
    } else {
      ctx.beginPath();
      ctx.arc(x(point), y(point), width / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.beginPath();
    ctx.moveTo(x(points[0]), y(points[0]));
    if (points.length < 3) {
      for (let index = 1; index < points.length; index += 1) {
        ctx.lineTo(x(points[index]), y(points[index]));
      }
    } else {
      // Same quadratic midpoint smoothing as DrawingCanvas.
      for (let index = 1; index < points.length - 1; index += 1) {
        const point = points[index];
        const next = points[index + 1];
        ctx.quadraticCurveTo(x(point), y(point), (x(point) + x(next)) / 2, (y(point) + y(next)) / 2);
      }
      const last = points[points.length - 1];
      ctx.lineTo(x(last), y(last));
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Render touched pages to JPEG data URLs for OCR. Blank pages are never drawn. */
export async function renderDrawingPages(pages: DrawingPage[]): Promise<string[]> {
  const touched = pages.filter((page) => page.strokes.length > 0);
  if (!touched.length) return [];

  const scale = WIDTH / LOGICAL_WIDTH;
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];

  const images: string[] = [];
  for (const page of touched) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    for (const stroke of page.strokes) drawStroke(ctx, stroke, scale);
    images.push(canvas.toDataURL("image/jpeg", 0.8));
  }
  return images;
}
