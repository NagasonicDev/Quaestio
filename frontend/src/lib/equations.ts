import "katex/dist/katex.min.css";
import katex from "katex";
import { toBlob, getFontEmbedCSS } from "html-to-image";
import { MATH_FONT_PX } from "./mathText";

export interface RenderedEquation {
  data: Uint8Array<ArrayBuffer>;
  width: number;
  height: number;
}

let fontsReadyPromise: Promise<void> | null = null;
const renderedEquations = new Map<string, Promise<RenderedEquation | null>>();
const renderedEquationSizes = new Map<string, number>();
// An 80-200 mark paper can hold hundreds of unique equations. A small cache
// evicts mid-build and forces the solutions pass to re-rasterise the whole
// paper, so keep enough entries to survive a full document.
const MAX_EQUATION_CACHE_ENTRIES = 512;
const MAX_EQUATION_CACHE_BYTES = 64 * 1024 * 1024;
// DOM-to-image can remain pending indefinitely in some browser/font states.
// Equation rendering is optional in exports, so don't let it block the whole
// document generation forever.
const EQUATION_RENDER_TIMEOUT_MS = 15_000;
let renderedEquationBytes = 0;
// Debug counters: how much real rasterising a resolveEquations pass did.
let equationMisses = 0;
let equationRasterMs = 0;
let fontEmbedBuildMs = 0;

export function equationStats(): { misses: number; cached: number; rasterMs: number; fontEmbedMs: number } {
  const stats = {
    misses: equationMisses,
    cached: renderedEquations.size,
    rasterMs: Math.round(equationRasterMs),
    fontEmbedMs: Math.round(fontEmbedBuildMs),
  };
  equationMisses = 0;
  equationRasterMs = 0;
  fontEmbedBuildMs = 0;
  return stats;
}

function evictEquation(key: string): void {
  renderedEquations.delete(key);
  renderedEquationBytes -= renderedEquationSizes.get(key) ?? 0;
  renderedEquationSizes.delete(key);
}

function fontsReady(): Promise<void> {
  if (!fontsReadyPromise) {
    fontsReadyPromise = (async () => {
      try {
        if (document.fonts?.ready) await document.fonts.ready;
      } catch {
        /* ignore */
      }
    })();
  }
  return fontsReadyPromise;
}

/** Every KaTeX_* font family declared by the loaded stylesheets. */
function katexFontFamilies(): string[] {
  const families = new Set<string>();
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // cross-origin stylesheet
    }
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSFontFaceRule) {
        const family = rule.style.getPropertyValue("font-family");
        if (family.startsWith("KaTeX_")) families.add(family);
      }
    }
  }
  return Array.from(families);
}

let fontEmbedCssPromise: Promise<string | undefined> | null = null;

async function computeFontEmbedCss(): Promise<string | undefined> {
  const families = katexFontFamilies();
  // Without a detected KaTeX family we cannot guarantee glyph coverage, so
  // fall back to html-to-image's per-node computation.
  if (!families.length) return undefined;
  const probe = document.createElement("div");
  probe.style.position = "fixed";
  probe.style.left = "-99999px";
  probe.style.top = "0";
  probe.style.fontFamily = [...families, getComputedStyle(document.body).fontFamily].join(",");
  document.body.appendChild(probe);
  try {
    // woff2 only: inlining every format triples the embed CSS for no benefit.
    const startedAt = performance.now();
    const css = await getFontEmbedCSS(probe, { preferredFontFormat: "woff2" });
    fontEmbedBuildMs += performance.now() - startedAt;
    return css;
  } finally {
    probe.remove();
  }
}

/**
 * html-to-image re-parses every stylesheet and walks the node's computed
 * styles on each call, inlining all font formats. That CSS only depends on
 * which font families are used, so build it once from a probe covering every
 * KaTeX family and reuse it for every equation.
 */
function fontEmbedCss(): Promise<string | undefined> {
  if (!fontEmbedCssPromise) {
    fontEmbedCssPromise = computeFontEmbedCss().catch(() => {
      fontEmbedCssPromise = null;
      return undefined;
    });
  }
  return fontEmbedCssPromise;
}

/**
 * Client-side twin of the backend matplotlib mathtext renderer: LeTeX ->
 * KaTeX -> offscreen DOM -> transparent PNG via html-to-image.
 */
export async function renderLatexPng(
  latex: string,
  display = true
): Promise<RenderedEquation | null> {
  const cacheKey = `${display ? "display" : "inline"}:${latex}`;
  const cached = renderedEquations.get(cacheKey);
  if (cached) {
    // Refresh insertion order so the cache behaves as a small LRU.
    renderedEquations.delete(cacheKey);
    renderedEquations.set(cacheKey, cached);
    return cached;
  }

  const render = new Promise<RenderedEquation | null>((resolve, reject) => {
    const timeout = setTimeout(() => resolve(null), EQUATION_RENDER_TIMEOUT_MS);
    renderLatexPngUncached(latex, display).then(
      (result) => { clearTimeout(timeout); resolve(result); },
      (error: unknown) => { clearTimeout(timeout); reject(error); },
    );
  });
  renderedEquations.set(cacheKey, render);
  void render.then((result) => {
    if (renderedEquations.get(cacheKey) !== render) return;
    if (!result) {
      evictEquation(cacheKey);
      return;
    }
    const size = result.data.byteLength;
    renderedEquationSizes.set(cacheKey, size);
    renderedEquationBytes += size;
    while (
      renderedEquations.size > MAX_EQUATION_CACHE_ENTRIES ||
      renderedEquationBytes > MAX_EQUATION_CACHE_BYTES
    ) {
      const oldest = renderedEquations.keys().next().value;
      if (oldest === undefined) break;
      evictEquation(oldest);
    }
  });
  return render;
}

async function renderLatexPngUncached(
  latex: string,
  display: boolean
): Promise<RenderedEquation | null> {
  const startedAt = performance.now();
  equationMisses += 1;
  const wrap = document.createElement("div");
  wrap.style.display = "inline-block";
  // Pin the equation's font size so every image has the same known scale; the
  // PDF/DOCX writers map pixels to points via MATH_FONT_PX instead of forcing
  // a bounding-box height (which shrank tall fractions to the wrong size).
  wrap.style.fontSize = `${MATH_FONT_PX}px`;
  wrap.style.lineHeight = "normal";
  wrap.style.background = "transparent";
  wrap.style.color = "#000000";
  const holder = document.createElement("div");
  holder.style.position = "fixed";
  holder.style.left = "-99999px";
  holder.style.top = "0";
  holder.style.visibility = "visible";
  holder.style.pointerEvents = "none";
  holder.appendChild(wrap);
  document.body.appendChild(holder);
  try {
    katex.render(latex, wrap, { throwOnError: false, displayMode: display });
    await fontsReady();
    const rect = wrap.getBoundingClientRect();
    const width = Math.max(1, Math.ceil(rect.width));
    const height = Math.max(1, Math.ceil(rect.height));
    const blob = await toBlob(wrap, { pixelRatio: 2, fontEmbedCSS: await fontEmbedCss() });
    if (!blob) return null;
    return {
      data: new Uint8Array(await blob.arrayBuffer()),
      width,
      height,
    };
  } catch {
    return null;
  } finally {
    holder.remove();
    equationRasterMs += performance.now() - startedAt;
  }
}
