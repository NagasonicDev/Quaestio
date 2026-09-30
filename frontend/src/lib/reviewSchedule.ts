/**
 * Review scheduling as a pure domain function.
 *
 * Everything here is deterministic: the same previous state, input and
 * reference instant always produce the same next state. The UI never computes
 * dates, so the policy can be reviewed, tuned or replaced without touching a
 * component. Timestamps are UTC SQL datetimes ("YYYY-MM-DD HH:MM:SS") which is
 * the format `nowUtc()` and SQLite `datetime('now')` already produce, so
 * string comparison in SQL and in JavaScript agree.
 *
 * Design rules taken from the study-experience proposal:
 *  - an interval is a small, visible ladder rather than a hidden scheduler;
 *  - a lapse is recorded honestly, never smoothed away;
 *  - a self-rating is a study signal, not a grade, so an ungraded attempt can
 *    still move a question forward;
 *  - the ladder step is derived from counters rather than duplicated, so the
 *    row can never hold two disagreeing copies of the same fact.
 */

export type SelfRating = "again" | "hard" | "got_it" | "easy" | "unsure";

export type ReviewOutcome =
  | "self_assessed"
  | "objective_correct"
  | "objective_incorrect";

/** Interaction states for a single question. Ordered by progress. */
export type AttemptStatus = "seen" | "attempted" | "revealed" | "reviewed";

export const SELF_RATINGS: readonly SelfRating[] = [
  "again",
  "hard",
  "got_it",
  "easy",
  "unsure",
] as const;

export const SELF_RATING_LABEL: Record<SelfRating, string> = {
  again: "Again",
  hard: "Hard",
  got_it: "Got it",
  easy: "Easy",
  unsure: "Not sure",
};

export const SELF_RATING_HINT: Record<SelfRating, string> = {
  again: "Show this again very soon",
  hard: "I got there, but it took effort",
  got_it: "I could do this unaided",
  easy: "This felt straightforward",
  unsure: "No judgement either way",
};

export interface ReviewState {
  question_id: string;
  next_due_at: string | null;
  interval_days: number;
  last_reviewed_at: string | null;
  /** Every recorded review event for this question. */
  review_count: number;
  /** The subset of review events that were lapses ("again", or answered wrong). */
  lapse_count: number;
  /**
   * Position on the ladder: how many successful reviews in a row this question
   * has had. A lapse sends it back to 0. This cannot be recovered from the
   * counters above — `review_count - lapse_count` keeps counting the
   * successful reviews that happened *before* a lapse, which would hand a
   * lapsed question a longer interval on its very next review. It is a state
   * machine position, not a second copy of a stored interval.
   */
  ladder_step: number;
  last_rating: SelfRating | null;
  last_outcome: ReviewOutcome | null;
  updated_at: string;
}

export interface ReviewPolicy {
  /** Interval in days for 0, 1, 2, ... successful reviews. Index 0 is the first. */
  ladder: number[];
  /** Minutes until a lapsed question comes back. */
  againMinutes: number;
}

export const DEFAULT_REVIEW_POLICY: ReviewPolicy = {
  ladder: [0, 1, 3, 7, 16, 35, 70],
  againMinutes: 10,
};

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

export function emptyReviewState(questionId: string, at: string): ReviewState {
  return {
    question_id: questionId,
    next_due_at: null,
    interval_days: 0,
    last_reviewed_at: null,
    review_count: 0,
    lapse_count: 0,
    ladder_step: 0,
    last_rating: null,
    last_outcome: null,
    updated_at: at,
  };
}

/**
 * Accept whatever came out of storage and return a policy that is safe to use.
 * A ladder that is missing or unusable falls back to the default rather than
 * collapsing to a shorter one, because a corrupted row must not quietly turn
 * every review into a one-day review.
 */
export function normalizePolicy(policy?: Partial<ReviewPolicy> | null): ReviewPolicy {
  const raw: unknown[] = Array.isArray(policy?.ladder) ? policy!.ladder : [];
  const cleaned = raw
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n > 0)
    .map((n) => Math.round(n * 100) / 100);
  const ladder = cleaned.length > 0 ? [0, ...cleaned] : [...DEFAULT_REVIEW_POLICY.ladder];
  const minutes = Number(policy?.againMinutes);
  const againMinutes = Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : DEFAULT_REVIEW_POLICY.againMinutes;
  return { ladder, againMinutes };
}

/**
 * The ladder step for a state. `ladder_step` is authoritative; the counter
 * fallback only exists so a row written before the column existed still loads.
 */
export function ladderStep(state: Pick<ReviewState, "ladder_step" | "review_count" | "lapse_count">): number {
  if (Number.isFinite(state.ladder_step)) return Math.max(0, state.ladder_step);
  return Math.max(0, state.review_count - state.lapse_count);
}

function intervalForStep(policy: ReviewPolicy, step: number): number {
  const index = Math.min(Math.max(step, 0), policy.ladder.length - 1);
  return policy.ladder[index];
}

function addDays(utc: string, days: number): string {
  const parsed = parseSqlUtc(utc);
  if (parsed == null) return utc;
  return formatSqlUtc(parsed + Math.round(days * DAY_MS));
}

function addMinutes(utc: string, minutes: number): string {
  const parsed = parseSqlUtc(utc);
  if (parsed == null) return utc;
  return formatSqlUtc(parsed + Math.round(minutes * MINUTE_MS));
}

const SQL_UTC = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/;

/** Parse a SQLite UTC datetime (fractional seconds optional) into epoch ms. */
export function parseSqlUtc(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = SQL_UTC.exec(value.trim());
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
}

export function formatSqlUtc(epochMs: number): string {
  const d = new Date(epochMs);
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return (
    `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  );
}

/**
 * Whole days between two UTC datetimes, rounded toward zero. Used for the
 * "was due 2 days ago" wording and for the recency buckets on the dashboard.
 */
export function daysBetween(from: string, to: string): number {
  const a = parseSqlUtc(from);
  const b = parseSqlUtc(to);
  if (a == null || b == null) return 0;
  return Math.trunc((b - a) / DAY_MS);
}

export function isDue(state: Pick<ReviewState, "next_due_at">, at: string): boolean {
  if (!state.next_due_at) return false;
  return state.next_due_at <= at;
}

export interface ReviewInput {
  rating: SelfRating;
  /** null/undefined when the attempt was not objectively scored. */
  objectiveCorrect?: boolean | null;
  at: string;
  policy?: ReviewPolicy;
}

/**
 * Apply one review event and return the next state. Never mutates `prev`.
 *
 * A wrong objective answer counts as a lapse regardless of the rating the
 * student picked; a correct objective answer still respects their rating,
 * because a student can choose the right answer for the wrong reason.
 */
export function nextReviewState(
  prev: ReviewState,
  input: ReviewInput
): ReviewState {
  const policy = normalizePolicy(input.policy);
  const reviewedAt = formatSqlUtc(parseSqlUtc(input.at) ?? 0);
  const step = ladderStep(prev);
  const lapsed = input.objectiveCorrect === false || input.rating === "again";
  const outcome: ReviewOutcome =
    input.objectiveCorrect === true
      ? "objective_correct"
      : input.objectiveCorrect === false
        ? "objective_incorrect"
        : "self_assessed";

  let interval: number;
  let nextStep: number;
  if (lapsed) {
    nextStep = 0;
    interval = policy.againMinutes / 1440;
  } else if (input.rating === "easy") {
    nextStep = step + 2;
    interval = intervalForStep(policy, nextStep);
  } else if (input.rating === "got_it") {
    nextStep = step + 1;
    interval = intervalForStep(policy, nextStep);
  } else {
    // "hard" and "not sure" repeat the current step rather than advancing it.
    nextStep = Math.max(1, step);
    interval = intervalForStep(policy, nextStep);
  }

  const reviewCount = prev.review_count + 1;
  const lapseCount = prev.lapse_count + (lapsed ? 1 : 0);
  return {
    question_id: prev.question_id,
    next_due_at: lapsed
      ? addMinutes(reviewedAt, policy.againMinutes)
      : addDays(reviewedAt, interval),
    interval_days: interval,
    last_reviewed_at: reviewedAt,
    review_count: reviewCount,
    lapse_count: lapseCount,
    ladder_step: nextStep,
    last_rating: input.rating,
    last_outcome: outcome,
    updated_at: reviewedAt,
  };
}

/** A never-reviewed question is due the moment it enters the queue. */
export function newlyDueReviewState(questionId: string, at: string): ReviewState {
  const state = emptyReviewState(questionId, at);
  return { ...state, next_due_at: at };
}

export function describeInterval(state: Pick<ReviewState, "interval_days" | "review_count">): string {
  if (!state.review_count) return "Not scheduled yet";
  const days = state.interval_days;
  if (days <= 0) return "Later today";
  if (days < 1) return `In ${Math.max(1, Math.round(days * 24 * 60))} minutes`;
  if (days === 1) return "Tomorrow";
  if (days < 14) return `In ${Math.round(days)} days`;
  if (days < 60) return `In ${Math.round(days / 7)} weeks`;
  return `In ${Math.round(days / 30)} months`;
}

export type DueReasonKind = "never_reviewed" | "overdue" | "due_now" | "rated_difficult" | "missed_objectively";

export interface DueReason {
  kind: DueReasonKind;
  /** Human sentence explaining why this question is in the queue. */
  text: string;
}

/**
 * Explain why a question is appearing. Ordering matters: the most informative
 * reason wins, so a question rated difficult yesterday does not get described
 * as merely "due now".
 */
export function dueReason(
  state: ReviewState,
  at: string,
  options: { includeRatedDifficult?: boolean } = {}
): DueReason {
  if (!state.review_count) {
    return { kind: "never_reviewed", text: "You have not reviewed this yet" };
  }
  if (state.last_outcome === "objective_incorrect" && state.lapse_count) {
    const ago = describeWhen(state.last_reviewed_at, at);
    return {
      kind: "missed_objectively",
      text: ago ? `You answered this incorrectly ${ago}` : "Your last answer was incorrect",
    };
  }
  if (options.includeRatedDifficult && (state.last_rating === "hard" || state.last_rating === "unsure")) {
    const ago = describeWhen(state.last_reviewed_at, at);
    return {
      kind: "rated_difficult",
      text: `You marked this ${state.last_rating === "hard" ? "hard" : "not sure"} ${ago ?? "recently"}`,
    };
  }
  const late = state.next_due_at ? daysBetween(state.next_due_at, at) : 0;
  if (late >= 1) {
    return { kind: "overdue", text: `Due ${late} day${late === 1 ? "" : "s"} ago` };
  }
  return { kind: "due_now", text: "Ready for another look" };
}

function describeWhen(then: string | null, at: string): string | null {
  if (!then) return null;
  const days = daysBetween(then, at);
  if (days <= 0) return "earlier today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "last week";
  return `${Math.round(days / 7)} weeks ago`;
}

/**
 * Items a review queue should surface first: due, recently missed, or rated
 * difficult. Returns question ids in priority order. Pure so the ordering can
 * be tested without a database.
 */
export function rankDueQuestions(
  states: ReviewState[],
  at: string,
  limit = 50
): ReviewState[] {
  const weight = (state: ReviewState): number => {
    const priority = (state.next_due_at ? daysBetween(state.next_due_at, at) : 0) * 10;
    const lapseWeight = Math.min(state.lapse_count, 5) * 6;
    const ratingWeight = state.last_rating === "hard" ? 8 : state.last_rating === "unsure" ? 4 : 0;
    const outcomeWeight = state.last_outcome === "objective_incorrect" ? 8 : 0;
    const recency = state.last_reviewed_at ? Math.max(0, 30 - daysBetween(state.last_reviewed_at, at)) : 0;
    return -(priority + lapseWeight + ratingWeight + outcomeWeight + recency);
  };
  return [...states]
    .filter((state) => isDue(state, at))
    .sort((a, b) => weight(a) - weight(b) || (a.next_due_at ?? "").localeCompare(b.next_due_at ?? ""))
    .slice(0, Math.max(0, limit));
}

export function isSelfRating(value: unknown): value is SelfRating {
  return typeof value === "string" && (SELF_RATINGS as readonly string[]).includes(value);
}

export function isReviewOutcome(value: unknown): value is ReviewOutcome {
  return (
    value === "self_assessed" || value === "objective_correct" || value === "objective_incorrect"
  );
}

export function isAttemptStatus(value: unknown): value is AttemptStatus {
  return value === "seen" || value === "attempted" || value === "revealed" || value === "reviewed";
}

export function attemptRank(status: AttemptStatus): number {
  return { seen: 0, attempted: 1, revealed: 2, reviewed: 3 }[status];
}

/** A review item only counts as complete once feedback was self-assessed. */
export function isCompletedReview(status: AttemptStatus | null | undefined): boolean {
  return status === "reviewed";
}

export const ATTEMPT_STATUS_LABEL: Record<AttemptStatus, string> = {
  seen: "Seen",
  attempted: "Attempted",
  revealed: "Answer revealed",
  reviewed: "Reviewed",
};

/**
 * Turns whatever is stored in the attempts table into one of the four honest
 * labels above.
 *
 * Rows written before the lifecycle split carry a single "completed" status, and
 * the migration cannot tell whether that row was a full review or just a score
 * being typed in. So the safest reading is "Attempted": something was answered,
 * and nothing more is claimed.
 */
export function attemptStatusLabel(status: string | null | undefined): AttemptStatus {
  if (isAttemptStatus(status)) return status;
  if (status === "completed") return "attempted";
  return "seen";
}

/** The display word for a stored status, after legacy rows are interpreted. */
export function activityLabel(status: string | null | undefined): string {
  return ATTEMPT_STATUS_LABEL[attemptStatusLabel(status)];
}
