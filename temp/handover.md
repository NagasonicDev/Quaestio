# HSC Template Repair — Handover to Finish Remaining Tasks

## Objective

Complete HSC template repair backlog after server restart, in any order:
1. **Industrial Technology** 36-bundle furniture sweep
2. **Physics** 25-bundle furniture sweep (7 files with furniture)
3. **Ext1 2025** MCQ stub audit failure
4. Then: business-studies + english-studies furniture, marking-criteria rebuild, stimulus-image ownership rows

## Requirements (do not break)

- User directives (verbatim):
  - "Just hit them in any order."
  - "The server restarted while you were working. Continue from where you left off without repeating completed work."
  - "If possible, use subagents to execute these simple tasks."
  - "continue"
- Byte-identical shipped/frontend + imports copies — SHA-256 identical. Always write both `frontend/public/templates/hsc/<course>/` (shipped) and `imports/<course>/hsc/` (or `imports/<course>/` — see Physics mapping warning).
- `scripts/question_import/audit_qbx.py` must pass (exit 0). Do not deliver a bundle it rejects.
- **No commits, pushes, tags.** No secrets / `.env` edits.
- Proven execution pattern: write a Python script file under `temp/`, run with `python -X utf8`, verify SHA on disk. Do NOT inline `-c` one-liners for writes (PowerShell quoting breaks). Reject any subagent report with no script file / no SHA as progress-only failure.
- Smallest diff that solves the problem. No drive-by refactors. Preserve tables, answer areas, answers/solutions/criteria, MCQ options, marks, nodes, assets.

## Decisions already made

- **Do NOT redo** SOR furniture (verified), depth-1 classification, MH, Music, CAFS, Geo, or content repairs listed as Completed.
- **SOR precedent** (`temp/fix_sor_furniture.py`): furniture-only text blocks are dropped; container parents that would be left with an empty `body` get a single genuine token (audit forbids empty parent bodies). Deterministic zip: read all names/payloads into dict, replace `questions.json`, rewrite with `ZIP_DEFLATED`, assert both targets share one SHA. Reuse this exact `process_bundle` structure for Industrial/Physics.
- **Physics imports mapping unresolved** for 2001–2019: `imports/physics/` vs `imports/physics/hsc/` diverge from shipped. 2020/2023/2024 shipped matches `imports/physics/hsc/`; 2001–2011 shipped differs from `imports/physics/` same-name files and `imports/physics/hsc/` is missing for those years. Resolve the authoritative target for each year *before* writing — match the SOR pattern per-course if the shipped file's counterpart is identifiable, otherwise write shipped + the `imports/physics/hsc/` path and note the gap. Never leave shipped and imports diverged on a touched bundle.

## Completed (verified on disk post-restart — do not redo)

- **SOR furniture — COMPLETED**, 12 bundles via `temp/fix_sor_furniture.py`, audits exit 0, byte-identical pairs.
  - SOR-1 SHAs: 2020 `6a089eecd165cd77158c468f2484489ec23021c4d2339eb6fee5897d90791726`, 2021 `e0371dfcad31...`, 2022 `cc388da4...`, 2023 `897a1dd8...`, 2024 `d57ef8f1...`, 2025 `3689439f...`
  - SOR-2 SHAs: 2020 `291a4ff8...` through 2025 `cb7339b0...`
- **Depth-1 classification — WRITTEN & verified:** Std 2020–2025, Ext1 2020–2024, Ext2 2020–2025, Geo 2021–2022, CAFS 2020–2025, MH2017 2014–2018, Music-1-2010 2015–2025, Music-2-2010 2015–2019
- **Content repairs audit-clean:** CAFS, Std/Ext1/Ext2 maths, Geography, Economics stimulus, MH2017, Music1/2, Industrial Timber 2021 / Graphics 2022, Physics 2020/2023/2024
- **Industrial shipped==imports verified** for all 36 files, e.g. 2020 auto `4f513ff980e1`, elec `987e623fcd4b`, graph `b03c0402b9c7`, metal `1843e46b9b89`, multi `94b7eac2481d`, timber `9bad20256f59` through 2025 timber `ddbe7813926a`
- **Physics SHAs verified:** shipped 2001 `9d2cae59d9de` vs `imports/physics/2001... 322b4f201864`; 2020 shipped `43b224a81c75` matches `imports/physics/hsc/2020...`; 2023 `579c93debc6e` matches `imports/physics/hsc/2023...`; 2024 `4e2fcefd3975` matches `imports/physics/hsc/2024...`. Shipped 2001–2011 SHAs: `9d2cae59d9de`, `7656ec85b066`, `0b85a7aa0a6b`, `dda312497a3a`, `2c5ac7a2276c`, `1cefb7bc18a6`, `28213508f08b`, `f043b8b939ee`, `93e35378f25a`, `8d55646a5139`, `26183e8a8673` — all DIFFER from `imports/physics/` counterparts.
- **Post-restart scanners on disk:** `temp/scan_furniture.py`, `temp/scan2.py`, `temp/scan3.py`, `temp/scan4.py` (rewritten post-restart with SOR furniture regex + token search over both Industrial and Physics), `temp/dump.py`, `temp/testclean.py`, `temp/testclean2.py`, `temp/dump2.py`
- **Ext1 2025 UNCHANGED:** shipped+imports SHA `cdc8328f7e0b` verified post-restart. Bundle at `frontend/public/templates/hsc/mathematics-extension-1/2025-hsc-mathematics-extension-1.qbx`

## Active — not yet run (this is the remaining work)

### A) Industrial Technology — 36-bundle furniture sweep

- Target: `frontend/public/templates/hsc/industrial-technology/` (36 shipped `.qbx`); counterpart `imports/industrial-technology/hsc/` (currently byte-identical).
- **Scan result:** every one of the 36 files has furniture hits (scan4 reported 1–2 hits per file).
- Furniture pattern (confirmed by `temp/dump2.py` output):
  - Q15/Q14 body trailing merged `| 2020 HIGHER SCHOOL CERTIFICATE EXAMINATION | [code] | Industrial Technology | <Technology>` — e.g. `auto202015` body is `'Explain how an anti-lock braking system (ABS) works. | 2020 HIGHER SCHOOL CERTIFICATE EXAMINATION | Industrial Technology | Automotive Technologies'` followed by `answer_area`. Strip the trailing examination/code/course/technology lines; keep the genuine stem. Same in 2021–2025, technology name varies (Automotive / Electronics / Graphics / Metalwork / Multimedias / Timber).
  - Q16 parent body `'Question 16 (15 marks) | Question 16'` — this is `Question 16 (15 marks)\nQuestion 16` collapsed. Present in **23/36**: all 2020, 2021 auto/elec/graph/metal/multi, all 2023, all 2025. **Absent in 2022** (genuine stems, e.g. `graph202215` body `'A company has identified safety issues as a potential area of concern.'`) and **2024** (genuine but degraded, e.g. `auto202416` `Use the following information to answer parts`, `elec202416` parent `Use the following information to answer parts` with part a body `'and'`). For the 23 furniture Q16 parents, `clean_text` empties them → follow SOR rebuild: parent must keep a body because it has parts — rebuild a minimal genuine token from context (SOR script rebuilds from original cleaned label; adapt to Industrial, e.g. keep the stem's first genuine line if present, else a `Question 16` token from source). Do NOT leave `body: []` on a parent with parts.
  - Stray numbers: `auto202014` trailing `| 8287310054`, `elec202414` trailing `| 5123310117` — bare numbers, drop.
  - Copyright: `elec202411` `'What is this component used for? | With kind permission of Core Electronics | © Farnell UK Ltd'` — drop copyright lines (genuine stem stays).
  - **KEEP / do not strip:** genuine stems, `answer_area` blocks, tables. Note `elec202416` part bodies are degraded (`'and'`, `'(a) | Compare...'`) — this is source degradation, NOT furniture to invent-fix; leave the text, only strip furniture lines.
- Fix rule: reuse `temp/fix_sor_furniture.py` — extend `FURNITURE_ONLY` with HIGHER SCHOOL EXAMINATION / course-code / technology lines and `(N marks)` suffix handling; extend `INLINE_FURN` to strip `HIGHER SCHOOL CERTIFICATE EXAMINATION`, exam-code `[number]`, `Industrial Technology`, technology-name tokens and copyright lines when they trail a genuine stem. Verify with `scripts/question_import/audit_qbx.py` on every touched bundle; report SHAs.

### B) Physics — 25-bundle furniture sweep (7 files with furniture)

- Target: `frontend/public/templates/hsc/physics/` (25 shipped). Other 18 years clean by scan4 — do not touch clean files.
- Furniture per year (scan4 + dump):
  - **2001** (Q27–31): `Geophysics. Attempt this question OR one other... Section II (25 marks).` → keep topic only (`Geophysics`), strip the Attempt-choice sentence.
  - **2004** (Q28–32): `Section II — Geophysics (25 marks). Attempt...` → keep topic after em-dash (`Geophysics`).
  - **2012** (Q31–35): `body[0]='Geophysics'`, `body[1]='Answer parts (a)-(c) in Section II Answer Booklet 1...'` → drop block `[1]`, keep `body[0]`. (Confirmed: `qhsc2012_31` body = `['Geophysics', 'Answer parts (a)-(c) in Section II Answer Booklet 1...', 'Show all relevant working...']` — the third block `Show all relevant working in questions involving calculations.` is also generic furniture; treat as droppable per audit if flagged, but the scan hit is block `[1]`.)
  - **2014** (Q32–36): `Geophysics. Answer parts... Writing Booklet.` → keep topic only. **KEEP** `qhsc2014_36.b.ii` `'Copy this graph in your Writing Booklet...'` — genuine instruction. Confirmed body: `['The Age of Silicon. Answer parts (a), (b) and (c) of the question in the Section II Writing Booklet.']` — the `Answer parts...` sentence is furniture, `The Age of Silicon.` is genuine.
  - **2015** (Q31–35): `— Geophysics. Answer parts... pages 2-4...` → keep topic only. **KEEP** `qhsc2015_21` (genuine: `'Measurements of the distance travelled by the projectile in Question 21...'` — `Question 21` here is genuine content, not a header).
  - **2016** (Q31–35): `'- Geophysics (25 marks)'` → keep topic token (`Geophysics`). Confirmed: `qhsc2016_31` body `['- Geophysics (25 marks)']` with genuine parts.
  - **2017** (Q31–35): `Geophysics. Answer parts... Writing Booklet. Start each part...` → keep topic only.
- `clean_text` (`scripts/question_import/text_clean.py`) strips Question-header / Writing-Booklet lines but does **NOT** strip Attempt-choice lines, `Geophysics. Attempt...`, `Section II —...`, Answer Booklet lines, or trailing `HIGHER SCHOOL...`. Verified via `temp/testclean2.py`: Answer Booklet sentences pass through unchanged; Writing Booklet sentences → empty; Attempt sentences unchanged. **Bodies still contain raw text on disk**, so the fix must edit `questions.json` bodies directly — do not rely on `clean_text` to do it.
- **Physics imports mapping warning:** resolve authoritative target before writing (see Decisions). For 2020/2023/2024 write `imports/physics/hsc/`; for 2001–2017 determine whether the shipped file or `imports/physics/` copy is newer/content-correct (shipped 2001 is `9d2cae59d9de`, imports copy is `322b4f201864` — they differ). Whichever you touch, keep the pair byte-identical and record the SHA.

### C) Ext1 2025 — MCQ stub audit failure

- Bundle: `frontend/public/templates/hsc/mathematics-extension-1/2025-hsc-mathematics-extension-1.qbx`, SHA `cdc8328f7e0b`, **unchanged**.
- Contents: 14 questions. `me1202501`–`me1202510` bodies are placeholders: `2025 HSC Mathematics Extension 1. See exam paper for the full multiple-choice stem, options and diagrams.` `me1202511`–`me1202514` bodies start `Use the Question 11/12/13/14 Writing Booklet`.
- Audit: **16 problems** — 10 placeholder bodies + `me1202513` 1349 chars + `me1202514` 1761 chars (long source text belongs in stimulus per WORKFLOW §11) + 4 marks-do-not-sum page markers.
- **No on-disk paper source found.** If a source is discoverable: reconstruct the 10 MCQ stems/options/diagrams properly (`mcq_options` on top-level only, stem in `body`, exactly one `is_correct`, answer letter agreed). If not: document the gap — tag `action_required`, `classification_confidence: low`, report the 16 problems verbatim. Never write "See exam paper" as a body (WORKFLOW §11 Placeholder body).

### D) After A–C: remaining backlog

- business-studies + english-studies furniture sweep (same pattern; geometry of parent-body rebuild applies)
- marking-criteria rebuild (every question **and** part needs allocated criteria — `list` block, allocation first: `2 marks: ...`; parent marks = sum of parts)
- stimulus-image ownership rows

## Blocked / known issues

- Prior Industrial (`ses_e54c4011...`) and Physics (`ses_e54c3dec...`) subagents returned progress-only, no script/SHA — do not trust; always verify SHA on disk.
- Physics `imports/physics/` (74 files) vs `imports/physics/hsc/` mapping unclear for 2001–2019.
- Ext1 2025 source gap (above).
- Repeated post-restart loops (ls/SHA/testclean) produced no fix script yet — do not repeat; go straight to writing the two fix scripts.

## Next moves (in order)

1. Write `temp/fix_industrial_furniture.py` (copy `temp/fix_sor_furniture.py`, adapt patterns for HIGHER SCHOOL trailing blocks + Question 16 parents + stray numbers + copyright). Run `python -X utf8 temp/fix_industrial_furniture.py`. Audit each touched bundle with `scripts/question_import/audit_qbx.py`. Print SHAs; verify shipped==imports on disk.
2. Write `temp/fix_physics_furniture.py` (copy SOR structure; per-year topic-keep rules above; KEEP `qhsc2014_36.b.ii` and `qhsc2015_21`). Resolve imports target per year first. Run, audit, print SHAs.
3. Ext1 2025: search for paper source; reconstruct if found, else gap-doc with `action_required` + 16 problems.
4. Business-studies + english-studies furniture, marking-criteria, stimulus rows. Report SHAs + unresolved source issues. No commits.

## Audit invocation

```sh
python scripts/audit_qbx.py <bundle.qbx> --schema import-schema.json   # per course schema beside scripts/
```

Audit is the authority — do not deliver a bundle it rejects. Parent marks must equal sum of immediate parts; no empty parent/part body; every written leaf ends with `answer_area` (MCQ has none); no "exam paper" placeholder bodies; body >1200 chars of text fails the gate (move to stimulus).

## Key files

| File | Purpose |
|---|---|
| `temp/fix_sor_furniture.py` | **Precedent to copy** — FURNITURE_ONLY / INLINE_FURN, `is_furniture_only`, `clean_text`, `clean_blocks`, `clean_question`, `process_bundle` (deterministic zip, parent rebuild, SHA assert), `main` |
| `scripts/question_import/audit_qbx.py` | Delivery gate — must exit 0 |
| `scripts/question_import/WORKFLOW.md` | Single source of truth (parts §5, blocks §6, MCQ §7, stimuli §2, quality gate §11) — lines 1–454 read |
| `scripts/question_import/text_clean.py` | `clean_text` — strips Question/Writing headers only; does NOT strip Attempt / Section II / Answer Booklet / HIGHER SCHOOL |
| `frontend/public/templates/hsc/industrial-technology/` | 36 shipped bundles to sweep |
| `imports/industrial-technology/hsc/` | Byte-identical counterparts |
| `frontend/public/templates/hsc/physics/` | 25 shipped bundles, 7 with furniture |
| `imports/physics/` + `imports/physics/hsc/` | Physics counterparts — mapping unresolved for 2001–2019 |
| `frontend/public/templates/hsc/mathematics-extension-1/2025-hsc-mathematics-extension-1.qbx` | Ext1 2025 failing bundle, SHA `cdc8328f7e0b` |
| `temp/scan4.py` | Furniture scanner (Industrial + Physics bodies) — reuse its token list |
| `temp/dump.py` + `temp/dump2.py` | Body inspectors used to confirm patterns (incl. auto202016, graph202215, elec202416, qhsc2014_36, qhsc2015_21, qhsc2016_31, qhsc2012_31) |
| `temp/testclean2.py` | `clean_text` probe — outputs quoted above |
| `docs/template-quality-report.md` | Backlog report — empty-bundle section is stale |

## Important context

- `.qbx` = zip; `questions.json` is the content. `body` is a list of blocks (`block_type`: `text`, `heading`, `equation`, `image/diagram/graph`, `function`, `table`, `list`, `code`, `answer_area`, `page_break` — unrecognised types render as nothing). Preserve `answer_area`, tables, image blocks, `mcq_options`, `answer`/`solution`/`marking_criteria` exactly.
- SOR parent-body rebuild detail: when cleaning empties a top-level `body` that has parts, rebuild from original body texts via `clean_text` minus furniture, strip leading bullet (`-`, `—`, `•`), keep shortest informative label (e.g. tradition name). Fallback: `Question <original_question_no>`. Audit forbids empty parent bodies.
- Industrial Q16 furniture body is `Question 16 (15 marks)\nQuestion 16` (dump shows ` | ` between lines). 2022/2024 Q16 bodies are genuine — only strip furniture lines from them, never drop the block.
- Physics "keep topic only" means e.g. `Geophysics. Attempt this question OR one other... Section II (25 marks).` → body `['Geophysics']` (or the genuine lead-in + topic where present, e.g. 2014 `The Age of Silicon.` + topic).
- `clean_text` behavior (testclean2, repeated): Answer Booklet sentences unchanged; `Answer parts ... pages 2-4 ... Writing Booklet` → `''`; `Answer parts (a)-(b) in a writing booklet.` → `''`; `Section II — Geophysics (25 marks). Attempt...` unchanged; `Geophysics. Attempt...` unchanged. Raw text remains on disk — fix edits JSON directly.
- Ext1 2025 long bodies (`me1202513` 1349 chars, `me1202514` 1761 chars): long source text belongs in top-level `stimuli` + `question_stimuli` links (WORKFLOW §2/§11); images never qualify as stimulus.
- No commits have been made at any point.
