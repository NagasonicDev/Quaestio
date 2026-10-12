---
name: {{COURSE_SLUG}}-question-import
description: {{DESCRIPTION}}
---

# {{COURSE_NAME}} — document-to-question import

Turns source documents into import-ready `.qbx` bundles for **{{COURSE_NAME}}
only**. Node ids, types, tags and difficulty levels are course-specific and
will not resolve against another course, so never reuse another course's skill.

## Read this first

**`WORKFLOW.md` in this bundle is the contract.** Read it in full before
writing any question data. It covers the full command pipeline, what the
importer keeps and silently discards, extraction and notation rules,
marking-guide format, parts, content blocks, multiple choice, assets, and the
final review. This file only carries what is specific to {{COURSE_NAME}}.

`import-schema.json` is a **machine reference** — never read it into context,
it lists all {{NODE_COUNT}} nodes. Search it with `scripts/index_nodes.py`, or
`grep` `nodes.txt`.

## Non-negotiables

The mistakes below survive every review because nothing errors on them. Every
row is enforced by `scripts/audit_qbx.py`.

| | |
|---|---|
| `difficulty` | **Required.** Any defined level — a missing or `null` value is rejected. |
| `marks` | **Required on the top-level question.** Without it the question is invisible to the Test Generator. |
| Parts | **Exactly one level.** A printed `(i)`/`(ii)` becomes a composite label `c(i)` at the same level — nesting is stored and never displayed. |
| Multiple choice | **Never a part.** Options on a part are dropped. Emit a nested MCQ as its own top-level question with the stem repeated. |
| `marks` | Parent total must equal the sum of its parts. Read each printed allocation; splits are never uniform. |
| Marking guide | Every question **and every part**. Write the allocation **first**: `"2 marks: …"`, never `"2 marks for …"` — the parser leaves a stray `for` in the criteria column. |
| Answer | Every part needs an `answer` or a `solution`. A partless `extended_response` needs one too. If no rubric was published, write the rubric yourself. |
| Classification | On the **parent**, never on a part. Always `node_ids` + the matching full path in `node_names` (separator `" / "`); `node_codes` only when every selected node has a code. |
| Body | Never empty, on a parent or a part. |
| Unknown values | Never invent a type, tag, difficulty level, block type or node — each one either rejects the question or renders nothing at all. |

`notes` is **dropped on import**. To flag a gap for follow-up, tag the question
`action_required` and report it in your delivery summary.

## This course's valid values

| | |
|---|---|
| `course_id` | `{{COURSE_ID}}` |
| `course_name` | `{{COURSE_NAME}}` |
| valid `type_key` | {{TYPES}} |
| difficulty levels | {{LEVELS}} |
| valid `tags` | {{TAGS}} |
| multiple nodes per question | {{MULTI}} |
| nodes | {{NODE_COUNT}} |

Put **both** `course_id` and `course_name` in the output file. If a previous
import of this course regenerated its node ids, the importer re-matches on
`course_name`, node codes and node paths — which is why those must be correct.

## Commands

```sh
python scripts/index_nodes.py --schema import-schema.json --search "topic"
python scripts/prep_paper.py exam.pdf --out work/pages
python scripts/extract_figures.py exam.pdf --out work/figures
python scripts/crop.py exam.pdf --page 1 --name q1_figure --rect 50,100,500,400
python scripts/build_qbx.py spec.json -o output.qbx --assets work/assets
python scripts/repair_multipart_solutions.py output.qbx
python scripts/audit_qbx.py output-fixed.qbx --schema import-schema.json
python scripts/check_scheme_bundle.py --exam output-fixed.qbx --mg mg.qbx
```

Build with `qbx_lib` constructors rather than hand-rolled block dicts. Resolve
every build error and every `REVIEW` warning; a warning is still a defect. The
audit is the authority — do not deliver a bundle it reports problems for.

## Classification rules for {{COURSE_NAME}}

- Classify to the most specific node the question actually tests. If nothing
  matches closely, take the nearest valid node, set
  `classification_confidence: "low"`, and tag `action_required` — never invent a
  node and never leave `node_ids` empty, because unclassified questions fall
  into an "unclassified" bucket in practice sessions and test generation.
- Always include the matching full path in `node_names`, separator `" / "`, plus
  `node_ids`, and `node_codes` only when the node has a non-null code.
- {{CLASSIFICATION_RULES}}

---

## Course structure, nodes and marking rules

{{COURSE_INSTRUCTIONS}}