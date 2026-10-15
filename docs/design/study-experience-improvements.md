# Quaestio Study Experience Improvements

**Status:** Proposed  
**Audience:** Product, design, and engineering  
**Scope:** UX fixes and learning features for the student study experience  
**Implementation target:** Existing client-only React, TypeScript, SQLite-WASM, and IndexedDB application

## 1. Summary

Quaestio already supports flexible courses, question banks, practice, quizzes, and printable tests. The main product gap is that students must assemble a useful bank before they can benefit, and the app does not yet turn practice activity into a clear, repeatable plan for learning.

This proposal has two tracks:

1. **Fix friction and feedback gaps** in onboarding, practice completion, persistence, navigation, and accessibility.
2. **Add a learning loop** based on retrieval practice, spaced review, confidence calibration, and optional mixed-topic practice.

The first release should stay local-first, work for any course structure, and avoid requiring an account, cloud service, or AI provider. Study-material conversion and cloud sync are later options with explicit privacy and correctness safeguards.

## 2. Product principles

- **Help students start quickly.** The first useful action should be available before a student has built a large question bank.
- **Make retrieval the default.** Encourage students to attempt an answer before showing answers, marking criteria, or worked solutions.
- **Turn attempts into a next step.** After a session, make it obvious what is due, what needs work, and how to continue.
- **Support different disciplines.** Learning features should work with configurable course hierarchies, multiple question types, free-response questions, diagrams, equations, and source metadata.
- **Keep assessment honest.** Distinguish seen, attempted, self-assessed, and objectively graded activity. Do not label a student as having mastered a topic based on one ambiguous signal.
- **Keep data portable.** New learning data must be included in course export/import and remain usable offline.
- **Make automation reviewable.** Any future generated questions or summaries must retain source references and require student review before being treated as trusted course material.

## 3. Current state and key gaps

| Area | Current behavior | Gap to address |
|---|---|---|
| First run | Asks students to create a course, then add/import questions | No immediate study value for students without a ready-made bank |
| Practice | Draws a random matching question and reveals marking guide, answer, and solution | Does not capture free-response work or a self-assessment signal |
| Session exhaustion | Excludes previously seen questions from random selection | Empty state can say there are no matches when unseen questions are simply exhausted |
| Activity | Stores `seen` and `completed` attempts and displays recent questions | Activity is not enough to infer knowledge or recommend a next review |
| Quiz | Supports timed sessions, objective MCQ scoring, and self-awarded marks | Progress is primarily session-local; no review schedule follows the quiz |
| Dashboard | Reports bank counts, type/difficulty totals, and course hierarchy | Describes content inventory rather than learning progress |
| Persistence | Stores a SQLite-WASM database snapshot in IndexedDB after a debounce | Save completion/failure is not apparent to students; abrupt exit near a write may lose the latest change |
| Navigation | Shows study, management, import, and settings destinations at one level | Important study paths compete with administrative destinations |
| Storage model | Data is local to a browser profile and exports are the portability path | Students need clear backup prompts and export-scope messaging |

Relevant implementation surfaces include `CourseOnboarding`, `Practice`, `Quiz`, `Dashboard`, `Layout`, `CourseSelector`, `RecentQuestionsSidebar`, `data.ts`, `db/schema.ts`, `db/sqlite.ts`, and `exchange.ts`.

## 4. Goals and non-goals

### Goals

- Make a first practice session possible with little setup.
- Build a repeatable loop: attempt → reflect → receive feedback → schedule review.
- Make practice history more meaningful without pretending manual scores are objective grades.
- Clarify exhaustion, save state, and recovery actions.
- Keep core study flows keyboard accessible and usable on narrow screens.
- Preserve client-only/offline behavior in the first delivery stages.

### Non-goals for the initial delivery

- Replacing the question bank or test generator.
- Automatically grading arbitrary long-form responses with an AI model.
- Adding social feeds, leaderboards, punitive streaks, or public rankings.
- Requiring accounts, remote storage, or institution integrations.
- Claiming that a confidence rating or interval scheduler proves mastery.

## 5. Proposed experience

### 5.1 First-run study on-ramp

Replace the single “create a course” path with a small set of clear options:

1. **Try a sample course** — opens a disposable example that demonstrates practice and feedback. Make it clear that the sample is separate from the student’s own courses, and provide a visible reset/remove option.
2. **Bring in questions** — import an existing `.qb` bundle or question JSON.
3. **Create a course** — retain the current customizable structure flow.
4. **Start from study material (later)** — convert user-selected notes into draft questions, preserving source references and requiring approval.

Once a course exists, show setup progress based on whether the student has topics and questions. If the bank is empty, keep “Add questions” and “Import” prominent and explain that a small starter set is enough to begin. Do not imply that a large bank is required.

### 5.2 Guided practice answer flow

For a free-response question:

1. Show the prompt, answer area, optional scratchpad, and optional hint affordance.
2. Let the student reveal hints one at a time. Hints are distinct from the answer and worked solution.
3. Before revealing feedback, ask the student to mark the answer as attempted. Optionally capture their response text locally.
4. Reveal the marking guide first, then answer and worked solution as separate sections.
5. Ask for a self-assessment: **Again**, **Hard**, **Got it**, or **Easy**. Include “I’m not sure” as an accessible, non-judgmental alternative if the four-level rating tests poorly.
6. Record elapsed time only when the student chooses to use the timer; avoid making speed a proxy for mastery.

For multiple choice, preserve the current answer selection and objective correctness signal, then collect confidence separately from correctness. Students can still inspect the explanation after a correct answer.

The existing quiz's manual mark entry remains useful for extended responses. Its score should be labeled **self-marked** and should not be mixed with objectively scored MCQ results without distinction.

### 5.3 Review queue

Add a **Due to review** entry point on the dashboard and practice page. The queue should:

- prioritize questions that are due, recently missed, or rated difficult;
- let students focus on one topic or choose a mixed session;
- display how many questions are due and an estimated session size, not a grade prediction;
- allow students to snooze or pause a queue without losing history;
- explain why an item is appearing (for example, “You marked this difficult yesterday”);
- offer a repeat option if all due questions are completed.

Start with a small, deterministic interval policy that uses response outcome and student rating. Keep the interval visible and adjustable. Validate the policy with usage and learning feedback before adopting a more complex scheduler.

### 5.4 Progress and next-step dashboard

Keep bank inventory, but add a distinct study section:

- questions reviewed recently and questions due;
- topic-level practice coverage, with number of attempts and recency;
- self-marked versus objectively marked activity;
- topics/questions the student has repeatedly marked difficult;
- one recommended next action, such as “Review 4 due questions” or “Try mixed practice for these two topics.”

Use descriptive labels such as “needs another review” rather than “weak” or “mastered.” Show sample size and let students inspect which attempts informed a summary. Do not show topic confidence until there is enough activity to make it useful; define and test a minimum evidence threshold with users.

### 5.5 Mixed practice

Add a session choice:

- **Focused practice:** stay within selected topic/type filters; appropriate when learning or refreshing a particular area.
- **Mixed practice:** draw across selected topics and, where appropriate, question types; appropriate for practising which method or concept applies.

Keep current filters available in both modes. Explain the difference in plain language. Mixed mode should avoid accidentally over-sampling a single large topic; selection should balance topic coverage when the student has selected multiple topics.

## 6. Fix designs

### 6.1 Practice exhaustion state

**Problem:** The visible matching count measures all filter-matching questions, while random selection also excludes seen IDs and may exclude recently attempted questions. The current empty state conflates “no filter matches” with “nothing left in this session.”

**Design:** Return distinct counts from the data layer: `filter_match_count`, `eligible_count`, and optionally `excluded_seen_count`. When no eligible question remains, show:

> You’ve practised all 12 matching questions in this session.

Actions: **Repeat these questions**, **Reset session**, **Broaden filters**. If filters truly match zero questions, retain the current filter guidance and offer to reset filters.

**Behavior:** Reset session clears `seenIds`; changing filters should either reset session exclusions or clearly indicate the current session's exclusions. “Avoid recently attempted” and “already seen in this session” should be explained separately.

### 6.2 Accurate attempt lifecycle

**Problem:** The practice flow records a non-MCQ question as completed when the student clicks reveal, despite not capturing an answer or self-assessment.

**Design:** Model interaction states explicitly: `seen`, `attempted`, `revealed`, and `self_assessed` (or equivalent normalized fields). A completed review item requires at least an explicit attempt plus feedback/self-assessment. If no answer text is captured, store the fact that the student confirmed an attempt; do not infer correctness.

**Behavior:** Update recent activity labels so “Seen,” “Attempted,” and “Reviewed” are distinguishable. Retain the quiz's objective result separately from a self-awarded mark.

### 6.3 Navigation and responsive layout

Group destinations into:

- **Study:** Overview, Practice, Quiz, Test Generator.
- **Question bank:** Browse, Import.
- **Course:** Course Settings, Settings.

Keep Practice or “Study” as the strongest action. On desktop, use available width earlier than the current `xl` threshold when it fits; on tablet/mobile, use a labeled, keyboard-operable menu. Make Recent Questions collapsible, move it below the primary content at narrower breakpoints, or turn it into a compact activity drawer.

### 6.4 Keyboard access for course picker and overlays

Use a well-supported accessible menu/listbox pattern. Provide predictable focus on open, arrow-key movement where a listbox is used, Enter/Space selection, Escape dismissal, and focus restoration to the trigger. Verify visible focus indicators, tab order, and screen-reader names. Apply the same review to filter, export, delete, and unsaved-changes dialogs.

### 6.5 Persistence feedback and failure recovery

Add a global local-data status: **Saving…**, **Saved on this device**, and **Could not save** with a retry action. Avoid claiming cross-device backup. Flush pending snapshots at safe lifecycle points where supported, but do not rely on asynchronous `beforeunload` work as the only protection. Surface IndexedDB quota/permission failures in context and explain how to export a backup.

### 6.6 Export clarity

Before export, state exactly which data is included (course structure, questions, images, review schedule/history, generated files, etc.). Include review state and attempt history in a versioned course bundle if product decisions confirm these are part of a student's portable learning record. Keep question-only exports intentionally narrow and label them accordingly.

## 7. Data and architecture proposal

The app is client-only: SQL.js owns the in-memory SQLite database, IndexedDB persists its snapshot and binary assets, and `data.ts` implements domain operations. New features should preserve this separation and remain usable offline.

### 7.1 Schema changes (proposed, subject to implementation review)

Add a migration/version mechanism rather than assuming `DB_VERSION` on the IndexedDB store is the only schema version. SQLite database contents need an explicit schema version and idempotent migrations.

Candidate tables:

```text
practice_session
  add: session mode/config snapshot where required (focused, mixed, due-review)

practice_attempt
  add: response_text (optional), confidence (optional), self_rating (optional)
  preserve: correct only for objectively scored outcomes; manual score remains identifiable

question_review_state
  question_id primary key, next_due_at, interval_days, last_reviewed_at,
  review_count, lapse_count, last_rating, updated_at
```

Do not store both derivable values and conflicting copies. The review-state row is a scheduling projection that can be rebuilt from attempt history where possible. Use UTC timestamps consistently and make export/import include the new state. Review state must be removed when its question or course is deleted.

The exact interval algorithm is intentionally not prescribed here. Keep it behind a pure domain function with deterministic inputs/outputs so it can be reviewed and adjusted without changing UI code. Test date boundaries, daylight-saving transitions, reset behavior, imports, and repeated/missing attempts before rollout.

### 7.2 Query and component boundaries

- `data.ts`: eligible random selection counts, attempt lifecycle writes, review queue queries, progress aggregates.
- `Practice`: session state, answer capture, progressive reveal, self-assessment, exhaustion actions.
- `Dashboard`: inventory and learning-progress sections, next recommended action.
- `RecentQuestionsSidebar`: refresh through query invalidation after local mutations instead of fixed polling where feasible.
- `exchange.ts`: versioned export/import of review state and any included attempt history.
- `db/schema.ts` and SQLite initialization: explicit migrations and rollback-safe updates.

### 7.3 Future study-material conversion

Treat this as a separate opt-in capability. The current course skill/import pipeline is compatible with a workflow where a student converts a document using a chosen assistant and imports a draft JSON file. Any in-app AI conversion would introduce external data transmission, operating cost, and generated-content correctness risks. It should not be silently added to a local-only app. A future design must specify provider, data sent, consent, source citations, deletion, and review status before implementation.

## 8. Delivery plan

### Phase 0 — UX and reliability fixes

- Distinguish no matches from session exhaustion; add repeat/reset actions.
- Distinguish viewed, attempted, and reviewed activity.
- Add persistence status and failure messaging.
- Improve navigation grouping, responsive behavior, and keyboard support.
- Explain browser-local storage and export contents at the point of use.

### Phase 1 — Learning loop foundation

- Add explicit attempt/self-assessment capture.
- Add question-level due dates and the review queue.
- Add due-review session mode and review completion feedback.
- Include schedule state in backup/export and implement migrations.

### Phase 2 — Useful progress and practice variety

- Add topic activity summaries with evidence/sample counts.
- Add focused versus mixed practice.
- Add confidence-versus-outcome reflection and repeated-difficulty cues.
- Validate balanced sampling across selected topics.

### Phase 3 — Reduce cold start

- Add sample course/starter question bundles with safe reset/removal.
- Improve bulk question import and draft review.
- Research demand and privacy expectations for study-material conversion before designing an AI-backed flow.

## 9. Success measures

Use measures that indicate useful study, not just screen visits or time in app:

- **Time to first attempt:** median time from first open to a student attempting a question.
- **First-session completion:** share of new users who attempt and review at least one question.
- **Return to review:** share of students who complete due reviews on a later day.
- **Review usefulness:** student-reported relevance of due questions and next-step recommendations.
- **Question-bank activation:** share of created/imported courses that reach a first practice session.
- **Data confidence:** export completion and restore success, plus save failures and recovery success.
- **Accessibility:** completion of core onboarding, picker, filter, and practice flows with keyboard and screen reader testing.

Where practical, validate retention with delayed recall or transfer questions in voluntary user research. Do not equate more attempts, longer sessions, or higher confidence with better learning by themselves.

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| A scheduler gives false precision | Explain intervals, allow adjustment, and avoid “mastery” claims |
| Self-marked results are mistaken for objective grades | Label scoring provenance and separate manual marks from MCQ correctness |
| Empty states create pressure or guilt | Use neutral copy; make repeat, pause, and reset normal choices |
| Starter content does not match the student's course | Make samples optional and clearly labeled; avoid implying curriculum coverage |
| Generated questions contain errors | Keep generated items in draft review, retain source references, and require approval |
| New history data increases local storage use | Keep response text optional, offer export/clear controls, and document retention |
| Local data is lost or unavailable on another device | Show local-only status, make backups discoverable, and test versioned restore |
| Mixed practice is confusing before foundations are learned | Offer focused practice and describe when to choose each mode |

## 11. Open decisions

1. Should a sample course be disposable/demo-only, or should starter bundles be importable into a student's own course?
2. Should free-response text be saved by default, saved only on explicit choice, or remain an ephemeral scratchpad?
3. Which self-rating labels are clearest to students: Again/Hard/Good/Easy, or plain-language confidence options?
4. Should review state and attempt history travel in `.qb` exports, and should students be able to export a separate activity archive?
5. What is the minimum activity evidence needed before showing topic-level progress?
6. Is cross-device sync a product requirement, or should the product remain local-first with file-based portability?

## 12. Learning-science references

- Dunlosky, J. et al. (2013). [Improving Students’ Learning With Effective Learning Techniques](https://www.psychologicalscience.org/publications/journals/pspi/learning-techniques.html). Review rates practice testing and distributed practice as broadly useful techniques.
- Roediger, H. L. & Karpicke, J. D. (2006). [Test-Enhanced Learning](https://www.psychologicalscience.org/journals/psychological-science/j.1467-9282.2006.01693.x). Retrieval practice improved delayed retention in the reported experiments.
- Rohrer, D. et al. (2020). [A Randomized Controlled Trial of Interleaved Mathematics Practice](https://eric.ed.gov/?id=EJ1237752). Evidence supporting an optional mixed-practice mode for mathematics; it should not be generalized uncritically to every course.
- *The effects of retrieval practice and prior topic knowledge on test performance and confidence judgments* (2019). [Contemporary Educational Psychology](https://www.sciencedirect.com/science/article/pii/S0361476X17305027). Examines retrieval practice and students' confidence judgments.
