/**
 * Turning a pool of candidate questions into the order a practice session will
 * actually offer them.
 *
 * This is deliberately a pure function. The two questions it answers —
 * "what is the order?" and "was the mix fair?" — are the ones most likely to be
 * argued about, and a pure function is the cheapest place to settle them. The
 * data layer supplies the pool; nothing here touches SQL.
 *
 * Focused and due-review sessions keep the pool's own order, because in both
 * cases the ordering already means something: the student chose a topic, or the
 * queue ranked the items. Only mixed practice reorders, and it does so by
 * interleaving topics so that one large topic cannot quietly fill the session.
 */

import type { DueReasonKind } from "./reviewSchedule";

export type SessionMode = "focused" | "mixed" | "due_review";

export const SESSION_MODE_LABEL: Record<SessionMode, string> = {
  focused: "Focused practice",
  mixed: "Mixed practice",
  due_review: "Due for review",
};

/** One-line explanation shown next to the mode picker. */
export const SESSION_MODE_HINT: Record<SessionMode, string> = {
  focused:
    "Stays with the topics and question types you picked. Good when you are working through one section.",
  mixed:
    "Draws from everything you picked and spreads the questions across those topics, so a large topic does not fill the whole session.",
  due_review:
    "Works through the questions your previous answers said were due again, hardest first.",
};

export interface PoolItem {
  question_id: string;
  /** Topic the question is being practised under, or null when unclassified. */
  topic_id: string | null;
  /** Why the question is in the pool, for a due-review queue. */
  reason_kind?: DueReasonKind;
  reason_text?: string;
}

export interface TopicCoverage {
  topic_id: string;
  selected: number;
  available: number;
}

export interface PlanOptions {
  mode: SessionMode;
  /** How many questions to offer, or null for the whole pool. */
  size?: number | null;
  random?: () => number;
}

export interface PlanResult {
  items: PoolItem[];
  question_ids: string[];
  topic_coverage: TopicCoverage[];
  /** Largest share of the session taken by a single topic, 0 to 1. */
  dominant_topic_share: number;
  /** True when topics were interleaved rather than kept in pool order. */
  balanced: boolean;
  /** True when the pool was larger than the requested size. */
  truncated: boolean;
}

const UNCLASSIFIED = "__unclassified__";

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Interleave topics round-robin, each topic contributing at most one question
 * per pass, until the pool or the size limit runs out. A topic that runs dry
 * stops taking part, so the remaining topics keep going instead of leaving a
 * gap where the biggest topic would otherwise have been.
 */
function interleave(buckets: Map<string, PoolItem[]>, size: number | null): PoolItem[] {
  const order = [...buckets.keys()];
  const out: PoolItem[] = [];
  const limit = size == null ? Infinity : Math.max(0, size);
  while (out.length < limit) {
    let added = false;
    for (const key of order) {
      const bucket = buckets.get(key);
      if (!bucket || !bucket.length) continue;
      out.push(bucket.shift()!);
      added = true;
      if (out.length >= limit) break;
    }
    if (!added) break;
  }
  return out;
}

export function buildSessionPlan(pool: readonly PoolItem[], options: PlanOptions): PlanResult {
  const random = options.random ?? Math.random;
  const unique: PoolItem[] = [];
  const seen = new Set<string>();
  for (const item of pool) {
    if (seen.has(item.question_id)) continue;
    seen.add(item.question_id);
    unique.push(item);
  }

  const counts = new Map<string, number>();
  for (const item of unique) {
    const key = item.topic_id ?? UNCLASSIFIED;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const availableTotal = unique.length;
  const size = options.size == null ? availableTotal : Math.max(0, options.size);

  const buckets = new Map<string, PoolItem[]>();
  for (const [key] of counts) buckets.set(key, []);
  for (const item of unique) buckets.get(item.topic_id ?? UNCLASSIFIED)!.push(item);
  for (const [key, bucket] of buckets) buckets.set(key, shuffle(bucket, random));

  const balanced = options.mode === "mixed" && buckets.size > 1;
  const items = balanced ? interleave(buckets, size) : unique.slice(0, size);

  const selectedByTopic = new Map<string, number>();
  for (const item of items) {
    const key = item.topic_id ?? UNCLASSIFIED;
    selectedByTopic.set(key, (selectedByTopic.get(key) ?? 0) + 1);
  }
  const topic_coverage: TopicCoverage[] = [...counts.entries()]
    .map(([topic_id, available]) => ({
      topic_id: topic_id === UNCLASSIFIED ? "" : topic_id,
      available,
      selected: selectedByTopic.get(topic_id) ?? 0,
    }))
    .sort((a, b) => b.available - a.available || a.topic_id.localeCompare(b.topic_id));

  const dominant_topic_share = items.length
    ? Math.max(...[...counts.keys()].map((key) => selectedByTopic.get(key) ?? 0)) / items.length
    : 0;

  return {
    items,
    question_ids: items.map((item) => item.question_id),
    topic_coverage,
    dominant_topic_share,
    balanced,
    truncated: availableTotal > items.length,
  };
}

/**
 * How many questions a session should offer when the student has not said.
 * A queue is capped so the promised effort stays small; open practice is not,
 * because the student decides when to stop.
 */
export function suggestedSessionSize(mode: SessionMode, dueCount: number): number | null {
  if (mode === "due_review") return Math.max(1, Math.min(30, dueCount));
  return null;
}
