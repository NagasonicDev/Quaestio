# Question Drawing Notebook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one indefinitely retained, editable, multi-page drawing notebook per question, usable while answering on a tablet.

**Architecture:** Store normalized vector strokes and page metadata in versioned SQLite tables in the existing local database. Render them on canvas through Pointer Events, with a dedicated drawing component and persistence adapter. Add notebook data to `.qb` course exports/imports and make the same question notebook available in Practice, Quiz, and Question Detail.

**Tech Stack:** React 19, TypeScript, HTML Canvas, Pointer Events, sql.js SQLite, IndexedDB persistence, TanStack Query.

**Spec:** `docs/superpowers/specs/2026-10-24-question-drawing-notebook-design.md`

## Global Constraints

- Notebook data remains local to the browser/device and can be lost if browser data is cleared or the device is lost without a backup.
- Do not claim a save succeeded until the existing database persistence layer reports a successful write.
- Keep notebook data out of question-only `.qbx` exports; include it in full `.qb` backups.
- Preserve compatibility with existing `.qb` bundles that do not contain notebook data.
- Use existing project dependencies and patterns; do not add a drawing dependency.

## Review Focus

- Pointer cancellation, stylus pressure, and touch input must not leave a stuck stroke or trigger page navigation; pin with drawing interaction tests.
- Partial erasing and undo/redo must preserve editable stroke data; pin with geometry/history tests.
- Deleting or reordering pages must preserve a valid notebook and at least one page; pin with page model tests.
- Failed persistence and storage quota errors must remain visible and retryable; pin with persistence state tests.
- Malformed, duplicate, or legacy backup notebook data must not corrupt course import; pin with bundle parsing/round-trip tests.

---

### Task 1: Drawing data model and persistence

**Files:**
- Modify: `frontend/src/lib/db/schema.ts`
- Modify: `frontend/src/lib/data.ts`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/api/types.ts`
- Create: `frontend/src/lib/drawingNotebook.ts`
- Test: `frontend/tests/drawingNotebook.test.mjs`

**Interfaces:**
- Produce these types in `drawingNotebook.ts`: `DrawingTool = "pen" | "highlighter" | "stroke-eraser" | "pixel-eraser"`; `DrawingPoint = { x: number; y: number; pressure: number; time: number }` with normalized `x`/`y` in `[0, 1]`; `DrawingStroke = { stroke_id: string; kind: "pen" | "highlighter"; color: string; width: number; points: DrawingPoint[] }`; `DrawingPage = { page_id: string; question_id: string; position: number; title: string; background: "plain" | "ruled" | "grid" | "dotted"; strokes: DrawingStroke[] }`; and `DrawingNotebook = { question_id: string; pages: DrawingPage[] }`.
- Produce `getDrawingNotebook(questionId: string): Promise<DrawingNotebook>`, `saveDrawingPage(questionId: string, page: DrawingPage): Promise<void>`, `deleteDrawingPage(questionId: string, pageId: string): Promise<void>`, and `reorderDrawingPages(questionId: string, pageIds: string[]): Promise<void>` through `data.ts` and the typed API client.
- A newly requested notebook contains one page named `Page 1` with plain background.

- [ ] **Step 1: Write the failing data-model and persistence tests**

Test that an unopened question lazily gets one plain page, page order is stable, saving updates a page without changing other pages, reordering changes only positions, deleting the last page is rejected, and deleting a question cascades its notebook pages.

- [ ] **Step 2: Run the focused test and confirm the missing notebook interface fails**

Run: `node --test tests/drawingNotebook.test.mjs` from `frontend`.
Expected: FAIL because the notebook model and data functions do not exist.

- [ ] **Step 3: Add migration 5 and the drawing persistence API**

Create `question_drawing_page` with `page_id TEXT PRIMARY KEY`, `question_id TEXT NOT NULL REFERENCES question(question_id) ON DELETE CASCADE`, `position INTEGER NOT NULL`, `title TEXT NOT NULL`, `background TEXT NOT NULL`, `strokes_json TEXT NOT NULL`, and `updated_at TEXT NOT NULL`; index `(question_id, position)`. Use one transaction per page mutation and existing `markDirty()` persistence behavior. Validate ids, background values (`plain`, `ruled`, `grid`, `dotted`), stroke point values, and ordering inputs before writes.

- [ ] **Step 4: Run the focused test and confirm all persistence assertions pass**

Run: `node --test tests/drawingNotebook.test.mjs` from `frontend`.
Expected: PASS.

- [ ] **Step 5: Commit the data model**

```bash
git add frontend/src/lib/db/schema.ts frontend/src/lib/data.ts frontend/src/api/client.ts frontend/src/api/types.ts frontend/src/lib/drawingNotebook.ts frontend/tests/drawingNotebook.test.mjs
git commit -m "feat: persist per-question drawing notebooks"
```

### Task 2: Canvas drawing surface and page controls

**Files:**
- Create: `frontend/src/components/drawing/DrawingNotebook.tsx`
- Create: `frontend/src/components/drawing/DrawingCanvas.tsx`
- Create: `frontend/src/components/drawing/drawingGeometry.ts`
- Create: `frontend/src/components/drawing/drawingHistory.ts`
- Modify: `frontend/src/components/SaveStatus.tsx`
- Test: `frontend/tests/drawingGeometry.test.mjs`
- Test: `frontend/tests/drawingHistory.test.mjs`

**Interfaces:**
- `DrawingNotebook` accepts `{ questionId: string; className?: string }` and loads/saves through `api.getDrawingNotebook`, `api.saveDrawingPage`, and related page APIs.
- `DrawingCanvas` accepts `{ page: DrawingPage; tool: DrawingTool; onChange(page: DrawingPage): void }`.
- Geometry exports `eraseStrokeAtPoint(strokes, point, radius)` and `eraseStrokePath(strokes, eraserPath, radius)`, returning new stroke arrays while preserving untouched stroke ids.
- Reuse `SaveStatusIndicator` from `SaveStatus.tsx`, whose saved state reflects successful IndexedDB persistence rather than only an in-memory SQLite mutation.

- [ ] **Step 1: Write failing geometry and history tests**

Pin normalized coordinates, pressure fallback, partial eraser splitting at the erasure region, whole-stroke erasure, and undo/redo restoring the exact prior page state.

- [ ] **Step 2: Run focused tests and confirm they fail**

Run: `node --test tests/drawingGeometry.test.mjs tests/drawingHistory.test.mjs` from `frontend`.
Expected: FAIL because geometry and history helpers do not exist.

- [ ] **Step 3: Implement geometry, history, and pointer-based canvas rendering**

Store normalized points with pressure and timestamps. Render pen, alpha-composited highlighter, whole-stroke eraser, and partial eraser. Handle `pointerdown`, `pointermove`, `pointerup`, and `pointercancel`; capture pointers while drawing; ignore touch palm contacts when a stylus is active; use constant-width fallback when pressure is unavailable. Add fit-page, zoom, and pan without modifying saved normalized coordinates.

- [ ] **Step 4: Implement notebook toolbar, pages, and visible save status**

Provide custom colour input, common palette, thickness control, pen/highlighter/eraser selection, undo/redo, add/rename/duplicate/reorder/delete page, background selector, and clear-page confirmation. Disable deleting the last page. Use large touch targets. Debounce saves, flush on page switch/unmount, and embed `SaveStatusIndicator` so the shown state follows successful or failed IndexedDB writes with the existing retry action. Persistent browser storage is already requested at app startup; keep the existing Settings explanation and backup path.

- [ ] **Step 5: Run the focused drawing tests and confirm all assertions pass**

Run: `node --test tests/drawingGeometry.test.mjs tests/drawingHistory.test.mjs` from `frontend`.
Expected: PASS.

- [ ] **Step 6: Commit the drawing surface**

```bash
git add frontend/src/components/drawing frontend/tests/drawingGeometry.test.mjs frontend/tests/drawingHistory.test.mjs
git commit -m "feat: add tablet-friendly drawing notebook"
```

### Task 3: Integrate notebooks in answer flows

**Files:**
- Modify: `frontend/src/components/PracticeFlow.tsx`
- Modify: `frontend/src/components/QuestionReader.tsx`
- Modify: `frontend/src/pages/Quiz.tsx`
- Modify: `frontend/src/pages/QuestionDetail.tsx`
- Test: `frontend/tests/drawingNotebookIntegration.test.mjs`

**Interfaces:**
- Reuse `<DrawingNotebook questionId={question.question_id} />` from Task 2.
- Add optional `afterQuestion?: ReactNode` to `QuestionSurface` and render it after the question body but before answer reveal and footer content; Quiz and Question Detail pass the notebook through this slot.
- Do not store drawing content in practice attempts or quiz scores; notebook identity is the question id.

- [ ] **Step 1: Write failing integration tests**

Verify the notebook is present on Practice prompt, Quiz run, and Question Detail, remains available after answer reveal, and reuses the same `question_id` for each location.

- [ ] **Step 2: Run the focused integration test and confirm it fails**

Run: `node --test tests/drawingNotebookIntegration.test.mjs` from `frontend`.
Expected: FAIL because answer surfaces do not render the notebook.

- [ ] **Step 3: Add the notebook to the three question-answering screens**

In `PracticeFlow`, render it after the question body and outside stage-specific content. In `QuestionSurface`, use `afterQuestion` so it appears before answer reveal; pass it from Quiz and Question Detail. Keep notebook visibility independent of response-capture settings and answer reveal. Preserve existing MCQ selection, scoring, and navigation behavior.

- [ ] **Step 4: Run the focused integration test and confirm it passes**

Run: `node --test tests/drawingNotebookIntegration.test.mjs` from `frontend`.
Expected: PASS.

- [ ] **Step 5: Commit answer-flow integration**

```bash
git add frontend/src/components/PracticeFlow.tsx frontend/src/components/QuestionReader.tsx frontend/src/pages/Quiz.tsx frontend/src/pages/QuestionDetail.tsx frontend/tests/drawingNotebookIntegration.test.mjs
git commit -m "feat: add drawing notebooks to question answering"
```

### Task 4: Full course backup and restore

**Files:**
- Modify: `frontend/src/lib/exchange.ts`
- Modify: `frontend/src/lib/data.ts`
- Test: `frontend/tests/drawingNotebookBackup.test.mjs`

**Interfaces:**
- Add optional `drawing_notebooks?: DrawingNotebook[]` to `ParsedBundle`.
- Add `listDrawingNotebooksForCourse(courseId: string): Promise<DrawingNotebook[]>` and `importDrawingNotebooks(notebooks: DrawingNotebook[]): Promise<void>` to the data layer.

- [ ] **Step 1: Write failing backup tests**

Verify `.qb` export includes notebooks for included questions, filtered exports include only notebooks for included questions, parse/import round trips all page metadata and strokes, and older `.qb` bundles without notebooks parse unchanged. Verify `.qbx` exports omit notebook data.

- [ ] **Step 2: Run the focused backup test and confirm it fails**

Run: `node --test tests/drawingNotebookBackup.test.mjs` from `frontend`.
Expected: FAIL because course bundle serialization omits notebooks.

- [ ] **Step 3: Serialize and restore notebook data in full course bundles**

Increment `COURSE_EXPORT_SCHEMA_VERSION` to 3 and add it to supported versions. Write a `drawing_notebooks` field only to full `.qb` course exports. Parse absence as an empty notebook list; reject malformed notebook ids, page ids, backgrounds, duplicate positions, and invalid point arrays before course replacement begins. Restore after questions have been imported, ignoring pages whose question id is not in the imported question set. Keep `.qbx` unchanged.

- [ ] **Step 4: Run the focused backup test and confirm it passes**

Run: `node --test tests/drawingNotebookBackup.test.mjs` from `frontend`.
Expected: PASS.

- [ ] **Step 5: Commit backup support**

```bash
git add frontend/src/lib/exchange.ts frontend/src/lib/data.ts frontend/tests/drawingNotebookBackup.test.mjs
git commit -m "feat: include drawing notebooks in course backups"
```

### Task 5: Final compatibility and build review

**Files:**
- Modify only files required by issues found during final review.

- [ ] **Step 1: Run all drawing notebook tests together**

Run: `node --test tests/drawingNotebook*.test.mjs tests/drawingGeometry.test.mjs tests/drawingHistory.test.mjs` from `frontend`.
Expected: PASS.

- [ ] **Step 2: Run the existing frontend suite and production build**

Run: `npm test` and `npm run build` from `frontend`.
Expected: all existing tests pass and Vite completes a production build without TypeScript errors.

- [ ] **Step 3: Inspect changed files and verify compatibility**

Confirm migration from schema version 4 to 5, old `.qb` import support, `.qbx` exclusion, and backup round-trip coverage. Fix only issues that violate the approved design.

- [ ] **Step 4: Commit any compatibility fixes**

```bash
git add <changed-files>
git commit -m "fix: harden drawing notebook compatibility"
```
