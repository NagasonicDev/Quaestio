export type BlockType =
  | "text" | "heading" | "equation" | "image" | "diagram" | "graph"
  | "table" | "list" | "code" | "answer_area" | "page_break";

export type Slot = "body" | "hint" | "answer" | "solution" | "marking_criteria";

export interface ContentBlock {
  block_id: string;
  slot: Slot;
  position: number;
  block_type: BlockType;
  content: Record<string, any>;
}

export interface LevelDef {
  level_index: number;
  label: string;
  required: boolean;
}

export interface DifficultyLevel {
  level: number;
  label: string;
}

export interface CourseNode {
  node_id: string;
  course_id: string;
  parent_node_id: string | null;
  level_index: number;
  name: string;
  code: string | null;
  description: string | null;
  sort_order: number;
  children: CourseNode[];
}

export interface CourseFullConfig {
  course_id: string;
  name: string;
  schema_version: number;
  hierarchy: LevelDef[];
  allow_multi_classification: boolean;
  difficulty_levels: DifficultyLevel[];
  question_types: string[];
  tags: string[];
  nodes: CourseNode[];
}

export interface Course {
  course_id: string;
  name: string;
  description: string | null;
  subject: string | null;
  curriculum: string | null;
  version_year: string | null;
  schema_version: number;
  allow_multi_classification: boolean;
  /** True for the optional starter course, which can be removed in one click. */
  is_sample: boolean;
  created_at: string;
  updated_at: string;
}

export interface Source {
  name: string;
  year: number | null;
  institution: string | null;
  original_question_no: string | null;
}

export interface InstitutionYearFilter {
  institution: string;
  years: number[];
}

export interface Asset {
  asset_id: string;
  file_path: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  caption: string | null;
}

export interface Question {
  question_id: string;
  course_id: string;
  type_key: string;
  difficulty: number | null;
  marks: number | null;
  parent_question_id: string | null;
  part_label: string | null;
  notes: string | null;
  review_status: string;
  classification_confidence: string | null;
  node_ids: string[];
  tags: string[];
  body: ContentBlock[];
  mcq_options?: Array<{ position: number; content: Array<{ block_type: BlockType; content: Record<string, any> }>; is_correct: boolean }>;
  hint: ContentBlock[];
  answer: ContentBlock[];
  solution: ContentBlock[];
  marking_criteria: ContentBlock[];
  assets: Asset[];
  source: Source | null;
  parts: Question[];
  created_at: string;
  updated_at: string;
}

export interface QuestionListItem {
  question_id: string;
  type_key: string;
  difficulty: number | null;
  marks: number | null;
  snippet: string;
  source: Source | null;
}

export interface QuestionListResponse {
  total: number;
  page: number;
  page_size: number;
  items: QuestionListItem[];
}

export interface RandomQuestionResponse {
  matching_count: number;
  question: Question | null;
}

export interface NodeCount {
  node_id: string;
  name: string;
  level_index: number;
  count: number;
  children: NodeCount[];
}

export interface QuestionCountsResponse {
  total: number;
  by_node: NodeCount[];
  by_type: Record<string, number>;
  by_difficulty: Record<string, number>;
}

export interface PracticeFilters {
  course_id: string;
  node_ids: string[];
  type_key: string | null;
  difficulty_min: number | null;
  difficulty_max: number | null;
  tag: string | null;
  avoid_recent_days: number | null;
  source_filters?: InstitutionYearFilter[];
}

export interface TestSectionInput {
  name?: string;
  node_ids?: string[];
  type_key?: string | null;
  type_keys?: string[];
  difficulties?: Array<number | string>;
  source_filters?: InstitutionYearFilter[];
  marks?: number | null;
}

export interface TestSectionResult {
  name: string;
  question_count: number;
  marks: number;
  count_requested: number | null;
  marks_requested: number | null;
  selection_limited?: boolean;
}

export interface GeneratedTestMeta {
  test_id: string;
  title: string;
  format: "docx" | "pdf";
  target_marks: number;
  achieved_marks: number;
  question_count: number;
  created_at: string;
  test_download_url: string;
  solutions_available?: boolean;
  preview_url: string;
  section_results?: TestSectionResult[];
}

export interface ImportResultItem {
  index: number;
  status: "imported" | "error";
  question_id?: string;
  errors: string[];
  warnings: string[];
}

export interface ImportResponse {
  import_job_id: string;
  imported_count: number;
  error_count: number;
  warnings: string[];
  results: ImportResultItem[];
}

// ---------- study loop ----------

/** How far a question got through the answer flow. Ordered by progress. */
export type AttemptStatus = "seen" | "attempted" | "revealed" | "reviewed";

/** The student's own judgement of how the attempt went. */
export type SelfRating = "again" | "hard" | "got_it" | "easy" | "unsure";

/** Where a mark came from. Anything but "objective" is not an app-verified result. */
export type ScoredBy = "objective" | "self" | "manual_legacy";

export type Confidence = "low" | "medium" | "high";

/** Free-response answer text may be kept, or thrown away after each question. */
export type ResponseCapture = "on" | "off";

export type ReviewOutcome = "self_assessed" | "objective_correct" | "objective_incorrect";

export type DueReasonKind =
  | "never_reviewed"
  | "overdue"
  | "due_now"
  | "rated_difficult"
  | "missed_objectively";

export interface ReviewStateRow {
  question_id: string;
  next_due_at: string | null;
  interval_days: number;
  last_reviewed_at: string | null;
  review_count: number;
  lapse_count: number;
  ladder_step: number;
  last_rating: SelfRating | null;
  last_outcome: ReviewOutcome | null;
  updated_at: string;
}

export interface ReviewPolicy {
  /** Interval in days at each ladder position. Index 0 is always 0. */
  ladder: number[];
  /** Minutes until a question marked "again" comes back. */
  againMinutes: number;
}

/**
 * Three different counts, kept apart on purpose. `filter_match_count` is what
 * the filters allow, `eligible_count` is what is left after the exclusions this
 * session is applying, and `excluded_seen_count` is how many were held back
 * because they were already offered in this session.
 */
export interface PracticePoolCounts {
  filter_match_count: number;
  eligible_count: number;
  excluded_seen_count: number;
  /** Held back by "avoid questions attempted recently", if that is on. */
  recently_excluded_count: number;
}

export type SessionMode = "focused" | "mixed" | "due_review";

export interface SessionPlanItem {
  question_id: string;
  topic_id: string | null;
  reason_kind?: DueReasonKind;
  reason_text?: string;
}

export interface SessionTopicCoverage {
  topic_id: string;
  selected: number;
  available: number;
}

export interface PracticeSessionSummary {
  session_id: string;
  course_id: string;
  mode: SessionMode;
  status: "active" | "completed" | "abandoned";
  filters: PracticeFilters;
  created_at: string;
  updated_at: string | null;
  planned_count: number;
  completed_count: number;
  /** Planned questions that have not been offered yet. */
  remaining_count: number;
  next_question_id: string | null;
  plan: SessionPlanItem[];
  topic_coverage: SessionTopicCoverage[];
  dominant_topic_share: number;
  /**
   * Recomputed when the session is read, so the practice page can tell
   * "nothing matches these filters" apart from "you have done all of these".
   */
  pool: PracticePoolCounts;
}

export interface DueQueueItem {
  question_id: string;
  snippet: string;
  type_key: string;
  next_due_at: string | null;
  reason_kind: DueReasonKind;
  reason_text: string;
  interval_days: number;
  review_count: number;
  lapse_count: number;
  last_rating: SelfRating | null;
  last_outcome: ReviewOutcome | null;
}

export interface DueQueue {
  due_count: number;
  /** Question ids are ordered by priority; the rest are counted only. */
  items: DueQueueItem[];
  /** Set when the student paused the queue, as a UTC datetime. */
  paused_until: string | null;
  paused: boolean;
  /** Rough effort estimate for the queue, never a prediction of results. */
  estimated_minutes: number;
}

export interface AttemptInput {
  session_id?: string | null;
  question_id: string;
  status: AttemptStatus;
  /** Only for objectively scored answers. */
  correct?: boolean | null;
  scored_by?: ScoredBy | null;
  score_earned?: number | null;
  score_possible?: number | null;
  time_spent_sec?: number | null;
  user_notes?: string | null;
  response_text?: string | null;
  confidence?: Confidence | null;
  self_rating?: SelfRating | null;
  hints_revealed?: number | null;
}

export interface AttemptSummary extends AttemptInput {
  attempt_id: string;
  created_at: string;
}

export interface TopicProgress {
  node_id: string;
  name: string;
  level_index: number;
  questions: number;
  subtree_questions: number;
  /** Distinct questions reviewed under this node or any of its descendants. */
  subtree_reviewed: number;
  subtree_due_now: number;
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
  days_since_review: number | null;
  evidence: "none" | "some" | "enough";
  standing: "needs_another_review" | "holding_steady" | null;
  evidence_note: string;
}

export interface DifficultyCue {
  question_id: string;
  snippet: string;
  type_key: string;
  hard_or_again: number;
  lapses: number;
  last_rating: SelfRating | null;
  last_reviewed_at: string | null;
}

export interface StudyProgress {
  course_id: string;
  generated_at: string;
  total_questions: number;
  ever_seen: number;
  attempted: number;
  reviewed: number;
  due_now: number;
  /** Set while the student has snoozed the review queue; the dates are untouched. */
  queue_paused_until: string | null;
  reviewed_last_7_days: number;
  objective_reviews: number;
  self_reviews: number;
  marking_mix_note: string;
  topics: TopicProgress[];
  repeated_difficulty: DifficultyCue[];
  next_action:
    | { kind: "add_questions"; title: string; detail: string; question_count: number }
    | { kind: "due_review"; title: string; detail: string; question_count: number }
    | {
        kind: "practise_topic";
        title: string;
        detail: string;
        node_id: string;
        node_name: string;
      }
    | { kind: "start_practising"; title: string; detail: string; question_count: number }
    | { kind: "keep_going"; title: string; detail: string; question_count: number };
}

