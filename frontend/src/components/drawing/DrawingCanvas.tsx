import { useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";
import type { DrawingPage, DrawingPoint, DrawingStroke, DrawingTool } from "../../lib/drawingNotebook";
import { eraseStrokePath, eraseWholeStrokesAtPath } from "./drawingGeometry";

interface DrawingCanvasProps {
  page: DrawingPage;
  tool: DrawingTool;
  onChange(page: DrawingPage): void;
}

const DEFAULT_COLOUR = "#1f2937";
const DEFAULT_WIDTH = 4;
const ERASER_RADIUS = 0.025;
const PALETTE = ["#111827", "#2563eb", "#16a34a", "#dc2626", "#9333ea", "#ea580c"];

function pointFromEvent(event: PointerEvent<SVGSVGElement>, zoom: number, pan: { x: number; y: number }): DrawingPoint {
  const bounds = event.currentTarget.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, ((event.clientX - bounds.left) / bounds.width - pan.x) / zoom)),
    y: Math.max(0, Math.min(1, ((event.clientY - bounds.top) / bounds.height - pan.y) / zoom)),
    pressure: event.pressure > 0 ? event.pressure : 0.5,
    time: Date.now(),
  };
}

function pathData(points: DrawingPoint[]): string {
  return points.map((point, index) => `${index ? "L" : "M"}${point.x} ${point.y}`).join(" ");
}

function Stroke({ stroke }: { stroke: DrawingStroke }) {
  const width = stroke.width / 640;
  if (stroke.points.length === 1) {
    const point = stroke.points[0];
    return <circle cx={point.x} cy={point.y} r={width / 2} fill={stroke.color} opacity={stroke.kind === "highlighter" ? 0.28 : 1} />;
  }
  return (
    <path
      d={pathData(stroke.points)}
      fill="none"
      stroke={stroke.color}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={stroke.kind === "highlighter" ? 0.28 : 1}
      style={{ mixBlendMode: stroke.kind === "highlighter" ? "multiply" : "normal" }}
    />
  );
}

export function DrawingCanvas({ page, tool, onChange }: DrawingCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const activePointer = useRef<number | null>(null);
  const activeStylus = useRef(false);
  const originalStrokes = useRef<DrawingStroke[]>([]);
  const workingPoints = useRef<DrawingPoint[]>([]);
  const [colour, setColour] = useState(DEFAULT_COLOUR);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [draft, setDraft] = useState<DrawingStroke | null>(null);
  const [panning, setPanning] = useState<{ pointer: number; x: number; y: number; origin: { x: number; y: number } } | null>(null);

  const backgroundClass = useMemo(() => ({
    plain: "bg-white",
    ruled: "bg-[repeating-linear-gradient(to_bottom,#fff_0,#fff_31px,#dbeafe_32px)]",
    grid: "bg-[linear-gradient(#e5e7eb_1px,transparent_1px),linear-gradient(90deg,#e5e7eb_1px,transparent_1px)] bg-[size:32px_32px]",
    dotted: "bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] bg-[size:16px_16px]",
  })[page.background], [page.background]);

  const commit = (points: DrawingPoint[]) => {
    if (tool === "pixel-eraser") {
      onChange({ ...page, strokes: eraseStrokePath(originalStrokes.current, points, ERASER_RADIUS) });
    } else if (tool === "stroke-eraser") {
      onChange({ ...page, strokes: eraseWholeStrokesAtPath(originalStrokes.current, points, ERASER_RADIUS) });
    } else if (points.length) {
      onChange({
        ...page,
        strokes: [...page.strokes, {
          stroke_id: crypto.randomUUID(),
          kind: tool,
          color: colour,
          width,
          points,
        }],
      });
    }
  };

  const start = (event: PointerEvent<SVGSVGElement>) => {
    if (event.pointerType === "touch" && activeStylus.current) return;
    if (event.pointerType === "pen") activeStylus.current = true;
    if (event.button === 1 || event.altKey) {
      setPanning({ pointer: event.pointerId, x: event.clientX, y: event.clientY, origin: pan });
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    activePointer.current = event.pointerId;
    originalStrokes.current = page.strokes;
    workingPoints.current = [pointFromEvent(event, zoom, pan)];
    if (tool === "pen" || tool === "highlighter") {
      setDraft({ stroke_id: "draft", kind: tool, color: colour, width, points: workingPoints.current });
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const move = (event: PointerEvent<SVGSVGElement>) => {
    if (panning?.pointer === event.pointerId) {
      const bounds = event.currentTarget.getBoundingClientRect();
      setPan({ x: panning.origin.x + (event.clientX - panning.x) / bounds.width, y: panning.origin.y + (event.clientY - panning.y) / bounds.height });
      return;
    }
    if (activePointer.current !== event.pointerId) return;
    const next = [...workingPoints.current, pointFromEvent(event, zoom, pan)];
    workingPoints.current = next;
    if (tool === "pen" || tool === "highlighter") setDraft({ stroke_id: "draft", kind: tool, color: colour, width, points: next });
  };

  const end = (event: PointerEvent<SVGSVGElement>) => {
    if (panning?.pointer === event.pointerId) {
      setPanning(null);
      return;
    }
    if (activePointer.current !== event.pointerId) return;
    commit(workingPoints.current);
    activePointer.current = null;
    workingPoints.current = [];
    setDraft(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface p-3">
        <label className="flex min-h-11 items-center gap-2 text-sm">Colour <input aria-label="Drawing colour" type="color" value={colour} onChange={(event) => setColour(event.target.value)} className="size-8 cursor-pointer rounded" /></label>
        <div className="flex items-center gap-1" aria-label="Common colours">
          {PALETTE.map((value) => <button key={value} type="button" aria-label={`Use ${value}`} onClick={() => setColour(value)} className="size-8 rounded-full border-2 border-white shadow ring-1 ring-border" style={{ backgroundColor: value }} />)}
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm">Thickness <input aria-label="Drawing thickness" type="range" min="1" max="18" value={width} onChange={(event) => setWidth(Number(event.target.value))} /></label>
        <button type="button" className="min-h-11 rounded border border-input px-3 text-sm" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>Fit page</button>
        <button type="button" aria-label="Zoom out" className="min-h-11 min-w-11 rounded border border-input text-lg" onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))}>−</button>
        <span className="min-w-12 text-center text-sm tabular-nums">{Math.round(zoom * 100)}%</span>
        <button type="button" aria-label="Zoom in" className="min-h-11 min-w-11 rounded border border-input text-lg" onClick={() => setZoom((value) => Math.min(3, value + 0.25))}>+</button>
        <span className="text-xs text-muted-foreground">Alt-drag or middle-drag to pan</span>
      </div>
      <div className={`relative aspect-[3/4] w-full touch-none overflow-hidden rounded-md border border-border shadow-sm ${backgroundClass}`}>
        <svg
          ref={svgRef}
          viewBox="0 0 1 1"
          role="img"
          aria-label="Drawing page"
          className="size-full touch-none select-none"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        >
          <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
            {page.strokes.map((stroke) => <Stroke key={stroke.stroke_id} stroke={stroke} />)}
            {draft && <Stroke stroke={draft} />}
          </g>
        </svg>
      </div>
    </div>
  );
}
