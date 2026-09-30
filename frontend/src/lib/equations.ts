import "katex/dist/katex.min.css";
import katex from "katex";
import { toBlob } from "html-to-image";

export interface RenderedEquation {
  data: Uint8Array<ArrayBuffer>;
  width: number;
  height: number;
}

let fontsReadyPromise: Promise<void> | null = null;
const renderedEquations = new Map<string, Promise<RenderedEquation | null>>();
const renderedEquationSizes = new Map<string, number>();
const MAX_EQUATION_CACHE_ENTRIES = 64;
const MAX_EQUATION_CACHE_BYTES = 24 * 1024 * 1024;
// DOM-to-image can remain pending indefinitely in some browser/font states.
// Equation rendering is optional in exports, so don't let it block the whole
// document generation forever.
const EQUATION_RENDER_TIMEOUT_MS = 15_000;
let renderedEquationBytes = 0;

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
  const wrap = document.createElement("div");
  wrap.style.display = "inline-block";
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
    const blob = await toBlob(wrap, { pixelRatio: 2 });
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
  }
}
