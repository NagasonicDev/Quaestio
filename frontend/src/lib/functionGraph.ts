import functionPlot, { EvalBuiltIn } from "function-plot";

export interface FunctionGraphConfig {
  expression: string;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  xLabel: string;
  yLabel: string;
}

export const DEFAULT_FUNCTION_GRAPH: FunctionGraphConfig = {
  expression: "x^2",
  xMin: -5,
  xMax: 5,
  yMin: -2,
  yMax: 10,
  xLabel: "x",
  yLabel: "y",
};

export function normalizedFunctionGraph(content: Record<string, unknown>): FunctionGraphConfig {
  const numberOr = (value: unknown, fallback: number) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    expression: String(content.expression ?? DEFAULT_FUNCTION_GRAPH.expression).trim(),
    xMin: numberOr(content.x_min, DEFAULT_FUNCTION_GRAPH.xMin),
    xMax: numberOr(content.x_max, DEFAULT_FUNCTION_GRAPH.xMax),
    yMin: numberOr(content.y_min, DEFAULT_FUNCTION_GRAPH.yMin),
    yMax: numberOr(content.y_max, DEFAULT_FUNCTION_GRAPH.yMax),
    xLabel: String(content.x_label ?? DEFAULT_FUNCTION_GRAPH.xLabel),
    yLabel: String(content.y_label ?? DEFAULT_FUNCTION_GRAPH.yLabel),
  };
}

export function validFunctionGraph(config: FunctionGraphConfig): boolean {
  return Boolean(config.expression) && config.expression.length <= 160 &&
    [config.xMin, config.xMax, config.yMin, config.yMax].every(Number.isFinite) &&
    config.xMin < config.xMax && config.yMin < config.yMax &&
    config.xMax - config.xMin <= 1e6 && config.yMax - config.yMin <= 1e6;
}

function normalizeImplicitMultiplication(expression: string): string {
  // function-plot reads x(...) as a function call; in school function notation
  // the x immediately before parentheses means multiplication instead.
  return expression.replace(/\bx(\s*)\(/g, "x$1*(");
}

function addBoundaryArrows(svg: SVGSVGElement, config: FunctionGraphConfig, width: number, height: number): void {
  const content = svg.querySelector<SVGGElement>(".content");
  if (!content) return;
  const inside = (y: number) => Number.isFinite(y) && y >= config.yMin && y <= config.yMax;
  const xPixel = (x: number) => ((x - config.xMin) / (config.xMax - config.xMin)) * width;
  const yPixel = (y: number) => ((config.yMax - y) / (config.yMax - config.yMin)) * height;
  const expression = normalizeImplicitMultiplication(config.expression);
  const valueAt = (x: number): number => {
    try { return Number(EvalBuiltIn({ fn: expression }, "fn", { x })); } catch { return NaN; }
  };
  const addArrow = (tip: { x: number; y: number }, direction: { x: number; y: number }, color: string) => {
    const length = Math.hypot(direction.x, direction.y);
    if (!length) return;
    const ux = direction.x / length;
    const uy = direction.y / length;
    const nx = -uy;
    const ny = ux;
    const baseX = tip.x - ux * 9;
    const baseY = tip.y - uy * 9;
    const arrow = document.createElementNS("http://www.w3.org/2000/svg", "path");
    arrow.setAttribute("class", "function-graph-boundary-arrow");
    arrow.setAttribute("d", `M${tip.x},${tip.y} L${baseX + nx * 3.5},${baseY + ny * 3.5} L${baseX - nx * 3.5},${baseY - ny * 3.5} Z`);
    arrow.setAttribute("fill", color);
    arrow.setAttribute("stroke", "none");
    content.appendChild(arrow);
  };

  const curve = svg.querySelector<SVGPathElement>(".graph path.line");
  if (!curve) return;
  const color = curve.getAttribute("stroke") || "#000000";
  const samples = 1200;
  const step = (config.xMax - config.xMin) / samples;
  let x0 = config.xMin;
  let y0 = valueAt(x0);
  const firstNextY = valueAt(x0 + step);
  if (inside(y0)) {
    addArrow({ x: 0, y: yPixel(y0) },
      { x: xPixel(x0) - xPixel(x0 + step), y: yPixel(y0) - yPixel(firstNextY) }, color);
  }
  for (let i = 1; i <= samples; i++) {
    const x1 = config.xMin + step * i;
    const y1 = valueAt(x1);
    if (inside(y0) !== inside(y1) && Number.isFinite(y0) && Number.isFinite(y1)) {
      const inX = inside(y0) ? x0 : x1;
      const inY = inside(y0) ? y0 : y1;
      const outX = inside(y0) ? x1 : x0;
      const outY = inside(y0) ? y1 : y0;
      const boundaryY = outY > config.yMax ? config.yMax : config.yMin;
      let lo = 0;
      let hi = 1;
      const startsBelow = inY < boundaryY;
      for (let j = 0; j < 32; j++) {
        const mid = (lo + hi) / 2;
        const testY = valueAt(inX + (outX - inX) * mid);
        if (!Number.isFinite(testY)) break;
        if ((testY < boundaryY) === startsBelow) lo = mid;
        else hi = mid;
      }
      const crossX = inX + (outX - inX) * ((lo + hi) / 2);
      const inPoint = { x: xPixel(inX), y: yPixel(inY) };
      const outPoint = { x: xPixel(outX), y: yPixel(outY) };
      addArrow({ x: xPixel(crossX), y: yPixel(boundaryY) },
        { x: outPoint.x - inPoint.x, y: outPoint.y - inPoint.y }, color);
    }
    x0 = x1;
    y0 = y1;
  }
  const lastX = config.xMax;
  const lastY = valueAt(lastX);
  const previousY = valueAt(lastX - step);
  if (inside(lastY)) {
    addArrow({ x: width, y: yPixel(lastY) },
      { x: xPixel(lastX) - xPixel(lastX - step), y: yPixel(lastY) - yPixel(previousY) }, color);
  }
}

export function drawFunctionGraph(target: HTMLElement, config: FunctionGraphConfig, width = 640, height = 360): void {
  target.replaceChildren();
  if (!validFunctionGraph(config)) return;
  // function-plot publishes a CommonJS module whose `default` export is
  // wrapped as another default by Vite's dependency optimizer.
  const imported = functionPlot as unknown;
  const plot = typeof imported === "function"
    ? imported
    : (imported as { default?: unknown }).default;
  if (typeof plot !== "function") throw new Error("The graphing library did not load correctly.");
  plot({
    target,
    width,
    height,
    grid: true,
    disableZoom: true,
    xAxis: { domain: [config.xMin, config.xMax], label: config.xLabel || "x", position: "sticky" },
    yAxis: { domain: [config.yMin, config.yMax], label: config.yLabel || "y", position: "sticky" },
    // Skip the plotter's pointer tooltip so the graph cannot reveal sampled values.
    data: [{ fn: normalizeImplicitMultiplication(config.expression), color: "#000000", skipTip: true }],
  });

  // function-plot can center axis ticks, but its labels stay at the SVG edges.
  // Place both axes at zero and move their labels alongside the axis ends.
  const svg = target.querySelector("svg");
  if (!svg) return;
  svg.querySelectorAll<SVGTextElement>("text").forEach((text) => {
    text.setAttribute("fill", "#000000");
    text.setAttribute("opacity", "1");
  });
  const innerWidth = width - 60;
  const innerHeight = height - 40;
  addBoundaryArrows(svg, config, innerWidth, innerHeight);
  const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));
  const axisX = clamp(((0 - config.xMin) / (config.xMax - config.xMin)) * innerWidth, innerWidth);
  const axisY = clamp(((config.yMax - 0) / (config.yMax - config.yMin)) * innerHeight, innerHeight);
  const xAxis = svg.querySelector<SVGGElement>(".x.axis");
  const yAxis = svg.querySelector<SVGGElement>(".y.axis");
  xAxis?.setAttribute("transform", `translate(0,${axisY})`);
  xAxis?.querySelectorAll("path, line").forEach((el) => el.setAttribute("transform", `translate(0,${innerHeight - axisY})`));
  yAxis?.setAttribute("transform", `translate(${axisX},0)`);
  yAxis?.querySelectorAll("path, line").forEach((el) => el.setAttribute("transform", `translate(${-axisX},0)`));
  const xLabel = svg.querySelector<SVGTextElement>(".x.axis-label");
  xLabel?.setAttribute("x", String(innerWidth));
  xLabel?.setAttribute("y", String(axisY - 6));
  const yLabel = svg.querySelector<SVGTextElement>(".y.axis-label");
  if (yLabel) {
    yLabel.removeAttribute("transform");
    yLabel.removeAttribute("dy");
    yLabel.setAttribute("x", String(axisX <= innerWidth / 2 ? axisX + 12 : axisX - 12));
    yLabel.setAttribute("y", String(innerHeight / 2));
    yLabel.setAttribute("text-anchor", "middle");
    yLabel.setAttribute("dominant-baseline", "middle");
    yLabel.setAttribute("writing-mode", "vertical-rl");
    yLabel.setAttribute("text-orientation", "upright");
  }
}

export async function renderFunctionGraphPng(config: FunctionGraphConfig): Promise<{ data: Uint8Array<ArrayBuffer>; width: number; height: number } | null> {
  if (!validFunctionGraph(config)) return null;
  const target = document.createElement("div");
  try {
    drawFunctionGraph(target, config);
    const svg = target.querySelector("svg");
    if (!svg) return null;
    const serialized = new XMLSerializer().serializeToString(svg);
    const url = URL.createObjectURL(new Blob([serialized], { type: "image/svg+xml;charset=utf-8" }));
    try {
      const image = new Image();
      image.src = url;
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Could not rasterize function graph"));
      });
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const context = canvas.getContext("2d");
      if (!context) return null;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not encode function graph")), "image/png"));
      return { data: new Uint8Array(await png.arrayBuffer()), width: canvas.width, height: canvas.height };
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}
