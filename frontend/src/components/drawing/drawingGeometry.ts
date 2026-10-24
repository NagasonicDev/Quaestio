import type { DrawingPoint, DrawingStroke } from "../../lib/drawingNotebook";

const squaredDistance = (a: DrawingPoint, b: DrawingPoint) => {
  const x = a.x - b.x;
  const y = a.y - b.y;
  return x * x + y * y;
};

function nearPath(point: DrawingPoint, path: DrawingPoint[], radius: number): boolean {
  return path.some((eraserPoint) => squaredDistance(point, eraserPoint) <= radius * radius);
}

/**
 * Removes only the portions of a stroke covered by the eraser path. Strokes
 * that were not touched keep their object and id, which keeps persistence and
 * undo histories pleasantly small.
 */
export function eraseStrokePath(
  strokes: DrawingStroke[],
  eraserPath: DrawingPoint[],
  radius: number
): DrawingStroke[] {
  if (!eraserPath.length || radius <= 0) return strokes;

  return strokes.flatMap((stroke) => {
    const chunks: DrawingPoint[][] = [];
    let chunk: DrawingPoint[] = [];
    let touched = false;

    for (const point of stroke.points) {
      if (nearPath(point, eraserPath, radius)) {
        touched = true;
        if (chunk.length) chunks.push(chunk);
        chunk = [];
      } else {
        chunk.push(point);
      }
    }
    if (chunk.length) chunks.push(chunk);
    if (!touched) return [stroke];

    return chunks
      .filter((points) => points.length > 0)
      .map((points, index) => ({
        ...stroke,
        stroke_id: `${stroke.stroke_id}:erase:${index}`,
        points,
      }));
  });
}

export function eraseStrokeAtPoint(
  strokes: DrawingStroke[],
  point: DrawingPoint,
  radius: number
): DrawingStroke[] {
  return eraseStrokePath(strokes, [point], radius);
}

/** Whole-stroke erasing is deliberately separate from pixel erasing. */
export function eraseWholeStrokesAtPath(
  strokes: DrawingStroke[],
  eraserPath: DrawingPoint[],
  radius: number
): DrawingStroke[] {
  if (!eraserPath.length || radius <= 0) return strokes;
  return strokes.filter((stroke) => !stroke.points.some((point) => nearPath(point, eraserPath, radius)));
}
