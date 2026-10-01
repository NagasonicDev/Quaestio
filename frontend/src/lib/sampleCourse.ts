import type { ContentBlock, Question, Slot } from "../api/types";
import { getFirst } from "./db/sqlite";
import { applyCourseBundle, type ParsedBundle } from "./exchange";
import { nowUtc } from "./id";

/**
 * The optional starter course. It is a small, self-describing example: the
 * questions are about how this app works, so a new user can try the practice
 * flow, the self-assessment, and the review queue before bringing in real
 * questions. It carries `course.is_sample`, which is the only thing that marks
 * it as removable — the UI offers a one-click delete, nothing else treats it
 * specially.
 *
 * The ids below are throwaway labels. `applyCourseBundle` assigns real course,
 * node and question ids on the way in, so the same bundle can be applied twice
 * without colliding.
 */

export const SAMPLE_COURSE_NAME = "Sample course \u2014 how practising works";
export const SAMPLE_COURSE_DESCRIPTION =
  "A throwaway example with five questions. Try the practice flow here first, then remove this course whenever you are ready \u2014 it is completely separate from your own courses.";

const NODE_ANSWERING = "sample-node-answering";
const NODE_REVIEWS = "sample-node-reviews";

let blockSeq = 0;

function text(slot: Slot, position: number, value: string): ContentBlock {
  blockSeq += 1;
  return {
    block_id: `sample-blk-${blockSeq}`,
    slot,
    position,
    block_type: "text",
    content: { text: value },
  };
}

function list(slot: Slot, position: number, items: string[]): ContentBlock {
  blockSeq += 1;
  return {
    block_id: `sample-blk-${blockSeq}`,
    slot,
    position,
    block_type: "list",
    content: { ordered: true, items },
  };
}

function functionGraph(slot: Slot, position: number): ContentBlock {
  blockSeq += 1;
  return {
    block_id: `sample-blk-${blockSeq}`,
    slot,
    position,
    block_type: "function",
    content: {
      expression: "x^2 - 4",
      x_min: -3,
      x_max: 3,
      y_min: -5,
      y_max: 6,
      x_label: "x",
      y_label: "f(x)",
      caption: "Graph of f(x) = x² − 4",
    },
  };
}

function blank(
  id: string,
  overrides: Partial<Question> & Pick<Question, "type_key" | "marks" | "node_ids">
): Question {
  const now = nowUtc();
  return {
    question_id: id,
    course_id: "sample-course",
    difficulty: 2,
    parent_question_id: null,
    part_label: null,
    notes: null,
    review_status: "approved",
    classification_confidence: null,
    tags: [],
    body: [],
    hint: [],
    answer: [],
    solution: [],
    marking_criteria: [],
    assets: [],
    mcq_options: undefined,
    source: null,
    parts: [],
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function sampleQuestions(): Question[] {
  return [
    blank("sample-q1", {
      type_key: "multiple_choice",
      marks: 2,
      difficulty: 1,
      node_ids: [NODE_ANSWERING],
      tags: ["onboarding", "retrieval"],
      body: [
        text(
          "body",
          0,
          "You have just been shown a free-response question in a practice session. What does the app ask you to do before it shows you the marking guide?"
        ),
      ],
      mcq_options: [
        { position: 0, content: [{ block_type: "text", content: { text: "Mark it as attempted, so the app knows you tried it" } }], is_correct: true },
        { position: 1, content: [{ block_type: "text", content: { text: "Nothing \u2014 read it for as long as you like" } }], is_correct: false },
        { position: 2, content: [{ block_type: "text", content: { text: "Rate how hard it looks before answering" } }], is_correct: false },
        { position: 3, content: [{ block_type: "text", content: { text: "Start the timer so the app can check your speed" } }], is_correct: false },
      ],
      answer: [
        text(
          "answer",
          0,
          "The app asks you to confirm an attempt first. Opening a question is recorded as \u2018seen\u2019, and only an explicit attempt is recorded as \u2018attempted\u2019. That is why the practice history never claims you answered something you only read."
        ),
      ],
      marking_criteria: [
        list("marking_criteria", 0, [
          "1 mark: identifies that the app asks you to mark the question as attempted before feedback is revealed",
          "1 mark: explains that the attempt is only recorded when you confirm it, not when the question is displayed",
        ]),
      ],
    }),

    blank("sample-q2", {
      type_key: "short_answer",
      marks: 3,
      difficulty: 2,
      node_ids: [NODE_ANSWERING],
      tags: ["onboarding", "review-schedule"],
      body: [
        text("body", 0, "In one or two sentences, explain what the app does after you rate an answer \u2018Again\u2019."),
        text("body", 1, "Do not explain what a spaced-repetition system is in general \u2014 only what this app does next."),
      ],
      hint: [
        text("hint", 0, "Think about the Review queue, not about the marks."),
      ],
      answer: [
        text(
          "answer",
          0,
          "The question comes back sooner than it would have \u2014 after about ten minutes rather than days \u2014 and its interval on the ladder is reset to the start."
        ),
      ],
      solution: [
        text(
          "solution",
          0,
          "Rating \u2018Again\u2019 is treated as a lapse. The question's next due time is set ten minutes out, its ladder step returns to the beginning, and its lapse count goes up by one. Two successful reviews afterwards will bring it back to a longer interval."
        ),
        text(
          "solution",
          1,
          "Nothing is deleted: the earlier attempt stays in the practice history, and the question still counts as reviewed in the topic table."
        ),
      ],
      marking_criteria: [
        list("marking_criteria", 0, [
          "1 mark: states that the question is due again sooner (minutes rather than days)",
          "1 mark: states that the interval restarts from the beginning of the ladder",
          "1 mark: states that the previous review is kept rather than removed",
        ]),
      ],
    }),

    blank("sample-q3", {
      type_key: "short_answer",
      marks: 4,
      difficulty: 2,
      node_ids: [NODE_REVIEWS],
      tags: ["onboarding", "review-schedule"],
      body: [
        text("body", 0, "A question has been reviewed three times: first rated \u2018Hard\u2019, then \u2018Got it\u2019, then \u2018Easy\u2019."),
        text("body", 1, "List the next two things the app should show you: when the question will come back, and the label it uses for that topic in the progress table."),
      ],
      hint: [
        text("hint", 0, "\u2018Easy\u2019 moves up the ladder faster than \u2018Got it\u2019 did. Count the steps rather than the days."),
      ],
      answer: [
        text("answer", 0, "It will come back much later \u2014 the third interval rather than the first \u2014 and the topic is labelled \u2018holding steady\u2019."),
      ],
      solution: [
        text(
          "solution",
          0,
          "The ladder starts at 1, 3, 7, 16, 35, 70 days. \u2018Got it\u2019 moves up one step and \u2018Easy\u2019 moves up two, so three successful reviews put the question at the third interval, 16 days."
        ),
        text(
          "solution",
          1,
          "The topic label is \u2018holding steady\u2019, and it only appears once a topic has three completed reviews behind it. Below that the app shows the number of reviews instead of a label, because three reviews are not enough to say anything confident about a topic."
        ),
      ],
      marking_criteria: [
        list("marking_criteria", 0, [
          "1 mark: gives a later interval than the first one (the third step of the ladder)",
          "1 mark: ties the interval to the rating steps rather than to a fixed number of days",
          "1 mark: names \u2018holding steady\u2019 as the label used for the topic",
          "1 mark: notes the topic needs three completed reviews before a label appears",
        ]),
      ],
    }),

    blank("sample-q4", {
      type_key: "extended_response",
      marks: 5,
      difficulty: 3,
      node_ids: [NODE_REVIEWS],
      tags: ["onboarding", "retrieval"],
      body: [
        text("body", 0, "In one topic, two questions have been marked difficult twice each. A third question in the same topic has never been attempted."),
        text("body", 1, "Write a short paragraph recommending what to practise next. Explain why \u2018mastered\u2019 and \u2018weak\u2019 would both be wrong descriptions here."),
      ],
      answer: [
        text(
          "answer",
          0,
          "Practise the two questions that were marked difficult, then the new one. No question in this topic is mastered or weak."
        ),
      ],
      solution: [
        text(
          "solution",
          0,
          "The two repeated ratings are the only evidence of difficulty in this topic, so they are the sensible place to spend the next sitting; the untouched question is worth one attempt so the topic is not built on two questions out of three."
        ),
        text(
          "solution",
          1,
          "\u2018Mastered\u2019 claims a level of reliability that two difficult ratings contradict. \u2018Weak\u2019 is a judgement about the student rather than about the evidence, and it would ignore that the third question has never been tried. The app therefore says a topic \u2018needs another review\u2019 and prints the sample size next to it."
        ),
      ],
      marking_criteria: [
        list("marking_criteria", 0, [
          "1 mark: recommends the questions that were marked difficult more than once",
          "1 mark: includes the untouched question rather than ignoring it",
          "1-2 marks: explains that \u2018mastered\u2019 is not supported by the evidence, with a reason",
          "1 mark: explains that \u2018weak\u2019 judges the student, or ignores the missing evidence",
        ]),
      ],
    }),

    blank("sample-q5", {
      type_key: "short_answer",
      marks: 3,
      difficulty: 2,
      node_ids: [NODE_ANSWERING],
      tags: ["onboarding", "retrieval"],
      body: [
        text("body", 0, "The graph shows f(x) = x² − 4."),
        functionGraph("body", 1),
        text("body", 2, "Read the graph to give the x-intercepts and the y-intercept."),
      ],
      answer: [
        text("answer", 0, "The x-intercepts are (−2, 0) and (2, 0). The y-intercept is (0, −4)."),
      ],
      solution: [
        text("solution", 0, "The curve crosses the x-axis where f(x) = 0, at x = −2 and x = 2. At x = 0, f(0) = −4, so it crosses the y-axis at (0, −4)."),
      ],
      marking_criteria: [
        list("marking_criteria", 0, [
          "1 mark: gives both x-intercepts, x = −2 and x = 2",
          "1 mark: gives the y-intercept, y = −4",
          "1 mark: identifies the intercepts as points on the correct axes",
        ]),
      ],
    }),
  ];
}

export function sampleCourseBundle(): ParsedBundle {
  return {
    course: {
      course_id: "sample-course",
      name: SAMPLE_COURSE_NAME,
      description: SAMPLE_COURSE_DESCRIPTION,
      subject: "Sample content",
      curriculum: null,
      version_year: null,
      is_sample: true,
      schema_version: 1,
      allow_multi_classification: true,
      hierarchy: [{ level_index: 0, label: "Topic", required: true }],
      difficulty_levels: [
        { level: 1, label: "Very Easy" },
        { level: 2, label: "Easy" },
        { level: 3, label: "Difficult" },
        { level: 4, label: "Very Difficult" },
      ],
      question_types: ["multiple_choice", "short_answer", "extended_response"],
      tags: ["onboarding", "retrieval", "review-schedule"],
      nodes: [
        {
          node_id: NODE_ANSWERING,
          course_id: "sample-course",
          parent_node_id: null,
          level_index: 0,
          name: "Answering a question",
          code: null,
          description: "What the app asks for before it shows any feedback.",
          sort_order: 0,
          children: [],
        },
        {
          node_id: NODE_REVIEWS,
          course_id: "sample-course",
          parent_node_id: null,
          level_index: 0,
          name: "Keeping track of reviews",
          code: null,
          description: "What the app schedules next, and what it is willing to say about a topic.",
          sort_order: 1,
          children: [],
        },
      ],
    },
    questions: sampleQuestions(),
    assetBlobs: new Map(),
    learning: null,
  };
}

/**
 * Adds the sample course, or returns the one already here. Idempotent, so a
 * double click on "Try a sample course" cannot produce two of them.
 */
export async function ensureSampleCourse(): Promise<{
  course_id: string;
  course_name: string;
  created: boolean;
}> {
  const existing = await getFirst("SELECT course_id FROM course WHERE is_sample = 1 LIMIT 1");
  if (existing) {
    return { course_id: String(existing.course_id), course_name: SAMPLE_COURSE_NAME, created: false };
  }
  const courseId = await applyCourseBundle(sampleCourseBundle(), "new");
  return { course_id: courseId, course_name: SAMPLE_COURSE_NAME, created: true };
}
