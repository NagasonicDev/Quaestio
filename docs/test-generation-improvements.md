# Test Generation: Proposed Changes

A revision plan for the Quaestio test generator, based on the current description in `test-generation-process.md`. It covers selection, rendering, storage, dependencies and testing.

> **Scope note.** This is based on the process document only, not a read-through of the code. Where a recommendation depends on something the document doesn't say (for example how maths is stored), it is listed under [Open questions](#open-questions) and should be confirmed before implementation.

---

## 1. Summary

The current design (client-side React, sql.js, IndexedDB, `docx` and `pdf-lib`) is a reasonable base for a local-first app. The main problems are:

| # | Problem | Impact |
|---|---|---|
| 1 | Two independent layout engines (`docx` and `pdf-lib`) | Double maintenance, layout drift, preview does not match download |
| 2 | Solutions are rebuilt later from live data | Solutions can silently diverge from the paper that was issued |
| 3 | Selection is heuristic, unseeded and deadline-dependent | Non-reproducible, machine-dependent, can miss the target |
| 4 | Sections are solved independently with no paper-wide balancing | Duplicate questions, no difficulty or topic control |
| 5 | Whole database lives in memory (sql.js) and blobs in IndexedDB | Scaling and data-loss risk |
| 6 | Little test coverage on the renderers | Layout regressions go unnoticed |

### Priority order

| Priority | Change | Section |
|---|---|---|
| 1 | Freeze an `ExamDocument` snapshot at generation; render paper and solutions together | [3](#3-exam-document-model-and-frozen-snapshots) |
| 2 | Replace `pdf-lib` with a single layout engine (HTML/CSS or Typst) driven by the shared model | [4](#4-rendering) |
| 3 | Exact solver, seeded randomness, Web Worker, cross-section dedupe | [5](#5-selection) |
| 4 | Ordering rules, difficulty and topic balance, usage history | [5.4](#54-ordering-and-balance) |
| 5 | Storage: OPFS, persistence request, backup/export | [6](#6-storage-and-persistence) |
| 6 | Visual regression and integrity tests | [7](#7-testing) |

---

## 2. Principles

1. **Separate selection, document model and rendering.** Each is a pure function of the previous stage's output.
2. **A generated paper is immutable.** Anything produced from it (paper, solutions, previews) is derived from a frozen snapshot, never from live question data.
3. **Deterministic by default.** The same inputs plus the same seed give the same paper on any machine.
4. **One layout engine per canonical format.** Do not hand-maintain two layout implementations for the same output.
5. **Fail loudly and honestly.** If a target cannot be met, say so and offer the nearest achievable options rather than silently approximating.

Target pipeline:

```
Blueprint (user input)
   -> Selection (worker, seeded, exact)
   -> ExamDocument (frozen snapshot, no layout)
   -> Renderer(s): paper PDF, paper DOCX, solutions PDF, solutions DOCX
   -> Storage (document snapshot + output blobs)
```

---

## 3. Exam document model and frozen snapshots

### 3.1 Problem

`generateTestSolutions` re-reads `question_ids_json` and `filter_json.generated_sections` and rebuilds questions from the current database. If a question's text, marks, options or marking criteria are edited after the paper was generated, the solutions document will no longer describe the paper students sat. Marks totals can also change.

### 3.2 Change

Introduce an `ExamDocument` type and store it (or a content-hashed equivalent) in `generated_test` at generation time.

```ts
// frontend/src/lib/examDocument.ts  (new)

export interface ExamDocument {
  schemaVersion: 1;
  testId: string;
  title: string;
  generatedAt: string;          // ISO timestamp
  seed: number;                 // see section 5
  profile: ExamProfile;         // timing, cover page, instructions
  totalMarks: number;
  sections: ExamSection[];
  stimuli: ExamStimulus[];
}

export interface ExamSection {
  label: string;                // "Section I"
  instructions?: string;
  targetMarks: number;
  achievedMarks: number;
  questions: ExamQuestion[];
}

export interface ExamQuestion {
  number: number;               // assigned at build time, never stored in the question bank
  sourceQuestionId: string;
  sourceVersion: string;        // content hash or revision id
  type: 'multiple_choice' | 'short_answer' | 'extended_response';
  marks: number;
  body: Block[];
  options?: McqOption[];        // includes isCorrect for the answer key
  parts?: ExamPart[];
  solution: SolutionContent;    // answer, worked solution, marking criteria
  source?: string;
  stimulusIds?: string[];
}

export type Block =
  | { kind: 'text'; markdown: string }
  | { kind: 'math'; latex: string; display: boolean }
  | { kind: 'image'; assetId: string; widthIn: number; alt: string }
  | { kind: 'table'; rows: string[][] };
```

Notes:

- The model contains **no layout decisions** (no fonts, no page breaks). That keeps it snapshot-testable and renderer-agnostic.
- Question numbers are assigned when the document is built, not stored in the database.
- Assets are referenced by id and resolved by the renderer. Store the asset bytes or hashes alongside the snapshot so the paper can be re-rendered even if the original asset is replaced.
- Include `sourceVersion` so you can later detect and report that a source question has changed since the paper was generated.

### 3.3 Schema changes

```sql
ALTER TABLE generated_test ADD COLUMN document_json TEXT;      -- frozen ExamDocument
ALTER TABLE generated_test ADD COLUMN seed INTEGER;
ALTER TABLE generated_test ADD COLUMN solutions_generated INTEGER NOT NULL DEFAULT 0;
```

- Keep `question_ids_json` for querying and usage history.
- Retire `solutions_file_path` (currently written empty and never updated), or populate it properly.
- Replace the "does the blob exist in IndexedDB" check for `solutions_available` with the explicit flag.
- Large asset bytes should stay in blob storage, referenced by hash, not inlined in `document_json`.

### 3.4 Generate paper and solutions together

Render both at generation time from the same snapshot. The marginal cost is small, and it removes the on-demand rebuild path. If you want lazy rendering of the solutions file for speed, render it lazily **from the snapshot**, never from live data.

### 3.5 MCQ answer key

The solutions builders currently ignore `mcq_option.is_correct` and rely on the stored `answer` slot. Change the builder so that:

1. For multiple choice questions, the correct option letter is always derived from `isCorrect` and shown as the answer.
2. Any `answer` slot content is shown in addition (for example a rationale).
3. Generation warns if an MCQ has no option marked correct, or more than one.

---

## 4. Rendering

### 4.1 Problems with the current approach

- **`pdf-lib` is a low-level writer, not a layout engine.** Text wrapping, pagination, keep-with-next, tables, right-margin mark tabs and image placement are all hand-written.
- **Every layout fix is made twice** (DOCX and PDF), and the two drift apart.
- **For DOCX output the preview is a separate PDF build**, so the preview is not what the user downloads.
- **Fonts:** `pdf-lib`'s standard fonts only cover Latin-1. Greek letters, `<=`, square roots and other symbols will fail or render incorrectly unless a Unicode font is embedded (with fontkit).
- **SVG:** neither library embeds SVG natively, so diagrams need a rasterisation step.
- **Maths:** the document doesn't say how it is rendered (see [Open questions](#open-questions)).
- **Maintenance:** `pdf-lib` has seen little maintenance activity in recent years.

### 4.2 Options

| Option | Pros | Cons |
|---|---|---|
| **A. HTML/CSS to PDF** (browser engine, optionally Paged.js) | One template; fonts, KaTeX maths and SVG handled by the browser; preview equals output; easy to restyle | Print CSS has quirks; paged-media features depend on Paged.js; no DOCX |
| **B. Typst via WASM** (`typst.ts`) | Excellent, deterministic typography; strong table and page control; small | New language and toolchain; PDF only; maths must be converted from LaTeX |
| **C. Desktop wrapper (Tauri or Electron) with LibreOffice or Pandoc sidecar** | DOCX and PDF come from the same source and match | Breaks the pure client-side model; install size and update burden |

### 4.3 Recommendation

- **Primary PDF: Option A (HTML/CSS)**, using the same React components or a plain HTML template driven by `ExamDocument`. Use Paged.js (or native `@page` rules where sufficient) for headers, footers, page counters and break control. Preview in an iframe is then literally the output.
- **DOCX: keep the `docx` package** as a secondary, editable export built from the same `ExamDocument`. Accept that it will not be pixel-identical to the PDF.
- **Decide which format is canonical.** If teachers edit papers, DOCX is canonical and PDF is a convenience. If the printed page is what matters, PDF is canonical and DOCX is best-effort. Document this decision so layout bugs are triaged against the right target.
- Revisit Option B if print CSS proves too fragile for pagination.

### 4.4 Renderer interface

```ts
export interface PaperRenderer {
  readonly format: 'pdf' | 'docx';
  renderPaper(doc: ExamDocument): Promise<Blob>;
  renderSolutions(doc: ExamDocument): Promise<Blob>;
}
```

Each renderer is a pure function of the snapshot plus resolved assets. This makes them independently testable and swappable.

### 4.5 Exam look-and-feel requirements

Keep these as explicit, tested requirements for every renderer:

- Named styles for Question, Part, Marks, Instructions and Section heading (DOCX), and equivalent CSS classes (PDF).
- Question numbers assigned at render time from the document model.
- Marks right-aligned as `[n marks]` or in the margin column.
- A question never splits from its stem and diagram: keep-with-next and keep-lines-together (DOCX), `break-inside: avoid` (CSS).
- Answer lines or boxes sized from the marks allocated.
- Images embedded at a fixed width and consistent resolution; SVG rasterised at a defined DPI for DOCX.
- Cover page, general instructions, structure overview, per-section headers with "Allow about X minutes", and "End of Exam".
- Page numbers and a footer on every page.

### 4.6 Exam profile

Move hardcoded values (`minutesPerMark = 1.8`, the HSC cover text, reading time, instructions) into an `ExamProfile` object stored in the snapshot. The NESA/HSC profile becomes the default, and other formats become configuration rather than code changes.

```ts
export interface ExamProfile {
  id: 'nesa-hsc';
  coverTitle: string;
  readingTimeMinutes: number;
  minutesPerMark: number;
  generalInstructions: string[];
  showCentreStudentBox: boolean;
}
```

---

## 5. Selection

### 5.1 Problems with the current approach

- Up to 4 randomised greedy passes and 12,000 random swaps are used to solve what is a subset-sum problem.
- A `performance.now()` deadline makes the result depend on machine speed.
- No seed, so papers cannot be reproduced and bad draws cannot be debugged.
- A 0.5-mark tolerance is unusual when marks are integers.
- Sections are solved independently, so the same question can be chosen twice.
- No difficulty or topic balancing across the paper.
- Selection runs on the main thread.

### 5.2 Exact solver

For integer mark values and targets up to 200, an exact dynamic-programming solution runs in milliseconds, so heuristics and deadlines are unnecessary for the single-section case.

For the full paper (several sections, one-use-per-question, topic and difficulty constraints), model one optimisation problem:

- **Variables:** a binary `x[q, s]` for each candidate question `q` and section `s` it is eligible for.
- **Constraints:**
  - Each section's marks equal its target exactly.
  - Each question is used at most once across the paper.
  - Per-section type and difficulty ranges.
  - Per-topic minimum and maximum marks (paper-wide).
  - Question groups (multi-part questions) are selected as whole units (already the case; keep it).
  - Optional pairwise exclusions ("not both") for near-duplicate questions.
- **Objective:** minimise usage-history penalty, plus a small seeded random weight per question for variety.

Candidate solver: **HiGHS compiled to WASM** (`highs-js`), which runs client-side and supports MIP. If the dependency is unwelcome, a branch-and-bound or DP implementation is sufficient for single-section cases and a simple two-pass approach (solve sections in order of pool size, removing used questions) is a reasonable fallback for the multi-section case.

### 5.3 Infeasibility handling

If a section cannot hit its target exactly:

1. Do not silently approximate.
2. Report the reason (for example: "pool has 14 approved questions totalling 37 marks; target is 40").
3. Offer the nearest achievable totals above and below.
4. Let the user choose to relax a filter or accept a different total.

### 5.4 Ordering and balance

Replace the single shuffle with ordering rules:

1. Section order as given by the user.
2. Within a section: multiple choice, then short answer, then extended response.
3. Within a type: ascending difficulty (or syllabus order), with seeded random tie-breaking.
4. `shuffle: false` keeps a stable deterministic order (for example by topic then id), not `created_at`.

Add paper-wide controls to the input:

- Difficulty mix (for example at most N hard marks).
- Topic coverage (minimum marks per selected topic).
- Exclude questions used in the last N tests, derived from `generated_test.question_ids_json`.
- Optional "keep these, replace the rest" for regenerating a paper with a fixed subset.

### 5.5 Seeding and workers

```ts
export interface SelectionRequest {
  sections: TestSectionInput[];
  seed: number;                 // generated if omitted, always stored
  excludeQuestionIds?: string[];
  usageWindow?: number;         // look back N tests
}
```

- Use a small seeded PRNG (for example mulberry32) everywhere randomness is needed.
- Store the seed in `generated_test.seed` and in the snapshot.
- Run selection in a **Web Worker** so the UI never blocks, with progress messages mapped onto the existing `onProgress` phases.
- Remove the deadline and the `selection_limited` flag. Exact solving makes them unnecessary; if a worst-case time guard is needed, make it a step count, not wall-clock time.

### 5.6 Tests for selection

Extend `questionSelection.test.mjs` to cover:

- Exact target hit for varied mark distributions.
- Determinism: same seed, same output; different seed, different output (where the pool allows).
- Infeasible targets return the documented error and nearest alternatives.
- No question appears in two sections.
- Topic and difficulty constraints are respected.
- Multi-part questions are never split.

---

## 6. Storage and persistence

### 6.1 Problems

- `sql.js` holds the whole database in memory and persists by exporting the entire file, which does not scale if images or other large assets are stored inside it.
- IndexedDB data can be evicted by the browser under storage pressure unless persistence is requested.
- With no server, the user's only backup is whatever they export themselves.

### 6.2 Changes

1. **Keep assets out of SQLite.** Store images and other files as blobs keyed by content hash. SQLite stores only the hash, dimensions and MIME type.
2. **Evaluate official SQLite WASM with OPFS** for incremental, persistent storage instead of whole-database export. This is a larger migration, so schedule it after the document model and renderer changes.
3. **Request persistent storage** on first run: `navigator.storage.persist()`, and surface the result in settings.
4. **Add backup and restore:** export the question bank, tests and assets as a single archive (for example a zip containing the SQLite file plus an `assets/` folder and a manifest), and import it with validation.
5. **Content-hash dedupe** for assets so repeated diagrams are stored once.

---

## 7. Testing

### 7.1 Add

| Layer | Test |
|---|---|
| Document model | Snapshot tests of `ExamDocument` for fixed seeds and a fixture question bank |
| Selection | Cases listed in [5.6](#56-tests-for-selection) |
| PDF renderer | Render to PNG (pdf.js) and compare with stored baselines (pixelmatch) with a small tolerance |
| DOCX renderer | Unzip and validate XML structure; open with LibreOffice headless in CI and convert to PDF to catch corruption |
| Integrity | Editing a source question after generation does not change the stored paper or solutions |
| MCQ key | Answer letter derives from `is_correct`; warnings for zero or multiple correct options |
| Fonts and symbols | A fixture question containing Greek letters, inequalities, subscripts and a non-Latin string renders correctly in both formats |
| Assets | SVG, PNG, large images and missing assets are handled with clear errors |

### 7.2 Keep

The existing `questionSelection`, `solutionSlots`, `solutionsDocx`, `mcqOptions` and `resolversProgress` tests, updated to the new document model where needed.

---

## 8. Migration plan

Phases are ordered so each one is shippable on its own.

### Phase 1: Document model and snapshots

- Add `ExamDocument` and a builder that produces it from selected, hydrated questions.
- Add `document_json`, `seed` and `solutions_generated` columns with a migration.
- Switch solutions generation to read from the snapshot.
- Fix the MCQ answer key.
- Backfill: for existing tests, build a best-effort snapshot from current data and mark it `legacy: true` so the UI can note it may not reflect the original paper.

**Done when:** editing a question after generation no longer changes that test's solutions.

### Phase 2: Rendering

- Introduce the `PaperRenderer` interface and port the DOCX builders to consume `ExamDocument`.
- Build the HTML/CSS PDF renderer, using the same snapshot.
- Remove `pdf-lib` after parity is reached; use the HTML renderer output for both preview and download.
- Add the exam profile and move hardcoded layout values into it.
- Add visual regression tests before removing the old PDF path.

**Done when:** preview and downloaded PDF are the same file, and Unicode maths symbols render correctly.

### Phase 3: Selection

- Add the seeded PRNG and store seeds.
- Implement the exact single-section solver, then the multi-section model.
- Move selection into a Web Worker.
- Add cross-section dedupe, infeasibility reporting and the new ordering rules.
- Remove the deadline and `selection_limited`.

**Done when:** the same inputs and seed produce an identical paper, and targets are hit exactly or reported infeasible.

### Phase 4: Balance and history

- Add difficulty mix, topic coverage and usage-history controls to the UI and request model.
- Add "regenerate keeping selected questions".

### Phase 5: Storage hardening

- Move assets to hash-keyed blobs.
- Request persistent storage; add backup and restore.
- Evaluate and, if justified, migrate to SQLite WASM with OPFS.

### Phase 6: Hardening

- CI visual regression, DOCX validation and integrity tests as listed in section 7.

---

## 9. Risks and trade-offs

| Risk | Mitigation |
|---|---|
| HTML/CSS pagination is less predictable than a hand-built PDF | Keep layout simple and rule-based; visual regression tests; fall back to Typst if needed |
| DOCX and PDF will still differ visually | State which format is canonical; test each against its own baseline |
| HiGHS WASM adds bundle size | Lazy-load it in the worker; single-section DP needs no solver |
| Snapshot storage grows the database | Reference assets by hash; compress `document_json` |
| Migrating existing tests | Mark legacy snapshots clearly; do not rewrite history |
| Changing the seed or solver changes results for existing workflows | Version the selection algorithm and store the version with the seed |

---

## Open questions

These affect the recommendations above and should be confirmed first.

1. **How is maths stored and rendered today?** (LaTeX, MathML, images, or plain text.) This decides the HTML/CSS versus Typst choice and whether DOCX needs native equations (OMML) or images.
2. **Do teachers edit the DOCX, or only print the PDF?** This decides which format is canonical.
3. **Are images stored inside the SQLite database or separately?** This changes the urgency of the storage work.
4. **What are the realistic pool sizes per section?** Very large pools favour a MIP solver; small pools are fine with DP.
5. **Is a desktop wrapper acceptable?** If so, a LibreOffice sidecar becomes a viable way to get matching DOCX and PDF.
6. **Do existing generated tests need faithful solutions, or is best-effort acceptable?** This decides how much effort the legacy backfill deserves.
