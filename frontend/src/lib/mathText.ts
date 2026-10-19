/**
 * Shared math-span handling for the solutions exporters.
 *
 * Every delimiter form an importer or editor can produce (`$…$`, `$$…$$`,
 * `\(…\)`, `\[…\]`) is recognised here so the PDF and DOCX writers route all
 * of it through the one KaTeX pipeline instead of printing raw markup.
 *
 * KaTeX rasterises at {@link MATH_FONT_PX}, so a rendered image's pixel size
 * maps to points as `targetPt / MATH_FONT_PX` — see `mathPtSize`.
 */
export const MATH_FONT_PX = 16;

export interface TextToken {
  text: string;
}
export interface MathToken {
  math: string;
}
export type RichToken = TextToken | MathToken;

// `$$…$$` first so display math is not mistaken for an empty inline span.
const MATH_SPAN_SOURCE =
  "\\$\\$([\\s\\S]+?)\\$\\$|\\\\\\[([\\s\\S]+?)\\\\\\]|\\\\\\(([\\s\\S]+?)\\\\\\)|\\$([^$\\n]+?)\\$";

function spanRegExp(): RegExp {
  return new RegExp(MATH_SPAN_SOURCE, "g");
}

/** The LaTeX inside every math span of `text`, in document order. */
export function mathExpressions(text: string): string[] {
  const out: string[] = [];
  const re = spanRegExp();
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) out.push(match[1] ?? match[2] ?? match[3] ?? match[4] ?? "");
  return out;
}

export function hasMath(text: string): boolean {
  return spanRegExp().test(text);
}

/** Split `text` into plain and math runs, preserving every other character. */
export function splitRichTokens(text: string): RichToken[] {
  const out: RichToken[] = [];
  const re = spanRegExp();
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (match.index > last) out.push({ text: text.slice(last, match.index) });
    out.push({ math: match[1] ?? match[2] ?? match[3] ?? match[4] ?? "" });
    last = re.lastIndex;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** Point size of a rendered equation placed at font size `targetPt`. */
export function mathPtSize(widthPx: number, heightPx: number, targetPt: number): { width: number; height: number } {
  const scale = targetPt / MATH_FONT_PX;
  return { width: widthPx * scale, height: heightPx * scale };
}

/**
 * True when a whole block is nothing but LaTeX that lost its `$` delimiters —
 * e.g. `t = \dfrac{2.5 - 0}{3.5 - 0} = 0.714\,\mathrm{s}.` Mixed prose and
 * maths is deliberately excluded, since guessing the maths span there would
 * risk mangling the sentence.
 */
export function looksLikeStandaloneLatex(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.includes("$")) return false;
  if (!/\\[a-zA-Z]+/.test(trimmed)) return false;
  if (!/[=]/.test(trimmed) && !/\\(?:frac|dfrac|tfrac|sqrt|approx|times|cdot|left)\b/.test(trimmed)) return false;
  const leftover = trimmed.replace(/\\(?:[a-zA-Z]+|[^a-zA-Z])/g, "").replace(/[{}\s0-9A-Za-z+\-*/^_=().,[\]]/g, "");
  return leftover.length === 0;
}

const GREEK: Record<string, string> = {
  alpha: "\u03b1", beta: "\u03b2", gamma: "\u03b3", delta: "\u03b4", Delta: "\u0394",
  epsilon: "\u03b5", varepsilon: "\u03b5", zeta: "\u03b6", eta: "\u03b7", theta: "\u03b8",
  iota: "\u03b9", kappa: "\u03ba", lambda: "\u03bb", mu: "\u03bc", nu: "\u03bd", xi: "\u03be",
  pi: "\u03c0", rho: "\u03c1", sigma: "\u03c3", Sigma: "\u03a3", tau: "\u03c4", upsilon: "\u03c5",
  phi: "\u03c6", varphi: "\u03c6", chi: "\u03c7", psi: "\u03c8", omega: "\u03c9", Omega: "\u03a9",
};

const SYMBOLS: Record<string, string> = {
  times: "\u00d7", div: "\u00f7", pm: "\u00b1", mp: "\u2213", cdot: "\u00b7",
  approx: "\u2248", neq: "\u2260", leq: "\u2264", geq: "\u2265", le: "\u2264", ge: "\u2265",
  to: "\u2192", rightarrow: "\u2192", leftarrow: "\u2190", Rightarrow: "\u21d2", Leftarrow: "\u21d0",
  infty: "\u221e", propto: "\u221d", partial: "\u2202", nabla: "\u2207", circ: "\u00b0",
  angle: "\u2220", sum: "\u2211", int: "\u222b", in: "\u2208", perp: "\u22a5", parallel: "\u2225",
  cdots: "\u22ef", ldots: "\u2026", dots: "\u2026", leftrightarrow: "\u2194",
};

const SUPERSCRIPTS: Record<string, string> = {
  "0": "\u2070", "1": "\u00b9", "2": "\u00b2", "3": "\u00b3", "4": "\u2074", "5": "\u2075",
  "6": "\u2076", "7": "\u2077", "8": "\u2078", "9": "\u2079", "+": "\u207a", "-": "\u207b",
  "=": "\u207c", "(": "\u207d", ")": "\u207e", n: "\u207f", i: "\u2071",
};

const SUBSCRIPTS: Record<string, string> = {
  "0": "\u2080", "1": "\u2081", "2": "\u2082", "3": "\u2083", "4": "\u2084", "5": "\u2085",
  "6": "\u2086", "7": "\u2087", "8": "\u2088", "9": "\u2089", "+": "\u208a", "-": "\u208b",
  "=": "\u208c", "(": "\u208d", ")": "\u208e", a: "\u2090", e: "\u2091", o: "\u2092",
  x: "\u2093", h: "\u2095", k: "\u2096", l: "\u2097", m: "\u2098", n: "\u2099", p: "\u209a",
  s: "\u209b", t: "\u209c",
};

/** Replace `\cmd{...}` (nested braces included) with `fn(inner)`. */
function matchBrace(text: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    if (text[i] === "{") depth += 1;
    else if (text[i] === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function replaceBraced(source: string, command: string, fn: (inner: string) => string): string {
  const marker = `\\${command}{`;
  let text = source;
  while (true) {
    const index = text.indexOf(marker);
    if (index === -1) break;
    const open = index + marker.length - 1;
    const close = matchBrace(text, open);
    if (close === -1) break;
    const inner = text.slice(open + 1, close);
    text = text.slice(0, index) + fn(inner) + text.slice(close + 1);
  }
  return text;
}

function scripted(inner: string, table: Record<string, string>): string {
  return Array.from(inner).map((char) => table[char] ?? char).join("");
}

/**
 * Best-effort plain-text rendering of LaTeX for when KaTeX fails and no image
 * exists. Enough to keep the printed guide free of literal markup; it is not a
 * substitute for the rendered equation.
 *
 * shortcut: covers the commands actually seen in imported solutions, not all of
 * LaTeX. Revisit if a source uses a command outside GREEK/SYMBOLS.
 */
export function latexToPlain(latex: string): string {
  let text = latex.trim();
  for (const style of ["mathrm", "text", "operatorname", "mathbf", "mathit"]) {
    text = replaceBraced(text, style, (inner) => inner);
  }
  text = replaceBraced(text, "sqrt", (inner) => `\u221a(${inner})`);
  for (const frac of ["frac", "dfrac", "tfrac"]) {
    // \frac{a}{b} -> (a)/(b), repeatedly for the innermost pair.
    const marker = `\\${frac}{`;
    let index = text.indexOf(marker);
    while (index !== -1) {
      const openA = index + marker.length - 1;
      const closeA = matchBrace(text, openA);
      if (closeA === -1) break;
      const openB = closeA + 1;
      if (text[openB] !== "{") break;
      const closeB = matchBrace(text, openB);
      if (closeB === -1) break;
      const numerator = text.slice(openA + 1, closeA);
      const denominator = text.slice(openB + 1, closeB);
      text = `${text.slice(0, index)}(${numerator})/(${denominator})${text.slice(closeB + 1)}`;
      index = text.indexOf(marker);
    }
  }
  text = replaceBraced(text, "vec", (inner) => `${inner}\u20d7`);
  text = text.replace(/\\(left|right|big|Big|bigg|Bigg)\b/g, "");
  text = text.replace(/\\(,|;|:|!|quad|qquad)/g, " ");
  text = text.replace(/\\(?:displaystyle|textstyle|limits)\b/g, "");
  // ^{...} and _{...} first, then the single-character forms.
  text = text.replace(/\^\{([^{}]*)\}/g, (_m, inner: string) => scripted(inner, SUPERSCRIPTS));
  text = text.replace(/_\{([^{}]*)\}/g, (_m, inner: string) => scripted(inner, SUBSCRIPTS));
  text = text.replace(/\^(\S)/g, (_m, char: string) => SUPERSCRIPTS[char] ?? `^${char}`);
  text = text.replace(/_(\S)/g, (_m, char: string) => SUBSCRIPTS[char] ?? `_${char}`);
  text = text.replace(/\\([a-zA-Z]+)/g, (_m, name: string) => GREEK[name] ?? SYMBOLS[name] ?? name);
  text = text.replace(/[{}]/g, "");
  return text.replace(/\s+/g, " ").trim();
}
