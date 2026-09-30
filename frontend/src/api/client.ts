import * as data from "../lib/data";
import { registerQuestionAssets, uploadAsset } from "../lib/assets";
import type {
  AttemptInput,
  AttemptSummary,
  Course,
  CourseFullConfig,
  CourseNode,
  DifficultyLevel,
  DueQueue,
  GeneratedTestMeta,
  ImportResponse,
  LevelDef,
  PracticeFilters,
  PracticePoolCounts,
  PracticeSessionSummary,
  Question,
  QuestionCountsResponse,
  QuestionListResponse,
  RandomQuestionResponse,
  ResponseCapture,
  ReviewPolicy,
  ReviewStateRow,
  SessionMode,
  Source,
  StudyProgress,
  InstitutionYearFilter,
  TestSectionInput,
} from "./types";

export { assetUrl } from "../lib/assets";
export type {
  AttemptInput,
  AttemptStatus,
  AttemptSummary,
  Confidence,
  DueQueue,
  DueQueueItem,
  DueReasonKind,
  GeneratedTestMeta,
  ImportResponse,
  ImportResultItem,
  PracticeFilters,
  PracticePoolCounts,
  PracticeSessionSummary,
  ReviewOutcome,
  ReviewPolicy,
  ReviewStateRow,
  ScoredBy,
  SelfRating,
  SessionMode,
  SessionPlanItem,
  SessionTopicCoverage,
  StudyProgress,
  TestSectionInput,
  TestSectionResult,
  TopicProgress,
} from "./types";

async function registerQuestion(q: Question | null): Promise<Question | null> {
  if (q) await registerQuestionAssets(q);
  return q;
}

async function registerRandom(q: RandomQuestionResponse): Promise<RandomQuestionResponse> {
  if (q.question) await registerQuestionAssets(q.question);
  return q;
}

export const api = {
  listCourses(): Promise<Course[]> {
    return data.listCourses();
  },

  createCourse(payload: {
    name: string;
    description?: string | null;
    subject?: string | null;
    hierarchy?: LevelDef[];
    difficulty_levels?: DifficultyLevel[];
    question_types?: string[];
  }): Promise<CourseFullConfig> {
    return data.createCourse(payload);
  },

  deleteCourse(courseId: string): Promise<void> {
    return data.deleteCourse(courseId);
  },

  resetCourseProgress(courseId: string): Promise<void> {
    return data.resetCourseProgress(courseId);
  },

  getCourse(courseId: string): Promise<CourseFullConfig> {
    return data.getCourseFullConfig(courseId) as Promise<CourseFullConfig>;
  },

  updateCourseTags(courseId: string, tags: string[]): Promise<void> {
    return data.updateCourseTags(courseId, tags);
  },

  updateCourseName(courseId: string, name: string): Promise<void> {
    return data.updateCourseName(courseId, name);
  },

  createNode(
    courseId: string,
    payload: { level_index: number; parent_node_id?: string | null; name: string; code?: string | null }
  ): Promise<CourseNode> {
    return data.createNode(courseId, payload);
  },

  updateNode(
    courseId: string,
    nodeId: string,
    payload: Partial<{
      name: string;
      code: string | null;
      description: string | null;
      sort_order: number;
      parent_node_id: string | null;
    }>
  ): Promise<CourseNode> {
    return data.updateNode(courseId, nodeId, payload);
  },

  deleteNode(courseId: string, nodeId: string): Promise<void> {
    return data.deleteNode(courseId, nodeId);
  },

  addLevel(courseId: string, level: LevelDef): Promise<LevelDef> {
    return data.addLevel(courseId, level);
  },

  updateLevel(courseId: string, levelIndex: number, level: LevelDef): Promise<LevelDef> {
    return data.updateLevel(courseId, levelIndex, level);
  },

  deleteLevel(courseId: string, levelIndex: number): Promise<void> {
    return data.deleteLevel(courseId, levelIndex);
  },

  getInstructions(courseId: string): Promise<{ course_id: string; instructions_markdown: string }> {
    return data.getInstructions(courseId);
  },

  skillDownloadUrl(courseId: string): string {
    // Placeholder kept for API-surface compatibility; real download is
    // triggered via downloadSkill() below.
    void courseId;
    return "";
  },

  downloadSkill(courseId: string): Promise<void> {
    return import("../lib/exchange").then((m) => m.downloadSkill(courseId));
  },

  exportCourse(
    courseId: string,
    filters?: { typeKeys?: string[]; difficulties?: number[]; institutions?: string[]; tags?: string[] },
    options?: { includeLearningData?: boolean; includeResponseText?: boolean }
  ): Promise<void> {
    return import("../lib/exchange").then((m) => m.exportCourse(courseId, filters, options));
  },
  exportQuestions(courseId: string, filters?: { typeKeys?: string[]; difficulties?: number[]; institutions?: string[]; tags?: string[] }): Promise<void> {
    return import("../lib/exchange").then((m) => m.exportQuestions(courseId, filters));
  },

  importCourseFile(
    file: File,
    onIdCollision?: (info: { course_id: string; course_name: string }) => Promise<"replace" | "new">
  ): Promise<{ course_id: string; course_name: string }> {
    return import("../lib/exchange").then((m) => m.importCourseFile(file, onIdCollision));
  },

  /** Adds the optional starter course, or returns the copy already here. */
  ensureSampleCourse(): Promise<{ course_id: string; course_name: string; created: boolean }> {
    return import("../lib/sampleCourse").then((m) => m.ensureSampleCourse());
  },

  uploadAsset(
    file: File
  ): Promise<{ asset_path: string; mime_type: string; original_filename: string }> {
    return uploadAsset(file);
  },

  listQuestions(
    courseId: string,
    filters: { node_id?: string | string[]; type?: string | string[]; difficulty?: string | number | Array<string | number>; tag?: string; q?: string; sort?: string; page?: number; page_size?: number; source_filters?: InstitutionYearFilter[] } = {}
  ): Promise<QuestionListResponse> {
    return data.listQuestions(courseId, filters);
  },

  questionSourceOptions(courseId: string): Promise<{ institutions: Array<{ name: string; years: number[] }> }> {
    return data.questionSourceOptions(courseId);
  },

  questionSourceCounts(courseId: string, filters: { type?: string[]; difficulties?: number[]; node_ids?: string[]; tag?: string } = {}): Promise<Record<string, { total: number; years: Record<string, number> }>> {
    return data.questionSourceCounts(courseId, filters);
  },

  renameInstitution(courseId: string, currentName: string, nextName: string): Promise<number> {
    return data.renameInstitution(courseId, currentName, nextName);
  },

  async getQuestion(id: string): Promise<Question> {
    const q = await data.getQuestion(id);
    return (await registerQuestion(q)) as Question;
  },

  async createQuestion(payload: Record<string, any>): Promise<Question> {
    const q = await data.createQuestion(payload as any);
    return (await registerQuestion(q)) as Question;
  },

  async updateQuestion(id: string, payload: Record<string, any>): Promise<Question> {
    const q = await data.updateQuestion(id, payload as any);
    return (await registerQuestion(q)) as Question;
  },

  deleteQuestion(id: string): Promise<void> {
    return data.deleteQuestion(id);
  },

  questionCounts(
    courseId: string,
    opts: {
      type?: string | string[];
      difficulty?: string | number;
      difficulties?: Array<string | number>;
      node_ids?: string[];
    } = {}
  ): Promise<QuestionCountsResponse> {
    return data.questionCounts(courseId, opts);
  },

  estimateTestSections(courseId: string, sections: TestSectionInput[]): Promise<Array<{ question_count: number; available_marks: number }>> {
    return data.estimateTestSections(courseId, sections);
  },

  randomQuestion(params: {
    course_id: string;
    node_id?: string | string[];
    type?: string | string[];
    difficulty?: string | number | Array<string | number>;
    tag?: string;
    exclude_question_ids?: Array<string | number>;
    exclude_recent_days?: number;
    source_filters?: InstitutionYearFilter[];
  }): Promise<RandomQuestionResponse> {
    return data.randomQuestion(params).then((r) => registerRandom(r));
  },

  recordAttempt(payload: AttemptInput): Promise<{ attempt_id: string; created_at: string }> {
    return data.recordAttempt(payload);
  },

  /**
   * Finish one review: writes the attempt, the self-rating and the new due date
   * together.
   */
  recordReview(payload: data.ReviewSubmission): Promise<{ attempt_id: string; review: ReviewStateRow }> {
    return data.recordReview(payload);
  },

  questionAttempts(questionId: string, limit?: number): Promise<AttemptSummary[]> {
    return data.questionAttempts(questionId, limit);
  },

  startPracticeSession(payload: {
    course_id: string;
    mode: SessionMode;
    filters: PracticeFilters;
    size?: number | null;
  }): Promise<PracticeSessionSummary> {
    return data.startPracticeSession(payload);
  },

  getPracticeSession(sessionId: string): Promise<PracticeSessionSummary | null> {
    return data.getPracticeSession(sessionId);
  },

  getActiveSession(courseId: string, mode?: SessionMode): Promise<PracticeSessionSummary | null> {
    return data.getActiveSession(courseId, mode);
  },

  resetPracticeSession(sessionId: string): Promise<PracticeSessionSummary | null> {
    return data.resetPracticeSession(sessionId);
  },

  setSessionStatus(sessionId: string, status: "active" | "completed" | "abandoned"): Promise<void> {
    return data.setSessionStatus(sessionId, status);
  },

  discardPracticeSession(sessionId: string): Promise<void> {
    return data.discardPracticeSession(sessionId);
  },

  practicePoolCounts(
    filters: PracticeFilters,
    options?: { excludeIds?: string[]; avoidRecentDays?: number | null; dueAt?: string | null }
  ): Promise<PracticePoolCounts> {
    return data.practicePoolCounts(filters, options);
  },

  dueQueue(courseId: string, limit?: number): Promise<DueQueue> {
    return data.dueQueue(courseId, limit);
  },

  studyProgress(courseId: string): Promise<StudyProgress> {
    return data.studyProgress(courseId);
  },

  getReviewPolicy(): Promise<ReviewPolicy> {
    return data.getReviewPolicy();
  },

  setReviewPolicy(policy: ReviewPolicy): Promise<void> {
    return data.setReviewPolicy(policy);
  },

  getQueuePause(): Promise<{ paused_until: string | null; paused: boolean }> {
    return data.getQueuePause();
  },

  setQueuePause(pausedUntil: string | null): Promise<void> {
    return data.setQueuePause(pausedUntil);
  },

  getResponseCapture(): Promise<ResponseCapture> {
    return data.getResponseCapture();
  },

  setResponseCapture(value: ResponseCapture): Promise<void> {
    return data.setResponseCapture(value);
  },

  getTimerEnabled(): Promise<boolean> {
    return data.getTimerEnabled();
  },

  setTimerEnabled(enabled: boolean): Promise<void> {
    return data.setTimerEnabled(enabled);
  },

  getReviewState(questionId: string): Promise<ReviewStateRow> {
    return data.getReviewState(questionId);
  },

  enqueueForReview(questionId: string): Promise<ReviewStateRow> {
    return data.enqueueForReview(questionId);
  },

  recentQuestions(
    courseId: string,
    limit: number = 10
  ): Promise<Array<{ question_id: string; course_id: string; snippet: string; type_key: string; status: string; scored_by: string | null; seen_at: string }>> {
    return data.recentQuestions(courseId, limit);
  },

  generateTest(
    courseId: string,
    payload: {
      title?: string;
      node_ids?: string[];
      format: "docx" | "pdf";
      shuffle?: boolean;
      sections: TestSectionInput[];
      selectionTimeoutMs?: number;
      onProgress?: (progress: { phase: "selecting" | "hydrating" | "paper" | "preview" | "saving"; questionCount?: number; completedQuestions?: number }) => void;
    }
  ): Promise<GeneratedTestMeta> {
    return data.generateTest(courseId, payload);
  },

  generateTestSolutions(testId: string): Promise<void> {
    return data.generateTestSolutions(testId);
  },

  listTests(courseId: string, limit: number = 20): Promise<GeneratedTestMeta[]> {
    return data.listTests(courseId, limit);
  },

  deleteTest(testId: string): Promise<void> {
    return data.deleteTest(testId);
  },

  testDownloadUrl(meta: Pick<GeneratedTestMeta, "test_download_url">): string {
    return meta.test_download_url;
  },

  testPreviewUrl(meta: Pick<GeneratedTestMeta, "preview_url">): string {
    return meta.preview_url;
  },

  importJson(courseId: string, fileContent: Record<string, any>): Promise<ImportResponse> {
    return data.importJson(courseId, fileContent);
  },
};

export type { Source };
