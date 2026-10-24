# Question Drawing Notebook Design

## Intent

Give tablet users a comfortable place to work out answers by hand, with one persistent, editable notebook per question. The same notebook should be available wherever that question is answered and remain saved across visits.

## Goals

- Add an in-app multi-page drawing surface to question answering.
- Support stylus and touch input, pen and highlighter colours and thicknesses, undo/redo, zoom/pan, and both stroke and partial erasing.
- Support adding, naming, duplicating, reordering, navigating, and deleting pages; provide plain, ruled, grid, and dotted paper.
- Show saving state and errors clearly; preserve drawing data in app backups and restore it on import.
- Keep the notebook independent from answer reveal and scoring.

## Non-goals

- Cloud sync, collaboration, or separate notebooks for each attempt.
- Raster-only pages that cannot be edited stroke by stroke.
- A general-purpose illustration suite.

## User-approved approach

Store editable vector strokes and page metadata in the app's local SQLite database, which is persisted in IndexedDB. The app already uses this local-first database for questions and has a save-status model. A separate IndexedDB image store is possible, but would make notebook export/restore and editing less direct; raster images would also lose stroke-level editing and scale quality. The user approved one persistent notebook per question.

## Product behavior

- Show a **Drawing** area while answering in Practice and Quiz, and on the question detail page. Opening the same question in any of these places opens the same notebook.
- A question starts with one plain page. The user can add pages and choose plain, ruled, grid, or dotted backgrounds.
- Drawing tools include a pressure-aware pen when the device reports pressure, a translucent highlighter, a colour palette with custom colour selection, adjustable thickness, a whole-stroke eraser, and a partial/pixel eraser. Provide undo/redo, clear-page with confirmation, page duplication, page rename, reorder, and delete.
- Provide touch/stylus drawing, palm-rejection heuristics, fit-page, zoom, and pan. Use large tablet-friendly controls and keep drawing input distinct from page navigation.
- Changes autosave. A visible state reports saving, saved, or failed; a failure leaves the work in memory and offers retry. Do not claim saved until the database write succeeds.
- The answer reveal and quiz/practice scoring flow remain available and do not cover or clear the notebook.
- Export and import the notebook with the full `.qb` course backup. Question-only `.qbx` exports remain question-content-only. Existing backups without notebook data import normally.
- Notebooks are local to this browser/device unless transferred using the full backup. Request persistent browser storage where supported and explain storage limits/failures; indefinite retention cannot be guaranteed if the user clears browser data or loses the device without a backup.

## Storage and implementation shape

- Add a versioned database migration for notebook metadata/pages and serialized editable strokes. Associate the notebook by `question_id`; use stable page and stroke identifiers and keep eraser results editable.
- Store normalized page coordinates so content remains crisp at different screen sizes and zoom levels. Capture Pointer Events and pressure where available, with a fallback constant width.
- Use a canvas renderer for the live surface; preserve stroke data as the source of truth. Separate drawing, toolbar/page controls, and persistence access into focused components/modules.
- Add notebook records to full `.qb` serialization and import, including validation and migration compatibility.

## Constraints and open implementation calls

- The project is a React/TypeScript app with a browser-persisted SQLite database, IndexedDB persistence, and existing save-status reporting.
- Browser storage is device-local, subject to browser/device deletion and quotas. Surface these realities rather than promising recovery without a backup.
- The builder chooses sensible limits for individual page dimensions and rendering work, with enough room for normal student work and clear handling when device storage is exhausted.
- Exact custom palette defaults and toolbar arrangement are implementation choices.
