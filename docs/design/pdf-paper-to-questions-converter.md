# Quaestio Document to Questions Converter

**Status:** Proposed — blocked behind a feasibility gate (Section 13)
**Audience:** Engineering
**Scope:** A local, offline, no-AI tool that converts exam/test documents (question papers, marking guides, answer keys, formula sheets) for **any course, subject and assessment style** into importable Quaestio bundles
**Implementation target:** Python tooling alongside `scripts/question_import/`, producing bundles consumed by the existing importer

## 1. Summary

The repo already contains 74 hand-built Physics bundles in `imports/physics/`, produced by a workflow (`scripts/question_import/WORKFLOW.md`) in which a person, assisted by a model, reads each paper and authors one JSON spec per paper. The mechanical parts of that workflow are already deterministic Python (`prep_paper.py`, `extract_figures.py`, `build_qbx.py`, `audit_qbx.py`). The expensive part is authoring the spec: segmenting questions and parts, reading marks, classifying to curriculum nodes, and writing marking criteria.

This proposal describes a converter that replaces the spec-authoring step with deterministic rules, and — critically — adds a **verification and quarantine stage** so that the tool only ever emits questions it can confirm, dropping the rest into a review report. No model, no API, no cost.

The converter is **course-parameterised and profile-driven**, not built for one subject or exam board. Physics/HSC is the reference corpus used to develop it, not its boundary. Nothing in the design may assume a subject, a language, an exam board, or a paper layout; those enter through data (the course schema and a layout profile), never through code.

The tool is not attempted until a feasibility spike (Section 13) produces measured numbers.

## 2. Intent and why

- **Volume.** Dozens of papers per course; Physics alone has 74 bundles and Engineering is untouched. Each new paper is hours of manual transcription, and every course added repeats the cost.
- **Repetition.** Exam papers of any subject share a shallow shape: numbered questions, lettered parts, marks allocations, an optional answer key, an optional marking guide. That regularity is what rules handle well, and it is subject-independent.
- **Zero cost.** The work must run entirely on the user's machine with no paid service. This rules out any hosted model or API.
- **Usable without edits.** A student importing a bundle must be able to practise and print it immediately. A bundle full of placeholder or malformed questions is worse than a shorter correct one.

The intended outcome is not "fully automatic conversion of anything". It is "a tool that reliably converts the documents it can handle, refuses the rest with a clear reason, and never emits a question it cannot vouch for" — for any course.

## 3. Generality requirement (the central design constraint)

Generality is a first-class requirement, not an aspiration. It is achieved by three separations:

1. **Course knowledge is data.** Every course-dependent value — question types (`type_key`), tags, difficulty levels, curriculum nodes and their codes, hierarchy — is read at runtime from that course's `import-schema.json`. No course's values are baked into code, and no course's values are reused for another.
2. **Layout knowledge is a profile.** Paper layout varies by publisher, board and era, not by subject. A **layout profile** is a declarative, data-only description of one document family: where question numbers sit, how parts and marks are written, how the marking guide is structured, which furniture to ignore. A built-in **generic profile** handles the common "numbered paper + marks in the margin" shape with no configuration; named profiles (e.g. one for a specific exam board) are optional tuning, and are data files, not code.
3. **Subject ambition is bounded honestly.** The block model is subject-neutral (text, equations, tables, images, lists, code, graphs). How well the generic profile performs does vary by subject — a prose humanities paper, a language paper with non-Latin script, and a music paper with notation are different extraction problems. The design promise is that the *architecture* is general and that **degradation is visible and quarantined**, not that every subject converts equally well on day one.

Because of requirement 1, the tool must work for a course it has never seen. Any technique that learns from previously-converted bundles therefore cannot be the core mechanism; it may only be an optional refinement (Section 10).

## 4. Decisions already made

These are settled by the requester, not proposed here:

1. **No AI.** No model, hosted or local. Deterministic code only.
2. **No cost.** Everything runs locally with free/open tooling.
3. **All block types and main features are in scope.** The 12 block types (Section 9) and the app's main features (MCQs, multi-part questions, marking criteria, classification, difficulty, tags, source metadata, printable tests) must be supported.
4. **Dropping is acceptable.** A question the pipeline cannot confirm may be left out of the bundle and listed for review. This removes the need for 100% accuracy.
5. **Maximum generality.** Applicable to any test, any course, any subject, working as well as possible (Section 3).
6. **Feasibility must be proven before building.** A measured spike precedes any production build.

## 5. Goals, non-goals, and anti-goals

### Goals

- Convert a supported document set for **any course** into a bundle that imports and works with no manual editing.
- Produce structural fields (question boundaries, parts, marks, answer areas, figures) with high reliability.
- Emit only confirmed content; quarantine everything uncertain with an explicit reason.
- Require no course-specific code and no per-document hard-coded offsets.
- Run offline, free, in bounded time per document.
- Be reproducible: same input, same output.
- Report, per document, exactly what was converted and what was dropped.

### Non-goals

- Converting hand-written or scanned documents (see constraints).
- Replacing the marking-guide semantics — criteria may be quarantined rather than invented.
- Guaranteeing every printed question appears.
- Real-time/in-app conversion by a student. This is a maintainer-side batch tool.
- Guaranteeing equal conversion quality across all subjects; the generic bar is "convert what is structurally standard, quarantine the rest".

### Anti-goals

The following count as failures even if the tool "works":

- **Silently wrong output.** A mis-classified question, a wrong answer key, or a figure crop showing the wrong region that passes validation and reaches a student. Silent wrongness is worse than a drop.
- **Shipping placeholders.** Placeholder text reaching the bank.
- **Fabricated metadata.** Inventing an institution name, a node code, or an exam year. Institution names are preserved verbatim or omitted.
- **Course or subject coupling.** Any code path that only works for Physics, or only for one exam board, or that hard-codes a node code, tag or type list.
- **A maintenance trap.** A per-paper pile of hard-coded offsets that only the original author can fix.

## 6. Constraints

| Constraint | Detail |
|---|---|
| Source format | Digital-born PDFs with a live text layer (most published papers for most boards qualify). Figures are often vector line art with live text labels. |
| Scanned documents | Out of scope initially. Vector figure extraction relies on drawing objects; a scan yields bitmaps and needs OCR plus a different figure strategy. |
| Licence | PyMuPDF is AGPL-3.0. Free of cost. Matters only if converter code is bundled into the distributed app; a maintainer-side script does not distribute it. |
| Optional documents | A marking guide, answer key, and formula sheet may each be absent. Absence downgrades or quarantines specific fields; it must not crash the run. |
| Multi-document inputs | Documents may arrive as separate files or as one combined "questions + solutions" PDF. Both shapes must be handled (Section 8.1). |
| Layout variance | Layouts differ by board, publisher and era. Rules that generalise are preferred to per-document overrides, which belong in a profile. |
| Schema | All valid `type_key`, `tag`, `difficulty` and node values come from the target course's `import-schema.json`. Nothing is invented. |
| Language | Text handling must be Unicode-safe and not assume Latin script or left-to-right reading order. |

## 7. Current state

Deterministic pieces that already exist and should be reused, not rewritten:

- `scripts/question_import/prep_paper.py` — page text + page renders + `meta.json`.
- `scripts/extract_figures.py` — vector-figure detection, clustering, cropping; emits `index.json` of `{file, question, page, kind, option, bbox, clip, px}`. Its constants are currently tuned to one paper family and are the first thing a layout profile must generalise.
- `scripts/build_qbx.py` — assembles `questions.json` + `assets/`, zips the bundle. Currently driven by per-paper hand data (`MAP`/`ALT`), which the layout profile must replace.
- `scripts/question_import/qbx_lib.py` — the only correct block constructors, plus `validate_question()`.
- `scripts/question_import/audit_qbx.py` — the authority on whether a bundle is deliverable.
- `scripts/question_import/index_nodes.py` — node search against the course schema.
- `scripts/question_import/repair_multipart_solutions.py` — moves parent answers onto matching parts.

What does **not** exist is the stage that turns documents into the spec: segmentation, marks reading, MCQ assembly, answer-key reading, marking-criteria extraction, and classification. That is the whole of this proposal.

## 8. Architecture

Six stages, each producing an inspectable artefact, so a failure can be localised.

### 8.1 Inputs

A **document set** for one assessment: a primary question document, plus optional marking guide, answer key and formula sheet. These may be separate files or a single combined PDF. The tool classifies each input's role (questions vs solutions/guide) by content heuristics (presence of a marking-guide layout, "Question / Marks / Criteria" tables, per-question answer lists), and falls back to explicit configuration when ambiguous. If the role cannot be determined, guide-derived fields are quarantined; conversion of the questions still proceeds.

### 8.2 Extract

`prep_paper.py` (text + renders) and `extract_figures.py` (figures), parameterised by the active layout profile. Unchanged in principle. Output: page text, page PNGs, figure PNGs, `index.json`.

### 8.3 Segment

A deterministic parser over text plus drawing/position data, driven by the layout profile. Produces a per-document structure: question number, section, part labels, marks, prompt text, whether it is an MCQ, and where figures and tables attach.

- Question anchors, part markers and marks patterns come from the profile; the profile's defaults cover the common shapes.
- Marks are cross-checked so parts sum to the parent total.
- Deeper nesting is collapsed to one level per WORKFLOW.md.
- Each field carries a confidence; anything under threshold is quarantine-eligible.
- A document whose shape does not match any active profile is reported as out-of-distribution rather than mis-parsed.

### 8.4 Compose blocks

Map extracted content to the 12 block types (Section 9). Inline symbols and superscripts become single-`$…$` maths, because that is the only inline form the renderer accepts. Content that cannot be converted safely is either replaced by an equivalent safe block (e.g. a graph emitted as an `image` rather than a `function`) or quarantined.

### 8.5 Build and validate

Run `build_qbx.py` and `audit_qbx.py`. Every build error and every audit finding is fixed by rules or triggers quarantine. No bundle is delivered with an unresolved audit finding.

### 8.6 Verify and quarantine — the oracle

Accuracy cannot be pushed to 100% by heuristics, so instead bound the blast radius. The draft bundle is checked by independent oracles, and any question that fails is dropped with a reason.

The oracles are chosen to be **offline and scriptable**. The app's own PDF/DOCX exporters are *not* usable as the oracle: they rasterise KaTeX through the browser DOM and read assets from IndexedDB, and the repo has no headless entry point (see Section 18, call C1). Instead:

| Field group | Oracle |
|---|---|
| Text, heading, list, table, code, answer area | Compare the emitted block content against the source text directly (these blocks are near-passthrough, so a renderer adds nothing) |
| Equations | Run the app's own KaTeX engine (`katex.renderToString`, already a frontend dependency, runs in plain Node with no DOM) — invalid LaTeX throws |
| Function graphs | Validate with the same rules as the app's `validFunctionGraph`, or avoid the risk entirely by emitting an `image` |
| Images / figures | Pixel-compare each crop against its source region; a crop that includes furniture or excludes its region is dropped |
| Answer keys and marking criteria | Compare against the **independent** marking-guide/answer-key text. This is a second oracle because a wrong answer renders identically to a right one and cannot be caught by self-comparison |

Any mismatch, any low-confidence field, any unparsed criterion, any unverified crop → that question is dropped and recorded. The report lists, per dropped question: number, reason, and source page. This is a deterministic accuracy oracle with no model.

## 9. Block type support, ranked by difficulty

All 12 block types are reachable and all are subject-neutral. Ratings assume digital-born PDFs and are estimates to be measured by the spike, not results.

### Tier A — mechanical and reliable

| Type | Difficulty | Strategy | Confirmation |
|---|---|---|---|
| `page_break` | trivial | Derived from source page boundaries | Deterministic |
| `answer_area` | trivial | Derived from marks (2 lines per mark) | Deterministic |
| `heading` | easy | Font size / weight on the text layer | Text diff |
| `code` | trivial (rare) | Monospace detection | Deterministic |
| `text` | easy–moderate | Text layer; convert inline symbols/superscripts to single `$…$` | Text diff |

### Tier B — extraction works, verification does not

| Type | Difficulty | Strategy | Confirmation |
|---|---|---|---|
| `image` / `diagram` / `graph` | moderate | Vector clustering, profile-tuned | Pixel compare; quarantine on low confidence |
| `list` | moderate | Marker/indent detection; list-vs-wrapped-paragraph ambiguity | Text diff |
| `table` | moderate–hard | Grid reconstruction; merged cells and maths-in-cells degrade it | Text compare; quarantine if grid unreadable |

### Tier C — requires inference, not extraction

| Type | Difficulty | Strategy | Risk |
|---|---|---|---|
| `equation` | hard | Text→LaTeX conversion. Failure is visible (renderer colours bad LaTeX red) | A wrong-but-parseable equation is silent wrongness |
| `function` | hard | Recovering expression and bounds is semantic. **Default to emitting an `image` instead** | Do not guess; an image of the graph is equivalent to a reader |

### Tier D — structural and semantic fields, the real blockers

- **`mcq_options` + `is_correct`** — option text is easy; the correct option needs the printed key. No key and no permitted solver → quarantine (Section 18, call C2).
- **`marking_criteria`** — required on every question and part. Recover from the marking-guide layout; if it cannot be parsed, quarantine rather than invent. This is subject-independent because it is layout parsing, not subject knowledge.
- **Node classification** — the ceiling. Schema demands exact ids and full-path names; keyword heuristics are imperfect. Strategy: keyword match to the closest valid node using schema names/codes plus a hand-authored lexicon, set `classification_confidence: low`, and quarantine or tag `action_required`. Never invent a node.
- **Difficulty** — required, and not derivable from content by rules; a mechanical heuristic from marks/structure/command verbs is proposed and flagged (Section 18, call C3).
- **Institution name** — preserve verbatim or omit. Never infer from year or exam type.

## 10. Course profile and layout profile

Two data files make the tool general.

**Course profile** (per course, derived from its `import-schema.json`): valid `type_key`s, tags, difficulty levels, node ids/codes/names and hierarchy, and the course identity to stamp into the bundle. Nothing in code may reference a specific course's values.

**Layout profile** (per document family, optional): question-anchor patterns, part and marks patterns, furniture to ignore, marking-guide table shape, figure-detection tuning. A built-in generic profile covers the common shape; named profiles tune a family.

An **optional, non-core** refinement: a course's own existing bundles can supply a deterministic keyword→node frequency table to improve classification. This is a lookup built from data, not a model, and it is optional because a brand-new course has no bundles — the core classifier must work from schema alone (Section 18, call C4).

## 11. Source traps the converter must encode

Documented failures from the existing manual pipeline, generalised:

- Marks allocations often sit in a margin beside the question. A bare number near a figure may be a mark count, not an axis value. Never quote a graph's "maximum N" from a bare number.
- MCQ option content must be `text`/`equation` only. The exporters flatten option blocks to a string, so an image/table/function inside an option is silently dropped from printed papers. Never place figures or tables inside options.
- Deeper nesting is stored but never displayed. Collapse `(i)/(ii)` into a composite part label.
- An unrecognised `block_type` renders as nothing, with no error. Only the 12 known types may be emitted.
- `answer_area.content.lines` must be a number; a string makes it invisible.
- Marking criteria items must be a `list` block with allocation-first wording (`2 marks: …`), never `2 marks for …`.
- A multipart parent carries no answer/solution of its own.
- `hint` blocks never reach printed papers.

## 12. Accuracy model and the no-edit guarantee

The tool targets two different standards:

- **Tier A/B fields**: high reliability, verified by the oracles in Section 8.6.
- **Tier C/D fields**: only emitted when confirmed; otherwise dropped or flagged.

The user-facing guarantee is therefore *conditional*: **any question present in the bundle is usable as-is**, because unconfirmed questions were dropped. This is what makes "students never edit" achievable — the bank is not exhaustive, but everything in it is trustworthy.

For a brand-new course with no tuning, expect the generic bar: standard-shaped questions convert, unusual layouts and subjects quarantine more heavily. The guarantee ("what is present is usable") holds regardless of how much is dropped.

## 13. Feasibility gate (must pass before building)

A throwaway spike with measurable results. Go/no-go — if the spike misses these, the approach is revisited before any production work.

**Spike scope**

- Because generality is the point, the spike must cross **at least two different courses/subjects** (the repo has Physics and Engineering sources and bundles) to prove the pipeline is course-agnostic, not just HSC-shaped.
- Build a throwaway `convert.py` doing stages 8.1–8.5, plus a scorer.
- Use the existing bundles as a *format* oracle: compare question count, part structure, marks per part, figure count and ownership, and block-type distribution. Where the converter disagrees with an existing bundle, inspect and classify the disagreement as converter error or bundle error.

**Acceptance thresholds (proposed; subject to the requester)**

| Measure | Threshold |
|---|---|
| Runs end-to-end, offline, no cost | Required |
| Works across ≥2 courses with no course-specific code | Required |
| Wall-clock per document | Under a few minutes |
| Questions segmented with correct marks and part structure | High proportion versus the existing bundles |
| Silent structural errors (mark sums, empty bodies) | Zero |
| `audit_qbx.py` | Clean on the output |
| Figure crops needing human review | Finite and small, each with a stated reason |

**Spike deliverables**

- The throwaway script and the measured report.
- A list of block types or subjects that could not be produced reliably, with the reason.
- A decision on whether classification and marking criteria are emitted or always quarantined.
- The first draft of a layout profile, and evidence for how much it improves over the generic default.

The spike is throwaway. Keeping any of it is a new request that comes back through this design.

## 14. Main feature coverage

For a converted bundle to be usable without edits, the converter must populate:

| Feature | Requirement |
|---|---|
| MCQ | Options in printed order, exactly one correct, `answer` letter agreeing |
| Multi-part | One level, composite labels, correct parent/part marks |
| Marking criteria | Non-empty on every question and part, or the question is dropped |
| Classification | Valid node ids and full-path names, or quarantined |
| Difficulty | Required on the parent |
| Tags | Only tags in the course list |
| Source metadata | Real institution/year/question number, never inferred |
| Printable tests | Option content restricted to text/equation so export is faithful |
| Export/import round-trip | Output must survive course export/restore unchanged |

## 15. Proposed phasing

1. **Spike** (Section 13). No production code. Cross-course by design.
2. **Tier A pipeline**, generic profile, course-parameterised — text, headings, marks, answer areas, page breaks, MCQ structure. Quarantine everything not in Tier A/B.
3. **Tier B** — figures, lists, tables, with the crop-review workflow.
4. **Layout profiles** — formalise the generic profile and add named profiles for specific document families.
5. **Marking criteria and classification** — parse the guide; keyword-classify from the schema; quarantine on doubt.
6. **Optional corpus refinement** for courses that already have bundles.

## 16. Left to the builder

- Exact segmentation grammar per section type, and how to detect an out-of-distribution layout.
- Thresholds for confidence and quarantine.
- How each oracle in 8.6 is implemented (text normalisation, pixel-comparison method).
- The layout-profile file format and its default contents.
- Input-role classification heuristics for the document set (8.1).
- Where the review report lives and its format.
- Whether to package this as a maintainer script or a hidden in-app import path (default: maintainer script).

## 17. Open questions

1. For a document with no marking guide or answer key, should criteria and MCQ answers always be quarantined, or is a minimal fallback acceptable?
2. Is a deterministic corpus-derived keyword table acceptable under the "no AI" decision, or must classification use only schema names plus hand-authored rules?
3. Is difficulty a mechanical heuristic (flagged, non-quarantining) or a field whose uncertainty drops the question?
4. Which concrete documents are available for the spike, and can source PDFs be provided for the reference courses?

## 18. Calls made in this revision (please check these)

These are the tool designer's decisions, not the requester's. Each may be overridden.

- **C1 — Oracle is offline, not the app's exporters.** The app's PDF/DOCX exporters need a browser DOM and IndexedDB and are not scriptable offline, so the "render it back" idea is replaced by direct text/pixel comparison plus the app's own KaTeX engine in Node. Residual risk: this does not prove pixel-identical print output, only that every block is valid and faithful to source.
- **C2 — MCQ answers come from the printed key only.** No deterministic Physics/Mathematics solver is in scope. MCQs without a key are quarantined. This significantly reduces MCQ yield for papers published without a key.
- **C3 — Difficulty is derived mechanically and flagged, not quarantine-triggering.** A wrong difficulty does not make a question unusable (it affects filtering, not correctness), so it should not cause a drop.
- **C4 — Classification core is schema-only; corpus refinement is optional.** Generality forbids depending on existing bundles, since a new course has none.
- **C5 — Generic profile first, named profiles optional.** Layout tuning is data, never code.
