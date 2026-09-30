/**
 * Learning progress as reported to the student.
 *
 * Two rules shape everything here. First, the app never claims a topic is
 * "mastered" or "weak": all it can honestly say is that a topic needs another
 * look, or that it is holding steady, and even that needs enough evidence
 * behind it. Second, self-marked and objectively marked work are counted
 * separately, because a number the student typed into a quiz is not the same
 * kind of evidence as a marked multiple choice answer, and averaging the two
 * would invent a result nobody produced.
 *
 * Pure functions only. The data layer collects rows; the wording, thresholds
 * and the single recommended next action are decided here so they can be read
 * and tested without a database.
 */

// The explicit .ts extension is deliberate: node:test imports this module
// straight from source, and Node's ESM resolver will not follow an
// extensionless path. Every other import in the app is bundled by Vite, which
// does not need it.
import { daysBetween } from "./reviewSchedule.ts";
import type { CourseNode } from "../api/types";

/**
 * Reviews needed in a topic before the app is willing to describe how that
 * topic is going. Below this, "needs another review" is noise, so the topic is
 * shown as simply not established yet.
 */
export const MIN_EVIDENCE = 3;

export type Evidence = "none" | "some" | "enough";

export type TopicStanding = "needs_another_review" | "holding_steady" | null;

/** Per-node activity, counting only questions classified directly on that node. */
export interface NodeActivity {
  questions: number;
  seen: number;
  attempted: number;
  reviewed: number;
  due_now: number;
  review_events: number;
  lapses: number;
  difficult_ratings: number;
  objective_reviews: number;
  self_reviews: number;
  last_reviewed_at: string | null;
}

export interface TopicActivity extends NodeActivity {
  node_id: string;
  name: string;
  level_index: number;
  /** Distinct questions under this node or any of its descendants. */
  subtree_questions: number;
  subtree_reviewed: number;
  subtree_due_now: number;
  days_since_review: number | null;
  evidence: Evidence;
  standing: TopicStanding;
  evidence_note: string;
}

export const EMPTY_ACTIVITY: NodeActivity = {
  questions: 0,
  seen: 0,
  attempted: 0,
  reviewed: 0,
  due_now: 0,
  review_events: 0,
  lapses: 0,
  difficult_ratings: 0,
  objective_reviews: 0,
  self_reviews: 0,
  last_reviewed_at: null,
};

export function evidenceFor(reviewed: number): Evidence {
  if (reviewed <= 0) return "none";
  if (reviewed < MIN_EVIDENCE) return "some";
  return "enough";
}

/**
 * What can be said about a topic, given only that much evidence. Returns null
 * until the threshold is met, which is the point: an empty or thin topic is
 * reported as unestablished rather than as reassuring.
 */
export function standingFor(
  activity: Pick<NodeActivity, "reviewed" | "due_now" | "lapses" | "difficult_ratings">
): TopicStanding {
  if (evidenceFor(activity.reviewed) !== "enough") return null;
  const dueShare = activity.reviewed ? activity.due_now / activity.reviewed : 0;
  const lapseShare = activity.reviewed ? activity.lapses / activity.reviewed : 0;
  const hardShare = activity.reviewed ? activity.difficult_ratings / activity.reviewed : 0;
  if (dueShare >= 0.34 || lapseShare >= 0.5 || hardShare >= 0.5) return "needs_another_review";
  return "holding_steady";
}

export const STANDING_LABEL: Record<Exclude<TopicStanding, null>, string> = {
  needs_another_review: "Needs another review",
  holding_steady: "Holding steady",
};

export function evidenceNote(evidence: Evidence, reviewed: number): string {
  if (evidence === "none") return "Not practised yet";
  if (evidence === "some") {
    const remaining = Math.max(0, MIN_EVIDENCE - reviewed);
    return `${reviewed} of ${MIN_EVIDENCE} reviews — ${remaining} more before this shows a pattern`;
  }
  return `Based on ${reviewed} reviews`;
}

/** Roll direct per-node counts up the tree so a topic includes its children. */
export function rollupTopicActivity(
  nodes: readonly CourseNode[],
  direct: ReadonlyMap<string, NodeActivity>,
  at: string
): TopicActivity[] {
  const byId = new Map<string, TopicActivity>();
  const visit = (node: CourseNode): TopicActivity => {
    const base = direct.get(node.node_id) ?? EMPTY_ACTIVITY;
    const children = node.children.map(visit);
    const subtree_questions = children.reduce((sum, c) => sum + c.subtree_questions, base.questions);
    const subtree_reviewed = children.reduce((sum, c) => sum + c.subtree_reviewed, base.reviewed);
    const subtree_due_now = children.reduce((sum, c) => sum + c.subtree_due_now, base.due_now);
    const lastChild = children
      .map((c) => c.last_reviewed_at)
      .filter((value): value is string => Boolean(value))
      .sort()
      .pop();
    const lastReviewed = [base.last_reviewed_at, lastChild]
      .filter((value): value is string => Boolean(value))
      .sort()
      .pop() ?? null;
    const evidence = evidenceFor(subtree_reviewed);
    const activity: TopicActivity = {
      ...base,
      node_id: node.node_id,
      name: node.name,
      level_index: node.level_index,
      subtree_questions,
      subtree_reviewed,
      subtree_due_now,
      last_reviewed_at: lastReviewed,
      days_since_review: lastReviewed ? Math.max(0, daysBetween(lastReviewed, at)) : null,
      evidence,
      standing: standingFor({
        reviewed: subtree_reviewed,
        due_now: subtree_due_now,
        lapses: base.lapses,
        difficult_ratings: base.difficult_ratings,
      }),
      evidence_note: evidenceNote(evidence, subtree_reviewed),
    };
    byId.set(node.node_id, activity);
    return activity;
  };
  for (const node of nodes) visit(node);
  return [...byId.values()];
}

// ---------- the one recommended next action ----------

export type NextAction =
  | { kind: "add_questions"; title: string; detail: string; question_count: number }
  | { kind: "due_review"; title: string; detail: string; question_count: number }
  | { kind: "practise_topic"; title: string; detail: string; node_id: string; node_name: string }
  | { kind: "start_practising"; title: string; detail: string; question_count: number }
  | { kind: "keep_going"; title: string; detail: string; question_count: number };

export interface NextActionInput {
  totalQuestions: number;
  dueNow: number;
  topics: readonly TopicActivity[];
  /** True while the student has deliberately snoozed the review queue. */
  queuePaused?: boolean;
}

/**
 * Exactly one suggestion. The order encodes what a student is best served by
 * next: an empty bank cannot be practised at all, a due queue is the work the
 * app already knows about, and after that a topic that needs another look beats
 * an untouched topic because it is more likely to be worth the time. A paused
 * queue still gets a mention, but the wording says it is paused rather than
 * implying the app is nagging.
 */
export function pickNextAction(input: NextActionInput): NextAction {
  const { totalQuestions, dueNow, topics, queuePaused } = input;
  if (totalQuestions === 0) {
    return {
      kind: "add_questions",
      title: "Add some questions",
      detail: "This course has no questions yet. Import a question file or write one to get started.",
      question_count: 0,
    };
  }
  if (dueNow > 0) {
    return {
      kind: "due_review",
      title: queuePaused
        ? `${dueNow} question${dueNow === 1 ? "" : "s"} waiting, queue paused`
        : `Review ${dueNow} question${dueNow === 1 ? "" : "s"} due now`,
      detail: queuePaused
        ? "You paused the review queue. The dates are untouched, so nothing has been forgotten \u2014 resume it in Settings whenever you want."
        : "These came back because of how your last answers went.",
      question_count: dueNow,
    };
  }
  const withEvidence = topics.filter((t) => t.evidence === "enough" && t.standing === "needs_another_review");
  const target = withEvidence.sort((a, b) => b.subtree_due_now - a.subtree_due_now || b.difficult_ratings - a.difficult_ratings)[0];
  if (target) {
    return {
      kind: "practise_topic",
      title: `Practise ${target.name}`,
      detail: `${target.evidence_note}.`,
      node_id: target.node_id,
      node_name: target.name,
    };
  }
  const untouched = topics
    .filter((t) => t.subtree_questions > 0 && t.subtree_reviewed === 0)
    .sort((a, b) => b.subtree_questions - a.subtree_questions)[0];
  if (untouched) {
    return {
      kind: "practise_topic",
      title: `Try ${untouched.name}`,
      detail: `${untouched.subtree_questions} question${untouched.subtree_questions === 1 ? "" : "s"} you have not practised yet.`,
      node_id: untouched.node_id,
      node_name: untouched.name,
    };
  }
  const reviewed = topics.reduce((sum, t) => sum + t.subtree_reviewed, 0);
  if (reviewed === 0) {
    return {
      kind: "start_practising",
      title: "Practise a question",
      detail: "You have not practised anything in this course yet.",
      question_count: totalQuestions,
    };
  }
  const nextUp = topics
    .filter((t) => t.subtree_questions > 0)
    .sort((a, b) => (a.last_reviewed_at ?? "").localeCompare(b.last_reviewed_at ?? ""))[0];
  return {
    kind: "keep_going",
    title: "Keep the streak going",
    detail: nextUp
      ? `Nothing is due right now. ${nextUp.name} is the least recently practised.`
      : "Nothing is due right now.",
    question_count: totalQuestions,
  };
}

// ---------- wording helpers ----------

export function describeRecency(days: number | null): string {
  if (days == null) return "never";
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "last week";
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

/**
 * "Self-marked versus objectively marked", phrased so the weaker evidence is
 * labelled as such rather than folded into an average.
 */
export function describeMarkingMix(objective: number, selfMarked: number): string {
  if (objective === 0 && selfMarked === 0) return "No completed reviews yet";
  if (selfMarked === 0) return `${objective} reviewed, all marked by the app`;
  if (objective === 0) return `${selfMarked} reviewed, all self-marked`;
  return `${objective} marked by the app, ${selfMarked} self-marked`;
}
