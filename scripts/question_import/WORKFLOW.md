# Document-to-Question Workflow

This is the single source of truth for turning a source document (exam paper,
worksheet, assessment) into this question bank's import format. It is
course-agnostic: **course-specific values — valid `type_key`s, tags, difficulty
levels and node codes — always come from that course's own `import-schema.json`
and its course section. Never reuse another course's values.**

The tools in `scripts/` work with any course whose `import-schema.json` sits
beside this file. Work in a directory containing the source paper, the course
skill, and `scripts/`.

---

## 1. Steps

1. **Read the whole document first**, including the marking guide. Record the
   printed question and part structure, marks, shared stems, tables and every
   figure before creating any question data.
2. **Index the nodes**, then search before classifying:
   `python scripts/index_nodes.py --schema import-schema.json --search "topic"`.
3. **Render and extract figures** for PDFs: `prep_paper.py`,
   `extract_figures.py`, `crop.py`. Inspect every page and crop by hand —
   automated detection merges panels, clips axis labels, misses figures and
   picks up page furniture. Treat every crop as a candidate until you have read
   the PNG back.
4. **Write one JSON spec** using the constructors in `scripts/qbx_lib.py` (see
   §10). Use only values from `import-schema.json`.
5. **Build the bundle**: `python scripts/build_qbx.py spec.json -o output.qbx
   --assets work/assets`. Resolve every build error and every REVIEW item.
6. **Repair part answers**:
   `python scripts/repair_multipart_solutions.py output.qbx`. This moves
   parent-level answers and solutions onto the parts they match — including
   splitting part-labelled answer text — and clears duplicate parent copies.
   Review its assignments and use the repaired copy for every later step.
7. **Audit**: `python scripts/audit_qbx.py output-fixed.qbx --schema
   import-schema.json`. The audit is the authority. Do not deliver a bundle it
   reports problems for.
8. **Cross-check the marking scheme** if one was prepared:
   `python scripts/check_scheme_bundle.py --exam output-fixed.qbx --mg mg.qbx`.
9. **Deliver** the finished `.qbx` plus a short list of unresolved source
   issues. The person uploads it; never import it yourself.

```sh
python scripts/index_nodes.py --schema import-schema.json --search "photoelectric"
python scripts/prep_paper.py exam.pdf --out work/pages
python scripts/extract_figures.py exam.pdf --out work/figures
python scripts/crop.py exam.pdf --page 1 --name q1_figure --rect 50,100,500,400
python scripts/build_qbx.py spec.json -o output.qbx --assets work/assets
python scripts/repair_multipart_solutions.py output.qbx
python scripts/audit_qbx.py output-fixed.qbx --schema import-schema.json
```

---

## 2. What the importer keeps, and what it throws away

Half of all import mistakes are fields that parse cleanly and are then
discarded without any warning. Read this before writing anything.

### Kept, and visible on screen

| Field | Requirement |
|---|---|
| `type_key` | Must be one of the course's valid types. Unknown value ⇒ question rejected. |
| `difficulty` | **Required.** If the course defines any difficulty level, a missing or `null` value is rejected outright. |
| `marks` | **Required on the top-level question.** The Test Generator only considers questions whose top-level `marks` is set. |
| `node_ids` / `node_codes` / `node_names` | Tried in that order: exact id → code → full `" / "` path → a bare name that is unique across the course. An ambiguous bare name is a hard error. |
| `tags` | Every tag must exist in the course's tag list; one unknown tag rejects the question. |
| `body`, `hint`, `answer`, `solution`, `marking_criteria` | The only five content slots. Any other slot name is stored and never rendered. |
| `mcq_options` | Top-level questions only — see §7. |
| `assets` + image blocks | The asset bytes must be inside the bundle — see §8. |
| `source` | `name`, `year`, `institution`, `original_question_no`. Always include `original_question_no`. |
| `classification_confidence` | `high` / `medium` / `low`; drives review workflows. |
| `part_label`, `marks`, `body`, `hint`, `answer`, `solution`, `marking_criteria`, `parts`, `assets` on a part | The per-part contract — see §5. |

### Silently discarded

| Field | What to do instead |
|---|---|
| `question_id` | Regenerated on import. Ids are display handles, not stable keys. |
| `review_status` | Hardcoded to `approved`. Do not ask for `pending_review` — any other value makes the question invisible everywhere. |
| `notes` | **Dropped.** To flag a gap for follow-up, tag the question `action_required` and say what is needed in a field a reviewer actually reads. |
| `created_at`, `updated_at`, `export_schema_version`, `includes`, `exported_at` | Set by the app. |

**Dropped on every part**, at every depth: `difficulty`,
`node_ids`/`node_codes`/`node_names`, `tags`, `source`, `notes`,
`classification_confidence`, `mcq_options`, `assets`, `review_status`.

Consequences:

- Put `difficulty`, classification, tags and `source` on the **parent**, not
  the part.
- **Never make a part a multiple-choice question** — its options are dropped.
  An MCQ nested inside a multipart question must be emitted as its own top-level
  question with the shared stem repeated in its `body`.
- A part's own `type_key` *is* honoured, so a part may narrow the parent's type;
  leave it out unless it really is a different type.

### Stored but never exported

- `hint` blocks never reach a printed PDF or DOCX paper. Still worth writing —
  the app shows them — but never put anything there that must reach paper.

### Course identity

`course_id` must match the target course, or `course_name` must match so the
importer can remap by name and node codes. Always include `course_name`. If a
previous import of this course regenerated its node ids, the importer re-matches
on **code and full path** — which is why both must be correct.

---

## 3. Extraction rules

1. Keep the printed question number as `source.original_question_no` only. It
   never drives display order.
2. Extract text, equations, figures, tables and lists in source order.
3. **Format all mathematical notation for rendering.** Standalone maths → an
   `equation` block. Maths inside prose, list items, table cells or MCQ options
   → single `$…$`, e.g. `$v = 3.0\times10^{8}\,\mathrm{m/s}$`. Never leave
   `10^8`, and never use a bare `x` for multiplication. Inside `text`, `heading`
   and `list` items only *single* `$…$` works: `$$…$$` and `\[…\]` render as
   literal characters. Set units upright with `\,\mathrm{…}`.
4. If the paper's allocation needs manual attention, or a figure could not be
   extracted, tag that question `action_required` — and only then. Never invent
   tags, never rename an existing one, never add it to a clean question.
5. Never invent a course node. If nothing matches, take the closest valid node,
   set `classification_confidence: "low"` and tag `action_required`.

---

## 4. Marking guides — required, and never an exemplar

Every question **and every part** carries a non-empty `marking_criteria`.

- Use the paper's own rubric when it has one, reworded into the block format.
- **If the paper gives none, write one yourself** from the prompt, its `marks`,
  difficulty and topic: what a response must demonstrate to earn each mark. A
  3-mark question might earn `1 mark: correctly identifies X`, `1 mark: uses the
  correct method`, `1 mark: correct final answer with correct units`.
- It is a marker's checklist, **not** a model answer. Worked reasoning belongs
  in `solution`.
- Format the rubric as a `list` block, one item per mark or band, and **put the
  allocation first, followed by a colon**: `"2 marks: sets up the correct
  equation"`. Accepted: `1 mark:`, `2 marks:`, `1.5 marks:`, `1-2 marks:`,
  `1–2 marks:`, `1 or 2 marks:`, `1 to 2 marks:`, `1/2 marks:`, or a trailing
  `… (2 marks)` / `… [1-2 marks]`.
  **Never write `"2 marks for …"`** — the parser consumes `2 marks` and leaves a
  stray leading `for` in the criteria column.
- An item the parser cannot read renders an **empty marks cell**. Never emit
  vague criteria such as `method` with no allocation.
- Only `list` blocks and non-blank `text` blocks become table rows. `equation`,
  `table`, `image`, `function` and `answer_area` blocks fall below the table as
  supplementary content — so the rubric itself must always be a `list`.
- Parent `marks` must equal the sum of its immediate parts. Re-check against the
  paper and any mark scheme before resolving a mismatch. Never silently change a
  printed allocation; flag it for review instead.

---

## 5. Parts — exactly one level

The importer writes deeper nesting to the database, but the reader, practice
flow, browser, test generator, PDF/DOCX export and the `.qb`/`.qbx` round-trip
all stop after the first level. A nested `(i)`/`(ii)` would therefore be stored
and **never displayed**. So:

- `parts` holds the printed sub-questions of one question, in printed order:

  ```json
  {"part_label": "a", "marks": 2, "body": [...], "hint": [...],
   "answer": [...], "solution": [...], "marking_criteria": [...],
   "assets": [], "parts": []}
  ```

- **A deeper printed level becomes a composite label at one level.** Question
  `26(c)(i)` is a part with `"part_label": "c(i)"` — never a `c` part holding
  `i`, and never a separate top-level question. Keep `parts: []` on every part.
- Keep the shared stem and shared data tables on the parent `body`. Give each
  part its own prompt, marks, answer area, marking guide, and **at least an
  `answer` or a `solution`** — never a part whose answer sits only on the parent.
  Use `answer` for the concise result, `solution` for the working.
- Never leave the parent or any part `body` empty; an empty parent body is
  rejected. If the paper prints no stem for a part, use that part's own prompt.
- A multipart parent carries **no** `answer`/`solution` content of its own.
- Add a trailing `answer_area` block to each part's `body` for written-response
  types, `content.lines` = two lines per mark (round up, minimum 1). Skip it on
  multiple-choice parts and where the paper already supplies an answer space.
- When a source answer key or solution document labels work by part, split the
  combined text at those labels onto the matching parts — never leave one
  labelled multi-part solution sitting in the parent's `solution`.

---

## 6. Content blocks

Every slot and every MCQ option `content` accepts exactly these twelve
`block_type` values. **An unrecognised `block_type` renders as nothing at all,
with no error anywhere** — the only protection is using these names verbatim.

| `block_type` | `content` keys | Notes |
|---|---|---|
| `text` | `text` | Inline maths in single `$…$`. |
| `heading` | `text` | `level` is stored but ignored; every heading renders the same size. |
| `equation` | `latex`, `display` (bool) | Bare LaTeX; `$…$`/`$$…$$` wrappers are stripped automatically. `align` is unsupported — use `aligned`, `array`, `cases`, `pmatrix`. |
| `image`, `diagram`, `graph` | `asset_path`, `alt_text`, `caption` | All three render identically. `asset_path` is the bare asset id (§8); a missing id renders a broken image. |
| `function` | `expression`, `x_min`, `x_max`, `y_min`, `y_max`, `x_label`, `y_label` | `expression` is the **right-hand side in maths notation, not LaTeX** (e.g. `x^2 - 3*x + 2`, max 160 chars). Bounds must be finite, increasing, and span at most 1e6. |
| `table` | `columns` (string[]), `rows` (string[][]) | Row length must match `columns`. Without `columns` the block renders nothing. |
| `list` | `items` (string[]), `ordered` (bool) | |
| `code` | `code` | `language` is stored but never rendered. |
| `answer_area` | `lines` (number) | Must be a JSON number; a string makes the block invisible. |
| `page_break` | `{}` | A real page break in PDF/DOCX, a rule on screen. |

---

## 7. Multiple-choice questions

- Stem in `body`; choices in `mcq_options` — **never** in a body list.
- Each option is `{"content": [<blocks>], "is_correct": <bool>}`, in printed
  order. Labels A, B, C… are implicit from array order: never write them, never
  truncate after D.
- Emit exactly one non-empty option per printed choice. Never merge choices,
  never drop a choice the OCR missed, never move choices into the stem. For
  table-based choices, keep the table in the stem and give each option its own
  choice.
- **Option content must be `text`/`equation` only.** The PDF and DOCX exporters
  flatten option blocks to a single string, so an `image`, `table` or `function`
  inside an option is silently dropped from printed papers.
- Determine the answer from the paper, any key, and by solving it yourself. Mark
  exactly one `is_correct: true` and set `answer` to that printed letter. A
  missing key does not mean the answer is unknown. Only when the question is
  genuinely ambiguous: no correct option, empty `answer`, `action_required`.
- MCQs must not have parts and must not be nested inside a multipart question
  (§2).

---

## 8. Images and assets

- Keep the `image`/`diagram`/`graph` block where the figure appears and package
  the bytes as `assets/<asset_id>.<ext>` inside the `.qbx`. **The file name stem
  must equal the asset id** used in `content.asset_path` and in the owning
  question's `assets` array — that is how the importer pairs them.
- `asset_path` takes the bare id only: no path, no `data:`, no base64.
- Declare the asset on the exact question or part that owns the block, with
  concise `alt_text` and an optional `caption`. A referenced asset missing from
  the bundle renders as a broken image.
- Keep each MCQ option's figure separate when the paper presents separate panels.
- Preserve data tables as `table` blocks when the contents are legible.
- Use a `function` block for a single explicit function instead of rasterising
  its graph.
- If a figure genuinely cannot be extracted, leave the block out, keep the
  surrounding text intact, and tag the question `action_required`. A description
  does not substitute for an available source figure.

---

## 9. Output format

`import.json` for a text-only import; a `.qbx` bundle whenever any image is
used. `scripts/build_qbx.py` builds the bundle and stamps the assets.

```json
{
  "course_id": "<the target course's id>",
  "course_name": "<the target course's name>",
  "questions": [
    {
      "type_key": "<a valid type from import-schema.json>",
      "difficulty": 3,
      "marks": 3,
      "node_ids": ["<valid node_id>"],
      "node_codes": ["<matching code>"],
      "node_names": ["<matching full path>"],
      "tags": [],
      "body": [
        {"block_type": "text", "content": {"text": "..."}},
        {"block_type": "equation", "content": {"latex": "x^2 - 5x + 6 = 0", "display": true}}
      ],
      "hint": [{"block_type": "text", "content": {"text": "A progressive hint, if useful."}}],
      "answer": [{"block_type": "text", "content": {"text": "..."}}],
      "solution": [],
      "marking_criteria": [
        {"block_type": "list", "content": {"ordered": false, "items": [
          "1 mark: correctly extracts the coefficients",
          "1 mark: applies the quadratic formula correctly",
          "1 mark: correct final answer"
        ]}}
      ],
      "classification_confidence": "high",
      "source": {"name": "Trial Examination", "year": 2025, "original_question_no": "17"}
    }
  ]
}
```

Always include `course_name`. Always include valid `node_ids` **and** matching
full-path `node_names` (separator `" / "`); include `node_codes` only when every
selected node has a non-null code. Never invent a code or leave a `null` in an
array. Code and path are what let the importer re-match classifications after a
re-import regenerates node ids.

**Do not read `import-schema.json` into context** — it lists every node. Search
it instead:

```sh
python scripts/index_nodes.py --schema import-schema.json --search "waves"
```

`nodes.txt`, when present, is the same tree flattened to `code | full path` for
grepping. Valid `type_key` values, tags, the difficulty range and the node list
are in this skill's course section.

---

## 10. Working with `qbx_lib`

`scripts/qbx_lib.py` is the only place that knows how to build these blocks
correctly. Use its constructors rather than hand-rolling dictionaries:

`text(s)`, `heading(s, level=2)`, `equation(latex, display=True)`,
`function_graph(expression, x_min, x_max, y_min, y_max, …)`,
`table(columns, rows, caption=None)`, `ulist(items)`, `olist(items)`,
`code(language, src)`, `answer_area(lines)`, `answer_lines(marks)`,
`image(asset_id, alt_text, block_type="image", caption=None)`, `page_break()`,
`criteria(items)` (wraps a `list` block), `mcq_option(blocks, correct=False)`,
`answer_letter(letter)`.

`validate_question()` checks a spec against the course schema and reports
build **errors** (must fix) separately from **REVIEW** warnings (a warning is
still a defect — resolve it before delivering). `build_qbx.py` prints both.

---

## 11. Final review

Before delivering, parse the finished JSON and confirm:

- No empty `text`, `heading`, `equation`, `list` item or MCQ option.
- Every printed MCQ choice present, in order, exactly one correct, answer letter
  agreeing with that option.
- A marking guide with allocated criteria on every question **and every part**.
- Parent `marks` equal to the sum of its immediate parts.
- No empty parent or part `body`; no answer or solution left on a multipart
  parent; no part left without an answer or solution.
- Every referenced asset actually present in the bundle under `assets/`.
- Genuine institution names preserved as the paper gives them — never inferred
  from a course, exam type or year.
- Every printed question accounted for; printed marks checked against the paper
  and mark scheme.
- `scripts/audit_qbx.py` clean on the final bundle.

For a set of papers, build each bundle independently, then run one audit over
the output directory. Use `--max-year` or `--only` only when intentionally
scoping the audit; by default it checks every `.qbx` in the target.

Deliver the finished bundle **and a concise list of any unresolved source
issues** — an unresolved source issue is a legitimate deliverable; an
unreported one is a defect.