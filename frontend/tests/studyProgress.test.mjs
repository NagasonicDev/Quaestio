import test from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_ACTIVITY,
  MIN_EVIDENCE,
  STANDING_LABEL,
  describeMarkingMix,
  describeRecency,
  evidenceFor,
  evidenceNote,
  pickNextAction,
  rollupTopicActivity,
  standingFor,
} from "../src/lib/studyProgress.ts";

const AT = "2026-09-30 09:00:00";

function activity(overrides = {}) {
  return { ...EMPTY_ACTIVITY, ...overrides };
}

function node(node_id, name, children = [], level_index = 0, parent_node_id = null) {
  return {
    node_id,
    course_id: "c1",
    parent_node_id,
    level_index,
    name,
    code: null,
    description: null,
    sort_order: 0,
    children,
  };
}

function topics(list, direct = new Map(), at = AT) {
  // rollup walks children first, so look topics up by id rather than position.
  return Object.fromEntries(rolled(list, direct, at).map((t) => [t.node_id, t]));
}

function rolled(list, direct = new Map(), at = AT) {
  return rollupTopicActivity(list, direct, at);
}

test("evidence is graded, and nothing is claimed below the threshold", () => {
  assert.equal(evidenceFor(0), "none");
  assert.equal(evidenceFor(1), "some");
  assert.equal(evidenceFor(MIN_EVIDENCE - 1), "some");
  assert.equal(evidenceFor(MIN_EVIDENCE), "enough");
  // Two reviews cannot support any claim about a topic.
  assert.equal(standingFor({ reviewed: 2, due_now: 2, lapses: 2, difficult_ratings: 2 }), null);
  assert.equal(standingFor({ reviewed: 0, due_now: 0, lapses: 0, difficult_ratings: 0 }), null);
});

test("a topic with enough reviews is described, never judged", () => {
  assert.equal(
    standingFor({ reviewed: 6, due_now: 1, lapses: 0, difficult_ratings: 0 }),
    "holding_steady"
  );
  // Half the topic due again, or most reviews ending in "again"/"hard", is
  // enough to prompt another look.
  assert.equal(
    standingFor({ reviewed: 6, due_now: 3, lapses: 0, difficult_ratings: 0 }),
    "needs_another_review"
  );
  assert.equal(
    standingFor({ reviewed: 4, due_now: 0, lapses: 0, difficult_ratings: 2 }),
    "needs_another_review"
  );
  assert.equal(
    standingFor({ reviewed: 4, due_now: 0, lapses: 3, difficult_ratings: 0 }),
    "needs_another_review"
  );
  // One difficult review in a longer history is not a pattern.
  assert.equal(
    standingFor({ reviewed: 9, due_now: 0, lapses: 0, difficult_ratings: 1 }),
    "holding_steady"
  );
  const labels = Object.values(STANDING_LABEL);
  assert.deepEqual(labels.sort(), ["Holding steady", "Needs another review"]);
  for (const label of labels) {
    assert.ok(!/master|weak/i.test(label), "the app never claims mastery or weakness");
  }
});

test("the evidence note always shows the sample size", () => {
  assert.equal(evidenceNote("none", 0), "Not practised yet");
  assert.equal(evidenceNote("some", 1), `1 of ${MIN_EVIDENCE} reviews \u2014 2 more before this shows a pattern`);
  assert.equal(evidenceNote("enough", 7), "Based on 7 reviews");
});

test("a parent's numbers include its children's", () => {
  const tree = [node("p", "Paper", [node("c1", "Algebra", [], 1, "p"), node("c2", "Geometry", [], 1, "p")])];
  const direct = new Map([
    ["p", activity({ questions: 2, seen: 2, attempted: 1, reviewed: 1, review_events: 1, last_reviewed_at: "2026-09-28 09:00:00" })],
    ["c1", activity({ questions: 5, seen: 5, attempted: 4, reviewed: 4, review_events: 6, difficult_ratings: 2, due_now: 1, last_reviewed_at: "2026-09-29 20:00:00" })],
    ["c2", activity({ questions: 3 })],
  ]);
  const { p: paper, c1: algebra, c2: geometry } = topics(tree, direct);
  assert.equal(paper.name, "Paper");
  assert.equal(paper.level_index, 0);
  assert.equal(algebra.level_index, 1);
  assert.equal(paper.subtree_questions, 10);
  assert.equal(paper.subtree_reviewed, 5);
  assert.equal(paper.subtree_due_now, 1);
  // The parent keeps its own direct counts, the subtree keeps the totals.
  assert.equal(paper.questions, 2);
  assert.equal(paper.reviewed, 1);
  // Recency comes from the most recent review anywhere in the subtree.
  assert.equal(paper.days_since_review, 0);
  assert.equal(geometry.subtree_reviewed, 0);
  assert.equal(geometry.standing, null);
  assert.equal(geometry.days_since_review, null);
});

test("a topic's standing uses subtree reviews but its own difficulty signals", () => {
  const tree = [node("p", "Paper", [node("c1", "Algebra", [], 1, "p")])];
  const direct = new Map([
    ["p", activity({ reviewed: 3, review_events: 3 })],
    ["c1", activity({ questions: 3, reviewed: 2, review_events: 2, difficult_ratings: 2 })],
  ]);
  const paper = topics(tree, direct).p;
  assert.equal(paper.subtree_reviewed, 5);
  // difficult_ratings is counted on the parent only, so a child signal does not
  // silently create a verdict for the parent.
  assert.equal(paper.standing, "holding_steady");
});

test("recency is described in words, not as a date", () => {
  assert.equal(describeRecency(null), "never");
  assert.equal(describeRecency(0), "today");
  assert.equal(describeRecency(1), "yesterday");
  assert.equal(describeRecency(4), "4 days ago");
  assert.equal(describeRecency(9), "last week");
  assert.equal(describeRecency(30), "4 weeks ago");
  assert.equal(describeRecency(200), "7 months ago");
});

test("self-marked and app-marked work are reported apart", () => {
  assert.equal(describeMarkingMix(0, 0), "No completed reviews yet");
  assert.equal(describeMarkingMix(4, 0), "4 reviewed, all marked by the app");
  assert.equal(describeMarkingMix(0, 3), "3 reviewed, all self-marked");
  assert.equal(describeMarkingMix(2, 3), "2 marked by the app, 3 self-marked");
  // Never a single blended figure, because nobody produced one.
  assert.ok(!describeMarkingMix(2, 3).includes("5 "));
});

test("the recommendation starts with getting questions into an empty bank", () => {
  const action = pickNextAction({ totalQuestions: 0, dueNow: 0, topics: [] });
  assert.equal(action.kind, "add_questions");
  assert.equal(action.question_count, 0);
});

test("a due queue outranks everything else when it is not paused", () => {
  const action = pickNextAction({ totalQuestions: 12, dueNow: 3, topics: [] });
  assert.equal(action.kind, "due_review");
  assert.equal(action.question_count, 3);
  assert.match(action.title, /Review 3 questions due now/);
  assert.match(action.detail, /came back/);
});

test("a paused queue says so instead of pretending it is urgent", () => {
  const action = pickNextAction({ totalQuestions: 12, dueNow: 3, topics: [], queuePaused: true });
  assert.equal(action.kind, "due_review");
  assert.match(action.title, /queue paused/);
  assert.match(action.detail, /paused/);
  assert.match(action.detail, /nothing has been forgotten/);
  assert.equal(action.question_count, 3);
});

test("a topic that needs another look is suggested over an untouched one", () => {
  const withEvidence = rolled([node("a", "Algebra"), node("b", "Biology")]).map((t) =>
    t.node_id === "a"
      ? { ...t, evidence: "enough", standing: "needs_another_review", subtree_reviewed: 4, subtree_questions: 6, difficult_ratings: 3 }
      : t
  );
  const action = pickNextAction({
    totalQuestions: 10,
    dueNow: 0,
    topics: withEvidence,
  });
  assert.equal(action.kind, "practise_topic");
  assert.equal(action.node_id, "a");
  assert.equal(action.title, "Practise Algebra");
});

test("with nothing due, an untouched topic is offered next", () => {
  const list = rolled([node("a", "Algebra")]).map((t) => ({ ...t, subtree_questions: 4 }));
  const action = pickNextAction({ totalQuestions: 4, dueNow: 0, topics: list });
  assert.equal(action.kind, "practise_topic");
  assert.equal(action.title, "Try Algebra");
  assert.match(action.detail, /4 questions you have not practised/);
});

test("questions with no topic still get a plain 'practise' prompt", () => {
  // Nothing is classified, so there is no topic to recommend and no review
  // history to interpret: the app says the one thing it can say.
  const action = pickNextAction({ totalQuestions: 4, dueNow: 0, topics: [] });
  assert.equal(action.kind, "start_practising");
  assert.match(action.detail, /have not practised anything/);
});

test("an up-to-date course suggests keeping the streak going, naming the stalest topic", () => {
  const list = rolled([node("a", "Algebra"), node("b", "Biology")]).map((t) => ({
    ...t,
    subtree_questions: 3,
    subtree_reviewed: 3,
    last_reviewed_at: t.node_id === "a" ? "2026-09-20 09:00:00" : "2026-09-25 09:00:00",
  }));
  const action = pickNextAction({ totalQuestions: 6, dueNow: 0, topics: list });
  assert.equal(action.kind, "keep_going");
  assert.match(action.detail, /Nothing is due right now/);
  assert.match(action.detail, /Algebra is the least recently practised/);
});
