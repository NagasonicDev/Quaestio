# Quaestio

Browser-based question bank and study tool. Everything is client-side: courses, images, practice history, review schedules and generated tests live in browser storage. No account, no sync. Deployed on GitHub Pages; also runnable locally via `Start Quaestio.bat` / `.command` / `start.sh` (needs Node 20.19+ or 22.12+).

Features that carry the most risk: topics/subtopics, rich questions (formatted text, equations, images, tables, multi-part), spaced-repetition review ratings, timed quizzes, printable tests (PDF and Word), JSON import, `.qb` course export/import including images, dark mode, responsive layout.

## Layout
- `frontend/`  the app. Read `package.json` for the real scripts before running anything.
- `backend/`   exists, but the README says the app has no server. Find out what it is for before assuming anything about it (see below).
- `docs/design/`  design notes. Read the relevant file before changing UI structure or flows.
- `scripts/`, `.github/workflows/`, launchers in the root.

## Hard rules
1. **User data is sacred.** Saved courses live only in the user's browser, so a bad change can destroy them. Any change to a stored shape needs a versioned migration that is tested against data saved by the previous version. Never "just rename" a stored field.
2. **`.qb` export -> import must round-trip losslessly** (questions, topics, images, marking criteria, review history). Any schema change updates both sides and the round-trip test.
3. **Import is untrusted input.** Validate JSON and `.qb` files; reject with a readable message, never partially import silently, never crash the UI.
4. **No network dependencies at runtime.** The app is private and offline-capable by design; do not add analytics, remote fonts, CDNs or telemetry.
5. Scheduling logic (what is due, how a rating moves the next review) is pure and unit-tested. Do not bury it in components.
6. Accessibility: keyboard reachable, visible focus, labelled controls, sufficient contrast in BOTH light and dark mode. Test responsive layouts, not just desktop.
7. GitHub Pages serves under a sub-path. Use relative/base-aware asset URLs. (The repo URL appears as both `Quaestio` and `quaestio`; Pages paths are case sensitive, so check the configured base.)

## Verification before "done"
Typecheck + lint + tests + production build all pass (use the real script names from `package.json`). For UI changes, say what you checked in light and dark mode and at phone width; use the Playwright MCP if enabled.

## Unverified assumptions (confirm, then delete)
- Framework/build tool (likely React or similar with Vite given the Node requirement), storage mechanism (IndexedDB vs localStorage), PDF and DOCX libraries, equation renderer.
- What `backend/` does and whether it is deployed.
- Whether any test suite exists yet. If not, adding one for scheduling, import validation and `.qb` round-trip is the highest-value first task.
