# HSC template import plan (2020-2025, all templates except physics/engineering)

Source workflow: `docs/template-import-process.md`. Scope excludes `physics` and `engineering-studies`.
Course graph source for new subjects: template nodes in `frontend/src/lib/courseTemplates.ts`, expanded with the same bundle path used by the .qb importer.

## Global execution rules

- Institution in every bundle is always `HSC`.
- Each wave uses exactly 4 parallel subagents, one subject per subagent.
- A wave is not complete until: source PDFs + MGs are stored under `exams/<subject>/`; skill files are rendered and `build_skill.py --check --course <subject>` passes; each requested year has a distinct `.qbx` under `imports/<subject>/hsc/`; `audit_qbx.py` returns exit code 0 for every bundle in that subject.
- Do not mark a subject complete if any requested year is missing or any subject audit reports problems.
- Repeat with the next wave in a fresh session when context gets heavy.

## Subject-year policy

- Main-current templates: fetch 2020-2025.
- Old-syllabus templates (`ancient-history-2017`, `biology-2017`, `chemistry-2017`, `modern-history-2017`, `economics-2011`, `legal-studies-2009`, `music-1-2010`, `music-2-2010`): fetch the year matching their template year plus any available surrounding years from the NESA archive, recording unresolved years explicitly.

## Per-subject subagent process

1. Prepare supporting files:
   - `work/<subject>_template.txt`
   - `courses/<subject>.qb` only if the existing importer requires it; otherwise use template-expanded node IDs.
   - `.opencode/skills/<subject>-question-import/` copied from `ancient-history-question-import`.
   - `nodes.txt` generated from the expanded template node list.
   - `import-schema.json`, `course-instructions.md`, then `python scripts/skill_render.py --course <subject>` and `python scripts/build_skill.py --sync --course <subject>`.
   - Verify with `python scripts/build_skill.py --check --course <subject>`.
2. Fetch official source documents:
   - Start from the NESA subject page: `https://www.nsw.gov.au/education-and-training/nesa/curriculum/hsc-exam-papers/<subject-slug>`.
   - Follow `Nyear HSC exam pack` links for every year to obtain direct PDF question and marking-guideline links.
   - Save as `exams/<subject>/<year>-hsc-<subject>.pdf` and `<year>-hsc-<subject>-mg.pdf`.
   - If an official exam pack is unavailable, record it in an unresolved-source note instead of fabricating content.
3. Build `.qbx` bundles:
   - `imports/<subject>/hsc/<year>-hsc-<subject>.qbx`
   - Use `action_required` / confidence tags for uncertain node classifications.
   - Keep every `source.institution` equal to `HSC`.
   - Preserve original question numbers and part letters.
   - Translate tables and diagrams as text with marker text if an asset is not cropped.
4. Validate:
   - `python .opencode/skills/<subject>-question-import/scripts/audit_qbx.py imports/<subject>/hsc/<bundle>.qbx --schema .opencode/skills/<subject>-question-import/import-schema.json`
   - Repeat for each bundle.
5. Report unresolved sources or ambiguous classifications at the end of the subagent result.

## Wave roster (4 subjects per wave)

Wave 01:
1. agriculture
2. ancient-history
3. ancient-history-2017
4. biology

Wave 02:
1. biology-2017
2. business-studies
3. chemistry
4. chemistry-2017

Wave 03:
1. chinese-beginners
2. chinese-continuers
3. chinese-extension
4. community-and-family-studies

Wave 04:
1. dance
2. design-and-technology
3. drama
4. earth-environmental-science

Wave 05:
1. economics
2. economics-2011
3. english-advanced
4. english-eald

Wave 06:
1. english-extension
2. english-standard
3. english-studies
4. enterprise-computing

Wave 07:
1. food-technology
2. french-beginners
3. french-continuers
4. french-extension

Wave 08:
1. geography
2. health-and-movement-science
3. hospitality
4. industrial-technology

Wave 09:
1. investigating-science
2. italian-beginners
3. italian-continuers
4. italian-extension

Wave 10:
1. legal-studies
2. legal-studies-2009
3. mathematics-advanced
4. mathematics-extension-1

Wave 11:
1. mathematics-extension-2
2. mathematics-standard
3. modern-history
4. modern-history-2017

Wave 12:
1. music-1
2. music-1-2010
3. music-2
4. music-2-2010

Wave 13:
1. studies-of-religion-1
2. studies-of-religion-2
3. visual-arts

Note: Wave 13 intentionally contains 3 subjects because 51 templates are in scope after excluding physics, physics-2017, and engineering-studies.

## Final wave (no exam PDFs): physics and engineering-studies from `courses/*.qb`

Wave 14 — execute after all 13 waves above:
1. physics
2. engineering-studies

Rules:
- Do not use NESA PDFs for this wave. Use `courses/physics.qb` and `courses/engineering-studies.qb`.
- Export only questions whose `source.institution == "HSC"` and whose `source.year` is between 2020 and 2025 inclusive.
- Group exported questions into one `.qbx` per source year under:
  - `imports/physics/hsc/<year>-hsc-physics.qbx`
  - `imports/engineering-studies/hsc/<year>-hsc-engineering-studies.qbx`
- Reassign course identity to the template course:
  - physics `.qb` is the 2017 syllabus, so target the `physics-2017` template; replace `.qb` node IDs with the target skill schema node IDs by matching `node_codes`, not by copying `.qb` node IDs.
  - engineering-studies `.qb` is the 2011 syllabus; replace node IDs the same way and document which template ID receives the exported course.
- Keep every `source.institution` equal to `HSC`; preserve question numbers and marking criteria where present.
- Do not export trial-school, Quaestio Bank, or external-source questions as HSC official bundles.
- Validate each per-year bundle with `audit_qbx.py` before considering the wave complete.

## Why this is last
- It reuses the existing course database rather than NESA exam packs.
- It depends on all ordinary template waves being stable enough that node remapping can be audited clearly.
- It avoids mixing large database export work with source-document fetching for the other templates.

- No template listed in this plan is treated as done until its requested bundles validate.
- Institution is always `HSC`, never the exam board or a school.
- Classifications only use node IDs that belong to that subject's generated node index.
- No duplicate `question_id` within or across the subject's bundles.
- Unavailable source years are reported as unresolved; their bundles are not created.
- Audit output is retained for each bundle and included in the wave completion report.

## Recommended execution order

Start with Wave 01 because it includes the already-supported subjects `ancient-history` and `biology`. Then proceed chronologically. Run four subagents in parallel, one subject each, and generate the next wave only after the previous wave's audit results are clean.
