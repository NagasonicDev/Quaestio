# Handover: deep classification of all HSC template question banks

## Task (as given)

> Looking at the templates, I noticed that most of the question organisation stops at the module level. EVERY QUESTION should have AT LEAST ONE subpart that is valid to be in the parent. For example, in biology 2017, 160 questions are assigned to module 4 of yr 12, but only 10 have been assigned to a child of that module. I want you to review EVERY SINGLE TEMPLATE and make sure that EVERY QUESTION is assigned a classification ALL THE WAY DOWN TO THE SYLLABUS DOT POINT LEVEL. Use parallel subagents to complete this.

Scope: the 54 shipped `.qb` bundles at `frontend/public/templates/hsc/<id>/<id>.qb`.

Definitions used by `temp/audit_resolved.py`:

- **deep** — at least one `-D<n>` node resolves against the bundle tree.
- **fixable** — the question is shallow, but its current topic/module has dot-point children.
- **gap** — the question is correctly classified to a topic/module that has **no** dot-point children in the tree.
- **unresolved** — none of `node_ids`, `node_codes` or `node_names` resolve to a tree node.

## Status

| Metric | Count |
|---|---|
| Shipped bundles | 54 |
| Top-level questions | 8,777 |
| Deep | 7,705 |
| Fixable (shallow, dot available) | 881 |
| Gap (no dot exists in tree) | 184 |
| Unresolved | 7 |
| Bundles modified in the working tree | 50 |
| `npm run test:templates` | 8/8 pass |

After the placeholder revert (step 1 below), the baseline was **3,491 deep / 4,219 fixable / 680 gap / 387 unresolved**. The content classification pass raised deep to 7,705.

The remaining 881 are mostly deliberate nulls: placeholder question bodies, missing listening/reading stimuli, or a theme/module for which the tree has no dot. They are not a build or resolver bug. The 184 gaps need real syllabus data; the 7 unresolved are old physics option headings with no current dot.

## What changed

### 1. Reverted the false-precision commit (`8a9ee37`)

`temp/deep_fix.py`, `temp/physics_name_fix.py`, `temp/eng_fix.py` and `temp/patch_new_dots.py` had added the **first** `-D` descendant of each question's existing node without reading the question. That made 4,436 questions look deep but produced absurd concentrations: biology-2017 had 158 questions under “causes of infectious diseases”; Mathematics Advanced had 191/191 under one differentiation dot; many courses were 100% on one dot.

`temp/revert_classification.py` restored the `questions` array from parent commit `0a21011` for all 41 affected bundles (7,184 questions, including nested `parts`). It kept the current course trees, including the dot points added by the earlier enrichment work. Question-id order was verified identical before writing. Zip entry order, `date_time`, `compress_type`, `external_attr`, `create_system`, README and assets were preserved; JSON used compact separators and `ensure_ascii=False`.

### 2. Content-based classification with one subagent per course

`temp/make_tasks.py` selected every shallow question that had at least 20 characters of text, plus the full dot-point list, and split courses into chunks when a task exceeded 340 KB or 160 questions. `temp/make_recheck_tasks.py` produced full rechecks for courses whose already-deep labels had collapsed onto one dot.

Each subagent was told to choose the single dot whose **full path and core concept** match the question; same module/theme first; `null` if no dot genuinely fits; never invent a code; wrong is worse than null; self-review high/medium once. `temp/apply_llm.py` then applied only `high`/`medium` labels, setting `classification_confidence`, and left `low`/`null` shallow. For rechecks, `--demote` also moved a low/null existing dot back to its parent topic, removing false precision without inventing a new dot.

### 3. Residual resolver fixes

`temp/fix_unresolved.py` mapped 25 physics legacy-code questions to current dots by their old syllabus paths, and all 24 engineering-studies questions that had no classification at all. Seven physics questions remain unresolved because they are whole-option headings (Geophysics, Medical Physics, Age of Silicon) or semiconductor content with no current dot.

## Main results and caveats

| Course | Result / caveat |
|---|---|
| biology, biology-2017 | 183/201 and 198/201 deep; 2017 bank has five pre-existing deep questions outside the task set |
| chemistry, chemistry-2017 | 179/216 and 204/216; remaining nulls are truncated/absent-topic stems |
| physics | 810/849 deep; 7 unresolved legacy option headings; 6 shallow prelim parents left shallow |
| mathematics-advanced | 121/191 deep; 70 nulls are 60 literal “Full MCQ stem…” placeholders plus no-dot regression/box-plot items |
| mathematics-standard | 417/418 deep; mathematics-standard and modern-history-2017 also gained tree dots via the earlier enrichment fix |
| modern-history | 134/143 deep; seven nulls are India 1942–1984 essays (no India module) and one UN-founding question |
| modern-history-2017 | 120/125 deep; five Personality essays are null because the tree has no Personality dots |
| studies-of-religion-1/2 | 107/126 and 192/198 deep; tree has merged depth-study groups, no separate Principal Beliefs dots |
| languages (beginners/continuers) | theme-first matching; many nulls where family/holidays/travel/listening themes have no dots or no transcript |
| French/Italian Extension | only prescribed-text dots exist; film/song text-type matches applied, thematic essays null |
| industrial-technology | 541/574 deep; tree has no Year 12 focus-area modules for Metal & Engineering, Timber & Furniture, or Multimedia, so core dots were used |
| legal-studies-2009 | 186 machine-generated stubs with no stem/options; all demoted to module `HSC-M1` (0 deep) |
| legal-studies | 206/231 deep; 24 option questions null where global-environment/Indigenous-peoples modules have no dots |
| visual-arts | 54/54 deep and spread across the HSC-M2-T3 dots instead of two dots |
| music-1, music-1-2010, music-2, music-2-2010 | rechecked; 16/24, 41/44, 24/24 and 11/20 deep; remaining nulls are open multi-concept or missing-prompt items |
| english-advanced/standard/studies/eald/extension | rechecked; broad skill dots, but some trees are sparse (English Studies still 26/48 on one broad narrative dot) |
| geography, economics, earth-environmental-science, hospitality, agriculture, business-studies, ancient-history(-2017), drama, dance, engineering-studies | applied; distributions are now spread across many dots |

## Remaining gaps (184)

| Course | Gap | Missing tree content |
|---|---|---|
| italian-beginners | 61 | Family/home, holidays/travel, community/everyday themes |
| french-beginners | 56 | Family life, people/places/communities, holidays |
| studies-of-religion-1 | 15 | Separate tradition/belief dots |
| ancient-history | 12 | HSC-M12 Historical personalities |
| chinese-extension | 12 | Social inequality, personal goals, relationships |
| italian-extension | 9 | Relationships, Education, Journeys |
| industrial-technology | 7 | Focus-area module dots |
| modern-history | 6 | National studies grouping/options |
| english-eald | 5 | Representations, culture/communication, composing/editing |
| studies-of-religion-2 | 1 | Separate tradition/belief dots |

These are pure data gaps in `frontend/src/lib/syllabusDotPoints.ts`, not a code bug. Do not fabricate dot points. The repo convention (`scripts/question_import/reclassify_2021_geography.py`) is to abort with “Shallow node … requires manual deepest-dot mapping; aborting to avoid inventing a node.”

## Scripts (all in `temp/`)

| Script | Purpose |
|---|---|
| `audit_resolved.py` | Current resolver audit; prints per-course `top/deep/fixable/gap/unres` and TOTALS. |
| `make_tasks.py` | Builds `<course>.task.json` / `.partN.json` inputs for classification. |
| `make_recheck_tasks.py` | Builds full-recheck tasks for already-deep collapsed courses. |
| `apply_llm.py` | Applies high/medium labels, validates codes, preserves zip metadata; `--demote` for rechecks; dry-run unless `--write`. |
| `fix_unresolved.py` | Physics legacy-path and engineering no-classification mappings. |
| `revert_classification.py` | One-shot undo of `8a9ee37`; already used. |
| `dump_tree.py` | `python temp/dump_tree.py <course-id>` — tree with child/dot counts. |
| `dump_points.mjs` | Syllabus groups and point counts. |

**Do not rerun** `deep_fix.py`, `physics_name_fix.py`, `eng_fix.py` or `patch_new_dots.py`. They are the scripts that created the first-`-D` placeholders. `make_progress.py` is broken (it globs `.out.json` as courses and resets statuses); use `audit_resolved.py` or the files in `temp/llm/` instead.

## Verification commands

```powershell
cd D:\quaestio
python -X utf8 temp/audit_resolved.py    # expect deep 7705, fixable 881, gap 184, unres 7
cd frontend
npm run test:templates                    # expect 8/8 pass
npx tsc -b                                # expect exit 0
npm run lint                              # expect exit 0, pre-existing warnings only
```

## Risks / notes

- The labels are LLM judgement calls, mostly medium confidence, not a human-expert syllabus review. Low/null entries were deliberately left shallow.
- The `.qb` bundles were patched directly. They now diverge from what `build-template-bundles` would generate from `syllabusDotPoints.ts`; a rebuild would lose these question labels and re-resolve stale `.qbx` codes onto different nodes. Do not rebuild without preserving question refs.
- `npm run test:templates` only validates `courseTemplates.ts`, not the shipped `.qb` contents. It is a sanity check, not proof of classification correctness.
- Physics still carries legacy codes on the 7 unresolved questions; the engineering 24 fixed questions originally had no code fields at all.
- The working tree is uncommitted. HEAD is still `8a9ee37`; 50 `.qb` files are modified, and this handover doc plus `temp/` are untracked. No commit or push was made.
