# Quaestio UI rework handover

Current state lives in uncommitted changes. `npm run build`, `npm run lint` (pre-existing warnings only), and full `npm run test` pass.

## Completed so far

- Phase 0 audit captured in `C:/Users/adamq/.opencode/plan/quaestio-ui-rework-ledger.md`.
- Tokens, surfaces and shell:
  - Added `warning` and `info` CSS tokens for light and dark mode.
  - Removed glass/blur/ledger wash decoration, solid `card`/`surface` backgrounds, fixed cream paper preview.
  - Flattened `PageHeader`; `Panel` no backdrop blur; `Modal` solid and no zoom-in; Layout solid header, grouped nav, success token, no pulse.
- Workflow/state fixes:
  - Dashboard, Browser, QuestionDetail, Quiz, Practice, QuestionEditor, Import, Settings.
  - QuestionEditor body/MCQ/marks validation, stimulus reconcile, deleting state.
  - Hardcoded answer colors replaced with semantic tokens (QuestionReader, Tour fallback, Layout status).
  - CourseOnboarding blobs/auto-motion removed; DrawingNotebook uses confirm modal.
- Build/tests green.

## Remaining work

### Phase 3 consistency and polish

Files: `CourseOnboarding.tsx`, `Dashboard.tsx`, `Browser.tsx`, `QuestionDetail.tsx`, `QuestionEditor.tsx`, `QuestionReader.tsx`.

- Standardize radii and page container widths (8px/12px/radius scale; avoid one-off `rounded-3xl` in first-run screen except top hero).
- Flatten over-nested card surfaces in Dashboard stats; remove icon tiles where they are chrome only.
- Replace arbitrary text sizes (`text-[34px]`, `text-[9px]`, `text-[10px]`) with Tailwind named sizes where possible.
- Keep all MCQ option states defined by semantic tokens; verify dark-mode contrast manually.
- Check empty/loading/error patterns in QuestionDetail and Browser after data fetch.

### Phase 4 interaction and form polish

Files: `Practice.tsx`, `Quiz.tsx`, `QuestionAnswerInput.tsx`, `PracticeFlow.tsx`.

- Verify match count wording and no-results explanations.
- Exercise keyboard: filter controls, stopwatch, answer text, reveal and advance.
- Ensure `QuestionAnswerInput` split of responsibilities stated in audit does not cause stale answer after next question.
- Keep generation duplicate-action prevention in Quiz.

### Phase 5 settings/import/test generator

Files: `TestGenerator.tsx`, `Import.tsx`, `CourseSettings.tsx`, `Settings.tsx`, `StructureEditor.tsx`.

- CourseSettings: migrate inline segment tabs to `ui/Tabs` if not already done; check stale source option state and refresh availability.
- TestGenerator: remove glass overlay and standardize long-form screen; review stale availability indicators.
- StructureEditor: remaining `window.prompt` usage for new node creation is still native and should become an input modal or inline field.
- `exchange.ts` remaining `window.confirm` should use a caller-provided confirmation callback or move confirmation to the UI layer.

### Phase 6 accessibility, responsive and dark mode

Files mostly visual components, no new behavior.

- Screen widths to test: 320 / 375 / 768 / 1024 / 1440.
- Check fixed-cream paper preview remains fixed in dark mode while app chrome changes theme.
- Focus-visible rings on custom buttons in `DrawingNotebook`, `FilterMenu`, and `CourseSettings`.
- Mobile overflow: wide tables, KaTeX displays, long question stems.
- Reduced motion already preferred globally; check animation durations in Tour and Modal.
- Consider bundle split for `data.ts` / exchange; performance warning remains but no action necessary unless shipping size target changes.

### Phase 7 metadata and SEO

Files: `index.html`, Vercel config, sitemap/robots.

- Add concise `meta description` and theme-color.
- Verify canonical/base URLs and Google verification.
- Ensure local-only privacy copy stays consistent with Analytics.
- Add or document smoke test commands for preview.

### Phase 8 final audit

- Run build, lint, and full test suite.
- Manually click through routes: `/`, `/browse`, `/practice`, `/quiz`, `/test-generator`, `/questions/:id`, `/import`, `/settings`, `/add-course`, `/course-settings`, `/templates`.
- Confirm no `window.confirm`, `window.prompt`, wash/blob/glass classes remain in UI.
- Confirm dark mode on and off.

## Useful commands

Run from `D:/quaestio/frontend`:

```powershell
npm run build
npm run lint
npm run test
npm run test:tour
npm run preview -- --host 127.0.0.1 --port 4173
```

## Test expectations

Do not broaden tests beyond current inventory in `package.json`; all existing tests must remain green. If hidden UI wording tests are added, verify against current generated strings before changing copy.

## Git state

This handover was written with uncommitted changes. Do not commit unless requested. Review `git diff` before resuming.
