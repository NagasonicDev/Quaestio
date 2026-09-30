import test from "node:test";
import assert from "node:assert/strict";
import {
  SESSION_MODE_HINT,
  SESSION_MODE_LABEL,
  buildSessionPlan,
  suggestedSessionSize,
} from "../src/lib/sessionPlan.ts";

/** Deterministic "random" so interleaving order is assertable. */
function constantRandom() {
  return () => 0;
}

function pool(sizes) {
  const items = [];
  for (const [topic, count] of Object.entries(sizes)) {
    for (let i = 0; i < count; i++) items.push({ question_id: `${topic}-${i}`, topic_id: topic });
  }
  return items;
}

test("every session mode has a label and a plain-language hint", () => {
  for (const mode of ["focused", "mixed", "due_review"]) {
    assert.ok(SESSION_MODE_LABEL[mode].length > 0);
    assert.ok(SESSION_MODE_HINT[mode].endsWith("."), "the hint reads as a sentence");
  }
  assert.notEqual(SESSION_MODE_HINT.focused, SESSION_MODE_HINT.mixed);
});

test("duplicate pool entries collapse to one question each", () => {
  const items = [
    { question_id: "q1", topic_id: "a" },
    { question_id: "q1", topic_id: "a" },
    { question_id: "q2", topic_id: "b" },
  ];
  const plan = buildSessionPlan(items, { mode: "focused" });
  assert.deepEqual(plan.question_ids, ["q1", "q2"]);
  assert.equal(plan.truncated, false);
});

test("focused practice keeps the pool order the student filtered down to", () => {
  const items = pool({ a: 3, b: 2 });
  const plan = buildSessionPlan(items, { mode: "focused", random: constantRandom() });
  assert.deepEqual(plan.question_ids, ["a-0", "a-1", "a-2", "b-0", "b-1"]);
  assert.equal(plan.balanced, false);
  assert.equal(plan.dominant_topic_share, 0.6);
});

test("due-review sessions keep the queue's own ranking", () => {
  const items = [
    { question_id: "hardest", topic_id: "a", reason_kind: "missed_objectively", reason_text: "You got this wrong" },
    { question_id: "second", topic_id: "b", reason_kind: "overdue", reason_text: "Due 2 days ago" },
  ];
  const plan = buildSessionPlan(items, { mode: "due_review" });
  assert.deepEqual(plan.question_ids, ["hardest", "second"]);
  assert.equal(plan.balanced, false);
  assert.equal(plan.items[0].reason_text, "You got this wrong");
});

test("mixed practice alternates topics instead of draining the big one first", () => {
  const plan = buildSessionPlan(pool({ big: 12, small: 3, tiny: 1 }), {
    mode: "mixed",
    random: constantRandom(),
  });
  assert.equal(plan.balanced, true);
  const order = plan.items.map((item) => item.topic_id);
  // While more than one topic still has questions, no two in a row come from
  // the same topic: that is what stops the session feeling like one topic.
  const remaining = { big: 12, small: 3, tiny: 1 };
  for (let i = 1; i < order.length; i++) {
    remaining[order[i - 1]] -= 1;
    const othersLeft = Object.entries(remaining).filter(
      ([topic, count]) => topic !== order[i] && count > 0
    );
    if (othersLeft.length > 0) {
      assert.notEqual(order[i], order[i - 1], `item ${i} repeats a topic that still had questions`);
    }
  }
  // Every question in the pool is still offered, and the imbalance is reported
  // rather than hidden, so the session header can show it.
  assert.equal(plan.items.length, 16);
  assert.equal(plan.dominant_topic_share, 12 / 16);
  assert.equal(plan.truncated, false);
});

test("a smaller topic is not starved while it still has questions", () => {
  const plan = buildSessionPlan(pool({ big: 9, small: 2 }), {
    mode: "mixed",
    size: 6,
    random: constantRandom(),
  });
  const counts = new Map();
  for (const item of plan.items) counts.set(item.topic_id, (counts.get(item.topic_id) ?? 0) + 1);
  assert.equal(plan.items.length, 6);
  assert.equal(counts.get("small"), 2);
  assert.equal(counts.get("big"), 4);
});

test("interleaving holds when the session is cut short", () => {
  const plan = buildSessionPlan(pool({ big: 9, small: 1 }), {
    mode: "mixed",
    size: 4,
    random: constantRandom(),
  });
  assert.equal(plan.items.length, 4);
  assert.equal(plan.truncated, true);
  const counts = new Map();
  for (const item of plan.items) counts.set(item.topic_id, (counts.get(item.topic_id) ?? 0) + 1);
  assert.equal(counts.get("big"), 3);
  assert.equal(counts.get("small"), 1);
});

test("mixed practice with a single topic is just the filtered list", () => {
  const plan = buildSessionPlan(pool({ only: 4 }), { mode: "mixed" });
  assert.equal(plan.balanced, false);
  assert.equal(plan.dominant_topic_share, 1);
});

test("unclassified questions are their own bucket, not folded into a topic", () => {
  const items = [
    { question_id: "t1", topic_id: "a" },
    { question_id: "t2", topic_id: "a" },
    { question_id: "loose", topic_id: null },
  ];
  const plan = buildSessionPlan(items, { mode: "mixed" });
  const loose = plan.topic_coverage.find((c) => c.topic_id === "");
  assert.equal(loose.available, 1);
  assert.equal(loose.selected, 1);
});

test("coverage reports how much of each topic the session could and did take", () => {
  const plan = buildSessionPlan(pool({ a: 5, b: 2 }), { mode: "mixed", size: 3 });
  assert.equal(plan.truncated, true);
  const a = plan.topic_coverage.find((c) => c.topic_id === "a");
  const b = plan.topic_coverage.find((c) => c.topic_id === "b");
  assert.equal(a.available, 5);
  assert.equal(a.selected, 2);
  assert.equal(b.selected, 1);
  // Biggest topic first, so the numbers are stable between sessions.
  assert.equal(plan.topic_coverage[0].topic_id, "a");
});

test("an empty pool plans nothing rather than throwing", () => {
  const plan = buildSessionPlan([], { mode: "mixed" });
  assert.deepEqual(plan.question_ids, []);
  assert.equal(plan.dominant_topic_share, 0);
  assert.equal(plan.truncated, false);
});

test("a due-review session is capped, and open practice is not", () => {
  assert.equal(suggestedSessionSize("due_review", 3), 3);
  assert.equal(suggestedSessionSize("due_review", 400), 30);
  assert.equal(suggestedSessionSize("due_review", 0), 1);
  assert.equal(suggestedSessionSize("focused", 400), null);
  assert.equal(suggestedSessionSize("mixed", 400), null);
});
