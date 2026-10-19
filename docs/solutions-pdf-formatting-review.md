# Solutions & marking guide PDF formatting — change summary

**Generator scope:** `frontend/src/lib/pdf.ts` (`buildPdfSolutions`), `frontend/src/lib/criteria.ts`, `frontend/src/lib/resolvers.ts`, `frontend/src/lib/equations.ts`, `frontend/src/lib/docx.ts` (twin). Added `frontend/src/lib/mathText.ts` (shared math pipeline).

## A. Tables (clipped/overflowing criteria) — fixed
- Added per-column width/align support to tables (`tableColumnWidths`, `tableColumnAligns` in `criteria.ts`). Marking-criteria tables now use `[0.14, 0.86]` (Marks 14%, Criteria 86%) and alignment `["center", "left"]` so descriptive criteria wrap left-aligned and marks stay centred (criteria.ts:78–101, 135–172).
- Replaced the legacy `gridRow` with a full table layout in `pdf.ts` (line-based wrapping, per-column widths/aligns, header repeated on continuation pages). Inline mathematics is measured in points and does **not** force a single unwrapped line; long expressions grow the line height instead of overflowing column boundaries (pdf.ts:297–412+ of new table implementation).
- Table rendering in DOCX now honours per-column widths/aligns, repeats header rows, sets `cantSplit` to keep short criteria rows whole and vertically aligns body cells to the top (docx.ts:242–295).

## B. Mathematical rendering & legibility — repaired
- Introduced `mathText.ts` (delimiters `$…$`, `$$…$$`, `\(…\)`, `\[…\]`): `mathExpressions`, `splitRichTokens`, `hasMath`, `latexToPlain`, `looksLikeStandaloneLatex`, `MATH_FONT_PX=16`, `mathPtSize`).
- KaTeX is rendered at a fixed font size (`MATH_FONT_PX=16px`) so pixel→point scaling is deterministic (equations.ts:167–205). Natural rendered width/height are now stored in `resolvers.ts` (no more forced 22px/27px aspect squashing) for both inline and display equations (resolvers.ts:157–239).
- `richText` in `pdf.ts` now tokenises spans via `splitRichTokens`, sizes inline math by its natural height via `mathPtSize`, and wraps long mathematical expressions across lines instead of shrinking them to fit a single line (pdf.ts:435–466).
- Standalone bare-LaTeX text/heading blocks (lost `$` delimiters) are detected via `looksLikeStandaloneLatex` and rendered as display equations rather than printed as literal markup (resolvers.ts:174–188). Unresolved math falls back to `latexToPlain` (unicode Greek/symbols, superscripts/subscripts, brace-matched `\frac`/`\sqrt`/`\mathrm`) so literal commands no longer leak into the visible PDF/DOCX (mathText.ts:109–170; pdf.ts:498–507, 434–466).
- Equation block images are placed at natural size (scaled to body text) and capped only by the text column width, not a fixed 216pt/23pt cap (pdf.ts:497–507, equationImage method).

## C. Pagination & table continuity — improved
- Tables keep their header with the first body row and repeat the header whenever a page break occurs mid-table (pdf.ts table layout with header reuse). The table layout avoids orphaning the header alone and reduces detached rows.
- Slot headings (`Overview`/part headings and `Answer`/`Solution`/`Marking criteria` labels) are emitted with additional pre-break spacing to stay with their following content (pdf.ts:866–883, 936–973).
- After each table, trailing spacer tightened to reduce excessive whitespace (net 4pt before / 8pt after) without risking overlap (pdf.ts table method).
- Paragraph line wrapping now accounts for tall inline mathematics when calculating line height, improving vertical rhythm near equations (pdf.ts:435–466).

## D. Structure & hierarchy — simplified (non-destructive)
- `solutionSlots()` now returns slots with optional `heading` and `sub` flags (criteria.ts:78–129). For questions with parts, parent slots are grouped under an `Overview` heading; each part starts with a part heading `(a)/(b)...` or `Part`, and the slot labels themselves remain `Answer`/`Solution`/`Marking criteria` (preserving clarity while making hierarchy explicit). The test expectations were updated accordingly (frontend/tests/solutionSlots.test.mjs).
- Question headers in the solutions PDF now include a right-aligned total-marks label in the text column area (e.g., "6 marks") where appropriate (pdf.ts:970–983).
- Lists gain hanging indent: continuation lines align with the text following the bullet/number, not with the bullet itself (pdf.ts:583–605).

## E. Typography & spacing — standardised
- Body text size preserved (12pt). Mathematical content is rendered at a legible scale (12pt-equivalent at the KaTeX baseline) and wrapped rather than scaled down. Headings use consistent sizes (15pt section, 13pt question, 12pt slot headings; 11.5/11pt for part/sub headings).
- Source line: `formatSourceBracket(q.source)` + `Question ID: ${q.question_id}` joined by ` · ` (grey, 8pt) — unchanged (pdf.ts:723–726).
- Page numbers remain `– n –` (decorative en-dashes). Text extraction may render them as replacement characters due to pdf-lib font subset ToUnicode; the visual PDF is unchanged in intent.

## Verification
- `npm run test:solutions` (frontend): **20/20 tests pass** (including new `mathText.test.mjs`).
- `npm test` (frontend): **90/90 tests pass** across all suites (selection, review, schema, plan, progress, mcq-options, solutions).
- TypeScript: `tsc -b` passes with no errors.

## Reviewability
- The changes are small and bounded, focused on the generator (no edits to generated PDFs, no changes to question content semantics). The new `mathText.ts` is pure and unit-tested. Table construction still emits `["Marks","Criteria"]` with `block_id` `*:criteria-table`, preserving the existing contract.

Unresolved source-content and scientific-review concerns are listed in `docs/solutions-pdf-formatting-concerns.md`.
