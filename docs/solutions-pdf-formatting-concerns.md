# Unresolved source-content & scientific-review concerns

These are flagged for editorial review (no content was invented or silently altered). They relate to the source material seen in the reference PDF (`test-solutions (5).pdf`) and to the generator's behaviour when encountering ambiguous math/content.

## 1. Bare LaTeX leaking into prose/text blocks
- **Observation (reference):** `pdf_content.txt` shows literal markup like `\left(\dfrac{GM T^{2}}{4\pi^{2}}\right)^{1/3}`, `\tau = 0.20\,\mathrm{N\,m}`, `t = \dfrac{2.5-0}{3.5-0}=0.714\,\mathrm{s}`, `y = ut + \tfrac{1}{2}at^{2}=...` appearing in what look like text lines.
- **Status:** The new pipeline now routes `$…$`, `$$…$$`, `\(…\)`, `\[…\]` through KaTeX. It also detects **whole-block** bare LaTeX via `looksLikeStandaloneLatex` and renders those blocks as display equations. **Mixed prose + un-delimited LaTeX** is deliberately **not** auto-converted (to avoid mangling sentences).
- **Action required (source/editorial):** Review questions that contain mixed prose and mathematics without `$…$` delimiters in their source (answers/solutions blocks). Either wrap the mathematical spans in `$…$` (preferred), or split into separate text/equation blocks. The generator will now avoid printing literal markup for standalone math lines, but mixed cases remain ambiguous and should be fixed at source.

## 2. Interface/instructional prose embedded in question content
- **Examples seen (content data):** "Answered in parts (a) to (d). Each part carries its own full answer and marking guide; open the part to see them." and "The worked method is stored against each part of this question, so that each part is self-contained."
- **Status:** These are stored in parent answer/solution blocks (content data), not synthesised by the generator. The new layout clarifies hierarchy (Overview for parent when parts exist) but does **not** remove or rewrite this text.
- **Action required (editorial):** Decide whether these platform/UI instructions belong in a printed solutions/marking guide PDF. If they are intended for the app UI only, strip or rephrase them in the question source before export. If they are pedagogically useful, keep as-is.

## 3. Question IDs, sources and attributions
- **Observation:** Source line shows `(institution, name, year)` bracket + `Question ID: X` joined by ` · ` (grey 8pt). Non-ASCII characters in that line may not extract to plain text in some PDF viewers due to font subset ToUnicode maps (pdf-lib behaviour) — this affects text extraction only, not visual rendering.
- **Status:** Preserved as-is. No changes to attribution wording.
- **Action required (editorial):** Verify that source strings are complete and consistently formatted across all questions (institution/name/year). Flag any missing or ambiguous attributions.

## 4. Marking criteria structure and ambiguity
- **Observation:** Some criteria tables mix single-mark entries with mark bands/ranges (e.g. `1-2 marks: ...`). The generator preserves the supplied text and renders Marks as-is (via `splitAllocation`).
- **Status:** No inference of scoring logic. Per-column widths favour the Criteria column (86%) to reduce wrapping-induced misreads. Ranges like `1-2` are kept verbatim.
- **Action required (editorial/scientific):** If a marking scheme uses cumulative vs alternative bands, ensure the source clearly expresses that distinction. Where allocation is ambiguous, flag for review before publication.

## 5. Diagrams/figures referenced but not reproduced
- **Observation:** Several solutions refer to diagrams, arrows, labelled points or an H–R diagram (notably Question 17(a)(i) describes a diagram in prose). Question 23's graph is included in the source set.
- **Status:** The generator places supplied figures/graphs near the corresponding block when present (using `fitImage` with column-width constraints). If an image is missing, it emits `[missing image: <path>]` in italics (or a compact placeholder). No diagrams were invented.
- **Action required (editorial):** Confirm whether the solutions/marking guide is intended to be used standalone or alongside the original question paper. For any answer that depends critically on a diagram not present in the export, either include the figure asset in the question/solution blocks or add a clear note in the source.

## 6. Equation resolution robustness
- **Observation:** Some long display equations in the reference contained un-delimited LaTeX and were rendered as literal markup by the previous generator (confirmed in `pdf_content.txt`).
- **Status:** With the new pipeline, standalone long equations are detected and rendered. If KaTeX cannot render an expression (syntax error), the equation image will be missing and the fallback `latexToPlain` produces a readable plain-text approximation; the equation block still renders (centred) rather than emitting raw TeX commands.
- **Action required (scientific/editorial):** Spot-check a sample of rendered display equations (especially with `\dfrac`, nested fractions, subscripts/superscripts, vectors) for mathematical correctness of the **source** LaTeX. The generator's rendering correctness is limited by KaTeX; any invalid LaTeX should be corrected at source.

## 7. Pagination trade-offs
- **Observation:** Keeping table headers with first row and repeating headers on continuation improves continuity but can create short orphaned table tails on the following page in edge cases.
- **Status:** The implementation prioritises continuity (header-repeat + ensuring header+first-row together) over forcing every tiny table to a single page. This matches the priority order (continuity before aggressive space compression).
- **Action required (editorial QA):** Run a visual pass on long marking-criteria tables (e.g. Questions 10, 18 in the reference set) to confirm page breaks fall at sensible row boundaries. If a particular table consistently breaks poorly, consider splitting into logical groups at source or rephrasing long criteria.

## 8. Scope: formatting only
- **Reminder:** All changes are presentation/structure fixes. The physics content, marks, criteria wording, question numbering/IDs, and source attributions were **preserved**. No values were changed. Any perceived scientific inaccuracy in the supplied solutions must be addressed in the source content, not by the PDF generator.
