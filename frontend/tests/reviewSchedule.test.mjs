import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_REVIEW_POLICY,
  daysBetween,
  describeInterval,
  dueReason,
  emptyReviewState,
  formatSqlUtc,
  isDue,
  ladderStep,
  nextReviewState,
  normalizePolicy,
  parseSqlUtc,
  rankDueQuestions,
  ATTEMPT_STATUS_LABEL,
  isCompletedReview,
  attemptRank,
  attemptStatusLabel,
  activityLabel,
  isReviewOutcome,
  isSelfRating,
  isAttemptStatus,
} from "../src/lib/reviewSchedule.ts";

const AT = "2026-09-30 09:00:00";

function fresh() {
  return emptyReviewState("q1", AT);
}

test("SQL UTC helpers round-trip and reject unparseable input", () => {
  assert.equal(parseSqlUtc("2026-09-30 09:00:00"), Date.UTC(2026, 8, 30, 9, 0, 0));
  assert.equal(parseSqlUtc("2026-09-30T09:00:00.123"), Date.UTC(2026, 8, 30, 9, 0, 0));
  assert.equal(parseSqlUtc(""), null);
  assert.equal(parseSqlUtc("not a date"), null);
  assert.equal(formatSqlUtc(Date.UTC(2026, 0, 5, 0, 0, 0)), "2026-01-05 00:00:00");
});

test("intervals use UTC so host daylight-saving transitions cannot shift a due date", () => {
  // 2026-10-04 is the start of daylight saving in Sydney and 2026-11-01 the
  // end. Computing an interval in UTC must ignore that entirely.
  const before = nextReviewState(fresh(), { rating: "got_it", at: "2026-10-03 12:00:00" });
  assert.equal(before.next_due_at, "2026-10-04 12:00:00");
  const across = nextReviewState(
    { ...before, review_count: 1, lapse_count: 0 },
    { rating: "got_it", at: "2026-10-31 12:00:00" }
  );
  assert.equal(across.next_due_at, "2026-11-03 12:00:00");
  assert.equal(daysBetween("2026-10-31 12:00:00", "2026-11-03 12:00:00"), 3);
});

test("a first 'got it' schedules one day out and advances the ladder step", () => {
  const next = nextReviewState(fresh(), { rating: "got_it", at: AT });
  assert.equal(next.next_due_at, "2026-10-01 09:00:00");
  assert.equal(next.interval_days, 1);
  assert.equal(next.review_count, 1);
  assert.equal(next.lapse_count, 0);
  assert.equal(ladderStep(next), 1);
  assert.equal(next.ladder_step, 1);
  assert.equal(next.last_reviewed_at, AT);
  assert.equal(next.last_outcome, "self_assessed");
  assert.equal(next.last_rating, "got_it");
});

test("'easy' jumps two ladder steps and is capped at the top rung", () => {
  let state = nextReviewState(fresh(), { rating: "easy", at: AT });
  assert.equal(state.interval_days, 3);
  state = nextReviewState(state, { rating: "easy", at: state.next_due_at });
  assert.equal(state.interval_days, 16);
  state = nextReviewState(state, { rating: "easy", at: state.next_due_at });
  assert.equal(state.interval_days, 70);
  state = nextReviewState(state, { rating: "easy", at: state.next_due_at });
  assert.equal(state.interval_days, 70, "top rung is clamped rather than extrapolated");
});

test("'hard' repeats the current step instead of advancing it", () => {
  let state = nextReviewState(fresh(), { rating: "got_it", at: AT });
  state = nextReviewState(state, { rating: "hard", at: "2026-10-01 09:00:00" });
  assert.equal(state.interval_days, 1);
  assert.equal(state.review_count, 2);
  assert.equal(state.lapse_count, 0);
  state = nextReviewState(state, { rating: "hard", at: "2026-10-02 09:00:00" });
  assert.equal(state.interval_days, 1, "repeated hard reviews never advance");
});

test("'not sure' is recorded without being punished as a lapse", () => {
  const next = nextReviewState(fresh(), { rating: "unsure", at: AT });
  assert.equal(next.lapse_count, 0);
  assert.equal(next.last_rating, "unsure");
  assert.equal(next.next_due_at, "2026-10-01 09:00:00");
});

test("'again' comes back the same day, records a lapse, and resets the ladder", () => {
  const learned = nextReviewState(fresh(), { rating: "got_it", at: AT });
  const lapsed = nextReviewState(learned, { rating: "again", at: "2026-10-01 09:00:00" });
  assert.equal(lapsed.next_due_at, "2026-10-01 09:10:00");
  assert.equal(lapsed.review_count, 2);
  assert.equal(lapsed.lapse_count, 1);
  assert.equal(ladderStep(lapsed), 0);
  const recovered = nextReviewState(lapsed, { rating: "got_it", at: "2026-10-01 09:30:00" });
  assert.equal(recovered.interval_days, 1, "recovery restarts at the first rung");
});

test("an incorrect objective answer is a lapse even when rated 'easy'", () => {
  const next = nextReviewState(fresh(), {
    rating: "easy",
    objectiveCorrect: false,
    at: AT,
  });
  assert.equal(next.lapse_count, 1);
  assert.equal(next.last_outcome, "objective_incorrect");
  assert.equal(next.last_rating, "easy", "the student's own rating is still preserved");
  assert.equal(next.next_due_at, "2026-09-30 09:10:00");
});

test("a correct objective answer respects a pessimistic self-rating", () => {
  const next = nextReviewState(fresh(), {
    rating: "again",
    objectiveCorrect: true,
    at: AT,
  });
  assert.equal(next.last_outcome, "objective_correct");
  assert.equal(next.lapse_count, 1, "choosing 'again' after a correct answer is still a self-signalled lapse");
});

test("the policy is adjustable and self-healing when stored JSON is junk", () => {
  const policy = normalizePolicy({ ladder: [0, 2, 9], againMinutes: 45 });
  assert.deepEqual(policy.ladder, [0, 2, 9]);
  assert.equal(policy.againMinutes, 45);
  const next = nextReviewState(fresh(), { rating: "got_it", at: AT, policy });
  assert.equal(next.next_due_at, "2026-10-02 09:00:00");

  const healed = normalizePolicy({ ladder: ["x", 0, -4] });
  assert.deepEqual(
    healed.ladder,
    DEFAULT_REVIEW_POLICY.ladder,
    "an unusable ladder falls back to the default rather than to a punishing one"
  );
  assert.equal(healed.againMinutes, DEFAULT_REVIEW_POLICY.againMinutes);
  assert.deepEqual(normalizePolicy(null), DEFAULT_REVIEW_POLICY);
});

test("due state respects the exact boundary second", () => {
  const state = { ...fresh(), next_due_at: "2026-09-30 09:00:00" };
  assert.equal(isDue(state, "2026-09-30 08:59:59"), false);
  assert.equal(isDue(state, "2026-09-30 09:00:00"), true);
  assert.equal(isDue(state, "2026-09-30 09:00:01"), true);
  assert.equal(isDue({ ...fresh(), next_due_at: null }, AT), false);
});

test("the queue explains why each item is appearing", () => {
  const never = fresh();
  assert.equal(dueReason(never, AT).kind, "never_reviewed");

  const learned = nextReviewState(never, { rating: "got_it", at: "2026-09-28 09:00:00" });
  const ratedHard = nextReviewState(learned, { rating: "hard", at: "2026-09-29 09:00:00" });
  assert.equal(
    dueReason(ratedHard, "2026-10-01 09:00:00", { includeRatedDifficult: true }).text,
    "You marked this hard 2 days ago"
  );

  const missed = nextReviewState(learned, {
    rating: "got_it",
    objectiveCorrect: false,
    at: "2026-09-29 09:00:00",
  });
  const reason = dueReason(missed, "2026-10-05 09:00:00", { includeRatedDifficult: true });
  assert.equal(reason.kind, "missed_objectively");
  assert.match(reason.text, /incorrectly 6 days ago/);

  const overdue = learned;
  assert.equal(dueReason(overdue, "2026-10-05 09:00:00").text, "Due 6 days ago");
  assert.equal(
    dueReason(overdue, "2026-09-30 09:00:00").text,
    "Due 1 day ago",
    "one day past its due date is still overdue, not merely ready"
  );
  const dueNow = { ...overdue, next_due_at: "2026-09-30 09:00:00" };
  assert.equal(dueReason(dueNow, "2026-09-30 09:00:00").text, "Ready for another look");
});

test("queue ranking favours missed and lapsed items and drops anything not due", () => {
  const dueNow = { ...emptyReviewState("due", AT), next_due_at: AT, review_count: 1, interval_days: 1 };
  const overdue = { ...emptyReviewState("overdue", AT), next_due_at: "2026-09-20 09:00:00", review_count: 3 };
  const missed = {
    ...emptyReviewState("missed", AT),
    next_due_at: "2026-09-28 09:00:00",
    review_count: 2,
    lapse_count: 2,
    last_outcome: "objective_incorrect",
  };
  const ratedHard = {
    ...emptyReviewState("hard", AT),
    next_due_at: "2026-09-29 09:00:00",
    review_count: 2,
    last_rating: "hard",
  };
  const notDue = { ...emptyReviewState("later", AT), next_due_at: "2026-12-01 09:00:00", review_count: 4 };

  const ranked = rankDueQuestions([dueNow, notDue, overdue, missed, ratedHard], AT);
  const ids = ranked.map((state) => state.question_id);
  assert.equal(ids.length, 4);
  assert.equal(ids.includes("later"), false);
  assert.deepEqual(ids.slice(0, 2), ["overdue", "missed"]);
  assert.equal(rankDueQuestions([dueNow, overdue, missed, ratedHard], AT, 2).length, 2);
});

test("interval descriptions read as plain language", () => {
  assert.equal(describeInterval({ interval_days: 0, review_count: 0 }), "Not scheduled yet");
  assert.equal(describeInterval({ interval_days: 0, review_count: 2 }), "Later today");
  assert.equal(describeInterval({ interval_days: 1, review_count: 1 }), "Tomorrow");
  assert.equal(describeInterval({ interval_days: 7, review_count: 3 }), "In 7 days");
  assert.equal(describeInterval({ interval_days: 16, review_count: 4 }), "In 2 weeks");
  assert.equal(describeInterval({ interval_days: 70, review_count: 6 }), "In 2 months");
});

test("interaction states only count as reviewed once self-assessed", () => {
  assert.equal(attemptRank("seen"), 0);
  assert.equal(attemptRank("attempted"), 1);
  assert.equal(attemptRank("revealed"), 2);
  assert.equal(attemptRank("reviewed"), 3);
  assert.equal(isCompletedReview("revealed"), false);
  assert.equal(isCompletedReview("reviewed"), true);
  assert.equal(ATTEMPT_STATUS_LABEL.reviewed, "Reviewed");
});

test("activity labels never claim a review the migration cannot prove", () => {
  // Pre-migration rows only have a bare "completed" flag: they may have been a
  // self-entered score, so the honest reading is "Attempted".
  assert.equal(attemptStatusLabel("completed"), "attempted");
  assert.equal(activityLabel("completed"), "Attempted");
  for (const status of ["seen", "attempted", "revealed", "reviewed"]) {
    assert.equal(attemptStatusLabel(status), status);
  }
  assert.equal(attemptStatusLabel("nonsense"), "seen");
  assert.equal(attemptStatusLabel(null), "seen");
  assert.equal(activityLabel(undefined), "Seen");
  assert.deepEqual(Object.values(ATTEMPT_STATUS_LABEL).sort(), [
    "Answer revealed",
    "Attempted",
    "Reviewed",
    "Seen",
  ]);
});

test("review outcomes are validated before they are written", () => {
  assert.equal(isReviewOutcome("self_assessed"), true);
  assert.equal(isReviewOutcome("objective_correct"), true);
  assert.equal(isReviewOutcome("objective_incorrect"), true);
  assert.equal(isReviewOutcome("correct"), false);
  assert.equal(isReviewOutcome(null), false);
  assert.equal(isSelfRating("easy"), true);
  assert.equal(isSelfRating("Great"), false);
  assert.equal(isAttemptStatus("reviewed"), true);
  assert.equal(isAttemptStatus("completed"), false);
});
