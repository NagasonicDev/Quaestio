# Template Question Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every shipped HSC template bundle import as simple, answerable questions, and give English Advanced Paper 1 real stimuli instead of copied page text.

**Architecture:** Add optional `stimuli` / `question_stimuli` support to the `.qbx` reader and `importJson`, reusing the shape already used by full course exchange. Then run two deterministic, idempotent Python passes over both bundle trees: one strips printed page furniture and adds answer space, the other rebuilds English Paper 1 bodies and extracts the unseen texts from the source PDFs into stimuli.

**Tech Stack:** TypeScript, React, sql.js SQLite, JSZip, Node test runner, Python 3.12 stdlib, PyMuPDF, existing `scripts/question_import/qbx_lib.py`.

**Spec:** `docs/template-import-process.md` plus the scope decision below (no separate spec document).

## Scope

In scope, per the user's chosen option **"Normalise all + rebuild English"**:

- Add stimuli support to `.qbx` (`questions.json` → `parseQuestionBundleBlob` → `importJson`).
- Mechanically clean every bundle: printed `Question N` headers, dot leaders, page furniture; add answer areas by marks.
- Rebuild English Advanced Paper 1 for 2021, 2022, 2023 and 2025 with stimuli extracted from the PDFs.
- Produce a quality report naming everything that could not be fixed mechanically.

Out of scope:

- Rebuilding marking criteria from `*-mg.pdf`.
- Inventing content missing from a source PDF.
- Fixing placeholder subjects whose bodies say "See exam paper".
- Stimulus images and Paper 2 stimuli.
- English Paper 1 for 2020 and 2024 (source PDFs contain Paper 2 only).

## Global Constraints

- Do not commit, push or tag. Leave the working tree for review.
- Never fabricate source content. A missing text is omitted and reported by year and text number.
- Only rewrite question `body` text/heading blocks. Never touch `answer`, `solution`, `marking_criteria`, `mcq_options`, `marks`, `nodes`, `source` or `parts` structure.
- Answer areas follow the existing convention of 2 lines per mark (`qbx_lib.answer_lines`).
- Both bundle trees must end identical: `imports/<subject>/hsc/<year>-hsc-<subject>.qbx` and `frontend/public/templates/hsc/<subject>/<year>-hsc-<subject>.qbx`.
- Both Python scripts are deterministic and idempotent; a second run reports zero changes.
- No new dependencies. Use `qbx_lib`, PyMuPDF and the stdlib already in the repo.
- Every changed bundle must still pass `scripts/question_import/audit_qbx.py`.

## Review Focus

- Unknown, duplicate or dangling stimulus links must be skipped with a warning, never abort the import.
- Stimulus blocks may reference images; the `.qbx` reader must stage those blobs and rewrite their ids.
- Cleaning must never empty a body or delete a genuine question. If cleaning removes everything, keep the original and flag it.
- The normaliser must not alter MCQ options, answers, solutions, marking criteria or parts.
- Copyright-blocked texts (2022 Text 6, 2025 Text 5) must be absent from stimuli and named in `notes` and the report.

---

### Task 1: Resolve authored stimulus links to imported ids

**Files:**
- Create: `frontend/src/lib/stimulus.ts`
- Test: `frontend/tests/stimulusLinks.test.mjs`

**Interfaces:**
- Produces `StimulusLink = { question_id?: string; stimulus_id?: string }`.
- Produces `resolveStimulusLinks(links, questionMap, stimulusMap): { links: Array<[string, string]>; skipped: number }`. `skipped` counts links whose authored question or stimulus id is unknown; duplicate resolved pairs are silently collapsed.

- [ ] **Step 1: Write the failing test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { resolveStimulusLinks } from "../src/lib/stimulus.ts";

test("maps authored ids, skips unknown ids and collapses duplicates", () => {
  const questions = new Map([["authored-q", "claimed-q"]]);
  const stimuli = new Map([["authored-s", "claimed-s"]]);
  assert.deepEqual(
    resolveStimulusLinks([
      { question_id: "authored-q", stimulus_id: "authored-s" },
      { question_id: "authored-q", stimulus_id: "authored-s" },
      { question_id: "missing-q", stimulus_id: "authored-s" },
      { question_id: "authored-q", stimulus_id: "missing-s" },
    ], questions, stimuli),
    { links: [["claimed-q", "claimed-s"]], skipped: 2 }
  );
  assert.deepEqual(resolveStimulusLinks(undefined, questions, stimuli), { links: [], skipped: 0 });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `frontend`: `node --test tests/stimulusLinks.test.mjs`
Expected: FAIL because `../src/lib/stimulus.ts` does not exist.

- [ ] **Step 3: Implement `resolveStimulusLinks`**

Use a `Set` keyed by `${questionId}\u0000${stimulusId}` for deduplication. Treat empty or missing authored ids as unknown.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/stimulusLinks.test.mjs`
Expected: PASS.

---

### Task 2: Import stimuli in `importJson`

**Files:**
- Modify: `frontend/src/lib/data.ts` (`importJson`, starting line 2993)
- Uses: `frontend/src/lib/stimulus.ts`

**Interfaces:**
- Consumes `resolveStimulusLinks` from Task 1.
- Accepts optional `data.stimuli: Array<{ stimulus_id, title?, blocks }>` and `data.question_stimuli: StimulusLink[]`.
- Inserts stimuli after the question loop and before the `UPDATE import_job` statement.
- Pushes one `jobWarnings` entry for each skipped stimulus and each skipped link.

- [ ] **Step 1: Add the authored-to-claimed question map**

Next to `usedQuestionIds` (data.ts:3047) add `const questionMap = new Map<string, string>();`. After the top-level `claimQuestionId` (line 3176) and after the part `claimQuestionId` (line 3207), record `questionMap.set(String(q.question_id), parentId)` / `questionMap.set(String(part.question_id), partId)` when the authored id is non-empty.

- [ ] **Step 2: Insert stimuli and links after the question loop**

After the `for (let i = 0; i < questions.length; i++)` loop closes at line 3228, before `UPDATE import_job`:

1. Create `stimulusMap`.
2. For each `data.stimuli` entry: skip and warn when `stimulus_id` is empty, duplicated, or `blocks` is not a non-empty array; otherwise `newId("stim")`, insert `stimulus` with `course_id`, `title ?? null`, `created_at`/`updated_at` from `nowUtc()`, then `insertStimulusBlocks(newStimulusId, stimulus.blocks, statements)` and `runMany`.
3. Call `resolveStimulusLinks(data.question_stimuli, questionMap, stimulusMap)`.
4. `runMany` one `INSERT OR IGNORE INTO question_stimulus (question_id, stimulus_id) VALUES (?, ?)` per resolved link.
5. Push one `jobWarnings` entry naming the number of skipped links.

Do not let a malformed stimulus reject any question already imported.

- [ ] **Step 3: Type-check the importer**

Run from `frontend`: `npm run build`
Expected: PASS. This compiles `data.ts` and `stimulus.ts`; there is no node test for `importJson` because `data.ts` imports browser-only renderers and IndexedDB.

- [ ] **Step 4: Confirm the stimulus path is reachable**

Grep `data.ts` for `stimulusMap` and `question_stimulus`; confirm both sit inside `importJson` after the question loop. Report the line numbers in the task result.

---

### Task 3: Stage assets referenced by stimulus blocks

**Files:**
- Modify: `frontend/src/lib/questionBundle.ts`

**Interfaces:**
- `parseQuestionBundleBlob` continues to return `{ ...payload, questions, assetIds }`; stimulus blocks are rewritten in place alongside question blocks.

- [ ] **Step 1: Collect stimulus assets**

Hoist the existing `collectBlocks` helper out of `collectQuestion` to function scope, then apply it to every `payload.stimuli[].blocks` entry. Keep the existing question slots, MCQ options and parts collection unchanged.

- [ ] **Step 2: Rewrite stimulus assets**

Hoist the existing `rewriteBlocks` helper out of `rewriteQuestion` to function scope, then apply it to every `payload.stimuli[].blocks` entry before the function returns.

- [ ] **Step 3: Verify**

Run from `frontend`: `npm run build`
Expected: PASS.

Run: `node --test tests/stimulusLinks.test.mjs`
Expected: PASS (no regression in the shared helper).

---

### Task 4: Document stimulus support in the import contract

**Files:**
- Modify: `scripts/question_import/WORKFLOW.md` (Stimuli section around line 112; delivery checklist around line 382)
- Regenerate: `.opencode/skills/*-question-import/WORKFLOW.md`

- [ ] **Step 1: Replace the "Stimuli" section**

State that `.qbx` now accepts optional top-level `stimuli` and `question_stimuli`, show the exact shape (`stimulus_id`, `title`, `blocks`; link fields `question_id`, `stimulus_id`), and keep the existing guidance: use a stimulus when the same content serves two or more top-level questions, or for a long extract; never across the parts of one question; images stay with their question. Say the importer skips unknown links with a warning.

- [ ] **Step 2: Replace the checklist bullet**

Replace "No `stimuli` field — the importer ignores it" with "Every `question_stimuli` link names a question and a stimulus present in the same bundle."

- [ ] **Step 3: Regenerate every skill copy**

Run: `python -X utf8 scripts/skill_render.py`
Expected: writes `WORKFLOW.md` into all `*-question-import` skill directories.

Run: `python -X utf8 scripts/build_skill.py --check`
Expected: exit 0, all skills `ok`.

---

### Task 5: Text cleaner and bundle normaliser

**Files:**
- Create: `scripts/question_import/text_clean.py`
- Create: `scripts/normalise_templates.py`

**Interfaces:**
- `text_clean.clean_text(text: str) -> str` removes dot leaders, printed `Question N` prefixes and page furniture, preserves genuine lines, and returns the original string when cleaning would leave nothing.
- `normalise_templates.normalise_bundle(path: Path, write: bool) -> dict` returns counts: `text_blocks_changed`, `chars_removed`, `blocks_emptied`, `answer_areas_added`, `changed`.
- CLI: `--root PATH` (repeatable; default `imports` and `frontend/public/templates/hsc`), `--write`, `--check`, `--report PATH`, `--self-test`.

- [ ] **Step 1: Write the failing self-test**

In `scripts/normalise_templates.py`, add a `--self-test` branch asserting:

```python
assert clean_text("Question 3 (4 marks)\nText 1 — Nonfiction\nName: ............ (a) Outline...") \
    == "Text 1 — Nonfiction\nName: (a) Outline..."
assert clean_text("===== PAGE 2 =====\n– 2 –\nPlease turn over\nBLANK PAGE") == ""
assert clean_text("Do NOT write in this area.\n(a) Explain why.") == "(a) Explain why."
assert clean_text("(a) Outline one reason.") == "(a) Outline one reason."
assert clean_text("............") == ""  # the bundle walk keeps the original block
```

- [ ] **Step 2: Run it to verify it fails**

Run: `python -X utf8 scripts/normalise_templates.py --self-test`
Expected: FAIL because `text_clean.clean_text` does not exist.

- [ ] **Step 3: Implement `clean_text`**

Order: replace runs of 5+ dots with a space; split into lines; normalise internal whitespace; strip a leading `Question N (M marks)` and optional `, Section X` prefix from a line; drop lines matching page furniture; drop empty lines; join with `\n`. `clean_text` may return `""`; the bundle walk is responsible for keeping the original block in that case.

Import `ensure_answer_areas` by adding `str(Path(__file__).resolve().parent / "question_import")` to `sys.path` before `from qbx_lib import ensure_answer_areas`.

Furniture patterns must include: `===== PAGE N =====`, `– N –`, `Please turn over`, `BLANK PAGE`, `End of paper`, `© YYYY NSW Education Standards Authority`, `Student Number`, `Centre Number`, `Office Use Only…`, `Do NOT write in this area.`, `Question attempted`, `If you use this space…`, `Extra writing booklets are available.`, `Answer the question in the … Writing Booklet…`, `Attempt Questions …`, `Allow about … minutes…`, `Section I`/`Section II` alone, `N marks` alone, a lone `•`, underscore rules.

Do not strip bare numbers, `(a)`/`(b)`, `OR`, `Text N — …`, or marking-criteria prose.

- [ ] **Step 4: Implement the bundle walk**

For each `20xx-hsc-*.qbx` under each root, read `questions.json` with `zipfile`, recurse through top-level questions and `parts`, and apply `clean_text` only to `body` blocks whose `block_type` is `text` or `heading` and whose `content.text` is a string. Count changed blocks and characters removed.

After cleaning each top-level question, call `qbx_lib.ensure_answer_areas(q)` and count new leaf answer areas. Skip `multiple_choice`, parents with parts, and leaves that already have one. Never delete a block; when cleaning empties it, keep the original and increment `blocks_emptied`.

Write the zip back deterministically: same member order, `questions.json` as `json.dumps(..., ensure_ascii=False, indent=2) + "\n"`, all other members copied byte-for-byte. Without `--write`, change nothing.

- [ ] **Step 5: Run the self-test**

Run: `python -X utf8 scripts/normalise_templates.py --self-test`
Expected: PASS.

- [ ] **Step 6: Verify idempotence on a scratch copy**

Copy one clean bundle and one dirty bundle into `temp/normalise-fixture/`, run `--write --root temp/normalise-fixture`, then run `--check --root temp/normalise-fixture`.
Expected: second run exits 0 with `changed=0`.

---

### Task 6: Apply normalisation to both bundle trees

**Files:**
- Modify: every `.qbx` under `imports/*/hsc/` and `frontend/public/templates/hsc/`
- Report: `temp/normalise-report.json` (untracked)

- [ ] **Step 1: Record a baseline audit**

Run: `python -X utf8 scripts/question_import/audit_qbx.py imports --all > temp/audit-before.txt 2>&1`

Keep the exit code and the failing bundle names; they are the baseline, not a gate.

- [ ] **Step 2: Dry-run and inspect**

Run: `python -X utf8 scripts/normalise_templates.py --report temp/normalise-report.json`

Check: changed bundles are plausible; `blocks_emptied` lists only furniture-only bodies; no bundle reports a drop in question count; the placeholder list matches the known "See exam paper" families.

- [ ] **Step 3: Write both trees**

Run: `python -X utf8 scripts/normalise_templates.py --write --report temp/normalise-report.json`

- [ ] **Step 4: Verify idempotence and parity**

Run: `python -X utf8 scripts/normalise_templates.py --check`
Expected: exit 0, `changed=0`.

For every bundle that exists in both trees, compare the SHA-256 of the `questions.json` member.
Expected: identical.

- [ ] **Step 5: Audit after and compare**

Run: `python -X utf8 scripts/question_import/audit_qbx.py imports --all > temp/audit-after.txt 2>&1`

Diff the failing bundle names against `temp/audit-before.txt`. Expected: no new failures. If a new failure appears, fix the cleaner before continuing.

- [ ] **Step 6: Spot-check three bundles**

Open one Mathematics Standard, one French Beginners and one Biology bundle. Confirm: no `Question N` header, no `....` leaders, no page markers, one answer area at the end of each written leaf, MCQ options unchanged.

---

### Task 7: English Paper 1 extractor and rebuild script

**Files:**
- Create: `scripts/question_import/rebuild_english_p1.py`
- Uses: `scripts/question_import/text_clean.py`, `scripts/question_import/qbx_lib.py`
- Test: `--self-test` in the same file

**Interfaces:**
- `texts_from_blocks(blocks: Iterable[str]) -> tuple[list[dict], list[str]]` returns `[{number, title, blocks}]` and warnings. Each block is `{block_type: "text", content: {text}}`.
- `YEAR_CONFIG` maps year → PDF path, bundle filename, expected text count, and question ids for Texts 1–5.
- CLI: `--year` (repeatable), `--all`, `--write`, `--root PATH` (repeatable), `--self-test`.

- [ ] **Step 1: Write the failing extraction self-test**

Feed a synthetic block list containing a booklet cover, `Text 1 – Poem ....... 2`, `Text 1 — Poem`, three poem lines, an attribution, a permission line, `Text 1 (continued)`, another line, `– 3 –`, and `Text 2 — Prose extract` with two prose lines and a copyright line.

Assert: exactly two texts; poem text 1 has one block per line and no permission/copyright/page blocks; prose text 2 has one joined paragraph; warnings are empty.

- [ ] **Step 2: Run it to verify it fails**

Run: `python -X utf8 scripts/question_import/rebuild_english_p1.py --self-test`
Expected: FAIL because the extractor does not exist.

- [ ] **Step 3: Implement `texts_from_blocks`**

Ignore everything before the first heading matching `^Text\s+(\d+)\s*[—–-]\s*(.+)$` that is under 120 characters and contains no 4+ dot run. Start a text with that title.

Inside a text: `Text N (continued)` continues the current text; a new heading starts the next text. Drop page numbers, `BLANK PAGE`, `End of Text N`, `Text N continues on page N`, `© …`, `Reproduced with permission…`, `With kind permission…`, `Every effort has been made…`, `ISBN:…`, `NSW Education Standards Authority`, bullet-only lines, and dot-leader lines. Keep author/source attribution and footnotes.

If the title contains `Poem`, split each block's lines and emit one text block per non-empty line. Otherwise join the block's lines with spaces and emit one paragraph block.

- [ ] **Step 4: Run the self-test**

Run: `python -X utf8 scripts/question_import/rebuild_english_p1.py --self-test`
Expected: PASS.

- [ ] **Step 5: Implement PDF extraction and bundle rewriting**

PDF: open with `pymupdf`, find the first page containing `Stimulus Booklet`, flatten every later page's `get_text("blocks")` in reading order, and pass the block strings to `texts_from_blocks`. Warn when the found count differs from the expected count.

Bundle: for each year in `YEAR_CONFIG`, load `questions.json` from both roots. Build `stimuli` with ids `stim-<year>-t<N>`, title from the heading, and blocks from the extractor. Build `question_stimuli` mapping Text 1–5 to `ea<year>01`–`ea<year>05`. Skip a text with no content and add a note to its question.

Rewrite only those five question bodies: clean text, remove a leading `Question N (M marks)` prefix and any `Text N — …` line, keep the stem, and append `answer_area(answer_lines(marks))` when absent. Do not touch the essay or any later question.

2022: Text 6 is a copyright-blocked photograph; link only Text 5 to `ea202205` and add `notes` saying Text 6 is unavailable in the source PDF. 2025: Text 5 is copyright-blocked; omit its stimulus, do not link `ea202505`, and add the same kind of note.

Before writing, validate every link references an existing question and stimulus, and every expected question has at most one stimulus.

- [ ] **Step 6: Dry-run all years**

Run: `python -X utf8 scripts/question_import/rebuild_english_p1.py --all`

Expected: 2021 = 5 texts, 2022 = 5 texts + 1 missing, 2023 = 5 texts, 2025 = 4 texts + 1 missing; each text reports a non-trivial block count; no PDF extraction error.

---

### Task 8: Apply the English rebuild and verify

**Files:**
- Modify: English Advanced bundles in both roots for 2021, 2022, 2023, 2025

- [ ] **Step 1: Write both trees**

Run: `python -X utf8 scripts/question_import/rebuild_english_p1.py --all --write`

- [ ] **Step 2: Verify stimuli and bodies**

For each rebuilt year assert:

- `len(stimuli)` equals 5, 5, 5, 4.
- Every `question_stimuli` entry points at an existing question and stimulus.
- `ea<year>01`–`ea<year>05` bodies contain no `....`, no `Question N`, no `Text N —` and end with an `answer_area`.
- `ea202205` and `ea202505` carry the missing-text note.
- The essay and all Paper 2 questions are byte-identical to the JSON captured before `--write`.

- [ ] **Step 3: Audit the changed bundles**

Run: `python -X utf8 scripts/question_import/audit_qbx.py frontend/public/templates/hsc/english-advanced --all`

Expected: no new failures versus `temp/audit-before.txt`.

- [ ] **Step 4: Verify both trees match**

Compare the SHA-256 of `questions.json` for each rebuilt bundle in `imports/english-advanced/hsc/` and `frontend/public/templates/hsc/english-advanced/`.
Expected: identical.

---

### Task 9: Quality report and full verification

**Files:**
- Create: `docs/template-quality-report.md`

- [ ] **Step 1: Write the report**

Summarise, from `temp/normalise-report.json` and the rebuild dry-run:

- Bundles scanned, questions touched, text blocks cleaned, characters removed, answer areas added.
- A per-subject table of remaining placeholder questions (`See exam paper`, empty bundles, empty MCQ options).
- The five English Paper 1 texts supplied per year, and the missing ones: 2020 and 2024 Paper 1 sources absent; 2022 Text 6; 2025 Text 5.
- Known limitations: generic marking criteria not rebuilt; stimulus images have no asset ownership row; 29 empty bundles remain empty.

- [ ] **Step 2: Run the frontend checks**

Run from `frontend`: `npm run build`
Expected: PASS.

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: Run the repository checks**

Run: `python -X utf8 scripts/normalise_templates.py --check`
Expected: exit 0.

Run: `python -X utf8 scripts/build_skill.py --check`
Expected: exit 0.

- [ ] **Step 4: Report**

Report what changed, the verification commands and results, and the unresolved items from the quality report. Do not commit.

---

## Self-Review

- Spec coverage: stimuli support (Tasks 1–4), mechanical normalisation (Tasks 5–6), English Paper 1 rebuild (Tasks 7–8), reporting and verification (Task 9).
- Every step names a command and an expected result. The only untestable unit is `importJson`, which cannot load under node because of its browser imports; the resolver test plus `tsc` cover its new branching, and Task 8 exercises the end-to-end path.
- Types are consistent: `StimulusLink` and `resolveStimulusLinks` are defined in Task 1 and consumed in Task 2; `clean_text` is defined in Task 5 and reused in Task 7.
- Review Focus items map to tests: link resolution (Task 1), stimulus assets (Task 3), empty-body protection (Task 5), non-body preservation (Tasks 5–6), missing texts (Task 7).
