# Task 7 Report: Include Stimulus in Test Generation

**Status:** DONE

## Files modified

- **`frontend/src/lib/data.ts`** — in `generateTest`, after the selected questions are assembled, collect the unique stimuli linked to them. Deduplicates by `stimulus_id` (via the existing `getStimuliForQuestion` and `getStimulus` helpers), records the rendered question number(s) each stimulus is referenced by, and passes the list to `buildTestOutputs` as `stimuli`.
- **`frontend/src/lib/tests.ts`** — added `TestStimulusItem` and an optional `stimuli` field on `BuildOptions`; forwards `stimuli` into `collectImages` and into the `docOptions` handed to both `buildDocxPaper` and `buildPdfPaper` (so the DOCX preview path picks it up too).
- **`frontend/src/lib/docx.ts`** — added `DocStimulusItem` and optional `stimuli` on `DocOptions`; added `renderStimulusSection`, appended after the last exam section. `collectImages` now also resolves images/equations from stimulus blocks.
- **`frontend/src/lib/pdf.ts`** — added `PdfStimulusItem` and optional `stimuli` on `PdfOptions`; after the last section it starts a new page and writes a "Stimulus Material" section mirroring the DOCX layout, resolving each stimulus's images/equations separately.

## Behaviour

- The stimulus section is rendered **at the end of the test** (after "End of Exam"), as requested.
- Each stimulus is labelled `Stimulus N` (or `Stimulus N: <title>` when it has a title) and followed by its blocks, rendered with the same block renderer used for questions (`renderBlocks`/`renderBlock`) so formatting stays consistent across DOCX and PDF.
- Each heading shows which questions use it: `(Referenced by Questions: 3, 7)`.
- A stimulus shared by several selected questions appears **once**, with all referencing question numbers listed.
- Question numbers match the global "Question N" numbering in the paper.

## Verification

- `npx tsc -b` — passed (no output).
- `npx oxlint src/lib/data.ts src/lib/tests.ts src/lib/docx.ts src/lib/pdf.ts` — passed (no output).
- `npm test` — all existing suites pass (selection 5, review 17, schema 3, plan 12, progress 14, mcq-options 4).
- `npm run build` (tsc -b && vite build) — succeeded.

## Concerns / not verified

- No automated test was added for the stimulus collection or rendering. The collection logic lives in `data.ts` and needs a live sql.js database, and the renderers need the DOCX/PDF font assets, so neither fits the repo's existing pure-logic `.mjs` test harness; the project has no test for `data.ts`.
- Step 5's runtime check ("generate a test with questions that share a stimulus") was **not** executed — it needs the browser app and a course with linked stimuli. Types, lint and the production build all pass, but the actual generated document was not eyeballed.
- Stimulus collection issues one `getStimuliForQuestion` per selected question plus one `getStimulus` per unique stimulus. Tests are small (tens of questions), so this was left un-batched rather than adding a new helper.
- The solutions/marking-guide export was intentionally left unchanged (not part of the brief).

No commits made.
