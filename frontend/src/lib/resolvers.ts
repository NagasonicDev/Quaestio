import type { ContentBlock } from "../api/types";
import * as idb from "./db/indexeddb";
import { contentOf, tableCellText, tableRows } from "./criteria";
import { mathExpressions, looksLikeStandaloneLatex } from "./mathText";
import { renderLatexPng, equationStats } from "./equations";
import { normalizedFunctionGraph, renderFunctionGraphPng } from "./functionGraph";
import { logTiming } from "./timing";

export const IMAGE_TYPES = new Set(["image", "diagram", "graph"]);

/**
 * Yield so the UI can repaint, preferring a frame but never waiting for one:
 * a hidden tab suspends requestAnimationFrame, which would freeze a long
 * export until the user returns.
 */
export function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 32);
    requestAnimationFrame(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

export function inlineMathImageId(blockId: string, index: number): string {
  return `${blockId}:inline-math:${index}`;
}

export interface ResolvedImage {
  data: Uint8Array<ArrayBuffer>;
  mime: string;
  widthPx: number;
  heightPx: number;
}

export async function blobPixelSize(
  blob: Blob
): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/** Rasterize an SVG blob to a PNG canvas so document builders can embed it. */
export async function svgToPng(
  blob: Blob
): Promise<{ data: Uint8Array<ArrayBuffer>; width: number; height: number }> {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("svg load failed"));
    img.src = url;
  });
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || 96;
  canvas.height = img.naturalHeight || 96;
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.drawImage(img, 0, 0);
  URL.revokeObjectURL(url);
  const png = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("canvas toBlob failed"))), "image/png")
  );
  return {
    data: new Uint8Array(await png.arrayBuffer()),
    width: canvas.width,
    height: canvas.height,
  };
}

// Figures are read from IndexedDB and decoded once per block occurrence. The
// same asset (asset_path is an immutable id) is often reused, so resolve each
// path once and share the bytes, bounded by a byte cap.
const MAX_ASSET_CACHE_BYTES = 32 * 1024 * 1024;
const assetCache = new Map<string, Promise<ResolvedImage | null>>();
const assetBytes = new Map<string, number>();
let assetCacheTotal = 0;

async function loadAsset(path: string): Promise<ResolvedImage | null> {
  const blob = await idb.getAsset(path);
  if (!blob) return null;
  const mime = blob.type || "image/png";
  if (mime === "image/svg+xml") {
    const png = await svgToPng(blob);
    return { data: png.data, mime: "image/png", widthPx: png.width, heightPx: png.height };
  }
  const data = new Uint8Array(await blob.arrayBuffer());
  const size = await blobPixelSize(blob);
  return { data, mime, widthPx: size ? size.w : 96, heightPx: size ? size.h : 96 };
}

function resolveAsset(path: string): Promise<ResolvedImage | null> {
  const cached = assetCache.get(path);
  if (cached) return cached;
  const promise = loadAsset(path).then((image) => {
    if (image) {
      assetBytes.set(path, image.data.byteLength);
      assetCacheTotal += image.data.byteLength;
      while (assetCacheTotal > MAX_ASSET_CACHE_BYTES) {
        const oldest = assetCache.keys().next().value;
        if (oldest === undefined) break;
        assetCache.delete(oldest);
        assetCacheTotal -= assetBytes.get(oldest) ?? 0;
        assetBytes.delete(oldest);
      }
    }
    return image;
  });
  assetCache.set(path, promise);
  return promise;
}

export async function resolveImages(
  blocks: ContentBlock[],
  onProgress?: (completed: number, total: number) => void
): Promise<Map<string, ResolvedImage>> {
  const started = performance.now();
  const map = new Map<string, ResolvedImage>();
  const jobs = blocks.filter((b) => IMAGE_TYPES.has(b.block_type));
  const functionJobs = blocks.filter((b) => b.block_type === "function");
  const total = jobs.length + functionJobs.length;
  let completed = 0;
  // Skipped assets count too: the decision is the work, so the bar never stalls
  // short of the plan.
  const done = () => onProgress?.(++completed, total);
  onProgress?.(0, total);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, async () => {
    while (next < jobs.length) {
      const b = jobs[next++];
      try {
        const path = contentOf(b, "asset_path");
        if (typeof path !== "string" || !path) continue;
        const image = await resolveAsset(path);
        if (image) map.set(b.block_id, image);
      } finally {
        done();
      }
    }
  }));
  await Promise.all(functionJobs.map(async (b) => {
    try {
      const png = await renderFunctionGraphPng(normalizedFunctionGraph(b.content));
      if (png) map.set(b.block_id, { data: png.data, mime: "image/png", widthPx: png.width, heightPx: png.height });
    } finally {
      done();
    }
  }));
  logTiming("resolveImages", started, `${jobs.length} figures, ${functionJobs.length} function graphs`);
  return map;
}

export async function resolveEquations(
  blocks: ContentBlock[],
  onProgress?: (completed: number, total: number) => void
): Promise<Map<string, ResolvedImage>> {
  const started = performance.now();
  const map = new Map<string, ResolvedImage>();
  const jobs: Array<() => Promise<void>> = [];
  for (const b of blocks) {
    // A whole text/heading block that is nothing but LaTeX (an import that lost
    // its `$` delimiters) is rendered as a display equation rather than printed
    // as literal markup. Mixed prose+LaTeX is left untouched — flagging it is
    // safer than guessing which span is maths.
    if (b.block_type === "text" || b.block_type === "heading") {
      const text = contentOf(b, "text");
      if (typeof text === "string" && looksLikeStandaloneLatex(text)) {
        jobs.push(async () => {
          const png = await renderLatexPng(text.trim(), true);
          if (!png) return;
          map.set(b.block_id, { data: png.data, mime: "image/png", widthPx: png.width, heightPx: png.height });
        });
        continue;
      }
    }
    if (b.block_type !== "equation") {
      const texts: string[] = [];
      if (b.block_type === "text" || b.block_type === "heading") {
        const text = contentOf(b, "text");
        if (typeof text === "string") texts.push(text);
      } else if (b.block_type === "table") {
        const columns = contentOf(b, "columns", []);
        const rows = contentOf(b, "rows", []);
        if (Array.isArray(columns)) texts.push(...columns.map(tableCellText));
        for (const row of tableRows(rows, columns)) texts.push(...row.map(tableCellText));
      } else if (b.block_type === "list") {
        const items = contentOf(b, "items", []);
        if (Array.isArray(items)) texts.push(...items.map(String));
      }
      const expressions = texts.flatMap(mathExpressions);
      for (let i = 0; i < expressions.length; i++) {
        const expression = expressions[i];
        jobs.push(async () => {
          const png = await renderLatexPng(expression, false);
          if (!png) return;
          map.set(inlineMathImageId(b.block_id, i), {
            // The equation cache owns these immutable bytes. Share them across
            // blocks instead of retaining a second full copy per occurrence.
            data: png.data,
            mime: "image/png",
            widthPx: png.width,
            heightPx: png.height,
          });
        });
      }
      continue;
    }
    const latex = contentOf(b, "latex");
    if (typeof latex !== "string" || !latex) continue;
    const display = contentOf(b, "display", true) !== false;
    jobs.push(async () => {
      const png = await renderLatexPng(latex, display);
      if (!png) return;
      map.set(b.block_id, {
        data: png.data,
        mime: "image/png",
        widthPx: png.width,
        heightPx: png.height,
      });
    });
  }

  // Keep DOM rasterization concurrent enough to reduce per-equation latency
  // without creating an unbounded number of canvases and cloned DOM trees.
  let completed = 0;
  onProgress?.(0, jobs.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, async () => {
    while (next < jobs.length) {
      await jobs[next++]();
      onProgress?.(++completed, jobs.length);
    }
  }));
  const stats = equationStats();
  logTiming("resolveEquations", started, `${jobs.length} jobs, ${stats.misses} rendered, ${stats.cached} cached, raster ${stats.rasterMs}ms, font-embed ${stats.fontEmbedMs}ms`);
  return map;
}
