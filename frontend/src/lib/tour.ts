// The first-visit walkthrough's content and the rule that decides what to show.
// Kept free of React so the ordering can be checked in Node tests; the overlay
// that renders it lives in components/Tour.tsx.

/** Written once the tour is finished or skipped; cleared by "Clear everything". */
export const TOUR_SEEN_KEY = "tour_seen";

export type TourStep = {
  id: string;
  /** What the user is on when the step has no route of its own. */
  page: string;
  /** Route the step belongs to; absent means "show it wherever the user is". */
  path?: string;
  /** Value of a data-tour attribute to highlight; absent means a centred card. */
  target?: string;
  title: string;
  body: string;
};

export type TourResolution =
  | { mode: "info"; step: TourStep }
  | { mode: "navigate"; step: TourStep }
  | { mode: "done"; step: null };

export function navTourTarget(path: string | undefined): string {
  if (!path || path === "/") return "nav-overview";
  return `nav-${path.replace(/^\//, "")}`;
}

/**
 * A step is shown in place when the user is on its page (or when it has no page
 * of its own). Otherwise it waits in "navigate" mode: the tooltip points at the
 * navigation link and there is no Next button, so the only way on is to click
 * the tab. Steps advance by index only, so no page can be skipped by accident.
 */
export function resolveTourStep(steps: TourStep[], index: number, path: string): TourResolution {
  const step = steps[index];
  if (!step) return { mode: "done", step: null };
  if (!step.path || step.path === path) return { mode: "info", step };
  return { mode: "navigate", step };
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    page: "this page",
    title: "Welcome — a two-minute tour",
    body: "I'll point out the main features page by page, and you click through as we go. Nothing here can change your questions, and you can leave at any time with Skip tour (or the Settings page brings it back).",
  },
  {
    id: "practice-filters",
    page: "Practice",
    path: "/practice",
    target: "practice-filters",
    title: "Choose what to practise",
    body: "Filters narrow the pool by topic, question type, difficulty, tag and source. The count on the left shows how many questions match before you commit to a session.",
  },
  {
    id: "practice-modes",
    page: "Practice",
    path: "/practice",
    target: "practice-modes",
    title: "Pick how the session behaves",
    body: "Focused draws questions on one topic, Mixed spreads them across the course, and Due for review only brings back questions the schedule says you are about to forget.",
  },
  {
    id: "practice-start",
    page: "Practice",
    path: "/practice",
    target: "practice-start",
    title: "Start a session",
    body: "Each question asks you to attempt it first, then reveals the marking guide, answer and solution — and finally you rate how it went. That rating is what decides when the question comes back.",
  },
  {
    id: "nav-quiz",
    page: "Quiz",
    path: "/quiz",
    target: "nav-quiz",
    title: "Next: the Quiz tab",
    body: "Quiz is a timed, exam-style run through a set of questions. Open the Quiz tab to carry on.",
  },
  {
    id: "quiz-setup",
    page: "Quiz",
    path: "/quiz",
    target: "quiz-setup",
    title: "Set the length",
    body: "Use the slider to choose how many questions the quiz draws from everything your filters match. Each question runs on its own stopwatch.",
  },
  {
    id: "quiz-generate",
    page: "Quiz",
    path: "/quiz",
    target: "quiz-generate",
    title: "Generate, answer, then self-mark",
    body: "Generate quiz draws the questions. Work through them, reveal each marking guide and enter your score — the results screen totals your marks per question at the end.",
  },
  {
    id: "nav-test-generator",
    page: "Test Generator",
    path: "/test-generator",
    target: "nav-test-generator",
    title: "Next: the Test Generator tab",
    body: "Test Generator builds a printable paper rather than a practice session. Open it to carry on.",
  },
  {
    id: "testgen-sections",
    page: "Test Generator",
    path: "/test-generator",
    target: "testgen-sections",
    title: "Build the paper section by section",
    body: "Give each section a name, a marks target and its own filters — so Section A can be multiple choice while Section B is extended response. Add as many sections as the paper needs.",
  },
  {
    id: "testgen-generate",
    page: "Test Generator",
    path: "/test-generator",
    target: "testgen-generate",
    title: "Generate and keep papers",
    body: "Generate paper produces a print-ready PDF or Word file with a matching solution set. Every paper you make is listed below so you can download, preview or delete it later.",
  },
  {
    id: "nav-browse",
    page: "Browse",
    path: "/browse",
    target: "nav-browse",
    title: "Next: the Browse tab",
    body: "Browse is your question bank. Open it to carry on.",
  },
  {
    id: "browse-search",
    page: "Browse",
    path: "/browse",
    target: "browse-search",
    title: "Search the whole bank",
    body: "Search by question text, code or source number, then sort or filter with the button. The bank remembers your filters and search for each course.",
  },
  {
    id: "browse-results",
    page: "Browse",
    path: "/browse",
    target: "browse-results",
    title: "Open a question to edit it",
    body: "Click any result to see the full question, its marks, source and metadata — and to edit, re-tag or delete it. This is also where you check how a question renders before printing it.",
  },
  {
    id: "nav-overview",
    page: "Overview",
    path: "/",
    target: "nav-overview",
    title: "Next: back to the Overview tab",
    body: "The Overview is where you check how the course is going. Open it to finish the tour.",
  },
  {
    id: "dashboard-stats",
    page: "Overview",
    path: "/",
    target: "dashboard-stats",
    title: "Where the course stands",
    body: "These cards count the bank by type and difficulty. The course selector sits at the top of the page — switch courses there, and the sun/moon button switches the theme.",
  },
  {
    id: "dashboard-due",
    page: "Overview",
    path: "/",
    target: "dashboard-due",
    title: "What is worth doing next",
    body: "The review queue shows questions the schedule is about to bring back, with a button to start exactly those. Practice coverage below shows which topics your practice is thin on.",
  },
  {
    id: "dashboard-structure",
    page: "Overview",
    path: "/",
    target: "dashboard-structure",
    title: "Your course structure",
    body: "Questions are grouped into topics like this. Edit structure takes you to Course settings, where you can add topics, rename the course and export a backup.",
  },
  {
    id: "finish",
    page: "this page",
    title: "That is the tour",
    body: "Everything else — import formats, review scheduling, appearance and backups — lives in Settings. You can replay this walkthrough from Settings whenever you like.",
  },
];
