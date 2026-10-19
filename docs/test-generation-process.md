# Test Generation Process

How Quaestio builds an exam paper and its solutions/marking guide. Everything runs
client-side (React + sql.js SQLite + IndexedDB); there is no server involved.

## Where the code lives

| File | Role |
|---|---|
| `frontend/src/pages/TestGenerator.tsx` | UI (route `test-generator`); `handleGenerate()` builds the payload |
| `frontend/src/api/client.ts` | `api.generateTest`, `api.generateTestSolutions`, `api.estimateTestSections`, `api.listTests`, `api.deleteTest` |
| `frontend/src/lib/data.ts` | Core logic: `estimateTestSections`, `selectForMarks`, `sectionQuestions`, `generateTest`, `generateTestSolutions` |
| `frontend/src/lib/questionSelection.ts` | `selectQuestionIndexes(marks, targetUnits)` — the marks-combination solver |
| `frontend/src/lib/tests.ts` | File build/storage/export: `buildTestOutputs`, `storeTestFiles`, `storeTestSolutionFile`, `downloadTestFile` |
| `frontend/src/lib/examLayout.ts` | NESA/HSC paper plan: cover page, instructions, timing (`minutesPerMark = 1.8`) |
| `frontend/src/lib/docx.ts` / `frontend/src/lib/pdf.ts` | `buildDocxPaper`/`buildPdfPaper`, `buildDocxSolutions`/`buildPdfSolutions` |
| `frontend/src/lib/criteria.ts` | Solution structure: `solutionSlots`, `markingCriteriaBlocks`, `splitAllocation` |
| `frontend/src/lib/db/schema.ts` | `generated_test` table; `content_block.slot` |

Note: practice sessions (`startPracticeSession`, `randomQuestions`) are a separate,
count-based random draw for study — not the paper generator.

## Inputs

Per section (`TestSectionInput`, `frontend/src/api/types.ts`):

- `name` (defaults to `Section A/B…` or Roman `Section I…`)
- `node_ids` — curriculum nodes, expanded to the full subtree (`effectiveNodeFilterIds`)
- `type_keys` — `multiple_choice`, `short_answer`, `extended_response`
- `difficulties` — per-section filter only, no paper-wide balancing
- `source_filters` — institution and year
- `marks` — mandatory target, 5–200 (UI default 20, slider step 4)

Paper level: `title`, `format` (`docx` | `pdf`), `shuffle`. There is **no question-count
input and no seed** — selection is marks-driven and uses `Math.random`, so runs are
not reproducible.

## Selection flow (per section, sections run in parallel)

1. **Candidate pool** — `matchingQuestionMarks` queries
   `buildFilters({approvedOnly: true, wholeQuestions: true, …})`: only
   `review_status = 'approved'` top-level questions (`parent_question_id IS NULL`)
   with `marks IS NOT NULL`, ordered `created_at ASC`. Candidate queries are cached
   per filter signature. The live UI availability counts come from
   `estimateTestSections` (COUNT + SUM(marks) per section).
2. **Shuffle** — candidate rows are Fisher–Yates shuffled (`selectForMarks`).
3. **Marks solver** — `selectQuestionIndexes(marks, round(target * 100))`. Marks are
   converted to integer "units" (×100). Equal-mark sections are solved directly
   (`count = target / unit`); otherwise:
   - up to **4 randomized greedy passes** (add shuffled questions while
     sum ≤ upper limit = target + max(tolerance, largest mark ≤ target));
   - up to **12 000 bounded random 1-for-1 / 1-for-2 swaps**, accepting only strict
     improvements.
   - Tolerance: **50 units (0.5 marks)**. A hard deadline
     (`performance.now() >= deadline`) sets `selectionLimited`; the best-so-far
     selection is always kept.
4. **Hydration** — picked IDs get full content: blocks, parts, MCQ options, assets,
   source (`hydrateQuestions`). Multi-part questions are selected as whole units.
5. **Ordering** — `payload.shuffle === false` keeps oldest-first order
   (`created_at ASC`), otherwise `shuffleList(questions)`. Sections keep the order
   given by the user.
6. **Stimuli** — linked stimuli are collected per question and rendered as a trailing
   "Stimulus Material" section.

If no approved questions match, generation throws
`"No approved questions match …"`. If a section misses its deadline, the UI shows a
warning banner and the section result carries `selection_limited: true`.

## Output formats

Built by `buildTestOutputs` (`frontend/src/lib/tests.ts`):

- **DOCX** (default, `docx` package) and **PDF** (`pdf-lib`) paper; for DOCX a PDF is
  also built as the preview blob.
- **HSC-style cover page**: "HIGHER SCHOOL CERTIFICATE EXAMINATION", centre/student
  number box, General Instructions (10 min reading, working time from
  `minutesPerMark = 1.8`, black pen, calculators, total marks), "Examination
  structure" overview; per-section headers with question ranges and "Allow about X"
  times; "End of Exam"; marks in the right margin tab (7.05 in).
- **In-app**: PDF preview in an iframe via object URL; "Past tests" list with
  download buttons (`test-paper.docx|pdf`, `test-solutions.docx|pdf`).

## Storage

- Metadata row in SQLite: `generated_test(test_id, course_id, title, format,
  target_marks, achieved_marks, question_count, filter_json, question_ids_json,
  test_file_path, solutions_file_path, preview_file_path, created_at)`.
  - `filter_json` = the whole payload plus
    `generated_sections: [{label, question_ids}]` — used to rebuild solutions later.
  - `question_ids_json` = ordered flat ID list.
- File blobs (test / preview / solutions) live in IndexedDB; the `*_file_path`
  values are nominal filenames.

## Progress reporting

Phases: `selecting → hydrating → paper → preview → saving`, reported through
`onProgress` (`testGenerationTask.ts`). An ETA is learned per format and cached in
localStorage (`quaestio:test-generation-seconds-per-question:<format>`).

## Solutions and marking guide

**Solutions are not included in the paper.** `buildDocxPaper`/`buildPdfPaper` render
only the body, MCQ options, part bodies, marks and source lines.

Solutions are generated **on demand, later** by `generateTestSolutions`
(`data.ts`), which re-reads `question_ids_json` + `filter_json.generated_sections`
from the stored test, rebuilds the questions, and produces a solutions document via
`buildDocxSolutions`/`buildPdfSolutions`. The result is stored as a third blob
(`storeTestSolutionFile`); `solutions_available` in the tests list is derived from
the blob's presence in IndexedDB.

Per question, content comes from `solutionSlots(question)` (`criteria.ts`) — three
slots, repeated per part as `(a)`/`(b)` sub-slots:

1. **Answer** — `question.answer` blocks (headed "Overview" when parts exist)
2. **Solution** — `solution` blocks
3. **Marking criteria** — `marking_criteria` blocks folded into a two-column
   `Marks | Criteria` table (widths 0.14/0.86)

Slot values come from `content_block.slot`
(`body | hint | answer | solution | marking_criteria`). Marks allocations inside
criteria text are parsed by `splitAllocation` (e.g. "2 marks: …" or "… (2 marks)").

Document header: title + "Solutions and marking guide"; per question: "Question N",
source bracket + `Question ID:` line, then the slots.

Caveats:

- MCQ `mcq_option.is_correct` exists but is **not used** by the solutions builders —
  the answer key relies on the stored `answer` slot content, so an MCQ with an empty
  answer slot yields no explicit answer letter.
- `generated_test.solutions_file_path` is written empty at generation and not
  updated when solutions are produced (existence is checked in IndexedDB).

## Known limitations

- Achieved marks may miss the target by up to the 0.5-mark tolerance, or more if the
  selection deadline is hit (`selection_limited`).
- No difficulty balancing across the paper — difficulty is a per-section filter only.
- No cross-section duplicate prevention: each section selects independently, so
  overlapping filters can produce the same question in two sections.
- Selection is non-deterministic (no seed); regenerating with the same inputs yields
  a different paper.

## Tests

Run with `npm test` in `frontend`:

- `frontend/tests/questionSelection.test.mjs` — marks-combination solver
- `frontend/tests/solutionSlots.test.mjs` — solution slot extraction
- `frontend/tests/solutionsDocx.test.mjs` — solutions DOCX builder
- `frontend/tests/mcqOptions.test.mjs` — MCQ option rendering
- `frontend/tests/resolversProgress.test.mjs` — resolvers and progress reporting
