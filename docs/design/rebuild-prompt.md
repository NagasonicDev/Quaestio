# Quaestio — Complete UI Rebuild Specification

> ## ⚠ SCOPE: this is a **UI/front-end rebuild**, not a whole-site or backend rebuild.
>
> **In scope — rebuild all of it:**
> - The design system: colour tokens, typography, spacing, radii, motion, dark mode, the Tailwind v4 setup.
> - The React component library and every feature component.
> - All ten pages, their layouts, their copy, their states (loading / empty / error / populated / destructive).
> - Routing, the app shell, navigation, the responsive/mobile behaviour.
> - Accessibility, keyboard behaviour, focus management.
> - The paper-preview and paper-generation *front-end* pipeline (it runs in the browser; there is no server involved).
> - The `api` facade contract the UI consumes, and the local-only persistence the UI depends on.
>
> **Out of scope — do not rebuild, do not redesign, do not extend:**
> - There is **no backend to rebuild.** Quaestio has no server, no API, no accounts, no sync, no deployment pipeline for anything but static files. The retired `backend/` FastAPI directory is dead code and stays dead. If a plan in this document mentions SQL, IndexedDB, `sql.js`, migrations or file formats, read it as *"the local data layer the UI reads from and writes to"*, **not** as an instruction to build a service.
> - The `scripts/question_import/*.py` Python tooling is **not** rewritten. It is opaque input data to the UI: the UI packages those files byte-for-byte into the `.skill` download. Leave the Python alone; if it is missing, the `.skill` ships with fewer scripts and nothing else changes.
> - No new features. This document describes the app that exists. Enhancement ideas are out of scope here; the point is a faithful, complete, patch-free reimplementation of the current UI.
>
> **How to use it.** Read §0, §1 and §2 completely before writing any JSX. Then work in the order given by §19 (Build order), which is dependency order, not feature order. Every verbatim string in double quotes is product copy and must survive the rewrite exactly. Every class name, query-key tuple, component prop and callback signature is a contract, not a suggestion.
>
> **Non-negotiables are marked ⚠.** If a rebuild deviates from a ⚠ rule, the rewrite is wrong regardless of how good it looks.

---

## Table of contents

0. What Quaestio is
1. Operating rules for the rebuild
2. Tone, language and typographic rules
3. Tech stack, repository layout, build configuration
4. Architecture
5. Design system
6. The local data layer the UI reads from and writes to
7. Domain layer (pure, no I/O)
8. Data access layer
9. Exchange layer — file formats
10. Paper generation
11. React shell
12. Component library
13. Feature components
14. Pages
15. Accessibility contract
16. Error and empty-state copy catalogue
17. Known defects: preserve, fix, or accept
18. Test suite
19. Build order
20. Acceptance criteria

---

# 0. What Quaestio is

Quaestio is a **single-user, entirely client-side question bank and study app** for a single student revising a HSC-style course (Engineering Studies, Physics). It has no account, no server, no network calls of any kind. Everything — courses, questions, images, practice history, review schedule, generated papers — lives in the browser on one device.

It does five things:

1. **Holds a question bank.** A course has a hierarchical topic tree, question types, difficulty levels, allowed tags. Each question has a block-structured body, an optional hint, an answer, a worked solution, a marking guide, source metadata, and one-level-or-deeper parts. Multiple-choice questions carry structured options.
2. **Imports questions** from AI-generated JSON, from a `.qbx` question bundle, or from a full `.qb` course backup, and can emit a per-course `.skill` file that teaches an AI assistant how to produce that JSON.
3. **Practises.** A session draws questions under filters, walks the student through attempt → reveal → self-rate, and schedules each question to come back on a spaced-repetition ladder.
4. **Quizzes.** A timed, self-marked examination run with a stopwatch, a mark summary, and provenance separation between app-marked and self-marked answers.
5. **Generates print-ready papers** as Word (`.docx`) or PDF, with an HSC-style cover page, per-section marks targets, right-margin mark allocations, and an in-app PDF preview.

The single most important product stance, repeated throughout the UI, is **honesty about evidence**. The app never says a topic is "mastered" or "weak". It prints sample sizes next to every judgement, distinguishes app-marked answers from self-marked ones, and says "Nothing is due right now" rather than inventing urgency.

---

# 1. Operating rules for the rebuild

### 1.1 ⚠ Zero network

There is no `fetch`, no XHR, no WebSocket, no beacon, no analytics, no telemetry, no font CDN, no error reporting. The only "network" is loading the app's own JS/CSS/WASM bundle. Any feature that would require a server is out of scope. If a feature needs data it does not have, it must degrade with honest copy, not a request.

### 1.2 ⚠ All data is local and disposable

Storage is: **one IndexedDB database** (`DB_NAME = "qb"`, version 1) with three object stores, and four `localStorage` keys. Nothing is backed up automatically. The UI must say so wherever the user might otherwise assume otherwise.

IndexedDB stores:

| store | key | value |
|---|---|---|
| `kv` | `"qb-database"` | the entire SQL.js database image as an `ArrayBuffer` |
| `assets` | `asset_…` id | image `Blob` |
| `tests` | `` `${testId}:${which}` `` | `Blob` (`which` ∈ `"test" \| "preview" \| "solutions"`) |

All three are **keyless** (out-of-line key) object stores. `onupgradeneeded` creates each one guarded by `objectStoreNames.contains`.

`localStorage` keys — exactly these four, no more:

| key | written by | shape |
|---|---|---|
| `qb-active-course` | `useActiveCourse` | raw course id string, or absent |
| `qb-theme` | `useTheme` | `"light"` or `"dark"` |
| `qb-browser-state` | `Browser` (migrated by `Settings`) | `Record<courseId, BrowserPersistedState>` |
| `quaestio:test-generation-seconds-per-question:{docx\|pdf}` | `TestGenerator` | numeric string, EWMA of observed seconds/question |

### 1.3 ⚠ One active course at a time

`useActiveCourse()` returns a single `courseId: string | null`. Every page is scoped to it. `CourseProvider` sits **above** the router so it never remounts on navigation.

### 1.4 ⚠ British verb, American noun

This is consistent throughout the existing codebase and is deliberate:

- Verb / gerund / participle → **`practise`, `practising`, `practised`** (British).
- Noun → **`practice`** (identical in both dialects).

So: the nav item and page title are `"Practice"`; the button is `"Start Practice"`; but body copy says `"Reduce glare while practising long sessions."`, `"Practise one question properly, then let the queue bring it back."`, and `"The free-text responses you wrote while practising."`

The `-ise` spelling is the only -ise form in the app.

### 1.5 ⚠ Zero-padded indices, `part_label` letters, and `{n}` placeholders

- Section/option/question indices in visible chrome use two-digit zero-padding where the design uses it (e.g. `"01"`, `"07"`, quiz summary rows `String(i+1).padStart(2,"0")`).
- `part_label` values are lowercase letters `a`, `b`, `c` … appended as `String.fromCharCode(97 + n)`. MCQ option letters are uppercase `A`, `B`, `C` … via `String.fromCharCode(65 + n)`.
- ⚠ **The `0${index+1}` hierarchy-chip pattern breaks at 10+ levels** (renders `"010"`). This is a known defect — see §17. Fix it during the rewrite with `String(i+1).padStart(2,"0")`.

### 1.6 ⚠ Nothing is deleted silently

Destructive actions are (a) behind an explicit button, and (b) behind a `useConfirm()` dialog whose `confirmLabel` names the action. The four destructive confirmations and their exact copy are in §16.3.

### 1.7 ⚠ Preserve the review ladder semantics exactly

`lib/reviewSchedule.ts` is the pedagogical core. Its behaviour is specified exhaustively in §7.1 and asserted by 17 tests. ⚠ Do not "improve" it. In particular:

- `"unsure"` is **not** a lapse.
- An incorrect objective answer is a lapse **even if the student rates it `"easy"`**.
- A correct objective answer rated `"again"` is **still** a self-signalled lapse.
- `"easy"` advances two ladder steps, `"got_it"` one, `"hard"`/`"unsure"` hold, `"again"` resets to step 0 and returns in `againMinutes`.
- All date arithmetic is **UTC SQL**, never host-local, so DST cannot shift a due date.

### 1.8 ⚠ Two instances of the same bug are intentional

`graded` in `PracticeFlow` and the `graded` test in `Practice.onConfirmAttempt` disagree: the UI treats an MCQ with no stored key but an answer text containing a bare `A`–`D` as "graded", while the DB writes `correct: null` because no option is flagged `is_correct`. **Preserve both.** The UI's softer "Correct, marked by the app from the stored answer key" line is the reason.

---

# 2. Tone, language and typographic rules

### 2.1 Voice

Second person, plain, warm, unhurried, never motivational-theatre. No exclamation marks anywhere. No emoji. No growth-hacking language. The app explains mechanisms ("The question comes back sooner — after about ten minutes rather than days") rather than encouraging ("You've got this!").

### 2.2 Punctuation

- **Em dash** `—` (U+2014) with spaces either side, for asides and for empty-state joins. Some files use the HTML entity `&mdash;` inside JSX strings; **normalise all of them to the literal character** during the rewrite.
- **Curly quotes** `“ ” ‘ ’` in prose. `&ldquo; &rdquo; &rsquo;` entities are legacy — normalise to literal characters.
- **En dash** `–` (U+2013) for numeric ranges: `1–2 marks`, `2–4`, and page numbers `– 3 –`.
- Sentence-ending periods in all product copy, including UI hints and empty states.

### 2.3 ⚠ The two forbidden words

`mastered` and `weak` must never appear as labels, statuses, or headings anywhere in the app. The vocabulary is:

| meaning | permitted wording |
|---|---|
| a topic needs more work | `"Needs another review"` / `"needs another review"` |
| a topic is fine | `"Holding steady"` / `"holding steady"` |
| not enough data | `"Not practised yet"` / `"N of 3 reviews — M more before this shows a pattern"` |
| sufficient data | `"Based on N reviews"` |

The rationale is stated in the app itself and must be restated: *"Needs another review" means a third or more of this topic's questions are due again, or most reviews there ended with a self-rated "again" or "hard". It is a prompt to look again, not a judgement about ability. Anything below 3 reviews shows its evidence instead of a standing.*

### 2.4 ⚠ Provenance is always visible

Self-marked and app-marked work are never blended. Every summary that mixes them splits them: `"N app-marked · M self-marked · K skipped"`, `"includes N self-marked"`, `"all marked by the app"`, `"Nothing is due right now"`. See `describeMarkingMix` (§7.3) and the Quiz summary (§14.5).

### 2.5 Sample sizes are always visible

Any statistic that implies a conclusion prints its `n`. Topics below `MIN_EVIDENCE = 3` completed reviews show evidence, not a standing.

---

# 3. Tech stack, repository layout, build configuration

### 3.1 Runtime and build

| item | value |
|---|---|
| framework | React `^19.2.8` / `react-dom` `^19.2.8` |
| router | `react-router-dom` `^7.18.4`, **`HashRouter`** |
| server state | `@tanstack/react-query` `^5.103.2` |
| styling | Tailwind CSS v4 (`^4.3.3`) via `@tailwindcss/postcss` `^4.3.3`, `tw-animate-css` `^1.4.0`, `autoprefixer`, `postcss` |
| linting | `oxlint` `^1.81.0` |
| language | TypeScript `~6.0.2`, `strict` |
| bundler | Vite `^8.3.0`, `@vitejs/plugin-react` `^6.1.1` |
| database | `sql.js` `^1.14.2` (SQLite compiled to WASM), `@types/sql.js` |
| types | `@types/node` `^24.13.3`, `@types/react` `^19.2.18`, `@types/react-dom` `^19.2.7`, `@types/react-katex` `^3.0.4`, `@types/sql.js` `^1.4.11` |

### 3.2 Feature libraries

| library | version | used for |
|---|---|---|
| `docx` | `^9.7.2` | Word paper generation |
| `pdf-lib` | `^1.17.1` | PDF paper generation |
| `@pdf-lib/fontkit` | `^1.1.1` | font embedding in the PDF |
| `katex` | `^0.18.7` | LaTeX rendering in the DOM and to raster |
| `react-katex` | `^3.1.0` | `<InlineMath>` / `<BlockMath>` in the app |
| `html-to-image` | `^1.11.13` | DOM → PNG for LaTeX in exports |
| `jszip` | `^3.10.2` | `.qb`, `.qbx`, `.skill` bundles |
| `lucide-react` | `^1.48.0` | every icon |
| `@radix-ui/react-{checkbox,label,select,slot,switch,tabs}` | `^1.3.11` / `^2.1.15` / `^2.3.7` / `^1.3.3` / `^1.3.7` / `^1.1.21` | accessible primitives |
| `class-variance-authority` `^0.7.1`, `clsx` `^2.1.1`, `tailwind-merge` `^3.7.0` | | `cn()` |

**There is no icon font, no component framework, no state library, no form library, no drag-and-drop library, no date library, no test framework beyond `node:test`.**

### 3.3 Repository layout

```
D:\quaestio\
  .github\workflows\deploy.yml      builds frontend/dist → GitHub Pages at /Quaestio/
  .opencode\skills\...              agent skills (not shipped)
  backend\                          RETIRED FastAPI server — reference only, do not port
  docs\design\                      this document and its siblings
  exams\                            source exam PDFs (input material)
  frontend\                         the application — the only thing to rebuild
  imports\                          produced .qbx bundles
  logs\                             vite preview request log target
  physics\                          extracted course material
  scripts\question_import\          Python import tooling (shipped inside .skill)
  work\                             scratch folders for page renders
  Start Quaestio.bat / .command / start.sh   launchers
```

### 3.4 `frontend/package.json` — verbatim scripts

```json
{
  "name": "frontend",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "oxlint",
    "test:selection": "node --test --test-isolation=none tests/questionSelection.test.mjs",
    "test:review": "node --test --test-isolation=none tests/reviewSchedule.test.mjs",
    "test:schema": "node --test --test-isolation=none tests/schemaMigrations.test.mjs",
    "test:plan": "node --test --test-isolation=none tests/sessionPlan.test.mjs",
    "test:progress": "node --test --test-isolation=none tests/studyProgress.test.mjs",
    "test": "npm run test:selection && npm run test:review && npm run test:schema && npm run test:plan && npm run test:progress",
    "bench:selection": "node scripts/benchmark-question-selection.mjs",
    "preview": "vite preview"
  }
}
```

⚠ Tests import `.ts` sources **directly** with `node:test` — no transpiler, no vitest, no jsdom. Any pure module must therefore be importable by plain Node ESM, which is why `lib/studyProgress.ts` imports `./reviewSchedule.ts` **with the explicit `.ts` extension** and only pure functions. Keep it that way.

### 3.5 `frontend/vite.config.ts` — every option that matters

```ts
const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  base: "/Quaestio/",                    // ⚠ GitHub Pages project path
  plugins: [react(), requestLogging()],
  build: { assetsDir: "app-assets" },    // ⚠ avoids colliding with the retired backend's /assets/
  server: { fs: { allow: [repositoryRoot] } },  // ⚠ required: the .skill ZIP reads ../scripts/question_import/*
});
```

`requestLogging()` is a local Vite plugin named `'quaestio-request-logging'` that hooks **only** `configurePreviewServer`. It appends synchronously (`appendFileSync`) to `process.env.QB_SERVER_LOG` or `../logs/server.log`, writes a startup INFO line, then one line per request with method, path, status and duration on `res` `finish`, an `ERROR` line for status ≥ 500, and `WARN … connection closed before response completed` on premature `close`. It must never ship in the production bundle.

`base: "/Quaestio/"` has exactly one runtime consequence: `lib/db/sqlite.ts` resolves the WASM binary as `${import.meta.env.BASE_URL}sql-wasm.wasm`, i.e. `/Quaestio/sql-wasm.wasm`, served from `frontend/public/sql-wasm.wasm` (~658 KB). No COOP/COEP headers, no `SharedArrayBuffer` — it is a single-file wasm.

---

# 4. Architecture

```
main.tsx  ──►  <StrictMode><App/></StrictMode>      + import "./index.css"

App.tsx
  QueryClientProvider      { queries: { retry: 1, refetchOnWindowFocus: false } }
  └─ ConfirmProvider       one shared confirm dialog
      └─ CourseProvider    useActiveCourse — localStorage-backed, above the router
          └─ HashRouter
              └─ Routes ─► <Route element={<Layout/>}>
                    index                 Dashboard
                    browse                Browser
                    practice              Practice
                    quiz                  Quiz
                    test-generator        TestGenerator
                    questions/:questionId QuestionDetail
                    import                Import
                    course-settings       CourseSettings
                    settings              Settings
```

### 4.1 ⚠ The data layer indirection

```
components/pages  ──import { api }──►  api/client.ts   (thin facade, 60 named methods)
                                          │  delegates everything
                                          ▼
                                    lib/data.ts       (all SQL, all validation, 3000 lines)
                                          │
                        ┌─────────────────┼──────────────────┐
                        ▼                 ▼                  ▼
              lib/db/sqlite.ts    lib/reviewSchedule    lib/sessionPlan
              lib/db/indexeddb    lib/studyProgress     lib/questionSelection
              lib/db/persistence  lib/exchange          lib/assets
                Status            lib/sampleCourse      lib/tests
```

⚠ **No component may import `../lib/data` directly.** Everything goes through `api`. This keeps the data layer swappable and the components testable.

`api/client.ts` exports:

- `assetUrl` — re-export of the synchronous asset URL lookup.
- `api` — one object with these 60 methods (order preserved):
  `listCourses`, `createCourse`, `deleteCourse`, `resetCourseProgress`, `getCourse`, `updateCourseTags`, `updateCourseName`, `createNode`, `updateNode`, `deleteNode`, `addLevel`, `updateLevel`, `deleteLevel`, `getInstructions`, `skillDownloadUrl`, `downloadSkill`, `exportCourse`, `exportQuestions`, `importCourseFile`, `ensureSampleCourse`, `uploadAsset`, `listQuestions`, `questionSourceOptions`, `questionSourceCounts`, `renameInstitution`, `getQuestion`, `createQuestion`, `updateQuestion`, `deleteQuestion`, `questionCounts`, `estimateTestSections`, `randomQuestion`, `recordAttempt`, `recordReview`, `questionAttempts`, `startPracticeSession`, `getPracticeSession`, `getActiveSession`, `resetPracticeSession`, `setSessionStatus`, `discardPracticeSession`, `practicePoolCounts`, `dueQueue`, `studyProgress`, `getReviewPolicy`, `setReviewPolicy`, `getQueuePause`, `setQueuePause`, `getResponseCapture`, `setResponseCapture`, `getTimerEnabled`, `setTimerEnabled`, `getReviewState`, `enqueueForReview`, `recentQuestions`, `generateTest`, `generateTestSolutions`, `listTests`, `deleteTest`, `testDownloadUrl`, `testPreviewUrl`, `importJson`.
- Type re-exports from `./types`: `AttemptInput`, `AttemptStatus`, `AttemptSummary`, `Confidence`, `DueQueue`, `DueQueueItem`, `DueReasonKind`, `GeneratedTestMeta`, `ImportResponse`, `ImportResultItem`, `PracticeFilters`, `PracticePoolCounts`, `PracticeSessionSummary`, `ReviewOutcome`, `ReviewPolicy`, `ReviewStateRow`, `ScoredBy`, `SelfRating`, `SessionMode`, `SessionPlanItem`, `SessionTopicCoverage`, `StudyProgress`, `TestSectionInput`, `TestSectionResult`, `TopicProgress`, `Source`.

Two behaviours belong to the facade itself, not to `data.ts`:

- `getQuestion`, `createQuestion`, `updateQuestion` and `randomQuestion` call `registerQuestionAssets` on the way out, so every returned `Question` has live blob URLs.
- `exportCourse`, `exportQuestions`, `importCourseFile`, `downloadSkill` and `ensureSampleCourse` reach their implementations through **lazy `import()`** of `../lib/exchange` and `../lib/sampleCourse`, keeping `jszip` and the skill Markdown out of the initial bundle.

`skillDownloadUrl()` returns `""` and is kept only for API-surface compatibility.

### 4.2 ⚠ Four independent "schema version" numbers

They are unrelated. Confusing them is the most common way a rewrite breaks a user's data.

| constant | value | governs |
|---|---|---|
| `SCHEMA_VERSION` (`lib/db/schema.ts`) | `1` | the SQLite table shape |
| `IndexedDB DB_VERSION` (`lib/db/indexeddb.ts`) | `1` | the IndexedDB object stores |
| `COURSE_EXPORT_SCHEMA_VERSION` (`lib/exchange.ts`) | `2` | the `.qb` bundle shape (`SUPPORTED_COURSE_EXPORT_VERSIONS = [1, 2]`) |
| `.qbx export_schema_version` | `1` | the `.qbx` questions-only bundle shape |

`course.schema_version` (per course, currently always `1`) is a *fifth*, separate number carried inside the course row. It is unrelated again.

---

# 5. Design system

All of it lives in `frontend/src/index.css` (313 lines) plus the primitives in `components/system.tsx` (§12).

## 5.1 Dark mode

`@custom-variant dark (&:is(.dark *));` — **class-based, not media-based.** `useTheme` toggles `document.documentElement.classList.toggle("dark", theme === "dark")`.

`getInitialTheme()`: read `localStorage["qb-theme"]`; accept only `"light"`/`"dark"`; otherwise `window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"`.

## 5.2 Typography

`@theme inline` maps three families:

| token | value |
|---|---|
| `--font-sans` | `"IBM Plex Sans"` — body |
| `--font-display` | `"Fraunces"` — headings, wordmark, `Q` loading glyph |
| `--font-mono` | `"IBM Plex Mono"` — `.label`, `Meta`, all numerals and ids |

`letter-spacing: 0` is set on `body` and on `button, a, input, textarea` — the app never tracks out text except the small caps label.

## 5.3 Colour tokens

### Light (`:root`)

| token | value |
|---|---|
| `--background` | `oklch(0.95 0.009 259)` |
| `--foreground` | `oklch(0.22 0.018 270)` |
| `--card` | `oklch(0.99 0.004 255 / 72%)` |
| `--card-foreground` | same as `--foreground` |
| `--popover` | `oklch(0.985 0.006 255)` |
| `--primary` | `oklch(0.38 0.047 164)` |
| `--primary-foreground` | `oklch(0.98 0.005 155)` |
| `--secondary` | `oklch(0.91 0.015 255)` |
| `--secondary-foreground` | `oklch(0.26 0.025 260)` |
| `--muted` | same as `--secondary` |
| `--muted-foreground` | `oklch(0.49 0.025 260)` |
| `--accent` | `oklch(0.9 0.028 60)` |
| `--accent-foreground` | `oklch(0.53 0.095 52)` |
| `--destructive` | `oklch(0.577 0.245 27.325)` |
| `--destructive-foreground` | `oklch(0.984 0.003 247.858)` |
| `--border` | `oklch(0.22 0.018 270 / 12%)` |
| `--input` | `oklch(0.22 0.018 270 / 16%)` |
| `--ring` | `oklch(0.53 0.095 52)` |
| `--surface` | `oklch(0.99 0.004 255 / 52%)` |
| `--success` | `oklch(0.48 0.075 152)` |
| `--chart-1` … `--chart-5` | `oklch(0.646 0.222 41.116)`, `oklch(0.6 0.118 184.704)`, `oklch(0.398 0.07 227.392)`, `oklch(0.828 0.189 84.429)`, `oklch(0.769 0.188 70.08)` |

### Dark (`.dark`)

| token | value |
|---|---|
| `--background` | `oklch(0.18 0.018 260)` |
| `--foreground` | `oklch(0.93 0.01 255)` |
| `--card` | `oklch(0.24 0.022 260 / 78%)` |
| `--card-foreground` | `oklch(0.984 0.003 247.858)` |
| `--popover` | `oklch(0.23 0.022 260)` |
| `--primary` | `oklch(0.69 0.09 157)` |
| `--primary-foreground` | `oklch(0.16 0.02 160)` |
| `--secondary` / `--muted` | `oklch(0.279 0.041 260.031)` |
| `--muted-foreground` | `oklch(0.7 0.025 255)` |
| `--accent` | `oklch(0.32 0.04 55)` |
| `--accent-foreground` | `oklch(0.72 0.11 55)` |
| `--destructive` | `oklch(0.704 0.191 22.216)` |
| `--border` | `oklch(1 0 0 / 10%)` |
| `--input` | `oklch(1 0 0 / 15%)` |
| `--ring` | `oklch(0.551 0.027 264.364)` |
| `--surface` | `oklch(0.3 0.02 260 / 55%)` |
| `--success` | `oklch(0.7 0.1 150)` |
| `--chart-1` … `--chart-5` | `oklch(0.488 0.243 264.376)`, `oklch(0.696 0.17 162.48)`, `oklch(0.769 0.188 70.08)`, `oklch(0.627 0.265 303.9)`, `oklch(0.645 0.246 16.439)` |

Sidebar tokens alias the base set.

## 5.4 Radius scale

`@theme inline` derives the whole scale from `--radius: 0.5rem`:
`sm = radius - 4px`, `md = radius - 2px`, `lg = radius`, `xl = radius + 4px`, `2xl = radius + 6px`, `3xl = radius + 8px`, `4xl = radius + 16px`.

## 5.5 Base layer

```css
* { border-color: var(--color-border); }
body { background; color; font-family; letter-spacing: 0; }
button, a, input, textarea { letter-spacing: 0; }
```

## 5.6 Custom utilities (`@utility`)

| name | definition |
|---|---|
| `panel` | 1px `--border`; radius `calc(var(--radius) + 0.25rem)`; background `--card`; `box-shadow: 0 1px 1px color-mix(in oklab, var(--foreground) 4%, transparent)`; `backdrop-filter: blur(14px)` |
| `label` | mono, `0.66rem`/`1rem`, weight 500, uppercase, `letter-spacing: 0.14em`, `--muted-foreground` |

## 5.7 Custom classes

| class | definition |
|---|---|
| `.global-loading-track` | `position: fixed; z-index: 60; inset: 0 0 auto; height: 2px; pointer-events: none` |
| `.global-loading-bar` | `width: 38%`, `background: var(--accent-foreground)`, `animation: loading-progress 1.2s ease-in-out infinite`; keyframes `translateX(-110%) → translateX(270%)` |
| `.ledger-wash` | `position: fixed; inset: 0; pointer-events: none`; three radial gradients at `5% 0%`, `100% 35%`, `40% 110%` using `oklch(0.75 0.08 230)`, `oklch(0.72 0.08 285)`, `oklch(0.78 0.08 170)` |
| `.question-paper` | `linear-gradient` ruled lines every 32px at `--border` at 40% opacity |
| `.paper-preview` | ⚠ fixed cream/ink, **never obeys dark mode**: `background: oklch(0.99 0.004 80)`, `color: oklch(0.22 0.01 70)`, `2rem` padding, `box-shadow: 0 10px 28px oklch(0.2 0.02 260 / 10%)` |
| `.answer-reveal` | `reveal` keyframes: opacity + `translateY(-5px) → 0`, 0.28s |
| `.ink-loader` | grid, gap `0.65rem` |
| `.ink-loader-mark` | `--primary`, `4.6rem`/`0.9` |
| `.ink-stream` | `190px × 12px`, `mask-image` linear gradient |
| `.ink-stream-base` | 1px line |
| `.ink-stream-current` | 2px, `ink-stream-flow` 2.5s `translateX(0) → translateX(494%)` |
| `.ink-stream-progress` | `width: var(--ink-progress, 0%)`, 500ms ease |
| `.ink-loader-progress` | mono 10px |
| `.ink-loader-message` | `min-height: 1rem` |
| `.katex-display` | `overflow-x: auto` |
| `.mcq-option-content` | `overflow-x: auto` |
| `.mcq-option-content .katex-display` | `max-width: 100%` |

A `prefers-reduced-motion` block collapses every animation and transition to `0.01ms`. **Keep it.**

---

# 6. The local data layer the UI reads from and writes to

> **Read this section as the UI's data contract, not as a service to build.** The UI never speaks SQL. It calls the `api` facade (§8), which talks to an in-browser SQLite (WASM) whose entire image lives in IndexedDB on the user's device. Nothing here leaves the machine. What the UI engineer needs from this section is: (a) the exact shape of every object the UI receives, (b) the exact behaviour of the handful of pure functions the UI calls directly, (c) the save/save-failure states the UI must render. The DDL is given so a rewrite can regenerate the local store compatibly and so existing user data survives.

## 6.1 Tables — 20 of them

All created with `CREATE TABLE IF NOT EXISTS`. `SCHEMA_SQL` is the single source; the `app_setting` DDL is duplicated in `lib/db/sqlite.ts` as `APP_SETTING_DDL` so migrations can run on a pre-migration image.

```sql
CREATE TABLE IF NOT EXISTS course (
  course_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  subject TEXT,
  curriculum TEXT,
  version_year TEXT,
  schema_version INTEGER NOT NULL DEFAULT 1,
  allow_multi_classification INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  is_sample INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS course_level_def (
  course_id TEXT NOT NULL REFERENCES course(course_id),
  level_index INTEGER NOT NULL,
  label TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (course_id, level_index)
);

CREATE TABLE IF NOT EXISTS course_node (
  node_id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES course(course_id),
  parent_node_id TEXT REFERENCES course_node(node_id) ON DELETE CASCADE,
  level_index INTEGER NOT NULL,
  name TEXT NOT NULL,
  code TEXT,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_course_node_parent ON course_node(parent_node_id);
CREATE INDEX IF NOT EXISTS idx_course_node_course_level ON course_node(course_id, level_index);

CREATE TABLE IF NOT EXISTS difficulty_level (
  course_id TEXT NOT NULL REFERENCES course(course_id),
  level INTEGER NOT NULL,
  label TEXT NOT NULL,
  PRIMARY KEY (course_id, level)
);

-- ⚠ course_id NULL means "global/builtin" and is shared by every course.
CREATE TABLE IF NOT EXISTS question_type (
  type_key TEXT PRIMARY KEY,
  course_id TEXT REFERENCES course(course_id),
  display_name TEXT NOT NULL,
  schema_json TEXT
);

CREATE TABLE IF NOT EXISTS tag (
  tag_id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES course(course_id),
  name TEXT NOT NULL,
  UNIQUE (course_id, name)
);

-- ⚠ paper, original_page, original_filename and import_job_id are NEVER written.
CREATE TABLE IF NOT EXISTS source (
  source_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  year INTEGER,
  institution TEXT,
  paper TEXT,
  original_page INTEGER,
  original_question_no TEXT,
  original_filename TEXT,
  import_job_id TEXT
);

CREATE TABLE IF NOT EXISTS question (
  question_id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES course(course_id),
  type_key TEXT NOT NULL REFERENCES question_type(type_key),
  difficulty INTEGER,
  marks REAL,
  parent_question_id TEXT REFERENCES question(question_id) ON DELETE CASCADE,
  part_label TEXT,
  source_id TEXT REFERENCES source(source_id),
  notes TEXT,
  review_status TEXT NOT NULL DEFAULT 'approved',
  classification_confidence TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_question_course ON question(course_id);
CREATE INDEX IF NOT EXISTS idx_question_type ON question(type_key);
CREATE INDEX IF NOT EXISTS idx_question_difficulty ON question(difficulty);
CREATE INDEX IF NOT EXISTS idx_question_parent ON question(parent_question_id);

CREATE TABLE IF NOT EXISTS content_block (
  block_id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES question(question_id) ON DELETE CASCADE,
  slot TEXT NOT NULL DEFAULT 'body',
  position INTEGER NOT NULL,
  block_type TEXT NOT NULL,
  content_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_content_block_question ON content_block(question_id, slot, position);

CREATE TABLE IF NOT EXISTS question_classification (
  question_id TEXT NOT NULL REFERENCES question(question_id) ON DELETE CASCADE,
  node_id TEXT NOT NULL REFERENCES course_node(node_id) ON DELETE CASCADE,
  is_primary INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (question_id, node_id)
);
CREATE INDEX IF NOT EXISTS idx_qc_node ON question_classification(node_id);

CREATE TABLE IF NOT EXISTS question_tag (
  question_id TEXT NOT NULL REFERENCES question(question_id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tag(tag_id),
  PRIMARY KEY (question_id, tag_id)
);

CREATE TABLE IF NOT EXISTS mcq_option (
  option_id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES question(question_id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  content_json TEXT NOT NULL,
  is_correct INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS asset (
  asset_id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES question(question_id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  mime_type TEXT,
  width INTEGER,
  height INTEGER,
  alt_text TEXT,
  caption TEXT,
  original_filename TEXT
);

CREATE TABLE IF NOT EXISTS practice_session (
  session_id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES course(course_id),
  filter_json TEXT,
  mode TEXT NOT NULL,
  created_at TEXT NOT NULL,
  config_json TEXT,
  plan_json TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  planned_count INTEGER NOT NULL DEFAULT 0,
  completed_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_session_course ON practice_session(course_id, created_at);

-- ⚠ ON DELETE CASCADE means discarding a session destroys its attempts.
CREATE TABLE IF NOT EXISTS practice_attempt (
  attempt_id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES practice_session(session_id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES question(question_id),
  status TEXT NOT NULL,
  correct INTEGER,
  time_spent_sec INTEGER,
  user_notes TEXT,
  created_at TEXT NOT NULL,
  response_text TEXT,
  confidence TEXT,
  self_rating TEXT,
  hints_revealed INTEGER NOT NULL DEFAULT 0,
  scored_by TEXT,
  score_earned REAL,
  score_possible REAL
);
CREATE INDEX IF NOT EXISTS idx_attempt_question ON practice_attempt(question_id, created_at);
CREATE INDEX IF NOT EXISTS idx_attempt_created ON practice_attempt(created_at);

CREATE TABLE IF NOT EXISTS question_review_state (
  question_id TEXT PRIMARY KEY REFERENCES question(question_id) ON DELETE CASCADE,
  next_due_at TEXT,
  interval_days REAL NOT NULL DEFAULT 0,
  last_reviewed_at TEXT,
  review_count INTEGER NOT NULL DEFAULT 0,
  lapse_count INTEGER NOT NULL DEFAULT 0,
  ladder_step INTEGER NOT NULL DEFAULT 0,
  last_rating TEXT,
  last_outcome TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_review_state_due ON question_review_state(next_due_at);

CREATE TABLE IF NOT EXISTS app_setting (
  setting_key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS import_job (
  import_job_id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES course(course_id),
  source_filename TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS import_question (
  import_question_id TEXT PRIMARY KEY,
  import_job_id TEXT NOT NULL REFERENCES import_job(import_job_id) ON DELETE CASCADE,
  proposed_json TEXT NOT NULL,
  confidence TEXT,
  resolution TEXT NOT NULL DEFAULT 'pending',
  final_question_id TEXT
);

CREATE TABLE IF NOT EXISTS generated_test (
  test_id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES course(course_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  format TEXT NOT NULL,
  target_marks REAL,
  achieved_marks REAL,
  question_count INTEGER,
  filter_json TEXT,
  question_ids_json TEXT,
  test_file_path TEXT,
  solutions_file_path TEXT,
  preview_file_path TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_generated_test_course ON generated_test(course_id, created_at);
```

### 6.2 Built-in question types

```ts
const BUILTIN_QUESTION_TYPES: Array<[string, string]> = [
  ["multiple_choice", "Multiple Choice"],
  ["short_answer", "Short Answer"],
  ["extended_response", "Extended Response"],
];
```

Inserted with `INSERT OR IGNORE` on first run. `display_name` for a newly added type is `titleCaseKey(key)`: underscores → spaces, each word capitalised.

### 6.3 Migrations

```ts
const SCHEMA_VERSION = 1;
const MIGRATIONS = [{ id: 1, name: "study-loop-foundation", sql: `…` }];
```

Migration 1 adds:
- `course.is_sample`
- `practice_session.config_json, plan_json, status, planned_count, completed_count, updated_at` and `idx_session_course`
- `practice_attempt.response_text, confidence, self_rating, hints_revealed, scored_by, score_earned, score_possible` and `idx_attempt_created`
- `UPDATE practice_attempt SET scored_by = 'manual_legacy' WHERE correct IS NOT NULL;`
- `question_review_state` + `idx_review_state_due`
- `app_setting`

⚠ The `manual_legacy` backfill is **pedagogically load-bearing**: pre-study-loop attempts had a `correct` column but no record of *who* decided it. Labelling them `objective` would claim the app graded them. They are self-reported, and the app says so.

`applyMigrations()`:

```ts
db.run(APP_SETTING_DDL);                          // every start, in case the table is absent
const current = readSchemaVersion();              // NaN → 0
if (current >= SCHEMA_VERSION) return;
for (const migration of MIGRATIONS.filter(m => m.id > current)) {
  db.run("BEGIN;");
  try { db.exec(migration.sql); writeSchemaVersion(migration.id); db.run("COMMIT;"); }
  catch (error) {
    try { db.run("ROLLBACK;"); } catch {}
    throw new Error(`Database upgrade ${migration.id} (${migration.name}) failed: ${reason}`);
  }
}
if (pending.length) markDirty();
```

### 6.4 Boot sequence — `initDb()`

1. `await initSqlJs({ locateFile: () => `${import.meta.env.BASE_URL}sql-wasm.wasm` })`
2. `const bytes = await idb.loadPersistedDb()`
3. If bytes exist and `byteLength > 0` → `db = new SQL.Database(bytes)` (**no `export()` upgrade**). Otherwise: `new SQL.Database()`, `db.run(SCHEMA_SQL)`, insert builtin types, `writeSchemaVersion(1)`, `markDirty()`.
4. `db.run("PRAGMA foreign_keys = ON;")` — **on every path, every session**.
5. `applyMigrations()`
6. `repairQuestionIds()`
7. Seed the built-in tag for every course:

```sql
INSERT OR IGNORE INTO tag (tag_id, course_id, name)
SELECT 'tag_action_' || course_id, course_id, 'action_required' FROM course
```

then `if (db.getRowsModified() > 0) markDirty();` — the deterministic `tag_id` makes it idempotent.

`getDb()` memoises the init promise and **resets the memo on failure** so the next call retries cleanly.

### 6.5 `repairQuestionIds()` — runs on every boot

Any `question_id` that fails `isValidQuestionId` is rewritten. Valid ids are reserved first, then each invalid id gets a fresh `newQuestionId()` that is not already used. With `PRAGMA foreign_keys = OFF`, inside one transaction, in this order:

```
question.parent_question_id → content_block.question_id → question_classification.question_id
→ question_tag.question_id → mcq_option.question_id → asset.question_id
→ practice_attempt.question_id → import_question.final_question_id
```

then `UPDATE question SET question_id = new WHERE question_id = old`, then `generated_test.question_ids_json` is parsed, mapped, and re-serialised only if something changed — **malformed JSON is silently left alone** rather than crashing the boot. `COMMIT` + `markDirty()`; on error `ROLLBACK` and rethrow; `finally` restores `PRAGMA foreign_keys = ON`.

Old ids are inlined as escaped literals (`oldId.replace(/'/g, "''")`) because table names cannot be bound.

### 6.6 Persistence

```ts
export function markDirty(): void {
  dirty = true; reportSaving();
  if (persistTimer !== null) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => { void flush().catch(() => {}); }, 500);
}

export async function flush(): Promise<void> {
  if (persistTimer !== null) { clearTimeout(persistTimer); persistTimer = null; }
  if (!dirty || !db) return;
  dirty = false; lastFlushError = null; reportSaving();
  const bytes = db.export();                       // synchronous full-image export
  const persist = idb.persistDb(bytes);
  pendingPersist = persist;
  try { await persist; reportSaved(nowUtc()); }
  catch (error) { dirty = true; lastFlushError = error; reportSaveFailure(error); throw error; }
  finally { if (pendingPersist === persist) pendingPersist = null; }
}
```

- Retry wiring at module load: `setPersistenceRetry(() => { lastFlushError = null; void flush().catch(() => {}); })`. It works **only** because a failed flush re-sets `dirty = true`.
- `flushOnHide()` is wired to `visibilitychange → hidden` and `window pagehide`. ⚠ **`beforeunload` is deliberately not used** — it cannot await.
- `clearAllData()`: cancel the timer, `await pendingPersist`, `await idb.clearAllData()`, `db?.close()`, `db = null`, `ready = null`, `dirty = false`, `reportCleared()`.

### 6.7 Query helpers

```ts
transaction(fn: (db: Database) => void): Promise<void>
  // ⚠ fn is SYNCHRONOUS and receives the Database; it must call database.run(…) directly.
  // Calling the async helpers inside would issue a nested BEGIN.
all<T>(sql, params): Promise<T[]>
getFirst<T>(sql, params): Promise<T | null>          // all()[0] ?? null
run(sql, params): Promise<void>                      // ⚠ calls markDirty() unconditionally
runMany(statements: Array<[string, any[]]>): Promise<void>   // one transaction, ⚠ no per-statement try/catch
```

Two of these are known defects — see §17.4 and §17.5.

### 6.8 IndexedDB helpers

`getDb()` (memoised, resets on failure); a private `txn(store, mode, fn)` that resolves on `tx.oncomplete` (not `onsuccess`) so writes are committed, and rejects on `req.onerror` / `tx.onerror` / `tx.onabort`; then `loadPersistedDb`, `persistDb` (⚠ writes `bytes.buffer.slice(0)` — the whole underlying ArrayBuffer, ignoring `byteOffset`/`byteLength`), `putAsset`, `getAsset`, `deleteAsset`, `listAssetIds`, `hasAsset` (`blob !== null && blob.size > 0`), `getAllAssets`, `putTestFile`, `getTestFile`, `deleteTestFiles` (prefix cursor delete on `` `${testId}:` ``), `clearAllData` (rejects `` `Failed to clear IndexedDB store: ${store}` ``), `getAllTestKeys` (unused).

⚠ Not implemented anywhere: `navigator.storage.estimate()`, a `persist()` request for durable storage, `versionchange` handling. Quota is handled purely reactively (§12.4).

### 6.9 Persistence status store

A plain external store (`Set<() => void>` listeners) in `lib/db/persistenceStatus.ts`, deliberately not React state, so the persistence layer never imports back into the DB module.

```ts
type SaveStatus = "idle" | "saving" | "saved" | "error";
interface SaveState { status: SaveStatus; message: string | null; lastSavedAt: string | null; hasUnsavedChanges: boolean; }
```

| function | resulting state |
|---|---|
| `reportSaving()` | `{ status: "saving", message: null, hasUnsavedChanges: true }` — no-op if already in that state |
| `reportSaved(at)` | `{ status: "saved", message: null, lastSavedAt: at, hasUnsavedChanges: false }` |
| `reportSaveFailure(error)` | `{ status: "error", message: describeFailure(error), hasUnsavedChanges: true }` — keeps `lastSavedAt` |
| `reportCleared()` | full reset to `{ idle, null, null, false }` |

`describeFailure`:
- `name === "QuotaExceededError"` or `/quota/i` → `"This device is out of storage space. Export a backup from Settings, then free up space."`
- `name === "SecurityError"` or `/permission|denied|not allowed/i` → `"This browser is not allowing local storage. Check private browsing settings."`
- otherwise → `` `Could not save to this device: ${raw}` `` or `"Could not save to this device."`

Plus `setPersistenceRetry(action)`, `canRetry()` (`retryAction !== null && status === "error"`), `retryPersistence()`. Consumed via `useSyncExternalStore`.

---

# 7. Domain layer — the pure functions the UI calls directly

Everything in `frontend/src/lib` that has no I/O. These are imported by components directly (unlike `lib/data.ts`, which must go through `api`). They must stay pure, dependency-free, and Node-ESM-importable so the tests in §18 can import the `.ts` files with no transpiler.

## 7.1 `lib/reviewSchedule.ts` (392 lines) — the pedagogical core

```ts
type SelfRating   = "again" | "hard" | "got_it" | "easy" | "unsure";
type ReviewOutcome = "objective_correct" | "objective_incorrect" | "self_assessed";
type AttemptStatus = "seen" | "attempted" | "revealed" | "reviewed";
```

Constants:

```ts
const SELF_RATINGS = ["again", "hard", "got_it", "easy", "unsure"] as const;
const SELF_RATING_LABEL = { again: "Again", hard: "Hard", got_it: "Got it", easy: "Easy", unsure: "Not sure" };
const SELF_RATING_HINT = {
  again: "Show this again very soon",
  hard: "I got there, but it took effort",
  got_it: "I could do this unaided",
  easy: "This felt straightforward",
  unsure: "No judgement either way",
};
const DEFAULT_REVIEW_POLICY = { ladder: [0, 1, 3, 7, 16, 35, 70], againMinutes: 10 };
const ATTEMPT_STATUS_LABEL = { seen: "Seen", attempted: "Attempted", revealed: "Answer revealed", reviewed: "Reviewed" };
```

Functions and their contracts:

| function | behaviour |
|---|---|
| `emptyReviewState(questionId, at)` | synthesised state for a question with no row: counters 0, `next_due_at: at`, `last_rating: null`, `last_outcome: null` |
| `normalizePolicy(policy)` | keeps only finite `> 0` entries rounded to 2 dp, always prepends `0`, else falls back to `DEFAULT_REVIEW_POLICY.ladder`; `againMinutes` must be finite `> 0` else `10` |
| `ladderStep(state)` | authoritative `state.ladder_step`, falling back to `review_count - lapse_count` |
| `intervalForStep(step, policy)` | `policy.ladder[clamp(step, 0, len-1)]`, in days |
| `addDays` / `addMinutes` | UTC string arithmetic |
| `SQL_UTC = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/` | |
| `parseSqlUtc(s)` | accepts SQL and ISO forms; `null` on garbage |
| `formatSqlUtc(ms)` | `"YYYY-MM-DD HH:MM:SS"` in UTC, no milliseconds |
| `daysBetween(a, b)` | `Math.trunc` of the difference |
| `isDue(state, at)` | `state.next_due_at != null && state.next_due_at <= at` — string comparison, correct for this fixed-width format |
| `newlyDueReviewState(questionId, at)` | all counters 0, `next_due_at = at` |
| `nextReviewState(prev, { rating, objectiveCorrect, at, policy })` | **the core transition** — see below |
| `describeInterval(state)` | `"Not scheduled yet"` / `"Later today"` / `"In N minutes"` / `"Tomorrow"` / `"In N days"` (< 14) / `"In N weeks"` (< 60) / `"In N months"` |
| `dueReason(state, at, { includeRatedDifficult })` | ordered: `never_reviewed` → `"You have not reviewed this yet"`; `missed_objectively` → `"You answered this incorrectly {ago}"`; `rated_difficult` → `"You marked this hard\|not sure {ago}"`; `overdue` → `"Due N day(s) ago"`; `due_now` → `"Ready for another look"` |
| `describeWhen(at)` | `"earlier today"` / `"yesterday"` / `"N days ago"` / `"last week"` / `"N weeks ago"` |
| `rankDueQuestions(states, at, limit = 50)` | filters to due, scores `-(priority + lapseWeight + ratingWeight + outcomeWeight + recency)`, sorts ascending; tie-break by `next_due_at` |
| `isSelfRating` / `isReviewOutcome` / `isAttemptStatus` | enum guards |
| `attemptRank(s)` | `{ seen: 0, attempted: 1, revealed: 2, reviewed: 3 }` |
| `isCompletedReview(s)` | `s.status === "reviewed"` |
| `attemptStatusLabel(status)` | legacy `"completed"` → `"Attempted"`; unknown → `"Seen"` |
| `activityLabel(s)` | wrapper over `attemptStatusLabel` |

`nextReviewState` — ⚠ the exact transition, because the tests assert every branch:

```
lapsed   = objectiveCorrect === false || rating === "again"
outcome  = objectiveCorrect === true  ? "objective_correct"
         : objectiveCorrect === false ? "objective_incorrect"
         :                               "self_assessed"

if (lapsed)         nextStep = 0;  interval = policy.againMinutes / 1440;  due = at + interval
else if easy        nextStep = step + 2
else if got_it      nextStep = step + 1
else                nextStep = Math.max(1, step)     // hard and unsure hold

interval = intervalForStep(nextStep, policy)
due      = addDays(at, interval)
```

`rankDueQuestions` weights:

| term | value |
|---|---|
| `priority` | days late × 10 |
| `lapseWeight` | `min(lapse_count, 5) × 6` |
| rating `hard` | +8 |
| rating `unsure` | +4 |
| `objective_incorrect` | +8 |
| `recency` | `max(0, 30 − daysSinceLastReview)` |

⚠ The function **never mutates** its input.

## 7.2 `lib/sessionPlan.ts` (166 lines)

```ts
const SESSION_MODE_LABEL = {
  focused:    "Focused practice",
  mixed:      "Mixed practice",
  due_review: "Due for review",
};
const SESSION_MODE_HINT = {
  focused:    "Stays with the topics and question types you picked. Good when you are working through one section.",
  mixed:      "Draws from everything you picked and spreads the questions across those topics, so a large topic does not fill the whole session.",
  due_review: "Works through the questions your previous answers said were due again, hardest first.",
};
const UNCLASSIFIED = "__unclassified__";
```

| function | behaviour |
|---|---|
| `shuffle(list, random)` | Fisher-Yates with an injected `random` |
| `interleave(buckets, size, random)` | round-robin one question per topic per pass until the pool or `size` is exhausted; topics that run dry drop out |
| `buildSessionPlan(pool, { mode, size, random })` | dedupes by `question_id`, buckets by `topic_id ?? UNCLASSIFIED`, shuffles each bucket, `balanced = mode === "mixed" && buckets.size > 1`, slices to `size`, returns `{ question_ids, items, topic_coverage, dominant_topic_share, balanced, truncated }`. `topic_coverage` is sorted by available count desc, then topic id |
| `suggestedSessionSize(mode, dueCount)` | `Math.max(1, Math.min(30, dueCount))` for `due_review`; `null` otherwise (open-ended) |

`SessionPlanItem` = `{ question_id, topic_id, reason_text?, reason_kind? }`.

## 7.3 `lib/studyProgress.ts` (276 lines)

⚠ **Imports `./reviewSchedule.ts` with the explicit `.ts` extension** so `node --test` can import it directly. Do not "clean that up".

```ts
const MIN_EVIDENCE = 3;
const STANDING_LABEL = { needs_another_review: "Needs another review", holding_steady: "Holding steady" };
```

| function | behaviour |
|---|---|
| `evidenceFor(reviewed)` | `"none"` at 0, `"some"` at 1–2, `"enough"` at ≥ 3 |
| `standingFor(...)` | `null` unless evidence is `"enough"`; otherwise `"needs_another_review"` when `dueShare >= 0.34 \|\| lapseShare >= 0.5 \|\| hardShare >= 0.5`, else `"holding_steady"` |
| `evidenceNote(reviewed)` | `"Not practised yet"` / `` `${n} of 3 reviews — ${3-n} more before this shows a pattern` `` / `` `Based on ${n} reviews` `` |
| `rollupTopicActivity(nodes, direct, at)` | sums each node's own numbers into every ancestor's `subtree_*`; a parent's `days_since_review` is the newest anywhere in its subtree |
| `pickNextAction({ totalQuestions, dueNow, topics, queuePaused })` | ordered: `add_questions` → `due_review` → `practise_topic` (a topic with enough evidence and `needs_another_review`) → `practise_topic` (the untouched topic with most questions) → `start_practising` → `keep_going` |
| `describeRecency(days)` | `null` → `"never"`; 0 → `"today"`; 1 → `"yesterday"`; < 7 → `"N days ago"`; < 14 → `"last week"`; < 60 → `"N weeks ago"`; else `"N months ago"` |
| `describeMarkingMix(objective, selfMarked)` | `"No completed reviews yet"` / `` `${n} reviewed, all marked by the app` `` / `` `${n} reviewed, all self-marked` `` / `` `${o} marked by the app, ${s} self-marked` `` |

`pickNextAction` titles/details (verbatim):

| kind | title | detail |
|---|---|---|
| `add_questions` | `"Add some questions"` | — |
| `due_review` (unpaused) | `` `Review ${dueNow} question(s) due now` `` | — |
| `due_review` (paused) | `` `${dueNow} question(s) waiting, queue paused` `` | — |
| `practise_topic` (needs review) | `` `Practise ${topic.name}` `` | `` `${topic.evidence_note}.` `` |
| `practise_topic` (untouched) | `` `Try ${topic.name}` `` | `` `${n} question(s) you have not practised yet.` `` |
| `start_practising` | `"Practise a question"` | — |
| `keep_going` | `"Keep the streak going"` | `"Nothing is due right now."` + the stalest topic named |

## 7.4 `lib/questionSelection.ts` (153 lines)

```ts
selectQuestionIndexes(marks: number[], targetUnits: number,
  { deadline, budgetMs = 40, toleranceUnits = 50, random })
  → { indexes: number[]; selectionLimited: boolean }
```

Algorithm, exactly:

1. `units = marks.map(m => Math.max(1, Math.round(m * 100)))`.
2. **Equal-marks shortcut** — if every unit is equal, return `count = max(1, min(n, round(targetUnits / units[0])))` first indexes with `selectionLimited: false`.
3. `upperLimit = targetUnits + Math.max(toleranceUnits, maxMarkAtOrBelowTarget)`.
4. `keepBest` keeps the lower **distance**; ties go to the **smaller sum**.
5. Up to **4** randomised greedy passes, each bounded by `deadline` (checked every 256 items).
6. If no exact solution was found, a bounded local search of up to **12 000** attempts (deadline checked every 128) mixing 1-for-1 and 1-for-2 swaps, accepting **strict improvements only**, redrawing a free index up to 12 times.
7. `selectionLimited = true` when the deadline was hit.

## 7.5 Small utility modules

**`lib/id.ts`**

```ts
newId(prefix)      // `${prefix}_${hex12}` — 12 hex chars, zero-padded
newQuestionId()    // 6 chars from A–Z0–9, guaranteed ≥ 1 letter and ≥ 1 digit
isValidQuestionId  // /^[A-Z0-9]{6}$/ AND has a letter AND has a digit
nowUtc()           // "YYYY-MM-DD HH:MM:SS.ffffff"
```

Prefixes in use: `course`, `node`, `src`, `blk`, `opt`, `tag`, `asset`, `att`, `iq`, `imp`, `test`.

**`lib/utils.ts`** — `cn(...inputs) = twMerge(clsx(inputs))`.

**`lib/questionTypes.ts`** — `formatQuestionType(key)` = underscores → spaces, each word capitalised. `"multiple_choice"` → `"Multiple Choice"`.

**`lib/nodeFilters.ts`** — `effectiveNodeFilterIds(nodes, selectedIds)`:
- a selected node with **no** selected descendant contributes its **entire subtree**;
- a selected node **with** a selected descendant contributes itself plus only the explicitly selected branches.

The UI calls this *before* querying, because the query layer matches explicit classification only and never rolls up subtrees.

**`lib/testGenerationTask.ts`** — a module-global `TestGenerationTask` plus listener `Set`, read via `useSyncExternalStore`. Writers: `beginTestGeneration(next)`, `updateTestGeneration(patch)` (no-op when null), `dismissTestGeneration()`.
```ts
interface TestGenerationTask {
  courseId: string;
  status: "running" | "complete" | "failed";
  phase: "selecting" | "hydrating" | "paper" | "preview" | "saving";
  startedAt: number;
  questionCount: number;
  completedQuestions: number;
  estimatedSeconds: number;
  result?: GeneratedTestMeta;
  error?: string;
}
```

**`lib/assets.ts`**

```ts
IMAGE_TYPES = new Set(["image", "diagram", "graph"]);
MAX_BYTES = 15 * 1024 * 1024;
uploadAsset(file): Promise<{ asset_path, mime_type, original_filename }>
  // accepts .png .jpg .jpeg .gif .webp .svg; throws "File too large (max 15 MB)"
  // stores the blob under a fresh `asset_<hex>` id
assetUrl(assetId): string          // ⚠ SYNCHRONOUS cached createObjectURL lookup; "" when unknown
ensureAssetUrl(assetId): Promise<void>
deleteAssetBlob(assetId)
finalizeQuestionAssets(questionId, summaries)   // inserts asset rows from image block content; width/height stay NULL
```

**`lib/MathText.tsx`**

```ts
normalizeMathText(text)      // 3x10^3 kg  →  $3\times10^{3}\,\mathrm{kg}$
normalizeEquationLatex(latex)// strips one layer of $…$ / $$…$$, same rewrite, no delimiters re-added
MathText({ text })           // splits /\$([^$]+)\$/g, <InlineMath errorColor="#b3261e"> per span, bare fragment
```

The legacy scientific-notation regex, used by both normalisers:
```
/(\d+(?:\.\d+)?)\s*[x×]\s*10\s*\^\s*(-?\d+)(?:\s*(kg\s*m\s*s(?:\^?-?\d+)?|kg|ms\^-?\d+|m|s|N|J|Hz|V|A|T|K|C|Wb|lux|°C))?\b/g
```

---

# 8. The `api` facade — every call the UI makes

`api/client.ts` re-exports a thin wrapper over `lib/data.ts`. Component signatures below are what the UI actually calls; each returns a promise of the type in `api/types.ts`.

## 8.1 Courses, structure, levels

| call | notes |
|---|---|
| `listCourses(): Promise<Course[]>` | `ORDER BY is_sample DESC, name` — the sample course sorts first |
| `getCourse(courseId): Promise<CourseFullConfig>` | the whole config in one call: nodes (tree), `question_types`, `tags`, `hierarchy`, `difficulty_levels`. `null` when absent |
| `createCourse(payload)` | seeds the `action_required` tag, the default difficulties `[{1,"Very Easy"},{2,"Easy"},{3,"Difficult"},{4,"Very Difficult"}]`, and any missing builtin types. Returns the full config |
| `deleteCourse(id)` | deletes asset blobs and test outputs first, then one transaction over attempts → generated tests → import jobs → questions → sessions → orphan question types → unreferenced sources → course |
| `resetCourseProgress(id)` | deletes attempts, review state and sessions. **Questions untouched** |
| `updateCourseName(id, name)` | throws `"Course name can't be empty."` |
| `updateCourseTags(id, names)` | trims, dedupes, force-puts `action_required` first, diffs inserts/deletes |
| `addLevel(courseId, { level_index, label, required })` | duplicate index → `` `Level index ${i} already exists` `` |
| `updateLevel(courseId, i, level)` | `"Level not found"` |
| `deleteLevel(courseId, i)` | in use → `"Cannot delete a level that still has categories. Reassign or delete them first."` |
| `createNode` / `updateNode` / `deleteNode` | `updateNode` sends `description`, `sort_order`, `parent_node_id` too; see §17.2 for the `?? null` coercion defect. `deleteNode` cascades to children, their classifications and their questions |

## 8.2 Questions

```ts
getQuestion(id): Promise<Question>
createQuestion(payload): Promise<Question>
updateQuestion(id, payload): Promise<Question>
deleteQuestion(id): Promise<void>
questionCounts(courseId, filters?): Promise<QuestionCountsResponse>
listQuestions(courseId, filters?): Promise<QuestionListResponse>
questionAttempts(questionId, limit = 20): Promise<AttemptSummary[]>
recentQuestions(courseId, limit = 10): Promise<RecentItem[]>   // ⚠ 90-char snippet
randomQuestion(filters): Promise<{ matching_count, question }>
```

**`Question`** — the object every renderer receives:

```ts
interface Question {
  question_id: string; course_id: string; type_key: string;
  difficulty: number | null; marks: number | null;
  parent_question_id: string | null; part_label: string | null;
  notes: string | null; review_status: string; classification_confidence: string | null;
  node_ids: string[]; tags: string[];
  body: ContentBlock[];
  hint: ContentBlock[];
  answer: ContentBlock[];
  solution: ContentBlock[];
  marking_criteria: ContentBlock[];
  mcq_options?: Array<{ position: number; content: ContentBlock[]; is_correct: boolean }>;
  assets: Asset[];
  source: Source | null;       // { name, year, institution, original_question_no }
  parts: Question[];           // recursive, but the editor is one level only
  created_at: string; updated_at: string;
}
```

⚠ `source` is emitted **only when `source.name` is truthy**. ⚠ Parts are returned with `parts: []` (no deeper recursion in the row-by-row path) and inherit their parent's `type_key`, but carry **no** classification, tags, `mcq_options` or `source`.

`ContentBlock` = `{ block_id, slot, position, block_type, content }`.

`BlockType = "text" | "heading" | "equation" | "image" | "diagram" | "graph" | "table" | "list" | "code" | "answer_area" | "page_break"`
`Slot = "body" | "hint" | "answer" | "solution" | "marking_criteria"`

**The default `content` shape per block type** — the editor, the renderer, the exporters and the import validator all agree on these:

| block_type | `content` |
|---|---|
| `text` | `{ text: string }` |
| `heading` | `{ text: string, level: number }` — ⚠ level is stored but the renderer ignores it |
| `equation` | `{ latex: string, display: boolean }` |
| `image` / `diagram` / `graph` | `{ asset_path: string, alt_text: string, caption: string }` |
| `table` | `{ columns: string[], rows: string[][] }` |
| `list` | `{ ordered: boolean, items: string[] }` |
| `code` | `{ language: string, code: string }` |
| `answer_area` | `{ lines: number }` |
| `page_break` | `{}` |

`listQuestions` defaults: `page ?? 1`, `page_size ?? 25`, snippet length 160, `approved` only, roots only. `sort` accepts `created_desc | created_asc | difficulty_asc | difficulty_desc | random`; an unknown key silently falls back to `created_desc`.

`questionCounts` returns `{ total, by_node: NodeCount[], by_type, by_difficulty }` where `by_node[].count` is an **in-memory recursive rollup** — a distinct-question subtree union, so a parent's count includes its descendants. `by_difficulty` is keyed by `String(difficulty)`, so nulls appear under the literal key `"null"`.

`randomQuestion` takes `{ course_id, node_id?, type?, difficulty?, tag?, exclude_question_ids?, exclude_recent_days?, source_filters? }`, returns `{ matching_count: 0, question: null }` when nothing matches, and picks by counting then `Math.floor(Math.random() * matching_count)` as an `OFFSET` into `ORDER BY q.question_id`.

**The filter compiler** — `buildFilters(opts)` is the single source of truth for "what matches". The question table is always aliased `q`. Clause order is fixed:

1. `approvedOnly` → `q.review_status = 'approved'`
2. `wholeQuestions` → `q.parent_question_id IS NULL`
3. `institutionYears` → per selection `q.source_id IN (SELECT source_id FROM source WHERE COALESCE(NULLIF(TRIM(institution),''),TRIM(name)) = ? AND year IN (…))`; an **empty year array drops the year predicate**; all selections OR-ed inside one group
4. `typeKey` → `q.type_key IN (…)` — **an empty array means "no constraint", not "match nothing"**
5. `typeKeys` → a second `q.type_key IN (…)`
6. scalar `difficulty` → `q.difficulty = ?`
7. `difficulties` → `q.difficulty IN (…)`
8. `difficultyMin` / `difficultyMax` → `q.difficulty >= ?` / `<= ?`
9. `marksMin` / `marksMax`
10. `nodeIds` → `q.question_id IN (SELECT question_id FROM question_classification WHERE node_id IN (…))` — **explicit classification only, no subtree rollup**
11. `tag` → join `question_tag` → `tag`, scoped to the course
12. `q` → `(q.question_id LIKE ? OR q.source_id IN (SELECT source_id FROM source WHERE original_question_no LIKE ?) OR q.question_id IN (SELECT question_id FROM content_block WHERE slot = 'body' AND content_json LIKE ?))` with `%term%`

`""`, `null`, `undefined` and `[]` **all mean "no constraint"**.

## 8.3 Practice, review and attempts

| call | returns / notes |
|---|---|
| `startPracticeSession({ course_id, mode, filters, size? })` | `PracticeSessionSummary`. For `due_review` the pool is replaced by `rankDueQuestions(…, 10000)`, each item carrying `reason_text`/`reason_kind`. `size` defaults to `suggestedSessionSize(mode, pool.length)` |
| `getPracticeSession(id)` | `null` when the row is gone. ⚠ Recomputes pool counts on every read |
| `getActiveSession(courseId, mode?)` | latest `status = 'active'`, optionally filtered by mode |
| `resetPracticeSession(id)` | ⚠ deletes only attempts with `status = 'seen'`, resets counts, status back to `active` |
| `discardPracticeSession(id)` | ⚠ deletes the session row — and because `practice_attempt.session_id` is `ON DELETE CASCADE`, **the attempts go with it** |
| `setSessionStatus(id, status)` | |
| `practicePoolCounts(filters, opts?)` | `{ filter_match_count, eligible_count, excluded_seen_count, recently_excluded_count }` |
| `recordAttempt(input)` | writes `correct` **only** when `scored_by === "objective" && correct != null`; writes `response_text` only when response capture is on; `hints_revealed ?? 0` |
| `recordReview(input)` | one transaction: the attempt row (status hard-coded `"reviewed"`), the review-state upsert, and a session `completed_count` recount |
| `questionAttempts(id, limit)` | newest first |
| `dueQueue(courseId, limit = 10)` | `{ due_count, items, paused_until, paused, estimated_minutes }`. `estimated_minutes = max(1, round(items.length * 1.5))` |
| `studyProgress(courseId)` | the whole `StudyProgress` object (§8.5) |
| `getReviewState(id)` | ⚠ synthesises `emptyReviewState` when there is no row; **writes nothing** |
| `enqueueForReview(id, at?)` | puts a question on the queue as of now without pretending it was reviewed |
| `getActiveSession` / `getQuestion` / `recordAttempt` | as above |

**`PracticeSessionSummary`** — what the Practice page renders:

```ts
{
  session_id, course_id, mode, filters, created_at, updated_at,
  status,                    // "active" | "completed"
  planned_count, completed_count, remaining_count, next_question_id,
  plan: SessionPlanItem[],
  topic_coverage: SessionTopicCoverage[],
  dominant_topic_share: number,
  pool: PracticePoolCounts,
}
```

**`StudyProgress`** — what the Overview dashboard renders:

```ts
{
  course_id, generated_at, total_questions,
  ever_seen, attempted, reviewed, due_now,
  queue_paused_until: string | null,
  reviewed_last_7_days, objective_reviews, self_reviews, marking_mix_note: string,
  topics: TopicProgress[],           // subtree-rolled-up per node
  repeated_difficulty: DifficultyCue[],   // hard/again ≥ 2 or lapses ≥ 2, top 8
  next_action: { kind, title, detail, node_id? },
}
```

## 8.4 App settings

Four `app_setting` rows, read through four pairs:

| key | reads | writes |
|---|---|---|
| `review_policy` | `getReviewPolicy()` → `DEFAULT_REVIEW_POLICY` when missing or unparsable | `setReviewPolicy(p)` — ⚠ `JSON.stringify(normalizePolicy(p))` |
| `review_queue_paused_until` | `getQueuePause()` → `{ paused_until, paused }` where `paused = until > nowUtc()` (a string compare) | `setQueuePause(until | null)` |
| `save_response_text` | `getResponseCapture()` → `"off"` **only** if stored exactly `"off"`, else `"on"` — **capture is on by default** | `setResponseCapture(v)` |
| `practice_timer` | `getTimerEnabled()` → `true` **only** if stored exactly `"on"` — **timer is off by default** | `setTimerEnabled(b)` writes `"on"`/`"off"` |

## 8.5 Tests, export, import, sources

| call | notes |
|---|---|
| `generateTest(courseId, payload)` | see §10.4 |
| `estimateTestSections(courseId, sections)` | one aggregate per section: `{ question_count, available_marks }` for approved, root-level questions with `marks IS NOT NULL` |
| `listTests(courseId, limit = 20)` | newest first; resolves `test_download_url` and `preview_url` from the object-URL cache, plus `solutions_available: boolean` |
| `generateTestSolutions(testId)` | rebuilds the sections from `filter_json.generated_sections` and writes a solutions document |
| `deleteTest(testId)` | |
| `testDownloadUrl` / `testPreviewUrl` | object URLs; may be `""` |
| `exportCourse(courseId, filters?, options?)` | §9.3 |
| `exportQuestions(courseId, filters?)` | §9.4 |
| `downloadSkill(courseId)` | §9.2 |
| `importCourseFile(file, onIdCollision?)` | §9.5 |
| `importJson(courseId, data)` | §9.6 |
| `questionSourceOptions(courseId)` | `{ institutions: Array<{ name: string; years: number[] }> }`, institutions sorted, **years descending**. Institution = `COALESCE(NULLIF(TRIM(institution),''),TRIM(name))` |
| `questionSourceCounts(courseId, filters?)` | `Record<institution, { total, years: Record<year, count> }>`. Inner-joins `source`, so unsourced questions are excluded |
| `renameInstitution(courseId, current, next)` | `"Institution name cannot be empty."`; returns the number of source rows touched. Copies to a course-scoped source row when the source is shared with another course |
| `getInstructions(courseId)` | `{ course_id, instructions_markdown }` — the block SKILL.md appends |
| `uploadAsset(file)` | §7.5 |
| `ensureSampleCourse()` | `{ course_id, course_name, created }`, idempotent |
| `skillDownloadUrl()` | returns `""`; kept for surface compatibility only |

---

# 9. Exchange layer — the file formats the UI reads and writes

All four are ZIPs made with JSZip and ⚠ generated with **only** `{ type: "blob" }` — no `compression` option, so they are **STORE** (uncompressed). `downloadBlob` revokes the object URL after **1000 ms**, because an immediate revoke cancels the download in some browsers.

`slugName(name)` = lowercase → `[^a-z0-9]+` → `-` → strip leading/trailing `-`, **falling back to the raw name when the result is empty**.

## 9.1 `lib/exchange.ts` exports

`slugName`, `downloadBlob`, `buildSkillMarkdown`, `buildSkillBlob`, `downloadSkill`, `COURSE_EXPORT_SCHEMA_VERSION = 2`, `SUPPORTED_COURSE_EXPORT_VERSIONS = [1, 2]`, `exportCourse`, `exportQuestions`, `parseCourseBundle`, `applyCourseBundle`, `importCourseFile`, plus the interfaces `CourseExportFilters`, `CourseExportOptions`, `LearningBundle`, `ParsedBundle`.

## 9.2 `.skill` — the per-course AI import skill

`downloadSkill(courseId)` → `` `${slugName(config.name)}.skill` ``. Throws `"Course not found"` when the config is missing.

**10 ZIP entries:** `SKILL.md`, `import-schema.json`, and eight Python scripts (`audit_qbx.py`, `build_qbx.py`, `check_scheme_bundle.py`, `crop.py`, `extract_figures.py`, `index_nodes.py`, `prep_paper.py`, `qbx_lib.py`) read as raw strings from `lib/questionImportAssets.ts` via Vite's `?raw` suffix. ⚠ `repair_multipart_solutions.py` exists on disk and is referenced by `WORKFLOW.md`, but is **not** in that map, so it does not ship. Either add it or reword the workflow.

**`SKILL.md` front matter** — validated, not decorative:

```ts
const name = `${slugName(config.name)}-question-import`;
// description: fixed template, config.name interpolated twice
throw "Skill validation failed: description is required."     // if blank
throw `Skill validation failed: name must be kebab-case (got '${name}').`   // if !/^[a-z0-9]+(?:-[a-z0-9]+)*$/
```
Then exactly `---\nname: X\ndescription: "…"\n---\n\n` with inner quotes escaped.

**`SKILL.md` body**, in this exact order: front matter (no separating newline) → `# Document-to-Question Skill — ${name}` → intro paragraph warning that node ids, question types and difficulty labels are course-specific → `## Process` (6 numbered items) → `## Image attachment checklist` → `## Image assets and import bundle` → `## Marking guides — required, and never an exemplar` → `## Output format` (fenced JSON example) → `## Multiple-choice questions` (fenced MCQ example + the institution-parsing paragraph) → `## Handling uncertainty` → `---` → `instructionsMarkdown` → `---` → the entire `WORKFLOW.md` appended raw.

The rules that must survive verbatim in that prose, because they encode real behaviours:

- Every question must end up with a **marking guide**, authored if the source has none, and **never as a worked exemplar** — a guide is a marker's checklist, not a model answer.
- Every criterion states its allocation **up front** (`"1 mark: …"`, `"1–2 marks: …"`, or a trailing `"(2 marks)"`) because the app renders the guide as a **two-column criteria | marks table**.
- Always emit **both** `node_ids` and `node_codes`, plus `course_name`. Course and node ids are regenerated on every re-import; codes, names and paths are stable. This is the entire mechanism that lets a re-imported course be re-matched.
- One question object per question-with-parts, with a nested `parts` array. Nesting is `26 → c → i/ii`, never flat labels like `c(i)`.
- `answer_area` of two lines per mark at the end of each free-response part's `body`.
- Institution: record only the institution's real name, and leave it `null` rather than inferring one from a course, exam type or year.
- If a figure cannot be extracted or mapped, add the exact tag `action_required` and say so in the checklist. Never invent a tag.

**`import-schema.json`** keys: `course_id`, `course_name`, `schema_version: 1`, `valid_type_keys`, `valid_tags`, `valid_difficulty_levels` (`{level,label}[]`), `allow_multi_classification`, `valid_node_ids` (pre-order DFS objects `{node_id, name, code, level_index, path}` where `path` joins names with `" > "`), `valid_node_codes` (truthy codes only), `valid_node_names` (full paths), `mcq_option_format` (`{ content, is_correct, order }` explanatory strings), `example_question`, `example_multiple_choice`.

## 9.3 `.qb` — the full course bundle

`exportCourse(courseId, filters = {}, options = {})`. ⚠ `includeLearningData` is on unless explicitly `false`; `includeResponseText` requires strictly `true`.

`course.json`, `JSON.stringify(…, null, 2)`, keys in order:

```jsonc
{
  "export_schema_version": 2,
  "exported_at": "<ISO>",
  "includes": { "course_structure": true, "questions": true, "images": true,
                "learning_data": <bool>, "typed_answers": <bool>, "generated_files": false },
  "course": { …full CourseFullConfig, with description/subject/curriculum/version_year overridden from the course row… },
  "questions": [ …filtered Question[] verbatim… ],
  "learning": { "review_policy": {"ladder": [...], "again_minutes": N},
                "review_state": [ …11 keys per row… ],
                "attempts": [ …14 keys per row… ] } | null
}
```

- The four filters AND together and each is **skipped when its array is empty** — an empty array means "no filter", not "match nothing".
- ⚠ `institutions` matches `question.source?.institution` **only**, whereas the query side `COALESCE`s to `source.name`. This asymmetry is real: exporting by an institution that only exists as a `source.name` returns nothing. **Fix it during the rewrite** to use the same `COALESCE`.
- ⚠ Filtered-out questions keep their original array positions.
- Assets are collected from `q.assets[]`, from `mcq_options[].content` block `asset_path`s, recursing into `parts` — ⚠ **not** from `hint`/`answer`/`solution`/`marking_criteria` blocks, so a figure inside a mark scheme is dropped. **Fix during the rewrite.**
- `assets/<asset_id>.<ext>` where the extension comes from the **blob's** MIME type: png/jpg/jpg/gif/webp/svg, default `bin`.
- ⚠ `response_text` in exported attempts is set to `null` (key retained) when the flag is off, not deleted — with the comment "`correct` is only meaningful for objectively scored attempts; keep the provenance column so an imported history is not silently re-graded."

`README.txt` — exact content:

```
${name} — Quaestio course bundle

Contents:
- course.json: course structure, difficulty and tag definitions, and the questions listed in it.
- assets/: images and diagrams referenced by the exported questions (${seen.size} file(s)).
- learning: review schedule and ${n} practice attempt record(s).      ← or "not included"
- typed answers: included|excluded                                    ← only when learning is on

- Generated test files are not included; regenerate them from the questions.

Importing replaces the course with the same id, or asks whether to add it as a new course.
Attempt history is restored without its practice session, so the schedule carries over but session history does not.
```

## 9.4 `.qbx` — the questions-only editable bundle

`exportQuestions(courseId, filters = {})` → `` `${slugName(name)}-questions.qbx` ``. Two entries: `questions.json` and `assets/*`. `questions.json` keys: `export_schema_version: 1`, `course_name`, `exported_at`, `includes { course_structure: false, questions: true, images: true, learning_data: false, typed_answers: false, generated_files: false }`, `questions`. ⚠ **No `course_id` key** — the target course comes from where the user uploads it. (The Python producer does write `course_id`; the app ignores it.)

`README.txt`:

```
Editable question export. Edit questions.json; binary files referenced by asset_id are in assets/. Keep asset IDs and filenames unchanged so image blocks continue to resolve.

This package deliberately contains questions and their images only: no course structure, no review schedule, no attempt history, no typed answers, and no generated files. Use the .qb course export for a full backup.
```

**Reading a `.qbx` (in `pages/Import.tsx`)** — four exact validation steps and nothing more:

```ts
try { archive = await JSZip.loadAsync(file); }
catch { throw new Error("This is not a valid .qbx question bundle."); }
const manifest = archive.file("questions.json");
if (!manifest) throw new Error("This .qbx bundle has no questions.json file.");
const payload = JSON.parse(await manifest.async("string"));
if (payload.export_schema_version !== 1 || !Array.isArray(payload.questions))
  throw new Error("Unsupported or invalid .qbx question bundle.");
```

Then: collect `assets/*` blobs with `assetId = filename.replace(/\.[^.]*$/, "")`; build an `assetMap` that remaps **only ids actually present in the ZIP** to `newId("asset")`; rewrite `content.asset_path` in the slots `body, answer, solution, marking_criteria` **and** in every `mcq_options[].content` block, recursing into `parts`; store the blobs; `ensureAssetUrl` each new id. ⚠ **The `hint` slot is not rewritten** — a latent bug; fix it during the rewrite.

## 9.5 `.qb` reading

`parseCourseBundle(file)`:
- `JSZip.loadAsync` failure → `"This file is not a valid .qb course bundle."`
- no `course.json` → `"This .qb bundle has no course.json — it may be corrupted."`
- `JSON.parse` with ⚠ **no try/catch** — malformed JSON throws a raw `SyntaxError`. Wrap it.
- version not in `[1, 2]` (⚠ **including a missing version**) → `` `Unsupported export schema version ${v} — this app supports version 1 and 2.` ``
- assets scanned from `assets/` only, id = filename minus the **last** dot-segment (`a.b.png` → `a.b`), first entry per id wins
- returns `{ course, questions: courseJson.questions ?? [], assetBlobs, learning: courseJson.learning ?? null }` with ⚠ **no validation of `course`** — a bundle missing `course` crashes later. Add a shape check.

`applyCourseBundle(bundle, mode, requestedCourseId?)` — order matters:

1. `courseId = mode === "new" ? (requestedCourseId ?? newId("course")) : src.course_id`
2. `mode === "replace"` → `wipeCourseData` (existence check, then `deleteCourse`)
3. Gather `existingAssets` from `idb.listAssetIds()` **and** `SELECT asset_id FROM asset` — the comment explains why: an old partial import can leave a SQL row without a blob.
4. Collect the bundle's own asset ids from **all five slots** plus `mcq_options[].content`, recursing into parts — **broader than the exporter**.
5. Remap only colliding ids; keep bundle ids otherwise. This is the one place bundle ids survive.
6. INSERT course with `created_at`/`updated_at` = `now` (never the bundle's), `schema_version ?? 1`, and `is_sample` honoured from the bundle.
7. `course_level_def`, then `difficulty_level`, then any missing `question_type` into the **global** table (⚠ this permanently adds types for every course).
8. `getOrCreateTag` for each declared tag, then insert `action_required` if absent — the invariant that `action_required` always resolves after an import.
9. Nodes pre-order, each with a **fresh `newId("node")`**, `ctx.nodeMap` translating the bundle's ids, and ⚠ **`code` never touched** — which is exactly why the skill insists on codes.
10. Questions via `insertQuestion`, recursive.

`insertQuestion` order, and its three traps:
- register the new id in `ctx.questionMap` **before** anything else — ⚠ so a part listed before its parent silently gets `parent_question_id = null`. **Fix: insert parents before children regardless of array order.**
- source rows come from a per-run memo keyed on `JSON.stringify(question.source)` — ⚠ so two questions from the same paper with different `original_question_no` get two `source` rows. Also, `insertSourceIfNeeded` matches on `(name, year, institution)` and the **first** question's `original_question_no` becomes the stored value for the whole triple. **Fix: key the memo on the full object and store `original_question_no` per row.**
- question values are passed through **unvalidated** — a bundle omitting `created_at`/`updated_at` writes `null` into `NOT NULL` columns. **Add defaults.**
- classifications are inserted without awaiting, so they race; an unknown node id passes through as a dangling FK. **Fix both.**

`getOrCreateTag` vs `getAllowedTagId`: course-level tags use the first (creates); a question's `tags[]` use the second, which **throws** `` `Tag '${name}' is not in this course's allowed tag list.` `` That throw *is* the enforcement of "never invent tags".

## 9.6 JSON import — `importJson(courseId, data)`

Used by the `.qb`? No — used by the **raw JSON** path and by a `.qbx` after `Import.tsx` has already unpacked it.

**Course identity guard**, first, before anything:
- `data.course_id` present and different → if `data.course_name` matches the target course's name case-insensitively, push a job **warning**; if it differs, **throw** `This file is for course '<x>' (id '<i>'), not '<y>' (id '<j>').`; if there is no `course_name`, **throw** advising the user to add one.
- ⚠ The warning text explains the whole id-remapping design: *"Course and node ids are regenerated when a course is re-imported, so the file was matched by course name and node codes instead."*

Then it builds `validTypeKeys`, `validTags`, `validDifficulties`, `validNodeIds`, `codeToNodeId`, `pathToNodeId` (`"Parent / Child"`), `nameToNodeIds`, and loops the questions.

**ERRORS** (any one ⇒ rejected, only an audit row written):

| condition | message |
|---|---|
| unknown `type_key` | `` `Unknown question type '${k}'. Valid types: …` `` |
| a tag outside `validTags` | `` `Tags not allowed for this course: ${bad}. Valid tags: ${good}` `` |
| invalid difficulty | `` `Invalid difficulty level ${d}. Valid: ${good}` `` |
| unresolvable node | `` `Unknown node(s): ${bad}. Every node must be a valid node_id, node code, node name or full node path from the course's import-schema.json.` `` |
| empty body | `"Question has no body content blocks"` |

**Node resolution**, per reference, in order: in `validNodeIds` → in `codeToNodeId` → in `pathToNodeId` → unique `nameToNodeIds` entry. An ambiguous name yields `` `${ref} (matches ${n} nodes — use a full path)` ``. References are taken from the **first non-empty** of `node_codes`, `node_names`, `node_ids`. Targets are deduped, the first is `is_primary = 1`. Any remap produces the warning `` `Classified using stable reference(s) (…) — node ids were regenerated when this course was re-imported.` ``

**WARNINGS** (never block): per-part or per-question `"No marking guide, answer, or solution provided for this question"` / `"… — only answer/solution"` / `"No answer or solution provided for part a"` / `"No marking guide (marking_criteria) provided for part a"`.

**Audit row** for every question, approved or rejected: the full proposed JSON, `confidence = q.classification_confidence ?? "medium"`, `resolution = "approved" | "rejected"`, `final_question_id` never set.

**Write order for an accepted question**: a `source` row if `q.source.name` (⚠ **a fresh row per question** — no dedupe); the `question` row; then one batched `runMany` of classifications, tags and blocks for all five slots; then `mcq_options` (⚠ only `content` and `is_correct` are read — a `position` in the file is ignored, array order wins); then `finalizeAssetsForStatements`; then recurse into `parts`, which **inherit the type** and get **no** classification, tags, options or source.

Returns `{ import_job_id, imported_count, error_count, results, warnings }` with `results` **index-aligned** to the input array.

---

# 10. Paper generation — the browser-side pipeline

There is no server involved. The whole pipeline runs on the user's machine when they press Generate.

## 10.1 `lib/examLayout.ts` — the HSC paper plan

```ts
const EXAM = {
  page:   { widthPt: 595.28, heightPt: 841.89 },                       // A4
  margin: { top: 56.7, bottom: 62, left: 56.7, right: 56.7, marks: 32 },
  font:   { family: "Times New Roman", bodyPt: 12, smallPt: 10,
            titlePt: 14, coverTitlePt: 16, lineHeight: 1.35 },
  minutesPerMark: 1.8,        // "~1.8 min/mark for a 100-mark, 3-hour paper"
  defaultReadingMinutes: 10,
  certificateLine: "HIGHER SCHOOL CERTIFICATE EXAMINATION",
};
```

| function | behaviour |
|---|---|
| `defaultSectionTitle(i, custom)` | trimmed custom, else `` `Section ${toRoman(i + 1)}` `` |
| `minutesForMarks(marks)` | `0` for ≤ 0; else `raw = marks * 1.8`; `raw < 15 ? max(5, round(raw/5)*5) : round(raw/5)*5` |
| `formatDurationMinutes(m)` | `"N minutes"` under 60; `"1 hour"` / `"N hours"` on the hour; else `"1 hour and 20 minutes"` |
| `formatPageNumber(p)` | `` `– ${p} –` `` (en dashes) |
| `formatQuestionRange(a, b)` | `"Question N"` when equal, else `` `Questions ${a}–${b}` `` |
| `isMcOptionLine(text)` | `/^\([A-Da-d]\)\s/` on the trimmed text — ⚠ **only A–D**, so a fifth option keeps its `(E)` prefix in both exporters. Extend to `/^\([A-Z]\)\s/` in the rewrite |
| `formatMcOption(text)` | `"(A) foo"` → `"A. foo"` |

`buildExamPaperPlan({ title, courseName, achievedMarks, sections, examDate = new Date() })` → `{ subjectLine: courseName, paperTitle: title, totalMarks: achievedMarks, totalQuestions, readingMinutes: 10, workingMinutes: minutesForMarks(achievedMarks), examDate, sections }`. The date is formatted `toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })`. Per section: `{ title, marks: round(sum*100)/100, questionStart, questionEnd, minutesAllow }` with running global question numbers. ⚠ Empty sections are skipped but still consume a roman numeral. ⚠ `totalMarks` is the **achieved** marks, not the plan's section sum.

`generalInstructionsLines(plan)` — 8 lines, verbatim:

```
"General Instructions"
""
`Reading time – ${readingMinutes} minutes`
`Working time – ${formatDurationMinutes(workingMinutes)}`
"Write using black pen"
"Draw diagrams using pencil"
"Approved calculators may be used unless stated otherwise"
`Total marks – ${totalMarks}`
```

`sectionOverviewLines(sec)` → `` `${sec.title} – ${sec.marks} marks` ``, `""`, `` `Attempt ${formatQuestionRange(start, end)}` ``, `` `Allow about ${formatDurationMinutes(sec.minutesAllow)} for this section` ``.
`sectionOpeningLines(sec)` → `[title, "N marks", "", Attempt…, Allow about…]`.

## 10.2 `lib/resolvers.ts` — turning blocks into pixels

```ts
IMAGE_TYPES = new Set(["image", "diagram", "graph"]);
inlineMathImageId(blockId, index) = `${blockId}:inline-math:${index}`
```

- `blobPixelSize(blob)` — object URL + `new Image()`; `onerror` → `null`; always revokes.
- `svgToPng(blob)` — canvas sized `naturalWidth || 96`; rejects `"svg load failed"` / `"canvas toBlob failed"`.
- `resolveImages(blocks)` — filters to `IMAGE_TYPES`, runs a **4-worker pool** (`Math.min(4, jobs.length)`), reads `content.asset_path` from IndexedDB, rasterises SVG, falls back to **96×96** when the pixel probe fails, keys by `block.block_id`. Missing blobs are skipped silently so the renderer prints `[missing image: …]`.
- `resolveEquations(blocks)` — for `equation` blocks renders at `heightPx = 27` with width `round((w/h) * 27)`; for every **other** block type harvests text (`text`/`heading` → `content.text`; `table` → all columns plus every cell via `tableRows`; `list` → all items) and renders each `$…$` inline at `heightPx = 22`, keyed by `inlineMathImageId`. The `data` buffer is **shared by reference** with the equation cache.
- ⚠ Neither traverses `mcq_options[].content` or part nesting — callers flatten first. ⚠ Neither caches across generations.

## 10.3 `lib/equations.ts` — LaTeX to PNG

`renderLatexPng(latex, display = true): Promise<RenderedEquation | null>`, where `RenderedEquation = { data, width, height }`.

- Cache key `` `${display ? "display" : "inline"}:${latex}` ``; a hit deletes and re-`set`s the key to refresh insertion order (small LRU) and returns the same promise.
- **The stored promise resolves `null` after 15 s.** The comment: *"DOM-to-image can remain pending indefinitely in some browser/font states… Equation rendering is optional in exports, so don't let it block the whole document generation forever."*
- Uncached path: an off-screen `holder` div (`position: fixed; left: -99999px`), `katex.render(latex, wrap, { throwOnError: false, displayMode: display })`, await a memoised `document.fonts.ready`, measure `getBoundingClientRect()` rounded up, `toBlob(wrap, { pixelRatio: 2 })`. `catch → null`, `finally → holder.remove()`.
- Limits: `MAX_EQUATION_CACHE_ENTRIES = 64`, `MAX_EQUATION_CACHE_BYTES = 24 MiB`. `null` results are evicted after settle, so a timeout retries next time.
- ⚠ `width`/`height` are **CSS pixels of the DOM box**, not the PNG's pixel dimensions (the PNG is 2× both). Callers scale by aspect ratio only.

## 10.4 `lib/docx.ts` and `lib/pdf.ts`

**DOCX** (`buildDocxPaper`, `buildDocxSolutions`, `collectImages`). Constants `GRAY = "6B6B64"`, `RULE_COLOR = "999999"`, A4 `8.27 × 11.69` in, `MARGIN_IN = 0.75`, usable text width **6.5 in**, marks right tab at `7.05` in, default style Times New Roman 12 pt, numbering configs `listNumber` (`%1.`) and `listBullet` (`•`), a single section with a centred `"Made with Quaestio"` footer, and `Packer.toBlob` with MIME `application/vnd.openxmlformats-officedocument.wordprocessingml.document`.

⚠ **DOCX renders `heading` exactly like `text`** — no bold, no size change. The PDF is the only format that honours headings. **Fix during the rewrite.**

Images: `targetIn = Math.min(4.5, 6.5 - indentIn)`, `maxHeightIn = 4.5`, uniform `scale = min(targetIn*96/widthPx, maxHeightIn*96/heightPx)` floored at 1 px, centred, caption as a separate centred italic 9 pt grey paragraph. Tables: `colWidthTwips = round(inches(widthIn) / max(1, columns.length))`, header fill `F1F1EE`, all cells centred, `verticalAlign: "center"`, `layout: "fixed"`, all six borders `SINGLE` size 4, short rows padded and extra cells dropped. `answer_area`: that many empty paragraphs each with `spacing.after = 14*20` and a `SINGLE` size 6 bottom border in `RULE_COLOR`.

**PDF** (`buildPdfPaper`, `buildPdfSolutions`). Geometry `PAGE_W 595.28`, `PAGE_H 841.89`, `MARGIN_L/R/T 56.7`, `MARGIN_B 62`, `MARKS_COL 32`, `BODY_W 449.88`, `TOP 785.19`, `BOTTOM 82`, `FOOTER_Y 58`, `LINE_H(size) = size * 1.35`. Colours `BLACK rgb(0,0,0)`, `GRAY rgb(0.42,0.42,0.39)`, `BORDER rgb(0.6,0.6,0.6)`, `HR rgb(0.8,0.8,0.8)`, `HEADER_BG rgb(0.945,0.945,0.933)`.

Fonts: Noto Serif Regular/Bold/Italic, `{ subset: true }`, registered through `@pdf-lib/fontkit`. ⚠ Not Times New Roman, so the DOCX and PDF papers differ typographically despite both claiming `EXAM.font.family`. `pdfSafeText` maintains a per-font `WeakMap<PDFFont, Set<number>>` charset cache and substitutes `√`→`"sqrt "`, `−`→`"-"`, `→`→`"->"`, else `` `[U+XXXX]` ``.

The `Writer` class: `embeddedImages: WeakMap<Uint8Array, Map<mime, Promise<PDFImage>>>` so identical bytes embed once. ⚠ A documented ordering bug — field initialisers run before the constructor body, so `this.page` is assigned inside the constructor; preserve the fix, not the bug.

Methods the UI relies on for correct output: `newPage()` (footer, page number, push history, `y = TOP`), `drawPageFooter()` (`– N –` centred plus `"Made with Quaestio"` left at `smallPt` grey), `drawQuestionContinuation(qn, fromPage, toPage)` (bold `smallPt` `"Question N Continues on Page M"` centred at `FOOTER_Y + 12` on every page in `[fromPage, toPage)`), `ensure(space)`, `drawMarks(marks, lineY)` (right margin at `x = MARGIN_L + BODY_W + MARKS_COL - width - 2`; comment: *"Marks sit in the right-hand margin (NESA Principle 12.)"*), `finishBox(startY, pad = 10)`, `gridRow`, `richText`, `fitImage`, `wrapText`.

⚠ Two PDF defects worth fixing in the rewrite: **image captions are never rendered in the PDF** (DOCX keeps them), and `gridRow`'s `align === "left"` branch is dead because every cell is centred.

`estimateBlockHeight` (module-private) pre-estimates to decide page breaks: equation `0.32*72 + 4 = 27.04`, missing image `LINE_H(10) = 13.5`, page break `TOP - BOTTOM + 1 = 704.2`, everything else the wrapped line count × `LINE_H(size)`.

**The MCQ option bug, which the UI must not repeat.** Both exporters synthesise a `list` block per question whose items are `` `(${letter}) ${option.content.map(b => String(b.content.text ?? b.content.latex ?? "")).join(" ")}` ``. ⚠ That reads **only `text` and `latex`**, so an image-only option renders as the literal string `"undefined"` and is silently lost — this is exactly how four Q16 option images were lost from the 2025 HSC conversion. And `collectImages` does **not** scan `mcq_options[].content` at all, so an image-only option never even resolves.

**During the rewrite, fix this properly:** render each option's blocks through the normal block renderer (so images, equations, tables and lists inside options survive), and include `mcq_options[].content` in the image/equation collection pass.

## 10.5 `lib/tests.ts` — output plumbing

```ts
storeTestFiles(testId, { test, preview })
ensureTestFileUrl(testId, which): Promise<string | null>
testFileUrlSync(testId, which): string | null      // synchronous cache peek
downloadTestFile(testId, which, format)           // "test-paper.docx" | "test-solutions.pdf" | …
storeTestSolutionFile(testId, blob)
deleteTestOutputs(testId)
buildTestOutputs(BuildOptions): Promise<{ test: Blob; preview: Blob }>
```

⚠ `storeTestFiles` registers object URLs **from the blobs it was handed**, never by re-reading IndexedDB. The comment: *"Reading them back from IndexedDB immediately after writing can race the transaction commit and yield empty download/preview links."* This is why the paper preview sometimes shows the "If it stays blank…" fallback.

`buildTestOutputs` order: `collectImages` → `onProgress({phase:"paper", questionCount})` → build the paper → `preview = test` → **unless the format is already PDF**, `onProgress({phase:"preview", …})` and render a second PDF. So a DOCX paper costs a DOCX plus a PDF; a PDF paper's preview *is* the paper. `timed(phase, run)` brackets each step with `performance.mark/measure` named `test-generation:${testId}:${phase}` and guarantees the closing mark in `finally`.

⚠ `sectionResults` is accepted in `BuildOptions` and never used — drop it.

## 10.6 `generateTest` — the orchestration the UI drives

1. Course lookup; throws `"Course not found"`.
2. With no `sections`, requires `target_marks > 0` else throws `"target_marks must be greater than 0"` and synthesises one section. Otherwise labels are `sec.name ?? (single ? null : "Section " + "A"|"B"|…)` and displays are `sec.name ?? "Section N"`.
3. `testId = newId("test")`; `onProgress({ phase: "selecting" })`; `selectionDeadline = performance.now() + (payload.selectionTimeoutMs ?? Infinity)`.
4. Sections resolve **in parallel**. Per section: throw `` `Section ${i}: set a marks target.` `` when `marks` is null; query matching marks (approved, root-level, `marks IS NOT NULL`); **shuffle rows in memory** (Fisher-Yates); `selectQuestionIndexes(marksArray, Math.max(1, Math.round(target*100)), { deadline })`; `hydrateQuestions(pickedIds)`. Zero questions → `` `No approved questions match ${display}. Try widening the topics/type filters, or set marks on matching questions.` `` Everything empty → `"No questions were selected for this test."`
5. `title = payload.title?.trim() || `${config.name} — Practice Test``; `format = payload.format ?? "docx"`; `achieved = round2(sum)`.
6. `buildTestOutputs(...)`.
7. `onProgress({ phase: "saving", questionCount })` → `storeTestFiles` → `ensureTestFileUrl` for both.
8. INSERT `generated_test` with `test_file_path = ${testId}-test.${ext}`, `solutions_file_path = ""`, `preview_file_path = ${testId}-preview.pdf` (**always `.pdf`**), `filter_json` = the payload **plus** `generated_sections: [{ label, question_ids }]`, `question_ids_json`, `target_marks = round2(target)`.
9. Return `GeneratedTestMeta` with a freshly computed `created_at: nowUtc()`.

`hydrateQuestions(ids)` returns `[]` for empty input, batches `IN (…)` at **400 ids per query**, fetches roots plus one level of children (`ORDER BY parent_question_id, part_label COLLATE NOCASE ASC, question_id`), then six parallel queries (blocks, classifications, tags, assets, mcq options, sources), and re-synthesises option block ids as `` `option-${question_id}-${position}-${i}` ``. It throws `` `Question not found: ${id}` `` for any missing id.

**Progress percentages** — the UI must use exactly these:

```
fixed:  { selecting: 4, hydrating: 12, saving: 96 }
paper:   22 + (completedQuestions / questionCount) * 56
preview: 78 + (completedQuestions / questionCount) * 17
```

⚠ Guard `questionCount > 0` before dividing. The existing code collapses the fraction when `questionCount` is falsy, which pins the bar at 22 % / 78 % for the rest of the run. Fix it.

**Runtime learning.** `estimatedSeconds = max(20, round(learnedSecondsPerQuestion ? count * learned : 15 + count * perQuestion))` where `perQuestion = format === "pdf" ? 5 : 4`. After success, `observed = max(1, elapsed / max(1, questionCount))`, then EWMA `previous * 0.5 + observed * 0.5`, stored in `quaestio:test-generation-seconds-per-question:${format}` inside a `try/catch` ("Private browsing or storage restrictions should not interrupt exports."). `selectionTimeoutMs = ceil(estimatedSeconds * 1.25 * 1000)`.

**Phase messages**, rotated by `InkLoader` every 4 s:

| phase | messages |
|---|---|
| `selecting` | `"Finding the closest mark combination…"` · `"Checking question marks against your target…"` · `"Comparing possible question combinations…"` · `"Choosing the best match for your requested marks…"` |
| `hydrating` | `"Loading the selected questions…"` · `"Gathering question text and diagrams…"` · `"Collecting answer choices and mark details…"` · `"Preparing the selected questions for your paper…"` |
| `paper` | `` `Building the ${FORMAT} paper…` `` · `"Laying out questions and answer spaces…"` · `"Formatting headings, marks, and page breaks…"` · `"Rendering the paper pages…"` |
| `preview` | `"Preparing the in-app PDF preview…"` · `"Opening the generated paper preview…"` · `"Finishing the preview document…"` |
| `saving` | `"Saving the generated paper…"` · `"Saving the paper and preview to your question bank…"` · `"Finishing up and saving your test…"`` |

## 10.7 The blocking overlay

Rendered while a run is owned by the current page **or** a background run exists for this course:

```
fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm
role="status" aria-live="polite" aria-busy="true"
  <InkLoader intervalMs={4000} progress={…} markClassName="text-[2.8rem]" messages={…} />
```

---

# 11. The React shell

## 11.1 `App.tsx` — routing

Routes, all inside `<Route element={<Layout/>}>`, all hash routes:

| path | component |
|---|---|
| index (`/`) | `Dashboard` |
| `/browse` | `Browser` |
| `/practice` | `Practice` |
| `/quiz` | `Quiz` |
| `/test-generator` | `TestGenerator` |
| `/questions/:questionId` | `QuestionDetail` |
| `/import` | `Import` |
| `/course-settings` | `CourseSettings` |
| `/settings` | `Settings` |

⚠ **With no active course, `Layout` renders `<CourseOnboarding/>` instead of `<Outlet/>` for every route except `/`.** That makes each page's own `"Select a course to …"` empty state unreachable. This is deliberate — it prevents a wall of half-working screens on first run — but it must be preserved, and every page must still *have* its guard for the moment a course is deleted mid-session.

## 11.2 `components/Layout.tsx` — the app shell

Full class strings and structure are in the notes above; the behaviours the UI must implement:

1. **Nav groups.** `NAV_GROUPS` with the comment: *"Grouped so the nav says what the app is for rather than listing eight pages. Practice leads Study because practising is the thing a student came to do; everything else is a means to that."* Group `Study` → `/` "Overview" (`end`), `/practice` "Practice", `/quiz` "Quiz", `/test-generator` "Test Generator". Group `Question bank` → `/browse` "Browse", `/import` "Import". Group `Course` → `/course-settings` "Course settings", `/settings` "Settings".
   `linkBase = "rounded-md px-2.5 py-2 text-[13px] font-medium text-muted-foreground transition hover:bg-surface hover:text-foreground"`; `linkActive = "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"`.

2. **Desktop header.** Wordmark `Quaestio<span className="text-accent-foreground">.</span>`, `CourseSelector` (hidden below `lg`), the grouped nav (`aria-label="Main"`, `lg:flex`), `SaveStatusIndicator`, the theme toggle, and the mobile Menu button. ⚠ The theme toggle's icon shows the **current** theme while its `aria-label` promises the **next** — keep the aria-label promise, and fix the icon to match.

3. **Mobile menu as a proper disclosure.** On open, move focus to the first focusable in the panel; `Escape` closes and returns focus to the Menu button; close on `location.pathname` change. ⚠ It is **not** a focus trap — Tab walks out into the page behind. **Implement a real trap** (cycle within the panel, or render the panel as a `Modal`). ⚠ The panel is conditionally mounted, which destroys the in-menu `CourseSelector`'s state on close; render it persistently and hide it with CSS, or move it outside the panel.

4. **Global loading bar.** Driven by `useIsFetching() > 0`, which is *global* — any in-flight query anywhere animates it. ⚠ That includes background refetches the user did not trigger. Gate it on `isFetching && !isFetchingPrevious` or on mutations plus the current route's queries.

5. **Generation strip.** Sticky below the header (`top-14 z-30`), `role="status" aria-live="polite"`, only when a task exists. Left: a `Link to="/test-generator"` whose content branches on `status` — running: pulsing `size-2 rounded-full bg-accent-foreground` + `"Generating your test…"`; complete: `Check` + `"Your test is ready"`; failed: `bg-destructive` dot + `"Test generation failed"` — and a `<p className="truncate text-xs text-muted-foreground">` reading the phase label plus `` ` · ${completedQuestions}/${questionCount} questions` `` when running, `` `${result?.title ?? "Generated test"} · Open Test Generator to download or preview` `` when complete, and the error when failed. A progress bar while running (`hidden w-40 sm:block`, 1.5-unit track, `bg-accent-foreground` fill). A dismiss ghost icon button when not running, `aria-label="Dismiss test generation notice"`. ⚠ The task store is global and course-agnostic; scope the strip to `task.courseId === courseId`.

6. **Body grid.** `mx-auto grid max-w-[1500px] gap-6 px-4 py-6 sm:px-5` plus `lg:grid-cols-[238px_minmax(0,1fr)]` when a course is active. `RecentQuestionsSidebar variant="rail"` in the 238 px column, `<main className="min-w-0">` holding `{!courseId && location.pathname !== "/" ? <CourseOnboarding/> : <Outlet/>}` and then `RecentQuestionsSidebar variant="inline"`. ⚠ Both sidebar variants mount simultaneously at `lg`, duplicating DOM and subscriptions — render one and switch it with CSS.

7. **Missing, and worth adding in the rewrite:** a skip link, focus moved to the new `<h1>` on navigation, an `aria-live` page announcement, and scroll reset on navigation.

## 11.3 `components/CourseOnboarding.tsx` — first-run

Four cards in the order most people need them: **Try a sample course** (default button), **Bring in questions** (a `.qb` bundle), **Create a course**, and a **disabled** "Start from study material". The fourth is shown disabled rather than hidden, with copy: *"Not built yet. When it arrives nothing leaves this device, drafts need your approval before they enter the bank, and you will be told what happens to the material you paste in."*

Layout: a hero with two blurred radial blobs, the badge `"Your question workspace"`, the headline `"Make room for better questions."` with the second clause in `--primary`, the paragraph `"Pick a starting point. Everything stays on this device, and you can export a backup whenever you want one."`, and CTAs `"Try the sample course"` (with a trailing `ArrowRight`) and `"Set up my own course"`. The right-hand mock card is headed `"A fresh start"` / `"Your study space"` with the three literal rows `["01","Get some questions in","Sample, import, or your own"]`, `["02","Practise one properly","Attempt it, then check yourself"]`, `["03","Come back to it later","The queue decides when"]`, and a `"Local to this device"` footer with a `bg-success` dot.

Then the four option cards with their exact title / text / detail / cta, then a three-up feature grid: `"Keep things organised"` / `"Group questions by course, topic, and learning goal."`; `"Build your question bank"` / `"Bring existing questions in or create new ones."`; `"Learn actively"` / `"Practise one question properly, then let the queue bring it back."`

⚠ `importBundle` has **no outer catch**, so a throw from `confirm()` or `adopt()` is an unhandled rejection with no visible message. ⚠ Failures are joined with `\n` into a `<p>` with no `whitespace-pre-line`, so multiple failures run together. Fix both.

## 11.4 `components/CreateCourseForm.tsx`

Name plus one comma-separated hierarchy input (default `"Topic, Subtopic, Dot Point"`). `hierarchy = levelsInput.split(",").map(trim).filter(Boolean).map((label, i) => ({ level_index: i, label, required: i === 0 }))`. Labels `"New course"`, `"Course name"`, `"Hierarchy levels"`; placeholders `"Mathematics Extension 1"` and `"Module, Outcome, Learning Objective"`; buttons `"Creating…"` / `"Create"` and a ghost `"Cancel"`. ⚠ `onDone` is called for both Cancel and success, so callers cannot distinguish them; change it to `onDone(reason: "created" | "cancelled")`.

## 11.5 `components/CourseSelector.tsx`

A `role="combobox"` trigger with `aria-haspopup="listbox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`, `aria-autocomplete="none"`, `aria-label="Course"`, a `size-2 rounded-full bg-primary` dot (⚠ always primary, even with no course), the active course name or `"Select course"`, and a `ChevronDown`. Alongside it: a ghost `"New course"` and a ghost `"Import course"` (`title="Import a course from a .qb bundle exported on another device"`).

Keyboard handling lives in one place on the trigger, with the comment: *"Single place that decides what the arrow/enter keys mean. Focus never leaves the trigger while the list is open, so the cursor is virtual."* Tab closes; closed + ArrowDown/ArrowUp opens; open + ArrowDown/ArrowUp cycles with modulo; Home/End jump; Enter/Space selects; Escape closes and refocuses. ⚠ The closed-state ArrowUp branch is identical to ArrowDown, so ArrowUp selects the current course. Fix it. There is no typeahead and no Enter-to-create.

The list is `role="listbox"` with `role="option"` rows carrying `aria-selected` and the `"sample"` chip for `c.is_sample`. ⚠ Options are `<div>`s, so the visual cursor (`activeIndex`) and `aria-selected` can disagree. The empty state is a `<p>` inside a `listbox`, which is invalid ARIA — use `role="presentation"` or a `role="status"` outside it.

Effects: auto-adopt the first course when none is active (⚠ silent localStorage write on any refetch); dismiss on outside `mousedown` and on `focusout` leaving the popup; focus the first control in the create form when it opens; auto-clear `importNotice` after 5 s (errors never auto-dismiss).

⚠ `handleImportFiles` has no outer catch; if every file fails the popup stays open; `switchCourse` is a no-op when the last imported course is already active so `navigate("/")` never runs; and the notice says `` `Imported ${n} course(s): …` `` with a literal `(s)` and straight quotes — make it pluralise and use the app's typography like `CourseOnboarding` does.

## 11.6 `components/RecentQuestionsSidebar.tsx`

`variant: "rail" | "inline"`. Query `["recent-questions", courseId]` → `api.recentQuestions(courseId, 12)`, **no polling — refresh by invalidation only**. Heading `"Recent activity"` with the count. Bodies: `"Select a course to see activity."`, `"Nothing yet — questions you practise or open will show up here."`, or links to `/questions/:id` showing the status dot (`bg-success` only when `attemptRank(label) >= attemptRank("reviewed")`, i.e. only `reviewed` counts as done), the `attemptStatusLabel`, `formatQuestionType` pushed right, and a `line-clamp-2` snippet through `MathText` — or the literal `"(no text)"`. The inline variant is a disclosure button with `aria-expanded` / `aria-controls="recent-activity-inline"` and a `ChevronDown` that rotates.

---

---

# 12. The component library

## 12.1 `components/system.tsx` — the shared primitives

Exports in file order: `PageHeader`, `Panel`, `LoadingState`, `InkLoader`, `PanelHead`, `Meta`, `Field`, `Stat`, `MiniRows`, `Bars`, `Pagination`.

**`PageHeader({ eyebrow, title, description?, actions? })`**

```html
<div class="mb-6 flex flex-col gap-4 rounded-2xl border border-border/80 bg-card/65 p-5 shadow-sm shadow-foreground/[0.025] backdrop-blur sm:p-6 md:flex-row md:items-end md:justify-between">
  <div class="min-w-0">
    <p class="label mb-2 inline-flex items-center gap-2"><span class="size-1.5 rounded-full bg-accent-foreground" />{eyebrow}</p>
    <h1 class="font-display text-3xl font-semibold leading-tight tracking-tight sm:text-[34px]">{title}</h1>
    <p class="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
  </div>
  <div class="flex w-full shrink-0 flex-wrap gap-2 md:w-auto md:justify-end">{actions}</div>
</div>
```

⚠ The eyebrow dot is decorative and must be `aria-hidden="true"`.

**`Panel({ children, className })`** → `<section className={cn("panel", className)}>`. Several components hardcode `className="panel …"` instead of using it; both are fine.

**`PanelHead({ title, note?, action? })`**

```html
<div class="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
  <div>
    <h2 class="font-display text-lg font-semibold">{title}</h2>
    <p class="mt-0.5 text-xs text-muted-foreground">{note}</p>   <!-- when note -->
  </div>
  {action}
</div>
```

**`Meta({ children, className })`** → `<span class="font-mono text-[10px] uppercase text-muted-foreground">`. It renders a `<span>`, so it must live inside a block element.

**`Field({ label, children })`** → `<label class="block"><span class="label mb-1.5 block">{label}</span>{children}</label>`. ⚠ Implicit labelling with no `htmlFor`/`id`, so any second control inside would be double-named. Where a page already has a real `<label htmlFor>` (the ladder minutes input, the Quiz marks input) prefer that.

**`Stat({ title, children })`** → `<Panel className="p-4"><p class="label">{title}</p><div class="mt-2">{children}</div></Panel>`.

**`MiniRows({ rows })`** — rows are `[label, value]` string pairs: `flex justify-between text-xs`, label `text-muted-foreground capitalize`, value `font-mono`. ⚠ The React `key` is the **label**, so duplicate labels collapse — key by index in the rewrite.

**`Bars({ bars })`** — `bars` is `[label, number]` where the number is a percentage: the label is `capitalize`, the value renders `value.toFixed(2)%` (so `62.50%`), and the fill is `Math.max(0, Math.min(100, value))` percent of a `h-1.5 rounded-full bg-secondary` track in `bg-accent-foreground`. Callers pre-round to 2 dp.

**`LoadingState({ label = "Quaestio is pondering…", className })`** → `InkLoader` with a single message.

**`InkLoader({ messages = ["Quaestio is pondering…"], className?, intervalMs = 900, progress?, markClassName? })`**

Rotates `messages` every `intervalMs`. Markup:

```html
<div class="ink-loader" role="status" aria-live="polite">
  <span class="ink-loader-mark font-display" aria-hidden="true">Q</span>
  <div class="ink-stream" aria-hidden="true" style="--ink-progress: 42%">   <!-- when progress != null -->
    <span class="ink-stream-progress" />
  </div>
  <!-- or, when progress == null: -->
  <div class="ink-stream" aria-hidden="true"><span class="ink-stream-base"/><span class="ink-stream-current"/></div>
  <span class="ink-loader-progress">About 42%</span>                    <!-- only when progress != null -->
  <p class="label ink-loader-message">{messages[index % messages.length]}</p>
</div>
```

⚠ An **empty `messages` array makes the index `NaN` and renders nothing**. Guard it: if `messages.length === 0`, fall back to the default single message. ⚠ Because the interval ticks every 900 ms inside an `aria-live="polite"` region, a screen reader announces constantly — in the rewrite, mark the message `aria-hidden` and expose one static string, or drop to a single message during long runs.

**`Pagination({ page, totalPages, onPrev, onNext })`** → `"← Previous"`, `"${page} of ${totalPages}"`, `"Next →"`, with the outer buttons disabled at the bounds.

## 12.2 `components/ui/*`

**`button.tsx`** — `Button` is `React.forwardRef<HTMLButtonElement, ButtonProps>` with `displayName = "Button"`, `asChild` via `@radix-ui/react-slot`. `cva` variants `default | destructive | outline | secondary | ghost | link`; sizes `default(h-9 px-4 py-2) | sm(h-8 px-3 text-xs) | lg(h-10 px-8) | icon(h-9 w-9)`. **Every size carries `[&_svg]:size-4 [&_svg]:shrink-0`.** Disabled → `pointer-events-none opacity-50 cursor-not-allowed`. `buttonVariants` is also exported.

⚠ `Button` defaults to `type="button"` only if you set it. Many call sites omit `type` inside forms, which makes them submit buttons. Set the default in the component.

**`input.tsx`** — `Input` forwardRef, base `flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base … focus-visible:ring-1 focus-visible:ring-ring`.

**`textarea.tsx`, `label.tsx`** — as expected; `Label` is a thin wrapper over Radix `Label`.

**`checkbox.tsx`** — Radix `CheckboxRoot` `h-4 w-4 rounded-sm border border-primary` + `data-[state=checked]:bg-primary` with a `<Check className="h-4 w-4" />` indicator.

**`switch.tsx`** — Radix `Switch`, matching the Checkbox shape.

**`select.tsx`** — Radix `Select` with `SelectTrigger` / `SelectValue` / `SelectContent` / `SelectItem`.

**`tabs.tsx`** — Radix `Tabs` with `TabsList` / `TabsTrigger` / `TabsContent`.

**`modal.tsx`** — the most important primitive in the app.

```ts
Modal({ open, onClose, label, description?, children?, className?,
        header?, footer?, headerNote?, initialFocusRef?,
        onCloseDisabled = false, role = "dialog" })
```

Behaviours, all of which matter:
- portals to `document.body`;
- backdrop click closes; `aria-modal="true"`; the accessible name comes from `label` via a generated title id;
- focus moves to `initialFocusRef ?? first focusable ?? the panel` on a `setTimeout(…, 0)`;
- `Escape` closes (capture-phase keydown) unless `onCloseDisabled`;
- `Tab`/`Shift+Tab` are **trapped**; `FOCUSABLE_SELECTOR = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"`, filtered by `el.offsetParent !== null || el === document.activeElement`;
- `document.body.style.overflow` is set to `"hidden"` and restored;
- the previously focused element is refocused on close.

```ts
useConfirm(): (options: { title; description?; confirmLabel = "Confirm";
                          cancelLabel = "Cancel"; destructive? }) => Promise<boolean>
```

Renders one shared `Modal className="max-w-md"`. Throws `"useConfirm must be used inside a <ConfirmProvider>"` outside its provider. The description is rendered `sr-only` **and** visibly (`px-5 py-4 text-sm text-muted-foreground`) so it is both announced and read.

## 12.3 `components/QuestionReader.tsx` — the block renderer

Exports `BlockList`, `SourceLine`, `QuestionReader`, `AnswerReveal`, `QuestionSurface`, `MarkingGuideTable`.

**`Block` — per-type rendering.** ⚠ Note which stored fields are ignored.

| `block_type` | output |
|---|---|
| `text` | `<p class="text-[15px] leading-7"><MathText/></p>` |
| `heading` | `<h4 class="font-display mt-2 font-semibold"><MathText/></h4>` — ⚠ **always `<h4>`; `content.level` is ignored.** In the rewrite, honour the level and map it to `<h3>`–`<h6>` |
| `equation` | `content.display ? <BlockMath/> : <InlineMath/>` via `normalizeEquationLatex` |
| `image` / `diagram` / `graph` | `<figure class="my-2">` + `<img class="max-w-full rounded-md border border-border">` + optional `<figcaption class="mt-1 text-[13px] text-muted-foreground">`. **The three types render identically** |
| `table` | `<div class="my-2 overflow-x-auto"><table class="min-w-full border border-border text-sm">`, `<th class="border border-border bg-muted/60 px-2 py-1 text-left font-medium">`, every cell through `MathText` |
| `list` | `<ol|ul class="pl-6 list-decimal|list-disc space-y-1">` |
| `code` | `<pre class="overflow-x-auto rounded-md border border-border bg-muted/60 p-3 font-mono text-[13px] leading-relaxed"><code>` — **raw, no `MathText`** |
| `answer_area` | `<div class="my-2 rounded-md border border-dashed border-border" style="height: {(lines ?? 3) * 1.75}rem" />` |
| `page_break` | `<hr class="my-4 border-border" />` — an `<hr>`, not a real page break in the DOM |
| unknown | `null`, silently |

**`BlockList({ blocks, interactiveChoices?, selectedChoice?, onSelectChoice?, submitted?, correctChoice? })`** — sorts by `position`, keys on `block.block_id`. When `interactiveChoices` is set and a `list` block has **at least one** item matching `/^\s*\(?[A-Z]\)?[.)]\s*/i`, it renders the button grid instead of the list:

```html
<div class="grid gap-2 sm:grid-cols-2" role="group" aria-label="Answer choices">
  <button type="button" disabled={submitted} class="flex items-start gap-3 rounded-md border-2 p-3 text-left transition-colors …">
    <span class="grid size-7 shrink-0 place-items-center rounded-full border font-mono text-xs font-semibold">A</span>
    <span class="pt-0.5"><MathText/></span>
  </button>
</div>
```

**The choice colour rule** — used identically here and in `QuestionReader`:

```ts
submitted && correct ? "border-green-600 bg-green-100 text-green-950"
: submitted && chosen  ? "border-red-600 bg-red-100 text-red-950"
: chosen               ? "border-primary bg-primary/10"
:                       "border-border hover:border-primary/60"
```

⚠ **These do not flip in dark mode** — a hard-coded Tailwind palette. In the rewrite, express them as CSS variables with light and dark values so a correct answer stays legible on a dark background. ⚠ Colour alone also carries the verdict; add a text or icon cue (`Correct answer` / `Not the answer`) so it survives greyscale.

**`SourceLine({ source })`** → `null` when there is no source, else

```
<p class="mt-4 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Source: {name} · {year} · {institution}</p>
```

⚠ `original_question_no` is **not** shown here, and the order (`name · year · institution`) differs from the QuestionDetail metadata panel (`institution · name · year · qno`). Pick one order and use it everywhere, or accept that the reader surface and the admin surface differ — but do it deliberately.

**`QuestionReader({ question, selectedChoice?, onSelectChoice?, submitted? })`** derives the correct choice:

```ts
question.mcq_options?.some(o => o.is_correct)
  ? String.fromCharCode(65 + question.mcq_options.findIndex(o => o.is_correct))
  : question.answer
      .map(b => String(b.content.text ?? "").trim().match(/\b([A-D])\b/i)?.[1]?.toUpperCase())
      .find(Boolean) ?? null
```

⚠ This exact expression is duplicated in three places (`QuestionReader`, `PracticeFlow`, `Quiz`). **Extract it into one helper.** Render order: structured MCQ options (with synthetic `block_id: practice-option-${i}-${j}`, `slot: "body"`, `position: j`), then parts as `({label}) [{marks} marks]` + body, then `SourceLine`. Structured options render each option's blocks through `BlockList`, so images and equations inside options work in the app (unlike the exporters — see §10.4).

**`AnswerReveal({ question })`** — `div.answer-reveal` with numbered sections `01 Marking guide` / `02 Answer` / `03 Worked solution`, then one `<section>` per part that has any of those three slots, headed `Part {label}` + `[{marks} marks]` with inner `<h4>` headings. Empty state: `"No marking guide, answer, or solution recorded for this question yet."` ⚠ The **hint slot is never rendered here** — hints are surfaced by `PracticeFlow` one step at a time. That is correct; keep it.

**`QuestionSurface({ question, submitted = false, footer?, selectedChoice?, onSelectChoice? })`** — the card used by Quiz and QuestionDetail: a meta strip (`formatQuestionType`, `Difficulty {n}`, `{marks} marks`, and the institution right-aligned), an `<article class="question-paper p-6 sm:p-8">` labelled `Question {original_question_no}` or the formatted type, then `{submitted && <AnswerReveal/>}`, then `{footer && <div class="border-t border-border px-5 py-4">{footer}</div>}`.

**`MarkingGuideTable({ blocks })`** — the two-column table the skill file's allocation rule exists to feed.

```ts
MARKS_PREFIX = /^(\d+(?:\.\d+)?)\s*(?:(?:-\s*|–\s*|—\s*|\bto\b\s+|\bor\b\s+|\/\s*)(\d+(?:\.\d+)?))?\s*marks?\b/i
MARKS_TRAIL  = /\s*[([](\d+(?:\.\d+)?(?:\s*[-–—/]\s*\d+(?:\.\d+)?)?)\s*marks?\s*[)\]]\s*$/i
```

`list` blocks contribute one row per item; non-empty `text` blocks contribute one row; **everything else** (equation, image, table, code, heading) renders below the table as a normal `BlockList` so nothing is lost. A range renders with an en dash (`1–2`). Headers are `Criteria` and `Marks`; an empty marks cell renders `"—"`, an empty criteria cell renders `"\u00a0"`.

## 12.4 `components/BlockEditor.tsx`

```ts
export interface EditableBlock { tempId: string; block_type: BlockType; content: Record<string, any>; }
export function emptyBlock(type: BlockType): EditableBlock
export function blocksToPayload(blocks: EditableBlock[])
  // → Array<{ block_type, content }> — drops tempId, slot and position
```

`emptyBlock` defaults are the same table as §8.2. `tempId` comes from a **module-level counter**, not React state: `` `tmp_${Date.now()}_${counter++}` ``.

The component is **stateless with respect to blocks** — every mutation calls `onChange(next)`, so the parent owns the array. Structure: `Panel` + `PanelHead(title=label, note)` + `p-4` body, with `"No content yet."` when empty. Each block is a `rounded-lg border border-border bg-surface/50 p-3` card whose header is a `Meta` with the type name plus `ArrowUp` / `ArrowDown` / `Trash2` ghost icon buttons (`title` `"Move up"`, `"Move down"`, `"Remove block"`, `h-7 w-7`). Reorder is arrow-button based — **there is no drag-and-drop anywhere in the app**.

Between blocks sits the insertion strip: `-my-1 flex h-3 items-center justify-center focus-within:h-10 hover:h-10` containing an absolutely positioned `opacity-0 group-hover:opacity-100 group-focus-within:opacity-100` row with a `Select` (`aria-label="Block type to insert ${label}"`) and an `Insert` button (`aria-label="Insert block ${label}"`). **One shared `addType` selection drives both the inter-block controls and the footer** `"Add block"` control. The footer is separated by `border-t border-border pt-3`.

`ImageBlockFields` — a dashed drop zone reading `"Click to upload an image"` (or `"Uploading…"`), a `max-h-48` preview, a `"Replace image"` label wrapping a hidden `accept="image/*"` input, plus alt-text (`"Alt text (for accessibility)"`) and caption (`"Caption (optional)"`) inputs. Uploads go through `api.uploadAsset`; failure sets `"Upload failed"` or the thrown message.

Other field editors: `AutoResizeTextarea` for `text` (sets `height` to `scrollHeight` in a layout effect); `heading` = Input + a 1–6 number input; `equation` = mono Input with placeholder `"$x^2 - 5x + 6 = 0$ or 5 × 10^3"` + a `"Display (block) equation"` checkbox + a live `BlockMath`/`InlineMath` preview with `errorColor="#b3261e"`; `table` = comma-separated columns Input + one-row-per-line rows Textarea (**a text round-trip, not a grid editor**); `list` = an `"Ordered list"` checkbox + one-item-per-line Textarea; `code` = a language Input + a mono Textarea; `answer_area` = `"Lines of space:"` number input; `page_break` = `"No fields — inserts a page break."`

⚠ Every image/diagram/graph needs an accessible name on the preview `<img>` — it uses `alt={content.alt_text ?? ""}`, so an author who skips alt text gets an unlabelled image in their own editor.

## 12.5 `components/QuestionEditor.tsx`

```ts
QuestionEditor({ config: CourseFullConfig; existing?: Question; onSaved: () => void; onCancel: () => void })
```

Layout `grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]`.

**Left column**, in order:
1. A `sm:grid-cols-3` panel: type `Select` over `config.question_types`, difficulty `Select` with a `"none"` sentinel → `null` and item labels `` `${level} — ${label}` ``, and `Marks` as `Input type="number" step="0.5"`.
2. Five `BlockEditor`s labelled **`"Question body"`, `"Hint (optional)"`, `"Answer"`, `"Solution / working"`, `"Marking criteria"`**. The hint note is: *"Shown during practice one step at a time, before the marking guide. Keep it answer-free."*
3. The MCQ panel, only when `typeKey === "multiple_choice"` — `PanelHead title="Answer choices"` with an `"Add choice"` action; each option is a `Checkbox` with `aria-label={`Mark choice ${L} as correct`}`, the label `Choice {L}{ · Correct answer}`, a `Trash2` with `aria-label={`Remove choice ${L}`}`, and a **nested `BlockEditor` labelled `Choice {L} content`**. Selecting one sets every other option's `isCorrect` to `false` in code. Empty state: `"Add answer choices for this multiple choice question."` A new MCQ starts with two empty options.
4. The parts panel — a **flat, one-level array**, append-only, no reordering. `"Add part"` appends label `String.fromCharCode(97 + n)`. Each part is a `Part label` Input, a `Marks` number Input, a `Trash2` with `aria-label={`Remove part ${label || index + 1}`}`, and **four** nested `BlockEditor`s (`Part {label} question|answer|solution|marking criteria`). **Parts have no `hint` slot.** Empty state: `"Add parts to create a multi-part question."`

⚠ **The editor's `mcq_options` payload is the source of the "option entries that are single content BLOCKS get wrapped in `text()`" bug** — an option whose content is a single block object rather than an array of blocks is silently coerced into a text block, which is how four Q16 option images were lost. The editor must require an **array**, and the import validator must reject a non-array `content`.

**Right column (280 px):**
- **Classification** — labelled `` `Classification — ${course.name} · ${hierarchy.map(l => l.label).join(" / ")}` ``, a `max-h-[32rem] overflow-y-auto rounded-md border border-border p-3 sm:p-4` scroll box of `ToggleButton`s showing `node.code` in `font-mono text-[11px]` then the name. Children render when the node is checked **or** a descendant is selected; indent `ml-3 space-y-2 border-l border-border pl-3 sm:ml-5 sm:pl-4`. ⚠ Unchecking removes every descendant. Empty state: `"No categories yet — add some under the Structure tab first."`
- **Tags** — `ToggleButton`s over `config.tags`. Empty state: `"Add tags in Course Settings first."`
- **Source metadata** — `Source name` (placeholder `"Trial Examination"`), a `grid-cols-2` of `Year` and `Original Q#`, and `Institution (optional)`.
- **Approved** `Switch` ↔ `approved` / `pending_review`, sub-copy `"Ready for practice and tests"`.
- **Delete** (only when editing) — destructive button behind `useConfirm`.

**Unsaved-changes machinery** — two layers, both required:

1. Form-level: `<form onChange={() => setDirty(true)} onClick={…}>` where the click handler marks dirty for any button that is not the submit, not inside `[data-dismiss-editor]`, and not inside `[data-editor-save]`.
2. Document-level, gated on `dirty`: a `beforeunload` handler (`preventDefault()` + `returnValue = ""`), and a **capture-phase** `click` listener that intercepts `a[href^="#/"]`, bailing on `defaultPrevented`, `button !== 0`, or any modifier key; on a hit it calls `preventDefault()` + `stopPropagation()`, stores `pendingNavigation.current = () => navigate(nextPath)`, and opens the prompt.

Floating bar (`role="status"`, `fixed bottom-4 right-4 z-50`): `"You have unsaved changes"` plus a `"Save now"` button (`"Saving…"` while saving).

Prompt: `Modal role="alertdialog" className="max-w-md" header="Unsaved changes" description="Would you like to save your changes before leaving?"` with `Cancel` / `Discard changes` / `Save and leave`.

**Save payload** — exactly:

```ts
{
  type_key, difficulty, marks: marks ? Number(marks) : null,
  node_ids: Array.from(nodeIds), tag_names: tags,
  body, hint, answer, solution, marking_criteria,          // blocksToPayload(...) each
  mcq_options: typeKey === "multiple_choice"
    ? options.map(o => ({ content: blocksToPayload(o.blocks), is_correct: o.isCorrect }))
    : [],
  parts: parts.map(p => ({ question_id: p.questionId, type_key: typeKey, part_label: p.label,
                           marks: p.marks ? Number(p.marks) : null, body, answer, solution, marking_criteria })),
  review_status,
  source_name: sourceName.trim() || null,
  source_year: sourceYear ? Number(sourceYear) : null,
  source_institution: sourceInstitution.trim() || null,
  source_original_question_no: sourceOriginalNo.trim() || null,
}
```

`createQuestion` additionally takes `course_id`. Then `onSaved()`; on error `setError(message)` with the fallback `"Failed to save question"`, and if a navigation was pending, reopen the prompt.

## 12.6 `components/FilterMenu.tsx`

```ts
ToggleButton({ enabled, onClick, right?, children })
FilterMenu(props)   // see the prop list in §14.1
```

`ToggleButton` is `<button type="button" aria-pressed={enabled}>` with a `size-4` rounded square containing a `Check` when on, the children in a `min-w-0 flex-1` span, and an optional `right` count slot in `font-mono text-[11px]`. Also used by `QuestionEditor` and `CourseSettings`.

**Six dimensions.** Each is multi-select except tags (single, exclusive):

| dimension | control | semantics |
|---|---|---|
| Course structure | recursive `ToggleButton`s, children revealed only when the node is on, indented `ml-4 space-y-1.5 border-l border-border pl-3`; each row shows `code` then `name`, and `right={counts[node_id]}` | toggling **off** drops the entire subtree; toggling **on** adds only that node (the subtree expansion happens later in `effectiveNodeFilterIds`) |
| Difficulty | one `ToggleButton` per level, label = the level's `label`, `right={difficultyCounts?.[String(level)]}` | OR within the dimension |
| Question type | one per type, label via `formatQuestionType`, `right={typeCounts?.[key]}` | OR |
| Institution & year | two levels: the institution toggle carries `right={counts.total}`; when on and years exist, an indented `"All years"` row (on iff `chosenYears.length === 0`) plus one toggle per year with `right={counts.years[String(year)] ?? 0}` | presence of the key = "all years of this institution"; toggling a year keeps the array **sorted descending** |
| Tags | an `"All tags"` row plus one per tag; clicking the active tag clears it | single exclusive. The tab exists only when `tags.length > 0` |
| Practice options | a `Switch` — on → `7` days, off → `null` — headed `"Avoid recently seen"` with the copy *"Skip questions you've seen in the last few days. This is separate from what has already been offered in the current session."*, plus a number input suffixed `" days"` | ⚠ present only when the `avoidRecent` prop is passed (Practice passes it; the others don't) |

`activeCount` — one per selected node, **plus one per active dimension** (type, difficulty, institution, tag, avoidRecent). It drives the trigger badge and the modal's `headerNote` (`` `${n} active filter${n === 1 ? "" : "s"}` ``).

**Modal mode** (default). Trigger: `Button variant="outline" size="sm" class="bg-surface/60"` with `SlidersHorizontal`, the literal label `"Filters"`, and a badge pill `grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 font-mono text-[10px]`. The modal is `Modal label="Filters" header="Filters" headerNote={…}` with a two-pane body: `<nav aria-label="Filter sections">` (`sm:w-48`, a horizontal row on mobile, a vertical column from `sm`) then `<div class="min-h-0 flex-1 overflow-y-auto p-5">`.

Nav tabs, in order, with icons and badges:

| key | label | icon | badge |
|---|---|---|---|
| `structure` | `"Course structure"` | `FolderTree` | `selectedNodes.size` |
| `difficulty` | `"Difficulty"` | `Gauge` | `difficulties.length` |
| `type` | `"Question type"` | `Shapes` | `typeKeys.length` |
| `institution` | `"Institution & year"` | `School` | `Object.keys(institutionYears).length` |
| `tags` | `"Tags"` | `Tags` | `selectedTag ? 1 : 0`, only when tags exist |
| `options` | `"Practice options"` | `Settings2` | none, only when `avoidRecent` |

Active tab `bg-primary text-primary-foreground` with `aria-current="page"`; inactive `text-muted-foreground hover:bg-surface hover:text-foreground`.

Per-tab helper copy — keep verbatim:
- structure: *"Toggle a module to reveal its contents — each level expands as you enable it. Enabling a branch includes everything beneath it."*
- difficulty: *"Pick any number of difficulty levels — every selected level matches."*
- type: *"Pick any number of question types — every selected type matches."*
- institution: *"Choose an institution to include all its tests, then expand it to narrow the selection to specific years."*
- tags: *"Choose a tag to show questions labeled with it."*

Empty states: `"No course structure yet."`, `"No difficulty levels defined."`, `"No question types defined."`, `"No institution information available."`. An optional `hint` renders under a `border-t border-border pt-4` rule. Footer: `Reset` (outline sm, when `onReset && activeCount > 0`) and a primary button whose label is `footerAction?.label ?? "Done"` — clicking it closes the modal and *then* fires `footerAction.onClick`.

**Inline mode** — `if (inline) return filterContent;`. A `grid gap-4 md:grid-cols-4` of always-visible columns in the fixed order **Course structure, Institution & year, Difficulty, Question type**, with a `md:col-span-4` `"Reset filters"` button when `onReset && activeCount > 0`. Never shows tags or practice options.

⚠ **There is no debounce anywhere in this component.** Every toggle fires `on*Change` synchronously. `Browser` therefore re-queries on every keystroke of the search box; add a 250 ms debounce there.

---

# 13. Feature components

## 13.1 `components/PracticeFlow.tsx` — the heart of the product

```ts
export type PracticeStage = "prompt" | "attempted" | "feedback" | "assessed";
export interface PracticeDraft {
  response_text: string; selected_choice: string | null;
  confidence: "low" | "medium" | "high" | null;
  hints_revealed: number; elapsed_sec: number | null;
}
export interface PracticeFlowCallbacks {
  onConfirmAttempt: (d: PracticeDraft) => void | Promise<void>;
  onReveal:        (d: PracticeDraft) => void | Promise<void>;
  onRate:          (rating: SelfRating, d: PracticeDraft) => void | Promise<void>;
}
export function PracticeFlow({ question, stage, captureResponse, timerEnabled,
                               nextLabel?, nextDisabled?, onNext?, footerNote?, callbacks })
```

**⚠ Purely presentational.** All persistence is the parent's job. Mount it with `key={question.question_id}` so each question remounts fresh.

State: `response`, `scratch`, `scratchpad`, `hintsShown`, `selectedChoice`, `confidence`, `revealed { guide, answer, solution }`, `busy`. A `useEffect` keyed on `question.question_id` resets all of them.

Derived: `elapsed = useElapsedSeconds(timerEnabled, stage !== "assessed")`; `hints = useMemo(() => buildHintSteps(question), [question])`; `isMcq = type_key === "multiple_choice"`; `hasParts = parts.length > 0`; `graded = isMcq && correctChoice != null`; `objectiveCorrect = graded ? selectedChoice === correctChoice : null`; `canAttempt = !isMcq || selectedChoice != null`.

### Stage machine

**`prompt`**
- free response and `captureResponse` → a `rows={6}` `Textarea` labelled `"Your answer"`, `id={response-${questionId}}`, placeholder *"Write your answer here. It is kept on this device only, and you can turn that off in settings."*
- free response → a ghost `size="sm"` button with `NotebookPen` reading `"Scratchpad"` / `"Hide scratchpad"`, `aria-expanded={scratchpad}`, revealing a `rows={3}` `Textarea` `aria-label="Scratchpad"` with the placeholder *"Rough working. Kept in this tab only: never saved and never sent anywhere."*
- an outline `size="sm"` `Lightbulb` button whose label is `"No more hints"` when exhausted, `"Show a hint"` at zero, else `` `Another hint (${hintsShown}/${hints.length})` `` — disabled when exhausted
- the elapsed chip when the timer is on: `Timer` icon + `formatElapsed`
- one card per revealed hint: `Meta` `"Hint {i+1}"` + `BlockList`
- the helper line — MCQ: *"Pick an answer, then confirm your attempt."*; free response: *"Try the question first — the marking guide and answer stay hidden until you do."*
- the confirm button, `disabled={!canAttempt || busy}`, `Check` icon, label `"Check my answer"` (MCQ) or `"I've attempted this"` (free response)
- when `hasParts`: *"This question has N part(s). Answer each part in turn."*

**`attempted`** (free response only) — `"Attempt recorded."` plus one of:
- `"The app marked that as correct."`
- `"The app marked that as incorrect."`
- `"No correctness has been recorded — nothing here has marked it for you."`

and a default `Eye` button `"Show the marking guide"`.

**`feedback`** (MCQ lands here directly from `prompt`) — the three reveal sections, then a `ConfidencePicker`, then `SelfAssessment`.

**`assessed`** — footer note `footerNote ?? "Saved. This question will come back based on what you chose."` and the next button.

Every stage except `assessed`, when `onNext` exists, also renders *"You can come back to this one later."* plus an `outline size="sm"` button labelled `nextLabel ?? "Skip for now"`.

### Reveal sections

Three numbered sections, each `border-t border-border px-5 py-4 sm:px-6`, with a mono `text-accent-foreground` number, a `font-display` heading, an optional note, and an `Eye` + `"Show"` button that **disappears once open**:

1. `01 Marking guide` — note *"What each mark is for"* — `MarkingGuideTable`
2. `02 Answer` — `BlockList`, plus, when `isMcq && graded && selectedChoice === correctChoice`, *"Correct, marked by the app from the stored answer key."*
3. `03 Worked solution` — `BlockList`

If all three parent slots are empty: *"No marking guide, answer, or solution is recorded for this question yet."*

Then one `<section>` per part that has content, headed `Part {label}` + `[{marks} marks]` with inner `<h4>` headings `"Marking guide"` / `"Answer"` / `"Worked solution"` — **always visible, no Show buttons.**

⚠ The three sections open independently, so a student can read the worked solution without ever opening the answer. That is acceptable; the ordering communicates the intent.

### `buildHintSteps`

Authored `question.hint` blocks win — **one hint per block**. Otherwise:

1. only when `marks != null && marks > 1`, `block_id: "hint-marks"`: *"This is worth N marks, so a complete answer usually needs several distinct points rather than one line."*
2. `block_id: "hint-stem"`: *"Re-read the command in the question. Every word that tells you what to do — calculate, explain, compare, draw, discuss — is part of the answer, and so is any condition or unit given with the data."*
3. `block_id: "hint-check"`: *"Before you reveal anything, check your answer actually answers what was asked, and that you have shown the working rather than only the final result."*

So: 3 hints for a multi-mark free response, 2 for a 1-mark question, 1 for an MCQ. ⚠ The synthetic `block_id`s are not unique across questions; key the rendered list by index.

### Timer

```ts
useElapsedSeconds(enabled, running)   // setInterval every 1000 ms, Math.floor((Date.now() - startedAt) / 1000)
formatElapsed(s)                     // "59s" / "1m 00s" / "60m 00s" — ⚠ no hour rollover
```

⚠ The clock **restarts from 0 at every stage transition**, so the persisted `elapsed_sec` is the last stage's duration, not the total. In the rewrite, accumulate across stages and keep one monotonic clock per question. ⚠ `formatElapsed` has no hours branch; add `"1h 05m 00s"`.

### `SessionModePicker`

```ts
SessionModePicker({ value, onChange, dueCount, disabled? })
```

A `fieldset` with `<legend class="label mb-1.5">What kind of session?</legend>` and a `grid gap-2 sm:grid-cols-3` of cards. Each card is a `<label>` wrapping an `sr-only` `<input type="radio" name="session-mode">`; selected `border-primary bg-primary/10`, unselected `border-border hover:border-primary/60 hover:bg-accent/40`, disabled `cursor-not-allowed opacity-50`. Icon + `SESSION_MODE_LABEL`, a `bg-primary/15 px-1.5 font-mono text-[10px] text-primary` due badge when `mode === "due_review" && dueCount > 0`, and a `text-[11px] leading-4 text-muted-foreground` hint — `"Nothing due for review yet."` when disabled, otherwise `SESSION_MODE_HINT[mode]`. Cards carry `focus-within:ring-1 focus-within:ring-ring`.

### `SelfAssessment`

A `fieldset` of the five ratings with `SELF_RATING_LABEL` as the visible text and `SELF_RATING_HINT` as the supporting line. ⚠ `PracticeFlow` hard-codes `value={null}`, so nothing is ever pre-selected after submitting; set it to the submitted rating.

### `SessionExhausted`

Distinct exhaustion copy when the pool is empty mid-session: `"You've practised all N matching questions in this session."`, plus actions **Repeat**, **Reset**, and **Broaden** (which resets the filters). ⚠ `onBroaden` and `onResetFilters` are the same function; keep them separate.

### `components/DueQueueCard.tsx`

```ts
DueQueueCard({ courseId, onStart?, compact? })
export function useDueQueue(courseId: string | null, limit = 5)
```

`useDueQueue` uses `limit = compact ? 3 : 5` and the key `["due-queue", courseId, limit]`. ⚠ `Practice.invalidate()` invalidates `["due-queue"]` **by prefix**, so both limits refresh — but it also means any course's queue refreshes.

`if (isLoading || !queue) return null;` — the card pops in, no skeleton.

**Empty branch** (`due_count === 0`): `h2` `"Review queue"`, a link `"Practise something instead"` → `/practice?mode=focused`, and the body `"The queue is paused. Resume it when you want these questions to come back."` when paused, else *"Nothing is due for review. Questions appear here after you finish one, based on how your answer went."* When paused, a `RotateCcw` `"Resume the queue"` button.

**Populated branch**: `h2` `` `${due_count} question${due_count === 1 ? "" : "s"} due for review` ``; a `Clock` icon with `sessionSizeNote` — `""` when nothing is due, `"about N minute(s)"` when everything fits, else `` `X of Y in this sitting, about N minutes` ``; a pause notice `"Paused until {YYYY-MM-DD}. Nothing is lost — the dates stay as they are."` with a bare `"Resume now"` link; then per item a `Meta` type, the 90-char snippet, and `reason_text` — **always shown in `compact`**.

⚠ The `"Resume now"` element is a bare `<button>` with **no `type`**, so inside a form it submits. ⚠ The `"Pause a week"` shortcut here writes the pause date directly and invalidates only `["due-queue"]`, while `StudySettings` invalidates `["study-progress"]` too — so pausing from this card leaves the Overview stale. Route both through one mutation.

## 13.2 `components/StudyOverview.tsx`

```ts
StudyOverview({ courseId })
```

One query, `api.studyProgress(courseId)` under `["study-progress", courseId]`, no `enabled` guard (the parent guards). `if (isLoading || !progress) return <LoadingState label="Gathering your study history…" />`. `if (progress.total_questions === 0) return null;` — **the whole study half of the dashboard is hidden for an empty bank**, and `Dashboard` shows its own empty-bank panel with `SetupProgress` instead.

**`NextActionCard`** — label `"Recommended next step"`, `h2 {action.title}`, `p {action.detail}`, a `"Start"` button (icon `Repeat` for `due_review`, `ListPlus` for `add_questions`, else `ArrowRight`), and the footnote *"One suggestion at a time. The other options stay on the practice page."* Targets: `add_questions` → `/import`; `due_review` → `/practice?mode=due_review`; `practise_topic` → `` `/practice?node_id=${action.node_id}` ``; everything else → `/practice?mode=mixed`.

**Four `Stat` tiles:**
- `"Due for review"` — value `due_now`; sub-line `"nothing waiting"` at 0, `` `queue paused until ${queue_paused_until.slice(0,10)}` `` when paused, else `"ready when you are"`.
- `"Reviewed this week"` — `reviewed_last_7_days`, with `` `${reviewed} of ${total_questions} questions reviewed in total` ``.
- `"Attempted"` — `attempted`, with `` `${ever_seen} opened at least once` ``.
- `"How answers were marked"` — `marking_mix_note`, with *"Only the app-marked ones can be checked automatically."*

**"Practice coverage by topic"** — `PanelHead title` with the note *"Attempts and recency per topic. A standing is only shown once a topic has at least 3 reviews."* Table headers `Topic`, `Questions`, `Attempted`, `Reviewed`, `Due now`, `Last review`, `Standing`, with `<th scope="col">` and row `<th scope="row">`. Cells: `subtree_questions`; `` `${attempted} of ${questions}` `` or `"—"`; reviewed or `"—"`; `subtree_due_now` or `"—"`; `describeRecency`; `STANDING_LABEL[standing]` or `evidence_note`. A `"Show all N"` / `"Show fewer"` toggle with `aria-expanded` when there are more than 8 topics. Row links go to `` `/practice?node_id=${topic.node_id}` `` with `title={`Practise ${topic.name}`}` and `paddingLeft: ${level_index * 14}px`. The footnote explains the standing rule in full (§2.3).

**"Marked difficult more than once"** — note *"These came back hard or again at least twice. Open one to see the attempts behind that."* Each row: snippet, `Meta` type, `` `${hard_or_again} hard or again · ${lapses} again` `` + `` ` · last rated ${SELF_RATING_LABEL[last_rating]}` ``, and an `"attempts"` link → `/questions/:id`. Returns `null` when empty.

## 13.3 `components/SetupProgress.tsx`

```ts
SetupProgress({ courseId? })     // falls back to useActiveCourse
```

Queries `["course", id]` via `useCourseConfig`, `["question-counts", id]`, `["study-progress", id]`. ⚠ The `question-counts` key here is the **2-element** form while `Dashboard` uses a 5-element form; they do not share a cache entry. **Unify them.**

Three steps in a `<ol>`:

| key | title | undone detail | done detail | action |
|---|---|---|---|---|
| `questions` | `"Add questions"` | *"Import a question file, or write a question yourself. One or two is enough to start."* | `` `${total} question(s) in the bank.` `` | `"Import questions"` → `/import` |
| `topics` | `"Name your topics"` | *"Add a few topics so you can practise one thing at a time."* | *"Topics are what practice filters and progress summaries are built from."* | `"Edit topics"` → `/course-settings` |
| `practise` | `"Practise a question"` | *"Answer one question and it joins your review schedule."* | *"You have started. Review dates are set as you go."* | `"Open practice"` → `/practice` |

Header `"Set up this course"` and *"Three steps, in the order that tends to work. Stop after any of them — nothing here is locked until the next one."* A done row gets a `Check` icon, `text-success` and a line-through title; the action button renders **only on the first incomplete step**. When all three are done, no buttons render at all — which is correct, but means the panel gives no next action; link to `/practice` in that case.

## 13.4 `components/SampleCourseNotice.tsx`

```ts
SampleCourseNotice({ courseId })   // returns null unless course.is_sample
```

Panel `"This is a throwaway example"` / body *"Four example questions to try the practice flow on. It is a separate course, so nothing here mixes with your own work — practise a few, then remove it whenever you are ready."* Three buttons: `"Practise a question"` → `/practice`; `RotateCcw` `"Start the sample again"` → `resetCourseProgress` + invalidate everything; `Trash2` `"Remove the sample course"` → `deleteCourse` behind `useConfirm` with `confirmLabel: "Remove the sample course"`, `destructive: true`, then adopt the first remaining course. Footnote: *"Start the sample again clears its practice history and review schedule but keeps the questions."* Error copy `"Could not clear the practice history."` / `"Could not remove the sample course."`, `role="alert"`.

The sample course's content — `SAMPLE_COURSE_NAME = "Sample course — how practising works"`, two nodes (`sample-node-answering` "Answering a question", `sample-node-reviews` "Keeping track of reviews"), hierarchy `[{0, "Topic", required}]`, difficulties 1–4, types multiple_choice / short_answer / extended_response, tags `["onboarding","retrieval","review-schedule"]`, four questions — is specified in the source file and must be reproduced verbatim. Q4 exists specifically to teach the "mastered"/"weak" refusal: *"Write a short paragraph recommending what to practise next. Explain why 'mastered' and 'weak' would both be wrong descriptions here."* Do not paraphrase any of it.

## 13.5 `components/SaveStatus.tsx`

`SaveStatusIndicator` — `null` when idle. On error a `role="alert"` card with `CloudOff`, the message, a `<RefreshCw/>` `"Try again"` when `canRetry()`, and a ghost link `"Settings"` → `/settings`. Otherwise an `aria-live="polite"` mono uppercase line: `"Saving…"` or `Check` + `"Saved on this device"`.

`SaveFailureBanner` — dismissal is **keyed on the message string**, so a repeated identical error stays dismissed and a new message re-shows it. A full-bleed `role="alert"` strip `border-b border-destructive/30 bg-destructive/10 px-4 py-3 sm:px-5` with `AlertTriangle`, the message plus *" Your latest changes are still in this tab, but they are not on this device yet."*, `"Try saving again"` when `canRetry()`, a `/settings` link `"Export a backup"`, and `"Dismiss"`.

⚠ **Never** introduce cloud, sync, or "synced" wording. The doc comment forbids it and it would be a lie: there is no server.

## 13.6 `components/StructureEditor.tsx`

Two panels: `"Hierarchy levels"` (note *"The ordered labels used by the course tree, top to bottom."*) with an `Input` + `"Add level"` action; and the level-0 panel titled `hierarchy[0].label` with the note *"Rename nodes, set short codes, or add children at the next level."* and an `"Add {label}"` action.

`LevelRow` renders `grid grid-cols-[30px_minmax(0,1fr)_auto]`, a mono 1-based index, an `Input` that **saves on blur**, and a destructive `Trash2` with `title="Delete level"`. `addLevel` always sends `required: false` and derives `level_index` from `config.hierarchy.length`. `addRootNode` uses the **native blocking `window.prompt`** — ⚠ replace it with an inline input or a `Modal`; a native prompt is inaccessible, unstyled, and blocks the tab.

`NodeEditRow` is recursive with up/down reorder buttons, a `CirclePlus` child button at the next level, and a confirmed delete. ⚠ Its `save()` sends `name` and `code` **without `.trim()`**, so a trailing space is persisted.

---

# 14. Pages

## 14.1 `pages/Browser.tsx`

State is a single `BrowserState` object persisted to `qb-browser-state` **keyed by course id**: `{ courseId, selectedNodes: Set, typeKeys, difficulties, selectedTag, institutionYears, search, sort, page }`.

⚠ `readBrowserState` **validates every field** on read (`Array.isArray` guards, a `sortOptions` allowlist, `Number.isInteger(page) && page > 0`) inside a `try/catch` that returns defaults on any parse failure — so corrupt storage cannot white-screen the page. ⚠ Writes are wrapped in `try/catch` with the comment *"Keep browsing usable if storage is unavailable or full."* ⚠ The state is written **twice** on every change (once in `updateState`, once in an effect) — harmless but wasteful. ⚠ `sortOptions` is referenced by `readBrowserState` before its `const` declaration; legal only because the function runs after module init.

`PAGE_SIZE = 20`. `sortOptions`, in Select order: `"Newest first"` (`created_desc`), `"Oldest first"` (`created_asc`), `"Difficulty ↑"` (`difficulty_asc`), `"Difficulty ↓"` (`difficulty_desc`), `"Random"` (`random`).

`handleReset` clears `selectedNodes`, `typeKeys`, `difficulties`, `selectedTag`, `institutionYears`, `search` and `page` — **but deliberately not `sort`**, because sort is a view preference rather than a filter.

Queries: `["question-source-options", courseId]`, `["question-counts", courseId]`, `["question-source-facet-counts", courseId, effectiveNodeIds, typeKeys, difficulties, selectedTag]`, and the list under `["questions", courseId, effectiveNodeIds, typeKeys, difficulties, selectedTag, institutionYears, search, sort, page]`. ⚠ Because `FilterMenu` rebuilds `institutionYears` with a spread, property insertion order is stable and the key hash is stable — but any refactor that builds the object with a different key order will silently refetch on every render.

Markup: `PageHeader` with `eyebrow="Browse"`, `title="Question Bank"`, `description="Search, filter and inspect every question in the active course."` and the `FilterMenu` as its only action. Then a search `Input` with a leading `Search` icon and placeholder *"Search question text, code or source number"* (⚠ no `aria-label`; add one), a sort `Select`, two `Meta` lines (`"Loading…"` / `` `${total} matching questions` `` and `` `Page ${page} of ${totalPages}` ``), then one `Link class="panel block p-4 transition hover:-translate-y-px hover:bg-surface"` card per result carrying `Meta` id, type, `Difficulty {n}`, `{marks} marks`, the `source.name` pushed right, the `MathText` snippet, and — when nodes are selected — `` `${n} topic(s) selected →` `` in `text-accent-foreground`. Loading shows `Panel grid min-h-48 place-items-center p-8` with `<LoadingState label="Consulting the ledger…" />`. Empty state: `"No questions match these filters."` Then `Pagination`.

⚠ `search` is sent on **every keystroke** with no debounce; add 250 ms.

## 14.2 `pages/Dashboard.tsx`

If there is no course, render `<CourseOnboarding/>` and **nothing else** (after the hooks, so hook order is stable).

Otherwise, in order:
1. `PageHeader` — `eyebrow="Course overview"`, `title={config?.name}`, `description="Where the course stands, and what is worth doing next."`, actions: an outline `BookOpen` link `"Question Bank"` → `/browse`, and a default `Shuffle` link `"Start Practice"` → `/practice`.
2. `<StudyOverview courseId/>`.
3. The empty-bank block, **only when `counts` has loaded and `counts.total === 0`** (so there is no flash while loading): `h2` *"This course has no questions yet"*, body *"Practice needs questions to draw from. Bring in a question file, or write one by hand — either works, and you do not need a large bank to get value from it."*, buttons `"Add questions →"` → `/import` and `"Browse the bank →"` → `/browse`, then `<SetupProgress/>`.
4. `<SampleCourseNotice courseId/>`.
5. A `grid-cols-2 lg:grid-cols-4` stat grid:
   - **"Total questions"** — `font-display text-4xl`, value `counts?.total ?? "…"` (the literal ellipsis while loading, never `0`), with the course name beneath in `font-mono text-[11px] text-success`.
   - **"By type"** — `MiniRows` over `Object.entries(by_type)` with `k.replace(/_/g," ")`.
   - **"By difficulty"** — `Bars`. The label is literally `` `Level ${level}` `` — the level's own label (`"Very Easy"` etc.) is **not** used. The percentage is `Math.round(value / total * 10000) / 100`, and `total` falls back to `1` so a zero-count course does not divide by zero.
   - **"Quick actions"** — `sm` links `"Start a session →"` → `/practice` and `"Browse the bank →"` → `/browse`.
6. `<DueQueueCard courseId/>` — only when `(counts?.total ?? 0) > 0`.
7. The `"Topic structure"` panel — note `` `${hierarchy[0].label} · question count` ``, action `"Edit structure"` → `/course-settings`, body `<NodeTree checks={false} …/>`, empty `"This course has no categories yet."`

⚠ Use the **2-element** `["question-counts", courseId]` key here, not the 5-element form, so it shares the cache with Browser, Practice, Quiz and SetupProgress.

## 14.3 `pages/Practice.tsx`

Guard: `"Select a course to start practising."`

Reads `?mode=` (validated against the three modes, default `"focused"`) and `?node_id=`. On session start it writes `{mode:"due_review"}` or `{}` with `{ replace: true }`, ⚠ which wipes `node_id`.

State: `mode`, `selectedNodes` (seeded from `?node_id=`), `typeKeys`, `difficulties`, `selectedTag`, `institutionYears`, `avoidRecentDays`, `sessionId`, `current`, `stage`, `planItem`, `startError`, `sessionNote`, `loading`.

⚠ **Two filter bugs that must be fixed in the rewrite:**

```ts
type_key: typeKeys.length === 1 ? typeKeys[0] : null,   // ⚠ selecting 2+ types silently means "any type"
difficulty_min: null,                                    // ⚠ the difficulty filter NEVER reaches the query
difficulty_max: null,
```

Both selections change the facet counts but not the pool. In the rewrite pass `type_keys` and `difficulties` arrays straight through, and add a test that a filtered session actually shrinks the pool.

⚠ `handleResetFilters` clears six pieces of state but not `sessionNote`, so a stale end-of-session message survives a filter reset.

⚠ Changing any tracked filter abandons the session (`setSessionId(null)`, `current = null`, `stage = "prompt"`, `planItem = null`). The source comment: *"Changing the filters changes what a session means, so the old session is put aside rather than silently continued under new rules."* Because `filters.node_ids` is a fresh array on every memo recompute, this effect fires whenever any tracked filter changes. **In the rewrite, compare by value (a stable serialisation), not by identity.**

`loadQuestion(sessionId, questionId)` — guard on an empty id; `setLoading(true)`; `getQuestion` → set current + `stage = "prompt"`; `getPracticeSession` → find the plan item → `setPlanItem`; fire-and-forget `recordAttempt({ status: "seen" })` with the comment *"The session only counts a question as offered once it has been shown."*; invalidate `["recent-questions", courseId]`; on error `setStartError(...)` and clear current; `finally setLoading(false)`.

⚠ `start` has **no `onError`** — a `startPracticeSession` rejection is invisible. Add one.

`advance()` — fetch the summary; if `remaining_count === 0`, `setSessionStatus("completed")`, clear current, set `sessionNote` to `` `That is all ${n} question(s) in this session done.` `` (or `"Nothing was in that session."`), invalidate, return; otherwise `loadQuestion(sessionId, summary.next_question_id)`.

`onConfirmAttempt(draft)` — `graded = mcq && Boolean(current.mcq_options?.some(o => o.is_correct))`; `recordAttempt({ status: "attempted", response_text, confidence, hints_revealed, time_spent_sec, correct: graded ? draft.selected_choice === currentLetter(current) : null, scored_by: graded ? "objective" : null })`; `setStage(mcq ? "feedback" : "attempted")`; invalidate. **MCQ skips straight from `prompt` to `feedback`.**

`onReveal(draft)` — `recordAttempt({ status: "revealed", … })` with no `correct`/`scored_by`; `setStage("feedback")`.

`onRate(rating, draft)` — `recordReview({ session_id, question_id, rating, objective_correct, response_text, confidence, hints_revealed, time_spent_sec, score_earned: null, score_possible: current.marks ?? null })`; `setStage("assessed")`; `setSessionNote(`Next time this comes up: ${describeInterval(review)}.`)`; invalidate.

`currentLetter(question)` — `String.fromCharCode(65 + mcq_options.findIndex(o => o.is_correct))`, `null` at `-1`.

**Layout.** `PageHeader` — `eyebrow="Practice"`, `title="Practise a question"`, `description="Try the question before looking at anything. Finish it by saying how it went, which is what decides when it comes back."` Actions: a match chip `<div class="rounded-md bg-secondary px-3 py-2 font-mono text-xs">` with `{count}` then `"match"` plus `"es"` **only when the count is exactly 1** (⚠ so it can read "1 matches" — pluralise properly), and a `FilterMenu` with `footerAction={{ label: "Start session", onClick: () => start.mutate({ mode }) }}`.

Then the error banner — `bg-destructive/10 px-3 py-2 text-sm text-destructive`, ⚠ **no `role="alert"`**; add one.

**Pre-session** — a `Panel p-5` with `SessionModePicker` and a row: helper text `"{due} due, roughly {minutes} minutes."` / `"Nothing is due yet."` / *"Questions are drawn in order and the list is kept, so a half-finished session survives a reload."*; then a `Play` button `"Start session"` disabled while loading, when `total === 0`, or when `due_review` with nothing due. Below it a compact `DueQueueCard`.

**In-session** — a progress strip: `` `${completed} of ${planned} done` `` plus `` ` · ${remaining} to go` `` when `remaining > 0`, plus `" · spread across the topics you picked"` in `mixed` mode; a ghost `"Reset session"` with `title="Clear which questions have been shown and start the same list again"`; an outline `"Change mode or filters"` which clears `sessionId`, `current` and `sessionNote`.

Then `SessionExhausted` when `pool.eligible_count === 0 && status === "active"`; then the end-of-session panel — a `size-12` `bg-secondary text-primary` `Shuffle` badge, `h2 {sessionNote}`, body *"The next due dates are already set. Come back when they land, or start another session now."* when `completed_count > 0` else *"Nothing has been reviewed yet, so nothing has been scheduled."*, buttons `"Do them again"` and `"Change mode or filters"`, plus `` `${due_count} question(s) is/are due for review now.` `` when applicable.

Then, for the current question: a reason banner — *"Why you are seeing this: {reason_text}"* — and either the loading panel (`Panel grid min-h-80 place-items-center p-8` with `InkLoader messages={["Dipping the pen…","Consulting the ledger…","Ruling the margin…"]}`) or `<PracticeFlow key={question_id} … />`.

⚠ `PracticeFlow` is keyed per question, so on every advance the previously focused button is destroyed and focus falls to `<body>`. **Move focus to the question container on each new question** and announce it with `aria-live="polite"`.

## 14.4 `pages/Quiz.tsx`

Guard: `"Select a course to start a quiz."`

`PageHeader` — `eyebrow="Timed session"`, `title="Quiz"`, `description="Build a question set from your course filters, then answer each question against the clock."` Actions: a `` `${matchingCount} matches` `` chip and a `FilterMenu` whose `footerAction` label is `"Restart quiz"` while running, else `"Generate quiz"`.

`phase`: `setup | loading | run | done`.

**Setup panel** — a labelled range slider, `aria-label="Number of quiz questions"`, `min=1 max=30`, with a scale from `"1"` to `"30 questions"`; the helper *"Use the stopwatch to track your time on each question."*; a `Meta` reading `` `${matchingCount} matching · ${min(requested, matchingCount)} will be drawn` ``; the generate button; and a `role="alert"` error. The `setup`-phase body is the line *"Set your filters and question count, then generate a quiz."* `loading` shows `InkLoader messages={["Drawing questions…","Starting your stopwatch…","Preparing your quiz…"]}`.

**Timer** — a single chained `setTimeout` re-arming every 1000 ms, gated on `phase === "run"`, `!revealed` and a current question. It **stops on reveal** (so self-marking time is excluded) and **freezes on the last question** (because `resetQuestion()` only runs when advancing). The footer label flips `{revealed ? "Time taken" : "Elapsed"}`. ⚠ No `visibilitychange` handling, so a backgrounded tab throttles the timeout and under-counts. ⚠ No keyboard shortcuts at all: no number keys to pick an option, no Enter to submit. **Add them** — 1–5 select an option, Enter submits, and document them in the setup panel.

**Deck build** — `startQuiz` makes `min(requestedCount, matchingCount)` **sequential** `randomQuestion` calls with an accumulating `exclude_question_ids` (the query picks by random offset, so this is a random permutation without repeats), records `status: "seen"` for the whole deck up front, and breaks on a null question. If `matchingCount < 1` it returns silently. If it lands on zero picks it returns to `setup` with *"No questions matched those filters. Adjust them and try again."*

⚠ Both the panel button and the `FilterMenu` footer call `startQuiz`, so the "Restart quiz" label appears twice and a fast double-click re-adds `"seen"` rows for the whole new deck. Disable one of them.

**Run** — a sticky strip `sticky top-[64px] z-10` with `"Complete"` or `` `Question ${index+1} of ${deck.length}` ``, `` `${earnedTotal} / ${possibleTotal} marks` ``, and a pip container `aria-label="Quiz progress"`. Pips are **decorative divs** — no `<progress>`, no navigation. Then `<QuestionSurface key={question.question_id} … />`. Free response adds a `rows` textarea labelled `"Your answer"`, `id="quiz-answer"`, placeholder *"Write your working and answer…"*, disabled once revealed; then a self-mark box with `"Marks awarded"` (both the visible label and the input's `aria-label`), `type="number" min={0} step="0.5"`, placeholder `` `0–${maxMarks}` ``, a `"Save score"` button, and the helper *"Compare your work with the guide above, then enter your score. This mark is self-marked, so it is kept separate from app-marked multiple choice."*

⚠ **Four scoring defects to fix in the rewrite:**
1. Repeated `"Save score"` clicks write **duplicate attempt rows**; the local `results` entry is deduped but the database is not. Upsert on `(session?, question_id, phase)`.
2. Skipped questions push `{ earned: 0, possible, scoredBy: "skipped" }`, which **inflates the percentage denominator**. Track skips separately from the denominator.
3. MCQ records `possible = marks ?? 1`, non-MCQ records `possible = marks ?? 0`, so `possibleTotal` can be `0` and the summary renders `"0 / 0 marks"` and `0%`. Handle the no-marks case explicitly.
4. `noMarkCount = results.filter(r => r.earned === 0).length` counts skipped questions as "no marks" as well, so the three badge counts do not sum to the deck length. Exclude skips.

Footer: `"Skip"` (ghost, `SkipForward`), then MCQ `"Submit answer"` (`Check`) / non-MCQ `"Reveal marking guide"`, then `` `${index + 1 >= deck.length ? "Finish quiz" : "Next question"} →` ``. ⚠ After revealing a non-MCQ answer the student **cannot skip** — `Skip` disappears and `Next` waits for a score, and the cheapest score is `0`. Always allow skipping.

**Done** — the summary panel: label `"Examination summary"`, `h2 "Quiz complete"`, `"/ {possibleTotal} marks"`, and tiles `"Avg time / Q"`, `"Total duration"`, `"Marks"` (with `scoreNote` = `"includes N self-marked"` / `"all marked by the app"` / `"nothing marked yet"`), `"Marked"` (`"{o} app-marked · {s} self-marked · {k} skipped"`). Header right: `` `Final score${selfMarked > 0 ? " · partly self-marked" : ""}` ``. Then `` `${full} full` ``, `` `${partial} partial` `` when non-zero, `` `${noMarks} no marks` ``, the app/self/skipped line, and — only when `selfMarked > 0 && objectivePossible > 0` — `` `app-marked only: ${objectiveEarned} / ${objectivePossible}` ``.

Rows: `String(i+1).padStart(2,"0")`, a status badge (`full` / `partial` / `no marks` / `skipped`), a provenance chip (`self-marked` / `app-marked`), `` `Difficulty ${d} · ` `` + `type_key.replaceAll("_"," ")`, a `question_id` link with `title="Open this question"` → `/questions/:id`, `` ` · ${possible} marks available` ``, `` `${earned} / ${possible} marks` ``, and `formatDuration(elapsed)`. Footer: a ghost `"Adjust quiz"` that scrolls to the top, and `"Retry quiz"` with `RotateCcw`.

⚠ **No `session_id` is ever passed**, so a quiz writes `practice_attempt` rows but never creates or moves review state. That is intentional (a quiz is not practice), but say so in the UI, otherwise a student reasonably expects the quiz to affect their schedule. Also: results live only in component state, so a reload loses the whole session.

## 14.5 `pages/TestGenerator.tsx`

Guard: `"Select a course to generate a test."`

`PageHeader` — `eyebrow="Assessment design"`, `title="Test Generator"`, `description="Build a print-ready paper section by section. Set a marks target and tailored topic, type and difficulty filters for each section."`

**Panel 1 · `1 · Paper details`** — a `Field` `"Optional test title"` with the placeholder `` `${course} — Practice Test` `` and the note *"Each section has its own topic, type and difficulty filters."*

**Panel 2 · `2 · Build sections`** — note *"Set the marks target and filters independently for each section."*, action `"Add section"`. Per section: a `Name` input (placeholder `"Section I (optional)"`), a marks slider `input type="range" min={5} max={80} step={1}` with `aria-label={`Section ${index+1} marks`}` labelled `` `Section marks · ${marks}` `` and a scale from `5` to `"80 marks"`, three icon buttons (`title` `"Move up"`, `"Move down"`, `"Remove section"` — the last disabled on the only section), an inline `FilterMenu`, a counter `` `${sec.nodeIds.size || "All"} topics · ${sec.typeKeys.length || "All"} types · ${sec.difficulties.length || "All"} difficulties` ``, and an `aria-live="polite"` availability line: `"Available: N questions · M marks"` or `"Updating…"`.

⚠ Three facet queries run **per section** at indices `i*3 + {0,1,2}`. That nesting is load-bearing — the UI indexes back into `sectionFacetQueries[index * 3 + n]`. Rewrite it as one query per section returning all three facets.

**Panel 3 · `3 · Output options`** — a `Field` `"Output format"` `Select` with `"Word document (.docx)"` / `"PDF document"`; a `Field` `"Question ordering"` `Select` with `"Random selection"` / `"Sequential (oldest first)"`; a `Meta` reading `` `${n} section(s) · ${marks} marks requested · … available questions · … available marks` `` (or `"Updating availability…"`); and the `Printer` button `"Generate paper"` / `"Generating…"`.

Validation: `sections.length > 0 && every(s => s.marks >= 5 && s.marks <= 80)`.

**Result panel** — `PanelHead title="Generated paper"` with the note `` `${n} questions · ${m} marks` `` and a `"Download paper"` action. Mark-mismatch boxes in `role="status"`:
- limited: `` `${section.name}: the search reached its time limit, so it used the closest combination found so far (${achieved} marks for a ${requested}-mark target).` ``
- inexact: `` `${section.name}: the requested ${requested} marks weren't achievable exactly; the closest available total was ${achieved} marks.` `` (epsilon `0.009`).

Then `<Meta>Actual selection</Meta>` + `MiniRows`, then the `.paper-preview` pane: the title, a mono uppercase summary, *"A preview of the generated test paper appears below."*, and an `<iframe src={previewUrl} title="Test preview" style={{ height: "60vh" }} />`. While the URL resolves: `LoadingState label="Loading preview…"` plus *"If it stays blank, use Download paper — the PDF may no longer be stored in this browser."* ⚠ The preview is always a PDF blob, even for DOCX output. ⚠ Use `ListChecks`-style empty state correctly — `LoadingState` currently returns `null` when not loading, which is why the pane flashes.

**Past tests** — `PanelHead title="Past tests" note="Previously generated papers"`, `LoadingState label="Loading past tests…"`, empty *"No tests generated yet for this course."*, rows `` `${date} · ${n} questions · ${m} marks · ${FORMAT}` `` with `title` `"Preview"` / `"Paper"` / `"Delete"`. The delete confirm is `"Delete this generated test?"` / *"The test and any files generated from it are removed. This can't be undone."* / `"Delete test"` / `destructive: true`.

⚠ `api.downloadSkill` has no busy state in `CourseSettings`, so a double click launches two downloads.

## 14.6 `pages/Import.tsx`

Guard: `"Select a course to import questions into."`

`PageHeader` — `eyebrow="Bulk intake"`, `title="Import questions"`, `description="Import questions from an AI-generated JSON file or a question-only .qbx bundle."`

`Panel` with `PanelHead title="Question import" note={`Target course: ${config.name}`}` and two numbered steps: `Meta` `"JSON workflow · Step 01"` + `h3` *"Prepare with the course skill"* + *"Download the skill file in Course Settings, then give it and your source document to an AI assistant to produce the import JSON."*; then `Meta` `"JSON workflow · Step 02"` + `h3` *"Upload the JSON output"* + *"JSON questions are validated independently. A .qbx bundle imports its editable question data and packaged images into this course."*

Then the dropzone: a `<label>` wrapping a hidden `input type="file" accept=".json,.qbx,application/json,application/zip" multiple`, with an `h2` that is `"Importing…"` / `` `${n} file(s) selected` `` / `"Choose a JSON file"`, a `p` listing the chosen names or *"Choose one or more JSON files or .qbx question bundles."*, and a `Button asChild` with `FileJson` `"Browse files"`.

Per-file error: `` `${name}: ${error}` `` in `bg-destructive/10 text-destructive`.
Per-file result: a panel keyed `` `${import_job_id}-${name}` ``, `PanelHead title={`Import summary · ${name}`} note={`Job ${import_job_id}`}`, two big stats (`Meta "Imported"` in `text-success`, `Meta "Rejected"` in `text-destructive`), the caption `` `${imported} question(s) imported{, m rejected | without issues}.` ``, a `bg-accent/30 text-accent-foreground` block of job warnings, and a detail list — **only** for rows with errors or warnings — laid out `grid-cols-[130px_90px_1fr]` with `Q{index+1}`, a `Rejected`/`Warnings` chip, then the errors in `text-destructive` followed by the warnings.

Footer hint: *"Prefer to add questions one at a time? Use **Course Settings → Questions → Add question**."*

Client-thrown copy: `"This is not a valid .qbx question bundle."`, `"This .qbx bundle has no questions.json file."`, `"Unsupported or invalid .qbx question bundle."`, `"Import failed — check the file is valid JSON in the expected format"`.

⚠ Files are processed **sequentially**, never in parallel — deliberate, since each `importJson` writes to the same SQLite image.

## 14.7 `pages/CourseSettings.tsx`

Guard: `"Select a course to manage its settings."`

`PageHeader` — `eyebrow="Course management"`, `title={config.name}`, `description="Manage this course's structure and its questions directly."` Actions, in order: `"Export course"`, `"Export questions"`, `"Delete questions"` (all with `title` tooltips), `"Download skill file"` (`ExternalLink`, with the long tooltip explaining that the `.skill` is general document-to-question instructions plus this course's structure and marking-guide rules), and `"Delete course"` (destructive, `"Deleting…"` while running).

An `actionError` line ⚠ with **no `role="alert"`**.

**Export modal** — `Modal label="Export options"` with the header depending on format. A `nav aria-label="Export sections"` with `Shapes`/`Gauge`/`School`/`Tags`/`ListChecks` tabs: `"Question type"`, `"Difficulty"`, `"Institution"`, `"Tags"`, `"What's included"`. Content per tab is an `ExportOptionGroup` (a `label` heading plus `ToggleButton`s, or the empty label). Footer: `"Reset"` and the primary `"Export .qb"` / `"Export questions"`.

`ExportScope` — `"Always included in a .qb export"`: *"Course structure, hierarchy levels, difficulty levels and allowed tags"*; *"Every question matching your filters, with answers, marking guides and hints"*; *"Images and diagrams used by those questions"*. `"Not included"`: *"Generated tests and their files — regenerate them from the questions"*; *"Your review intervals and queue settings, which are preferences on this device"*. Then two switches: **"Include practice history"** (default **on**) — *"The review schedule for each question and every practice attempt: when it was seen, whether you attempted or reviewed it, how you rated it, and how long it took. Without this, an imported course starts with an empty schedule."* — and **"Include answers you typed"** (disabled unless history is on) — *"The free-text responses you wrote while practising. Leave this off to share a backup without your written work."*

**Delete-questions modal** — `Modal label="Delete question options" header="Delete questions" headerNote="Choose matching questions to delete. Empty sections include all values." onCloseDisabled={bulkDeleting}`. The same four `ExportOptionGroup`s stacked, **no scope section**. Footer `"Reset"`, `"Cancel"`, and a destructive `"Delete matching questions"` (`"Deleting…"` while running).

⚠ **Three dangerous defects here, all to fix:**
1. The four filter arrays are **shared** between the export modal and the delete modal, so opening delete inherits whatever export was left with.
2. There is **no node filter and no free-text filter** in either dialog. Selecting an institution alone deletes everything from that institution. **Require an explicit confirmation showing the exact matched count** and refuse when the count is large relative to the bank.
3. Bulk delete is **N sequential single-row deletes** (`for (const id of ids) await api.deleteQuestion(id)`) — 5 000 questions means 5 000 transactions. Add a batch delete.

⚠ `ExportOptionGroup`'s default empty label is `` `No ${title.toLowerCase()} values defined.` ``, which produces the broken *"No tags values defined."* Pass explicit `emptyLabel` props.

⚠ `qc.removeQueries({ predicate: q => q.queryKey.includes(config.course_id) })` is a **substring** test on an array, not a prefix test. Use `q.queryKey[0] === "course" && q.queryKey[1] === courseId`, or a real prefix test.

**Tabs** — `"Structure"`, `"Tags"`, `"Questions"`.
- *Structure* → `CourseNameSettings` (⚠ **must keep `key={config.course_id}`** so a course switch remounts it and resets the draft — remove the key and renaming shows the previous course's name) then `StructureEditor`.
- *Tags* → `CourseTagSettings`: `PanelHead title="Allowed tags" note="Only tags in this list can be assigned to course questions."`; chips `bg-muted px-3 py-1.5` each with a `Remove {tag}` button rendering the literal `"×"` (**hidden for `action_required`** — it is mandatory); an add form with `"Add an allowed tag"`; then `"Save tag list"` and a ghost `"Discard"` that appear only when there are unsaved changes.
- *Questions* → `QuestionManager`: a `["questions", course_id, "manage", page]` list with an `"Add question"` action, each row a truncated `MathText` snippet plus a `Meta` of type / difficulty / marks and a `Pencil` / `Trash2` icon pair. Empty: *"No questions yet — add the first one above."* ⚠ **The pencil and trash icon buttons have no `aria-label`** — give them `"Edit question"` and `"Delete question"`. ⚠ It never invalidates `["question", id]`, so an open `QuestionDetail` keeps a stale cached copy.

## 14.8 `pages/Settings.tsx`

`mx-auto max-w-2xl space-y-5`.

1. `PageHeader` — `eyebrow="Preferences"`, `title="Settings"`, `description="Appearance and local preferences for Quaestio."`
2. The dark-theme panel — `"Dark theme"` with *"Reduce glare while practising long sessions."* ⚠ The `Switch` is **unlabelled**; the visible text is a `<p>`, not a `<label>`. Associate them.
3. `<StudySettings courseId/>` — four panels:
   - **`"Review intervals"`** — strips ladder index 0 on load, re-prepends on save via `normalizePolicy({ ladder: [0, ...ladder], againMinutes })`. Per-step number inputs `min={1} step={1} class="w-20 text-center"` captioned `#{i+1}` with `aria-label={`Days between reviews at step ${i+1}`}`, plus `"Minutes before an “again” comes back"` (`id="again-minutes"`, `w-32`). Buttons `"Save intervals"` and `<RotateCcw/> "Restore the default ladder"` (⚠ local state only — it must also be made obvious that nothing is saved until you press Save). States: `"Loading the current intervals…"`, `"Saved on this device."`, and a `role="alert"` error defaulting to `"Could not save the intervals."` The explanation paragraph: *"“Got it” moves a question one step along the ladder, “Easy” moves it two, and “Hard” or “Not sure” keeps it where it is. “Again” restarts the ladder and brings the question back in the minutes set above. Changes apply from the next review onwards; dates already scheduled are left alone."* ⚠ An emptied ladder box becomes `0`, which `normalizePolicy` filters out, so the ladder silently shortens — validate on blur and say so.
   - **`"Review queue"`** — `PAUSE_OPTIONS = [a day(1), a week(7), a month(30)]`. Running copy: *"The queue is running. Pausing it for a while is fine if you are busy — the review dates stay exactly as they are and the questions pick up where they left off."* Then a `BellOff` `"Pause for"` with three buttons. Paused: `"Paused until {date}."` + `` `${n} question(s) is/are due and waiting.` `` or `"Nothing is due yet."`, plus `<RotateCcw/> "Resume the queue"`.
   - **`"During practice"`** — a `divide-y divide-border` block with two switches: **"Keep the answers I type"** (default on) — *"When this is on, the text you type for a free-response question is stored with that attempt so you can read it back. Turn it off to keep only that you attempted the question. Typed answers are left out of exports unless you ask for them."* — and `Clock` **"Show a timer while I answer"** (default off) — *"Off by default. The timer only records how long you spent, and speed is never treated as evidence that you know something — nothing about your result changes with it."*
   - **`"Your data on this device"`** — note *"Quaestio has no account and no server. Everything below is stored by this browser, on this device only."* A `HardDrive` row explaining the `Saving…` / `Saved on this device` indicator and the failure banner with retry; a `Download` row explaining *"That is the only copy. There is no automatic backup, and clearing this browser's site data deletes it. Export a **course backup** whenever you want one; the questions-only export is smaller but leaves the review schedule behind."*
4. `InstitutionManager` — `h2 "Institutions"`, *"Rename an institution to update every source and question currently grouped under it."* Per row: the name, its years (or `"Year not recorded"`), an `Input aria-label={`Rename ${name}`}` and a `Pencil` `"Rename"` button. Tri-state: `"Select a course to manage its institutions."`, `"No institutions found for this course."`, or the rows. ⚠ `api.renameInstitution` returns the number of rows touched and **the UI ignores it**, so a rename matching nothing gives no feedback. ⚠ After a successful rename it also migrates `qb-browser-state`, reaching into a key owned by another page — keep that in one shared module.
5. The active-course summary — a `BookOpen` tile, the course name or `"None selected"`, the hierarchy joined with `" → "`, then a `"Hierarchy labels"` row of numbered chips. ⚠ `0${i+1}` breaks at 10 levels.
6. A closing paragraph: *"Appearance, the review schedule, and what practice keeps are above. Nothing here talks to the network — this app runs entirely in the browser, so there is no account to configure and no sync to wait for."*
7. The destructive panel — `"Clear questions"` (*"Deletes all questions, images, practice history, imports and generated tests. Course structure and settings stay untouched."*) then `await clearQuestions(); window.location.reload();`; and `"Clear everything"` (*"Deletes all local data, including courses, course structure, questions and files. This cannot be undone."*) then `await clearAllData(); setCourseId(null); queryClient.clear(); navigate("/")`.

⚠ Two different teardown paths. `"Clear questions"` hard-reloads; `"Clear everything"` soft-tears-down. That is intentional and load-bearing — `clearQuestions()` must `flush()` **synchronously before returning**, or the reload will restore the pre-clear database from IndexedDB and silently undo itself. ⚠ A `role="alert"` clears on reload.

## 14.9 `pages/QuestionDetail.tsx`

Guard `"Question not found."`, loading `Panel grid min-h-64 place-items-center p-8` with `LoadingState`.

`PageHeader` — `eyebrow="Question detail"`, `` title={`Question ${questionId}` } `` (**the URL id, not `source.original_question_no`**), `description="Complete question, source record and reviewed solution."` Actions: `"Edit question"` (`Pencil`) and an outline `asChild` link `ArrowLeft` `"Back to browser"` → `/browse`.

Body: `grid gap-5 xl:grid-cols-[minmax(0,1fr)_260px]`. Left: `<QuestionSurface question submitted={showAnswer} footer={…} />`, where the footer — a `Button variant="outline" class="w-full"` with `Eye` labelled `"Show answer"` / `"Hide answer"` — renders **only** when the question or any part has an answer, solution or marking guide. Right: a `Panel h-fit p-5 xl:sticky xl:top-[76px]` with the pending banner *"Pending review — not yet approved for practice."* (⚠ **not** `role="alert"`), an `h2 "Metadata"`, and a `<dl>` of Type, Difficulty, Marks, Tags, Review status (rendered `text-destructive` when pending), and Source (`institution · name · year · qno`).

When `isEditing`, the whole page is replaced by `QuestionEditor`, and while the config loads by `LoadingState label="Loading course settings…"`.

⚠ **`showAnswer` and `isEditing` are page-lifetime booleans, not per-question.** Navigate from one question to the next and the answer stays open. **Reset both on `questionId` change** — that alone fixes a whole class of "the app showed me the answer" reports.

---

# 15. Accessibility contract

Accessibility is not optional here: the app has keyboard shortcuts and focus-dependent flows, and a single-student study tool that traps focus is unusable.

### 15.1 Must have

| area | requirement |
|---|---|
| Skip link | A `"Skip to content"` link that focuses `<main>`. ⚠ missing |
| Page navigation | Move focus to the new page's `<h1>` and announce it in an `aria-live="polite"` region on every route change. Reset scroll. ⚠ all missing |
| Mobile menu | A real focus trap, `Escape` to close, focus returned to the trigger, `aria-expanded` on the button, `aria-controls` pointing at the panel. ⚠ only the first item is focused and Tab escapes |
| Modals | Already correct: `aria-modal`, `aria-labelledby`, focus in, focus trap, `Escape`, focus restored, body scroll locked. ⚠ give each modal a unique title id when more than one can be open |
| Every dismissible banner | `role="status"` for progress, `role="alert"` for failures. ⚠ `Practice`'s error banner, `CourseSettings`' `actionError`, `CreateCourseForm`'s error, `StructureEditor`'s `levelError` and `QuestionDetail`'s pending banner are all missing this |
| Icon-only buttons | Every one needs an `aria-label`. ⚠ `QuestionManager`'s pencil and trash, the sidebar's `"Resume now"`, and several modal close buttons rely on an icon alone |
| Form controls | Every input has a real label. ⚠ `Browser`'s search input, `Settings`' dark-theme switch, `Quiz`'s marks input, and `FilterMenu`'s institution/year toggles rely on placeholders or adjacent text |
| Tables | `<th scope="col">` / `<th scope="row">`. Already correct on the study-coverage table |
| Live regions | `LoadingState`/`InkLoader` use `role="status" aria-live="polite"`. ⚠ the rotating message announces every 900 ms — expose one stable string instead |
| Motion | `prefers-reduced-motion` collapses all animation. Already present. ⚠ also stop the `ink-stream` animation under reduced motion rather than only shortening it |
| Focus visibility | Every interactive element needs a visible focus ring. `focus-visible:ring-ring` on inputs, `focus-within:ring-1 focus-within:ring-ring` on the session-mode cards. ⚠ apply consistently — several ghost buttons rely on the browser default |
| Colour | The MCQ correct/incorrect treatment is colour-only and hard-coded light-palette. ⚠ add a text or icon cue and theme-aware tokens |
| Destructive actions | Every one is a real `<button>` behind `useConfirm`, never a bare icon. ⚠ `Settings`' two teardown paths and `CourseSettings`' bulk delete are the highest-risk flows; they have confirms, which is right |

### 15.2 Keyboard map the rebuild should provide

| context | keys |
|---|---|
| Practice, prompt stage | `1`–`5` select an MCQ option; `H` reveals the next hint; `Enter` confirms the attempt |
| Practice, feedback stage | `1`–`3` open Marking guide / Answer / Worked solution; `G`/`A`/`S` set the rating |
| Quiz | `1`–`5` select, `Enter` submits or reveals, `S` saves the score, `→` next |
| FilterMenu | `Esc` closes; `Tab` cycles inside the modal |
| CourseSelector | arrow keys move the virtual cursor, `Home`/`End` jump, `Enter`/`Space` selects, `Esc` closes, typeahead is a nice-to-have |
| Global | `⌘/Ctrl+B` focus the search box, `g` then `p` for Practice, `g` then `b` for Browse — ⚠ do **not** add single-letter global shortcuts; they collide with the stage shortcuts above and with text inputs |

⚠ None of these exist today. They are the single largest usability gap in the rebuild.

---

# 16. Copy catalogue

Every string below is verbatim product copy. When in doubt, prefer the existing wording over inventing new copy — the tone is already right.

## 16.1 Page headers

| page | eyebrow | title | description |
|---|---|---|---|
| Dashboard | `"Course overview"` | the course name | *"Where the course stands, and what is worth doing next."* |
| Browser | `"Browse"` | `"Question Bank"` | *"Search, filter and inspect every question in the active course."* |
| Practice | `"Practice"` | `"Practise a question"` | *"Try the question before looking at anything. Finish it by saying how it went, which is what decides when it comes back."* |
| Quiz | `"Timed session"` | `"Quiz"` | *"Build a question set from your course filters, then answer each question against the clock."* |
| Test Generator | `"Assessment design"` | `"Test Generator"` | *"Build a print-ready paper section by section. Set a marks target and tailored topic, type and difficulty filters for each section."* |
| QuestionDetail | `"Question detail"` | `` `Question ${questionId}` `` | *"Complete question, source record and reviewed solution."* |
| Import | `"Bulk intake"` | `"Import questions"` | *"Import questions from an AI-generated JSON file or a question-only .qbx bundle."* |
| CourseSettings | `"Course management"` | the course name | *"Manage this course's structure and its questions directly."* |
| Settings | `"Preferences"` | `"Settings"` | *"Appearance and local preferences for Quaestio."* |

## 16.2 Destructive confirmations — all four

| trigger | title | description | confirmLabel |
|---|---|---|---|
| Delete question | *"Delete this question?"* | *"The question, its images, and any practice history and review schedule for it are permanently deleted. This can't be undone."* | `"Delete question"` |
| Delete generated test | *"Delete this generated test?"* | *"The test and any files generated from it are removed. This can't be undone."* | `"Delete test"` |
| Clear questions | *"Clear all questions?"* | *"Every question, image, practice history entry, review schedule and generated test for this course is deleted. Course structure and settings are kept. This cannot be undone."* | `"Clear questions"` |
| Clear everything | *"Delete everything on this device?"* | *"All courses, structure, questions, images, practice history and settings stored by this browser are deleted. Nothing is recoverable afterwards. Export a backup first if you might want it."* | `"Delete everything"` |

Also: `"Remove the sample course?"`, `"This course already exists here"` (with `"Replace the existing course"` / `"Add as a new course"`), `Delete the “{label}” level?`.

## 16.3 Empty states

`"Select a course to see activity."` · `"Nothing yet — questions you practise or open will show up here."` · `"Nothing is due for review. Questions appear here after you finish one, based on how your answer went."` · `"This course has no questions yet"` · `"No questions match these filters."` · `"This course has no categories yet."` · `"No courses yet"` · `"No content yet."` · `"No marking guide, answer, or solution recorded for this question yet."` · `"No approved questions match {section}. Try widening the topics/type filters, or set marks on matching questions."` · `"No tests generated yet for this course."` · `"No questions yet — add the first one above."` · `"No course structure yet."` / `"No difficulty levels defined."` / `"No question types defined."` / `"No institution information available."` · `"No institutions found for this course."` · `"No courses yet"`.

## 16.4 Hints and reassurance

- *"Questions are drawn in order and the list is kept, so a half-finished session survives a reload."*
- *"Avoid recently seen — Skip questions you've seen in the last few days. This is separate from what has already been offered in the current session."*
- *"Why you are seeing this: {reason_text}"*
- *"You can come back to this one later."*
- *"One suggestion at a time. The other options stay on the practice page."*
- *"This is the only copy. There is no automatic backup, and clearing this browser's site data deletes it."*
- *"Nothing here talks to the network — this app runs entirely in the browser, so there is no account to configure and no sync to wait for."*
- *"This is not built yet. When it arrives nothing leaves this device, drafts need your approval before they enter the bank, and you will be told what happens to the material you paste in."*

## 16.5 Empty / default settings copy

- Loading: `"Quaestio is pondering…"` (default), `"Consulting the ledger…"`, `"Gathering your study history…"`, `"Loading preview…"`, `"Loading past tests…"`, `"Loading the current intervals…"`, `"Loading course settings…"`.
- Practice inks: `"Dipping the pen…"`, `"Consulting the ledger…"`, `"Ruling the margin…"`.
- Quiz inks: `"Drawing questions…"`, `"Starting your stopwatch…"`, `"Preparing your quiz…"`.

---

# 17. Known defects — preserve, fix, or accept

This is the list the rebuild must decide about explicitly. ⚠ **Fix** items are genuine bugs; ⚠ **Preserve** items are deliberate design decisions that look like bugs.

### 17.1 Preserve (deliberate)

| # | behaviour | why |
|---|---|---|
| 1 | `PracticeFlow`'s `graded` and `Practice.onConfirmAttempt`'s `graded` disagree | the UI is softer than the DB, so an MCQ with no stored key never claims the app graded it |
| 2 | With no active course, `Layout` swaps in `<CourseOnboarding/>` for every route but `/` | it prevents a wall of half-working screens on first run; each page still needs its own guard for mid-session deletion |
| 3 | `resetPracticeSession` deletes only `seen` attempts | in-flight `attempted`/`revealed` work is kept, and the UI copy is honest about it |
| 4 | The `manual_legacy` `scored_by` backfill | pre-study-loop attempts have a `correct` value but no record of who decided it |
| 5 | A quiz writes attempts but never review state | a quiz is not practice; the UI should say so |
| 6 | `descending` year order in the institution filter | most recent first is what a student wants |
| 7 | `"easy"` jumps two ladder steps | the whole point of a four-point self-rating scale |
| 8 | `unsure` is not a lapse | "not sure" is missing evidence, not failure |

### 17.2 Fix (real bugs)

| # | defect | fix |
|---|---|---|
| 1 | `Practice` sends `type_key` only when exactly one type is selected, and **never** sends `difficulty_min`/`max` | pass `type_keys` and `difficulties` arrays; add a test that filtering shrinks the pool |
| 2 | `Practice`'s abandon-session effect compares a fresh array by identity | compare a stable serialisation of the filters |
| 3 | MCQ options that are a single block object get coerced into `text()` — **this silently lost four option images in the 2025 HSC conversion** | require an array; reject a non-array `content` in the validator |
| 4 | `docx.ts` and `pdf.ts` render MCQ options as `text ?? latex` only, so an image-only option prints `"undefined"` | render each option's blocks through the block renderer |
| 5 | `collectImages` never scans `mcq_options[].content` | include it |
| 6 | `Import.tsx` does not rewrite `asset_path` in the `hint` slot | rewrite all five slots |
| 7 | `exportCourse`'s `collectIds` ignores `answer`/`solution`/`marking_criteria`/`hint` assets, so a figure inside a mark scheme is dropped | scan all five slots, matching what the importer already does |
| 8 | Export's `institutions` filter matches `source.institution` only, while queries `COALESCE` to `source.name` | use the same `COALESCE` |
| 9 | `.qb` import does not await its classification inserts, and passes unknown node ids through as dangling FKs | await them; reject unknown ids before inserting |
| 10 | `.qb` import inserts a part before its parent if the array is ordered that way, silently orphaning it | insert parents first, or do two passes |
| 11 | `.qb` import writes `null` into `NOT NULL` timestamps when the bundle omits them | default to `nowUtc()` |
| 12 | `insertSourceIfNeeded`'s memo keys on the whole source object, so one paper's questions get several `source` rows, and `original_question_no` is whichever question came first | key on `(name, year, institution)` and store the question number on the question, not the source |
| 13 | `parseCourseBundle` has no `try/catch` around `JSON.parse` and no validation of `course` | wrap and validate |
| 14 | `updateNode` coerces every provided value with `?? null`, so `sort_order: 0` and `code: ""` become NULL | only null out `undefined` |
| 15 | `run()` calls `markDirty()` unconditionally, so every no-op write schedules a full DB export | only mark dirty when `getRowsModified() > 0` |
| 16 | `MiniRows` keys on the label, so duplicate labels collapse | key by index |
| 17 | `InkLoader` renders nothing when `messages` is empty | fall back to the default message |
| 18 | `"1 matches"` in the Practice match chip | pluralise properly |
| 19 | `CourseSelector`'s closed-state `ArrowUp` selects the current course | make it select the last |
| 20 | `"Imported N course(s)"` uses a literal `(s)` and straight quotes | pluralise and match the app's typography |
| 21 | `CreateCourseForm.onDone` cannot distinguish cancel from create | pass a reason |
| 22 | `CourseOnboarding.importBundle` has no outer catch, and joins failures into a `<p>` with no `whitespace-pre-line` | add the catch and the class |
| 23 | `CourseSettings`' export filters leak into the delete dialog | give each modal its own state |
| 24 | Bulk delete is N single-row transactions | add a batch delete |
| 25 | Bulk delete has no node or text filter, so selecting only an institution deletes all of it | require an explicit count confirmation |
| 26 | `removeQueries` uses `Array.includes` as a substring test | use a real prefix test |
| 27 | `QuestionDetail` keeps `showAnswer` / `isEditing` across a question change | reset on `questionId` change |
| 28 | Three different `["question-counts"]` key shapes | use one everywhere |
| 29 | `0${i+1}` renders `"010"` at 10+ levels | `padStart(2, "0")` |
| 30 | DOCX ignores heading levels; PDF drops image captions | honour levels; render captions in both |
| 31 | `pdf.ts` `gridRow`'s `align === "left"` branch is dead | honour the alignment |
| 32 | `isMcOptionLine` / `formatMcOption` only recognise `(A)`–`(D)` | `/^\([A-Z]\)\s/` |
| 33 | `PracticeFlow`'s timer restarts at every stage, so the persisted `elapsed_sec` is only the last stage | accumulate across stages |
| 34 | `formatElapsed` has no hours branch | add one |
| 35 | The progress bar pins at 22 % / 78 % when `questionCount` is falsy | guard the division |
| 36 | The layout progress fraction also collapses on a falsy `questionCount` | same |
| 37 | `useIsFetching()` animates the global loading bar for any background refetch | gate it on user-initiated work |
| 38 | Both sidebar variants mount simultaneously at `lg` | render one |
| 39 | The mobile menu is not a focus trap and destroys the in-menu CourseSelector state | trap focus; keep the selector mounted |
| 40 | The generation strip is course-agnostic | scope it to `task.courseId` |
| 41 | `StructureEditor` uses `window.prompt` | replace with an inline input or a modal |
| 42 | `QuestionManager`'s pencil and trash have no `aria-label` | add them |
| 43 | The Browser search has no `aria-label` and no debounce | add both |
| 44 | `Settings`' dark-theme switch is unlabelled | associate the label |
| 45 | The delete modal hides `Skip` and blocks `Next` until a score is entered | always allow skipping |
| 46 | Repeated `Save score` writes duplicate attempt rows | upsert |
| 47 | Skipped questions inflate the percentage denominator | track skips separately |
| 48 | `Browser` writes its persisted state twice per change | write once |
| 49 | The MCQ correct/incorrect colours don't flip in dark mode | theme-aware tokens plus a non-colour cue |
| 50 | The theme toggle's icon shows the current theme while its label promises the next | align them |
| 51 | `repair_multipart_solutions.py` is referenced by `WORKFLOW.md` but is not packaged into `.skill` | add it or reword |
| 52 | No skip link, no focus-on-navigation, no page announcement | add all three |

### 17.3 Accept (known, low impact)

`reviewStatesForIds` is unchunked (SQLite's variable limit applies to very large due queues — chunk it if a course ever exceeds ~1000 due items). `discardPracticeSession` cascades away its attempts — the schema, not a bug. `by_difficulty` keys nulls under `"null"`. `source.paper`, `source.original_page`, `source.original_filename` and `source.import_job_id` are dead columns — leave them; removing them would break existing databases. `Question.parts` is recursive in the type but only one level deep in practice. `buildExamPaperPlan`'s `totalMarks` is the achieved marks rather than the plan's sum — deliberate, and the instructions box should print what was actually selected.

---

# 18. Test suite

`npm test` runs five `node --test` files, all with `--test-isolation=none`, importing the `.ts` sources **directly**. No transpiler, no DOM. Anything these tests import must therefore stay pure and Node-importable.

| file | count | covers |
|---|---|---|
| `tests/questionSelection.test.mjs` | 5 | equal-marks shortcut; greedy restart/swap solving `[6,5,5]` to exactly 1000 units; `[2,3]` returning both at 500 units; `[8,8]` keeping the 800-unit single-question fallback; an expired deadline still returning a non-empty result with `selectionLimited: true` |
| `tests/reviewSchedule.test.mjs` | 17 | SQL UTC round-trip and garbage rejection; **UTC immunity to the Sydney Oct/Nov DST transitions**; a first "got it" scheduling one day out at `ladder_step 1` / `last_outcome "self_assessed"`; "easy" jumping two steps and capping at 70 days; "hard" repeating without advancing or lapsing; "unsure" recorded without a lapse but still +1 day; "again" at +10 minutes with `lapse_count 1` and a reset ladder; an incorrect objective answer lapsing despite an `"easy"` rating; a correct objective answer still honouring a pessimistic `"again"`; policy adjustment plus self-healing from junk JSON; `isDue` at the exact boundary second; every `dueReason` string; ranking preferring missed and lapsed items and dropping non-due ones; every `describeInterval` phrase; `attemptRank` ordering and only `reviewed` counting as completed; legacy `"completed"` → `"Attempted"` with unknown values → `"Seen"`; the three enum guards |
| `tests/schemaMigrations.test.mjs` | 3 | running real `sql.js`: migration 1 against a legacy DB with `foreign_keys = ON`, asserting the 7 new `practice_attempt` columns land after the existing 8, `course.is_sample` appears, `question_review_state` and `app_setting` exist, `scored_by = 'manual_legacy'` and **not** `objective`, no attempt is lost, course defaults to non-sample and session to `active`; cascade from `question` to `question_review_state`; the migrated column lists are **identical** to a fresh `SCHEMA_SQL` install for `course`, `practice_session`, `practice_attempt`, `question_review_state` and `app_setting`, and `SCHEMA_VERSION === Math.max(...MIGRATIONS.map(m => m.id))` |
| `tests/sessionPlan.test.mjs` | 12 | every mode has a label and a hint ending in `.`; duplicates collapse; focused keeps the filtered order with `balanced === false`; due-review preserves the queue's ranking and `reason_text`; mixed alternates topics with no two adjacent items sharing a topic; a smaller topic is not starved; interleaving survives truncation; a single-topic mixed pool is just the list; unclassified questions form their own bucket with coverage key `""`; coverage reports available vs selected, ordered biggest first; an empty pool plans nothing; `suggestedSessionSize` caps due-review at 30 and returns `null` otherwise |
| `tests/studyProgress.test.mjs` | 14 | evidence graded below `MIN_EVIDENCE`; a standing is described never judged, and ⚠ **no label matches `/master\|weak/i`**; `evidenceNote` always shows the sample size; a parent's numbers include its children's while keeping its own counts and the newest review in the subtree; subtree reviews feed the standing but difficulty signals do not leak upward; `describeRecency` for null/0/1/4/9/30/200 days; `describeMarkingMix` never blends app- and self-marked; `add_questions` for an empty bank; an unpaused due queue outranks everything; a paused queue says so; a topic needing another look beats an untouched one; an untouched topic is offered when nothing is due; unclassified questions still get a prompt; `keep_going` names the stalest topic |

**New tests the rebuild should add**, each covering a §17.2 fix:

- a filter round-trip proving `type_keys` and `difficulties` reach the query;
- a `PracticeFilters` → `PracticeSessionSummary` integration test against real `sql.js`;
- a `.qbx` round-trip: export → import → assert identical question count, part structure and asset references;
- an MCQ whose options contain images, exported to DOCX and PDF, asserting the image count is non-zero;
- an accessibility smoke test asserting every icon-only button has an accessible name.

---

# 19. Build order

Dependency order, not feature order. Do not skip ahead — several steps are meaningless until an earlier one exists.

| # | step | produces | done when |
|---|---|---|---|
| 1 | Scaffold | `package.json`, `vite.config.ts`, `tsconfig*.json`, `postcss.config`, `index.html`, `public/sql-wasm.wasm`, `main.tsx` | `npm run dev` shows an empty page and `npm run build` succeeds |
| 2 | Design system | `index.css` with the `@custom-variant`, `@theme inline` tokens, `@utility panel` / `label`, the custom classes and the reduced-motion block | a test page renders the palette in both themes |
| 3 | Core utils | `lib/utils.ts`, `lib/id.ts`, `lib/questionTypes.ts`, `lib/nodeFilters.ts` | `cn` and the id helpers typecheck |
| 4 | Pure domain | `lib/reviewSchedule.ts`, `lib/sessionPlan.ts`, `lib/studyProgress.ts`, `lib/questionSelection.ts` | **the reviewSchedule, sessionPlan and studyProgress suites pass** |
| 5 | Local store | `lib/db/schema.ts`, `lib/db/indexeddb.ts`, `lib/db/persistenceStatus.ts`, `lib/db/sqlite.ts` | the schemaMigrations suite passes and a reload keeps data |
| 6 | Data layer | `lib/data.ts` | a scratch script can create a course, add a node and insert a question, then read it back after a reload |
| 7 | Assets and maths | `lib/assets.ts`, `lib/equations.ts`, `lib/resolvers.ts`, `lib/MathText.tsx` | an image and a LaTeX equation both render |
| 8 | Exchange | `lib/exchange.ts`, `lib/sampleCourse.ts`, `lib/questionImportAssets.ts` | a `.qb` export → re-import round-trips with identical ids and assets |
| 9 | UI primitives | `components/ui/*` and `components/system.tsx` | the modal traps focus and restores it |
| 10 | Shell | `App.tsx`, `components/Layout.tsx`, `hooks/*`, `components/CourseSelector.tsx` | every route renders inside the shell with no course active |
| 11 | Onboarding | `components/CourseOnboarding.tsx`, `components/CreateCourseForm.tsx`, `components/SampleCourseNotice.tsx` | the sample course can be added and practised |
| 12 | Course setup | `pages/CourseSettings.tsx`, `components/StructureEditor.tsx`, `components/NodeTree.tsx` | a three-level tree can be built and renamed |
| 13 | Authoring | `components/BlockEditor.tsx`, `components/QuestionReader.tsx`, `components/QuestionEditor.tsx`, `pages/QuestionDetail.tsx` | a question with parts, options and a marking guide round-trips through save and reload |
| 14 | Browsing | `components/FilterMenu.tsx`, `pages/Browser.tsx` | filters narrow the result set and persist across a reload |
| 15 | Study loop | `pages/Practice.tsx`, `components/PracticeFlow.tsx`, `SessionModePicker`, `SelfAssessment`, `SessionExhausted`, `DueQueueCard`, `StudyOverview`, `SetupProgress`, `RecentQuestionsSidebar` | a full session completes and reschedules correctly |
| 16 | Dashboard and settings | `pages/Dashboard.tsx`, `pages/Settings.tsx`, `components/StudySettings.tsx`, `components/SaveStatus.tsx` | the review ladder can be edited and pausing the queue works |
| 17 | Quiz | `pages/Quiz.tsx` | a quiz runs end to end and the summary's badge counts sum to the deck length |
| 18 | Papers | `lib/examLayout.ts`, `lib/criteria.ts`, `lib/docx.ts`, `lib/pdf.ts`, `lib/tests.ts`, `pages/TestGenerator.tsx` | a DOCX and a PDF generate, download, and preview |
| 19 | Import | `pages/Import.tsx` | a `.qbx` and a raw JSON both import with a correct per-question report |
| 20 | Tests and lint | the full `npm test` and `npm run lint` | green |

---

# 20. Acceptance criteria

The rebuild is done when **all** of the following are true.

## 20.1 Behaviour

1. Adding the sample course, practising four questions, and removing it works end to end with no server and no console errors.
2. Creating a course, building a three-level topic tree, and importing a `.qb` bundle all work, and the imported course is immediately practisable.
3. A practice session: filters narrow the pool; the hint ladder works; the MCQ verdict is correct; the self-rating writes a review row; `next_due_at` matches the ladder; a reload resumes the session at the same question.
4. ⚠ **A multi-select type filter and a difficulty filter both actually narrow the pool.** This is the single most important behavioural fix.
5. ⚠ **An MCQ with image options survives export to DOCX and to PDF.** No `"undefined"` strings, no missing images.
6. A `.qb` export → re-import round-trips: same question count, same part nesting, same asset references, and (when included) the review schedule and attempts.
7. The quiz runs, self-marks, and its summary badge counts sum to the deck length, with self-marked and app-marked always reported separately.
8. The test generator produces a DOCX and a PDF; the marks targets are met or the mismatch is explained; the in-app preview renders; past tests list, preview, download and delete.
9. Every destructive action asks first with the exact copy in §16.2, and nothing is deleted without that prompt.

## 20.2 Copy and honesty

10. No occurrence of `mastered` or `weak` anywhere in the UI.
11. Every standing and every marking-mix figure prints its sample size and splits app-marked from self-marked.
12. No cloud, sync, account or server wording anywhere.
13. Spelling follows British-verb/American-noun throughout.

## 20.3 Accessibility

14. `npm run lint` is clean and every interactive element is reachable and operable by keyboard alone.
15. The modal traps focus, closes on `Escape`, and restores focus to its trigger.
16. The mobile menu is a real focus trap.
17. Every icon-only button has an accessible name; every form control has a label.
18. Every failure banner is `role="alert"`; every progress region is `role="status"` with a stable message.
19. The app announces and moves focus on route change.
20. ⚠ Zero `role="alert"`-less error text on a destructive or blocking path.

## 20.4 Data integrity

21. Reloading never loses data; the save indicator is truthful about saving, saved and failed; a failed save is retryable and never silently discarded.
22. `Clear questions` survives the hard reload — i.e. `flush()` completes before the reload fires.
23. `Clear everything` leaves the app in the same state as a first visit.
24. A migrated database from the previous schema loads without data loss, and `question_review_state` cascades with its question.

## 20.5 Build

25. `npm run build` (`tsc -b && vite build`) succeeds with no type errors.
26. `npm test` passes all five suites, including the new tests in §18.
27. `npm run lint` is clean.
28. The build deploys to GitHub Pages under `/Quaestio/` and the app boots, with `sql.js` loading from the base path and no cross-origin or mixed-content warnings.
29. `grep` finds no `fetch(`, `XMLHttpRequest`, `WebSocket`, `navigator.sendBeacon` or remote font/analytics URL in `src/`.

---

*End of specification. If something here is ambiguous, prefer the behaviour the tests in §18 assert, then the copy in §16, then the structure in §12. Those three are the parts a user can actually notice.*


