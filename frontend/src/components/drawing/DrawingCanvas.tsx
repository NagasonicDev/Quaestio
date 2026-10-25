import { useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";
import type { DrawingPage, DrawingPoint, DrawingStroke, DrawingTool } from "../../lib/drawingNotebook";
import { eraseStrokePath, eraseWholeStrokesAtPath } from "./drawingGeometry";

interface DrawingCanvasProps {
  page: DrawingPage;
  tool: DrawingTool;
  colour: string;
  width: number;
  expanded?: boolean;
  onChange(page: DrawingPage): void;
}


function pointFromEvent(event: { clientX: number; clientY: number; pressure: number }, bounds: DOMRect): DrawingPoint {
  return {
    x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
    y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    pressure: event.pressure > 0 ? event.pressure : 0.5,
    time: Date.now(),
  };
}

function pathData(points: DrawingPoint[]): string {
  const project = (point: Pick<DrawingPoint, "x" | "y">) => `${point.x * 640} ${point.y * 480}`;
  if (points.length < 3) return points.map((point, index) => `${index ? "L" : "M"}${project(point)}`).join(" ");
  let path = `M${project(points[0])}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index];
    const next = points[index + 1];
    const midpoint = { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 };
    path += ` Q${project(point)} ${project(midpoint)}`;
  }
  const last = points[points.length - 1];
  // Finish with an explicit final segment. A smooth quadratic T command here
  // can leave a zero-length tangent, which makes the flat cap look rounded.
  return `${path} L${project(last)}`;
}

function Stroke({ stroke }: { stroke: DrawingStroke }) {
  const isHighlighter = stroke.kind === "highlighter";
  // Match the height of a stationary vertical marker nib so its thickness
  // does not jump when the first move event turns it into a path.
  const width = isHighlighter ? stroke.width * 2.7 : stroke.width;
  if (stroke.points.length === 1) {
    const point = stroke.points[0];
    if (isHighlighter) {
      const markerWidth = stroke.width;
      const markerHeight = stroke.width * 2.7;
      return <rect x={point.x * 640 - markerWidth / 2} y={point.y * 480 - markerHeight / 2} width={markerWidth} height={markerHeight} fill={stroke.color} opacity={0.42} pointerEvents="none" shapeRendering="geometricPrecision" />;
    }
    return <circle cx={point.x * 640} cy={point.y * 480} r={width / 2} fill={stroke.color} pointerEvents="none" />;
  }
  return <path d={pathData(stroke.points)} fill="none" stroke={stroke.color} strokeWidth={width} strokeLinecap={isHighlighter ? "butt" : "round"} strokeLinejoin={isHighlighter ? "miter" : "round"} opacity={isHighlighter ? 0.42 : 1} pointerEvents="none" shapeRendering="geometricPrecision" />;
}

export function DrawingCanvas({ page, tool, colour, width, expanded = false, onChange }: DrawingCanvasProps) {
  const activePointer = useRef<number | null>(null);
  const activeStylus = useRef(false);
  const originalStrokes = useRef<DrawingStroke[]>([]);
  const workingPoints = useRef<DrawingPoint[]>([]);
  const [draft, setDraft] = useState<DrawingStroke | null>(null);
  const [eraserPreview, setEraserPreview] = useState<DrawingStroke[] | null>(null);
  const backgroundClass = useMemo(() => ({
    plain: "drawing-paper-plain",
    ruled: "drawing-paper-ruled",
    grid: "drawing-paper-grid",
    dotted: "drawing-paper-dotted",
  })[page.background], [page.background]);

  const commit = (points: DrawingPoint[]) => {
    if (tool === "pixel-eraser") onChange({ ...page, strokes: eraseStrokePath(originalStrokes.current, points, width / 640) });
    else if (tool === "stroke-eraser") onChange({ ...page, strokes: eraseWholeStrokesAtPath(originalStrokes.current, points, width / 640) });
    else if (points.length) onChange({ ...page, strokes: [...page.strokes, { stroke_id: crypto.randomUUID(), kind: tool, color: colour, width, points }] });
  };
  const start = (event: PointerEvent<SVGSVGElement>) => {
    if (event.pointerType === "touch" && activeStylus.current) return;
    if (event.pointerType === "pen") activeStylus.current = true;
    activePointer.current = event.pointerId;
    originalStrokes.current = page.strokes;
    workingPoints.current = [pointFromEvent(event, event.currentTarget.getBoundingClientRect())];
    if (tool === "pen" || tool === "highlighter") setDraft({ stroke_id: "draft", kind: tool, color: colour, width, points: workingPoints.current });
    else setEraserPreview(page.strokes);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent<SVGSVGElement>) => {
    if (activePointer.current !== event.pointerId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const coalesced = event.nativeEvent.getCoalescedEvents?.();
    const samples = coalesced?.length ? coalesced : [event.nativeEvent];
    const next = [...workingPoints.current, ...samples.map((sample) => pointFromEvent(sample, bounds))];
    workingPoints.current = next;
    if (tool === "pen" || tool === "highlighter") setDraft({ stroke_id: "draft", kind: tool, color: colour, width, points: next });
    else if (tool === "pixel-eraser") setEraserPreview(eraseStrokePath(originalStrokes.current, next, width / 640));
    else if (tool === "stroke-eraser") setEraserPreview(eraseWholeStrokesAtPath(originalStrokes.current, next, width / 640));
  };
  const end = (event: PointerEvent<SVGSVGElement>) => {
    if (activePointer.current !== event.pointerId) return;
    commit(workingPoints.current);
    activePointer.current = null;
    if (event.pointerType === "pen") activeStylus.current = false;
    workingPoints.current = [];
    setDraft(null);
    setEraserPreview(null);
  };

  return <div>
    <div className={`drawing-paper relative ${expanded ? "mx-auto aspect-[4/3] min-h-[320px] w-full max-w-[80vh]" : "aspect-[4/3] min-h-[320px] w-full"} touch-none overflow-hidden rounded-md border border-border shadow-sm ${backgroundClass}`}>
      <svg viewBox="0 0 640 480" preserveAspectRatio="none" role="img" aria-label="Drawing page. Use a pen or touch input to write or sketch." tabIndex={0} className={`size-full touch-none select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${tool === "pen" || tool === "highlighter" ? "cursor-crosshair" : "cursor-cell"}`} shapeRendering="geometricPrecision" onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
        {(eraserPreview ?? page.strokes).map((stroke) => <Stroke key={stroke.stroke_id} stroke={stroke} />)}
        {draft && <Stroke stroke={draft} />}
      </svg>
    </div>
  </div>;
}
