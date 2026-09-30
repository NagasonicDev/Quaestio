## Practical document-to-question workflow

The tools in `scripts/` apply to any course whose `import-schema.json` is
packaged beside this file. Start in a working directory containing the source
paper, the generated course skill, and the bundled tools. Use the course's
schema throughout; never rely on a sample course name, identifier, or topic.

1. Read the complete paper and marking guide. Record the printed question and
   part structure, marks, shared stems, tables, and every figure before
   creating question data.
2. Index the course nodes and search likely topic terms before classifying:
   `python scripts/index_nodes.py --schema import-schema.json --search "topic"`.
3. For PDFs, render pages and extract candidate figures. Inspect every page
   and crop: automated figure detection can merge panels, cut off labels, or
   miss figures. Use `prep_paper.py`, `extract_figures.py`, and `crop.py`.
   Treat extracted crops as candidates, not verified figures.
4. Write one JSON spec for the paper using the constructors in
   `scripts/qbx_lib.py`. Put the question-bank's course name in
   `course_name`, use only the packaged schema's node codes and valid values,
   and keep nested parts nested.
5. Build a `.qbx` bundle with `scripts/build_qbx.py`. Resolve every build
   error and every REVIEW item. Run
   `scripts/repair_multipart_solutions.py` on the bundle, review its part
   assignments, and use the repaired copy for the remaining checks. This moves
   parent-level answers and solutions onto the parts they match, including
   splitting part-labelled answer text, and clears duplicate parent copies.
6. Run `scripts/audit_qbx.py` on the repaired bundle or output directory. The
   audit checks course/schema alignment, identifiers, part marks, marking
   criteria, question blocks, image assets, and rejects any multipart parent
  that still has answer or solution content. It also rejects any leaf part
  with neither an answer nor a solution. Resolve these findings from the source
  answer key/solution, or work out the response from the question; if the
  information is genuinely unavailable, record it as an unresolved source issue
  and do not deliver the bundle as validated.
7. If a marking-scheme bundle was also prepared, run
   `scripts/check_scheme_bundle.py` against the exam bundle. Deliver the
   finished `.qbx` and a concise list of any unresolved source issues.

Example commands (replace paths and search terms with the current course's
files and content):

```sh
python scripts/index_nodes.py --schema import-schema.json --search "topic"
python scripts/prep_paper.py exam.pdf --out work/pages
python scripts/extract_figures.py exam.pdf --out work/figures
python scripts/crop.py exam.pdf --page 1 --name q1_figure --rect 50,100,500,400
python scripts/build_qbx.py spec.json -o output.qbx --assets work/assets
python scripts/repair_multipart_solutions.py output.qbx
python scripts/audit_qbx.py output-fixed.qbx --schema import-schema.json
```

### Shapes the importer reads

- A content block is `{"block_type": "text", "content": {"text": "..."}}`.
  Equations use `content.latex`; tables use `content.columns` and
  `content.rows`; image blocks use the bare asset id in `content.asset_path`.
- MCQ options are objects with `content` blocks and an `is_correct` boolean.
  Their printed labels are implicit in array order.
- Parts use `part_label`, `marks`, `body`, `marking_criteria`, `answer`,
  `solution`, `assets`, and `parts`. Preserve the source hierarchy.
- Classification belongs on the question. If a part declares node codes or
  ids, they must identify the same nodes as its parent schema.
- Every image asset must be included in the bundle under `assets/`, declared
  on the question or part that uses it, and referenced by a matching image
  block. Keep extracted images in the bundle; descriptions do not substitute
  for available source figures.

### Review checks that matter

- Keep the shared prompt on the parent question; do not leave a parent or
  container body empty. Do not assume marks are split evenly between parts.
- Inspect and, where needed, manually recrop every figure. Keep each MCQ
  option's figure separate when the paper presents separate panels. Preserve
  data tables as table blocks when their contents are legible.
- Never invent a course node. If the course schema has no close match, choose
  the closest valid node, mark classification confidence low, and explain the
  limitation in notes.
- Give each marking criterion an explicit mark allocation. Check that each
  parent mark total equals its immediate parts and repeat that check for
  nested parts.
- Verify every printed MCQ choice is represented in order, exactly one
  option is correct when the answer is known, and the answer letter agrees
  with that option.
- Include `source.original_question_no` for each question. Preserve genuine
  institution names as supplied by the paper; do not infer an institution
  from a course, exam type, or year.

For a set of papers, build each bundle independently, then run one audit over
the output directory. Use `--max-year` or `--only` only when intentionally
scoping the audit; by default it checks every `.qbx` in the target.
