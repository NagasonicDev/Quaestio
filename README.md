# Quaestio

**A calm, flexible place to build a question bank, practise what you know, and make your own test papers.**

Quaestio works in your browser and keeps your courses and study history on your device. Start from a ready-made course template or a sample course, then shape the question bank around the way you study.

<!-- Add a screenshot or short demo GIF here when one is available. -->

## Build your bank

- **Start from a template.** Pick from 28 ready-made HSC course templates—current syllabus and pre-reform—with the syllabus structure, subject tags, and module topics already in place, or create a course from scratch with your own hierarchy, difficulty levels, and question types.
- **Organise your way.** Questions sit in a course tree of topics and subtopics. Rename or reshape the levels, add categories, and browse or filter by subject, difficulty, question type, tags, institution, and year.
- **Write rich questions.** A block editor for formatted text, equations (LaTeX), images, diagrams, function graphs, tables, lists, code, and multi-part prompts. Keep the hint, answer, solution/working, and marking criteria with each question, plus source metadata and an "approved" flag when it is ready for practice and tests.
- **Share reading passages and data.** Maintain a course-level library of stimuli (passages, tables, data extracts), link them to any number of questions, and they appear beside the question while you study.
- **Bring your questions with you.** Import JSON or `.qbx` question bundles, restore a complete `.qb` course backup—including images, review history, and stimuli—or download a skill file so an AI assistant can author question JSON in Quaestio's import format.

## Practise and revise

- **Practise with a purpose.** Choose **Focused practice** (your current filters), **Mixed practice** (a balanced draw across topics and types), or **Due for review** (your spaced-repetition queue).
- **Let the schedule drive you.** Rate each question **Again / Hard / Got it / Easy** and Quaestio spaces your reviews out over days and weeks. The due-queue card tells you what is waiting.
- **Reveal help gradually.** Hints appear one step at a time before the marking guide, answer, and solution. Multiple-choice questions are scored objectively; free-text answers are self-assessed.
- **See your progress.** The overview shows practice coverage across the course tree and your recent activity, and a session that runs out tells you whether to broaden filters, reset, or repeat—never a dead end.
- **Take a timed quiz.** Pick up to 30 questions, set a timer or go untimed, flag questions as you go, and finish with an exam summary: score breakdown, per-question outcomes, and a review against the marking criteria.

## Make test papers

- **Build a paper in sections.** Give each section a label, a filtered question pool, random or sequential ordering, and a mark total.
- **Export as Word or PDF.** Both formats produce a full exam paper: cover page with centre and student number boxes, general instructions, examination structure, section headers with time allowances, marks in the margin, answer lines, source credits, and page footers.
- **Get a solutions document.** A matching DOCX/PDF of solutions and marking guide, with criteria tables, generated alongside the paper—progress is shown while it runs, and the paper keeps generating in the background if you navigate away.
- **Attach stimulus material.** Linked stimuli are appended to the paper as a numbered Stimulus Material section.
- **Keep your papers.** Past tests are listed with per-format generation times, ready to re-download or delete.

## Study comfortably

- **Dark mode** and a responsive layout that works across phone, tablet, and desktop.
- Accessible dialogs and menus: keyboard navigation, Escape to close, focus returned to where you were.
- Everything runs locally—no account, no server, no sync. See below for how your data is stored.

## Get started

### Try it online

Open the **Quaestio GitHub Pages site**: [Launch Quaestio](https://nagasonicdev.github.io/Quaestio/)

Your courses are saved in the browser you use to open it. They are not synced between devices or browser profiles, so export a course backup if you want to move it or keep a copy.

### Run it on your computer

Install [Node.js 20.19 or later](https://nodejs.org/) (or Node.js 22.12 or later), download or clone this repository, then:

1. Open the project folder.
2. Double-click `Start Quaestio.bat` on Windows, `Start Quaestio.command` on macOS, or run `./start.sh` on Linux.
3. Keep the terminal window open while you use Quaestio. The launcher opens the app in your browser.

The first launch installs the app's dependencies. After that, start it again with the same launcher whenever you want to study.

## Your courses and privacy

Quaestio stores course content, images, stimuli, practice history, review schedules, and generated tests in browser storage on your device. The app does not use a Quaestio account or sync your data to a Quaestio server.

That means each browser profile has its own copy. Use **Export course** to download a `.qb` backup, then import that file in another browser or keep it somewhere safe. Clearing the browser's site data can erase your local courses, so back up anything you want to keep.

## Questions and feedback

Found a problem or have an idea that would make studying better? [Open an issue](https://github.com/NagasonicDev/quaestio/issues).

---

<sub>Quaestio is a browser-based study tool. Your question bank is yours to organise and back up.</sub>
