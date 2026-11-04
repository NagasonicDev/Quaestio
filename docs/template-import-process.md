# General Course Template Import Process

This process applies to importing assessment/source material into any Quaestio course template. It is intentionally subject-agnostic.

## Inputs

- A Quaestio course template or `.qb` course graph.
- One or more trustworthy source documents: past papers, marking guidelines, worksheets, assessment task papers.
- An existing course skill to mirror. In this repo, `physics-question-import` is the reference implementation.

## 1. Prepare the course graph

- Locate or generate the course node graph:
  - template slice file: `work/<subject>_template.txt`
  - course definitions: `courses/<subject>.qb`
  - skill nodes: `.opencode/skills/<subject>-question-import/nodes.txt`
- Keep the original node IDs unchanged once imported. New skills must classify to these node IDs only.

## 2. Create the course skill

From `.opencode/skills/physics-question-import`:

1. Copy the directory to `.opencode/skills/<subject>-question-import`.
2. Update `import-schema.json` with subject-specific nodes, types, difficulty levels, and tags.
3. Write `course-instructions.md` with subject-specific extraction and classification rules.
4. Render generated files:

```sh
python scripts/skill_render.py --course <subject>
python scripts/build_skill.py --sync --course <subject>
```

5. Verify the skill structure:

```sh
python scripts/build_skill.py --check --course <subject>
```

## 3. Fetch source documents

- Store official/authored source documents in:

```text
exams/<subject>/
```

- One paper and one marking guideline per assessment where available.
- For subjects with multiple papers (e.g. English Advanced), fetch each paper/marking guide pair.

## 4. Build the question bundle

Create a `.qbx` bundle under:

```text
imports/<subject>/<source-class>/<year>-<source>-<subject>.qbx
```

Rules:
- Translate questions, sub-parts, choices, stimuli, commands, solutions, and marking criteria from the source.
- Classify each question to valid course node IDs.
- Use `action_required` or confidence tags for uncertain classifications.
- Mark figure-dependent content clearly when no cropped asset is included.
- Do not fabricate missing source content; record unresolved source issues in the bundle or audit notes.

## 5. Validate

```sh
python .opencode/skills/<subject>-question-import/scripts/audit_qbx.py \
  imports/<subject>/<source-class>/<bundle>.qbx \
  --schema .opencode/skills/<subject>-question-import/import-schema.json
```

Also rerun:

```sh
python scripts/build_skill.py --check --course <subject>
```

Fix all validation problems before packaging.

## 6. Package

```sh
python scripts/build_skill.py --course <subject>
```

This produces `<subject>-question-import.skill` at repo root when applicable.

## Quality rules

- Do not modify template/source files except through their import workflow.
- Keep original question numbers and part letters faithful to the source.
- Keep all generated question IDs unique within a bundle.
- Treat converted images, tables, and diagrams as text if assets are not cropped, and mark them for later figure extraction.
- Do not expose all year contents when only one year is requested; processes independently per year.
- Run the project's build/test or validation commands and report exact results before claiming completion.

## Applies to all subjects

Use the same skeleton for every subject. Replace only:
- course graph/node data,
- schema metadata,
- extraction rules,
- source files,
- output bundle paths.