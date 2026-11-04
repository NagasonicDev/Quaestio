import { useState, type ReactNode } from "react";
import { InlineMath } from "react-katex";
import { splitRichTokens } from "../lib/mathText.ts";
import { useGlossaryTerms } from "./GlossaryProvider.tsx";

/** Expand common legacy scientific notation before rendering LaTeX. */
function normalizeMathText(text: string) {
  return text.replace(
    /(\d+(?:\.\d+)?)\s*[x×]\s*10\s*\^\s*(-?\d+)(?:\s*(kg\s*m\s*s(?:\^?-?\d+)?|kg|ms\^-?\d+|m|s|N|J|Hz|V|A|T|K|C|Wb|lux|°C))?\b/g,
    (_, coefficient, exponent, unit) => `$${coefficient}\\times10^{${exponent}}${unit ? `\\,\\mathrm{${unit.replace(/\s+/g, "\\,")}}` : ""}$`
  );
}

/** Accept the same optional math delimiters used inside ordinary text blocks. */
export function normalizeEquationLatex(latex: string) {
  const trimmed = latex.trim();
  const wrapped = trimmed.match(/^\$\$(.*)\$\$$/s) ?? trimmed.match(/^\$(.*)\$$/s);
  return (wrapped?.[1] ?? trimmed)
    .replace(
      /(\d+(?:\.\d+)?)\s*[x×]\s*10\s*\^\s*(-?\d+)(?:\s*(kg\s*m\s*s(?:\^?-?\d+)?|kg|ms\^-?\d+|m|s|N|J|Hz|V|A|T|K|C|Wb|lux|°C))?\b/g,
      (_, coefficient, exponent, unit) => `${coefficient}\\times10^{${exponent}}${unit ? `\\,\\mathrm{${unit.replace(/\s+/g, "\\,")}}` : ""}`
    )
    .trim();
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function GlossaryWord({ term, definition }: { term: string; definition: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block align-baseline">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="rounded-sm bg-accent/70 px-1 font-medium text-accent-foreground decoration-2 underline underline-offset-2 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {term}
      </button>
      {open && (
        <span role="status" className="absolute left-0 top-full z-50 mt-2 block w-64 max-w-[min(18rem,80vw)] rounded-xl border border-border bg-popover p-3 text-left text-sm font-normal leading-relaxed text-popover-foreground shadow-lg">
          <span className="mb-1 block font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Glossary</span>
          {definition}
        </span>
      )}
    </span>
  );
}

function renderPlainWithGlossary(text: string, terms: { term: string; definition: string }[]): ReactNode[] {
  if (!terms.length || !text) return text ? [text] : [];
  const sorted = [...terms].sort((a, b) => b.term.length - a.term.length);
  const pattern = new RegExp(`(?<![A-Za-z])(${sorted.map((t) => escapeRegExp(t.term)).join("|")})(?![A-Za-z])`, "gi");
  const out: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const matched = match[0];
    const entry = sorted.find((t) => t.term.toLowerCase() === matched.toLowerCase());
    out.push(
      <GlossaryWord key={`g${i++}`} term={matched} definition={entry?.definition ?? ""} />
    );
    last = pattern.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.length ? out : [text];
}

/** Render explicit maths, bold/italic markup and common legacy scientific notation. */
export function MathText({ text }: { text: string }) {
  const glossary = useGlossaryTerms();
  const parts: ReactNode[] = [];
  splitRichTokens(normalizeMathText(text)).forEach((token, index) => {
    if ("math" in token) {
      parts.push(<InlineMath key={index} math={token.math} errorColor="#b3261e" />);
      return;
    }
    const content = renderPlainWithGlossary(token.text, glossary);
    if (token.bold && token.italic) parts.push(<strong key={index}><em>{content}</em></strong>);
    else if (token.bold) parts.push(<strong key={index}>{content}</strong>);
    else if (token.italic) parts.push(<em key={index}>{content}</em>);
    else parts.push(...content);
  });
  return <>{parts}</>;
}
