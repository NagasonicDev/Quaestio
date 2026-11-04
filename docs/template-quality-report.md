# Template Quality Report

Generated after applying `scripts/normalise_templates.py` and `scripts/question_import/rebuild_english_p1.py` to both working trees:

- `imports/` (414 bundles)
- `frontend/public/templates/hsc/` (294 shipped bundles)

The two trees share 294 bundle files; after normalisation all 294 are byte-identical.

## Normalisation summary

| Measure | Result |
| --- | --- |
| Bundle copies scanned | 714 |
| Bundle copies changed | 474 |
| Text/heading blocks cleaned | 6,280 |
| Characters removed | 1,668,809 |
| Answer areas added | 732 |
| Furniture-only blocks kept unchanged | 532 |
| Errors | 0 |
| Second run (`--check`) | 0 changed, exit 0 |

Only `body` text and heading blocks were rewritten. Answers, solutions, marking criteria, MCQ options, marks, nodes and non-`questions.json` ZIP members were left unchanged.

Furniture-only blocks were kept verbatim rather than deleted. An empty block fails bundle validation, and deleting content the cleaner cannot classify risks losing genuine question text. Those blocks, and lines where page furniture is merged with real question text, remain for manual review.

After cleaning, 440 question/part bodies across both trees still begin with a printed "Question N" header, 260 still contain page furniture, and 3 still contain dot leaders. These sit inside the 65 unique bundles listed for manual review; they are header-only or merged-line blocks that cannot be emptied safely.

## Remaining content gaps

### Empty bundles

39 unique bundles (68 copies; 29 of the 294 shipped templates) contain no questions:

- `ancient-history-2017`, `biology-2017`, `chemistry-2017`: all six years each.
- `enterprise-computing`: 2020-2024.
- `health-and-movement-science`: all six years.
- `legal-studies-2009`: 2010-2019 (working tree only; not shipped).

These need source extraction; normalisation cannot create content.

### Placeholder bundles

18 unique bundles (36 copies, 574 unique questions), all in the shipped templates:

- `mathematics-standard`, `mathematics-extension-1`, `mathematics-extension-2`: 2020-2025.

Their bodies still say "See exam paper for the full multiple-choice stem, options and diagrams." The MCQs have empty `mcq_options`, so these need typing from the papers rather than mechanical repair.

### Manual review

65 unique bundles (102 copies; 35 shipped) still contain furniture that could not be removed safely because it is merged into a genuine line or is the only content in a block. The largest groups are `industrial-technology`, `studies-of-religion-1/2`, `business-studies`, `english-studies`, `geography`, `physics` and some language courses.

The full per-bundle lists are in `temp/normalise-report.json`:

- `summary.empty_bundle_paths`
- `summary.placeholder_paths`
- `summary.needs_manual`

### Other limitations

- Generic marking criteria were not rebuilt from the marking guidelines.
- Stimulus images have no asset ownership row, so they are staged and displayed but not tracked like question images. The English stimuli added here are text-only.
- Inline furniture merged into question text survives; for example a body ending in "End of paper © ...".

## English Advanced Paper 1 rebuild

| Year | Stimuli | Links | Blocked / missing |
| --- | --- | --- | --- |
| 2021 | 5 | 5 | none |
| 2022 | 6 | 6 | Text 1 (Poem) and Text 6 (Photograph) are copyright-restricted; only the HSC publication notice/index is included |
| 2023 | 5 | 5 | none |
| 2025 | 5 | 5 | Text 5 (Nonfiction extract) is copyright-restricted; only the HSC publication notice/index is included |
| 2020 | 0 | 0 | Paper 1 source absent (PDF is Paper 2) |
| 2024 | 0 | 0 | Paper 1 source absent (PDF is Paper 2) |

21 unseen texts and 21 question links are now represented, including copyright-restricted extracts as their printed HSC reference notices (URL/publisher reference) rather than the restricted text. The 20 Paper 1 short-answer questions across 2021, 2022, 2023 and 2025 contain the question stem plus an answer area.

Paper 2 questions were left unchanged by the rebuild. The 2023 essay body (`ea202306`) was trimmed to its three-line prompt; the copied stimulus booklet and prescribed-text list were removed.

## Verification

- `cd frontend; npm run build` passed.
- `cd frontend; npm test` passed, including the new stimulus-link suite (4 tests).
- `python -X utf8 scripts/normalise_templates.py --self-test` passed.
- `python -X utf8 scripts/normalise_templates.py --check` exits 0 with no pending changes.
- `python -X utf8 scripts/build_skill.py --check` passed all 54 skills.
- `audit_qbx.py` with `.opencode/skills/english-advanced-question-import/import-schema.json` reports no problems in the 2023 English bundle. The default schema path is absent from the repo, so pass `--schema` explicitly.
