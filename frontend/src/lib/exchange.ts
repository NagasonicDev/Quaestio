import JSZip from "jszip";
import { questionImportScripts, questionImportSkillTemplate, questionImportWorkflow } from "./questionImportAssets";
import { importConventionsMarkdown, checkConventionsScript, importAuthoringRules } from "./importConventions";
import * as idb from "./db/indexeddb";
import { all, getFirst, run, runMany, transaction } from "./db/sqlite";
import { claimQuestionId, newId, nowUtc } from "./id";
import * as data from "./data";
import { isAttemptStatus, isSelfRating, isReviewOutcome } from "./reviewSchedule";
import { contentHash } from "./storage";
import type { DrawingNotebook } from "../api/types";
import { validateDrawingNotebooks } from "./drawingNotebook";
import type { CourseFullConfig, CourseNode, Question } from "../api/types";

// ---------- helpers ----------

/** The separator both importers key on when they build a node's full path:
 *  `data.ts importJson` builds `parent + " / " + name` and
 *  `scripts/question_import/qbx_lib.py` resolves node_names via
 *  NodeIndex.path_to_id. A different separator makes every node_names entry fall
 *  back to a unique-bare-name match, which is a hard error for any duplicated
 *  leaf name. */
export const NODE_PATH_SEPARATOR = " / ";

export function slugName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || name;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function flattenNodes(nodes: CourseNode[]): Array<{ node_id: string; name: string; code: string | null; level_index: number; path: string }> {
  const out: Array<{ node_id: string; name: string; code: string | null; level_index: number; path: string }> = [];
  const walk = (list: CourseNode[], path: string[]) => {
    for (const n of list) {
      const fullPath = [...path, n.name];
      out.push({
        node_id: n.node_id,
        name: n.name,
        code: n.code,
        level_index: n.level_index,
        path: fullPath.join(NODE_PATH_SEPARATOR),
      });
      walk(n.children, fullPath);
    }
  };
  walk(nodes, []);
  return out;
}

// ---------- course skill (.skill) ----------

/** Flat `code | full path` index - greppable, and far cheaper than a tree. */
function nodesIndexMarkdown(rows: ReturnType<typeof flattenNodes>): string {
  return rows.map((row) => `${row.code ?? ""} | ${row.path}`.trimEnd()).join("\n");
}

/** Placeholder values for SKILL_TEMPLATE.md. Mirrors backend/app/skill_export.py. */
function skillSubstitutions(config: CourseFullConfig, instructionsMarkdown: string): Record<string, string> {
  const nodes = flattenNodes(config.nodes);
  const types = config.question_types.map((t) => `\`${t}\``).join(", ") || "see import-schema.json";
  const levels = config.difficulty_levels.length
    ? config.difficulty_levels.map((d) => `\`${d.level}\` = ${d.label}`).join(", ")
    : "none defined - omit `difficulty`";
  const tags = config.tags.map((t) => `\`${t}\``).join(", ") || "none";
  const slug = slugName(config.name);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error(`Skill validation failed: name must be kebab-case (got '${slug}').`);
  }
  const description = `Convert exam papers, worksheets and assessments for ${config.name} into this question bank's import format. Use when digitising ${config.name} source documents, extracting questions with figures, equations, tables and marking guides, classifying them to ${config.name} curriculum nodes, or auditing and repairing an existing question bundle. Returns a validated .qbx bundle plus a list of unresolved source issues. Only valid for the ${config.name} course.`;
  return {
    COURSE_SLUG: slug,
    COURSE_NAME: config.name,
    COURSE_ID: config.course_id,
    DESCRIPTION: description.replace(/"/g, "'"),
    TYPES: types,
    LEVELS: levels,
    TAGS: tags,
    MULTI: config.allow_multi_classification ? "allowed" : "one node only",
    NODE_COUNT: String(nodes.length),
    CLASSIFICATION_RULES: config.allow_multi_classification
      ? "List several nodes when the question genuinely spans them, in most-specific-first order."
      : "Pick exactly one node - this course allows only one per question.",
    COURSE_INSTRUCTIONS: instructionsMarkdown.trim() || "_(none recorded)_",
    WORKFLOW: questionImportWorkflow,
  };
}

function renderSkillMarkdown(substitutions: Record<string, string>): string {
  let out = questionImportSkillTemplate;
  for (const [key, value] of Object.entries(substitutions)) {
    out = out.split(`{{${key}}}`).join(value);
  }
  return out;
}

export function buildSkillMarkdown(config: CourseFullConfig, instructionsMarkdown: string): string {
  const substitutions = skillSubstitutions(config, instructionsMarkdown);
  // The house conventions (prompts always present, composite parts, banded
  // criteria for written answers, real solutions, ...) must reach every agent that
  // reads SKILL.md. A template that has its own {{CONVENTIONS}} slot gets them
  // there; an older template gets them ahead of the course-specific instructions.
  substitutions.CONVENTIONS = importConventionsMarkdown.trim();
  if (!questionImportSkillTemplate.includes("{{CONVENTIONS}}")) {
    substitutions.COURSE_INSTRUCTIONS =
      `${importConventionsMarkdown.trim()}\n\n---\n\n### Course-specific instructions\n\n${substitutions.COURSE_INSTRUCTIONS}`;
  }
  return renderSkillMarkdown(substitutions);
}

export function buildImportSchema(config: CourseFullConfig): Record<string, unknown> {
  const nodes = flattenNodes(config.nodes);
  const exampleNode = nodes[0];
  return {
    course_id: config.course_id,
    course_name: config.name,
    schema_version: 1,
    valid_type_keys: config.question_types,
    valid_difficulty_levels: config.difficulty_levels.map((d) => ({ level: d.level, label: d.label })),
    allow_multi_classification: config.allow_multi_classification,
    valid_tags: config.tags,
    node_path_separator: NODE_PATH_SEPARATOR,
    // No `path` per row: paths are rebuilt from level_index by
    // scripts/question_import/qbx_lib.py, so storing them would only create a
    // second copy that can disagree with the separator the app actually uses.
    valid_node_ids: nodes.map((n) => ({
      node_id: n.node_id,
      code: n.code,
      name: n.name,
      level_index: n.level_index,
    })),
    authoring_rules: importAuthoringRules,
    content_block_types: {
      slots: ["body", "hint", "answer", "solution", "marking_criteria"],
      types: ["text", "heading", "equation", "image", "diagram", "graph", "function", "table", "list", "code", "answer_area", "page_break"],
    },
    mcq_option_format: {
      content: "array of content blocks, same block format as body",
      is_correct: "boolean; mark exactly one true when the answer is known",
      order: "array order is the printed choice order; labels A, B, C... are implicit",
    },
    ignored_fields: {
      question: ["review_status", "notes", "created_at", "updated_at"],
      part: ["difficulty", "node_ids", "node_codes", "node_names", "tags", "source", "notes", "classification_confidence", "mcq_options", "assets", "review_status"],
      never_exported: ["hint"],
      max_part_depth_rendered: 1,
    },
    example_question: {
      type_key: config.question_types[0] ?? "short_answer",
      difficulty: config.difficulty_levels[0]?.level ?? null,
      marks: 3,
      node_ids: exampleNode ? [exampleNode.node_id] : [],
      node_codes: exampleNode?.code ? [exampleNode.code] : [],
      node_names: exampleNode ? [exampleNode.path] : [],
      tags: [],
      body: [
        { block_type: "text", content: { text: "Example question text." } },
        { block_type: "equation", content: { latex: "x^2 - 5x + 6 = 0", display: true } },
      ],
      hint: [{ block_type: "text", content: { text: "Try identifying the relevant principle first." } }],
      answer: [{ block_type: "text", content: { text: "x = 2, x = 3" } }],
      solution: [],
      // Calculation: step by step, one mark per step (written answers use bands instead).
      marking_criteria: [
        {
          block_type: "list",
          content: {
            ordered: false,
            items: [
              "1 mark: uses the correct formula",
              "1 mark: correct working shown",
              "1 mark: correct final answer",
            ],
          },
        },
      ],
      classification_confidence: "high",
      source: { name: "Example Source", year: 2025, original_question_no: "1" },
    },
    example_written_question: {
      type_key: config.question_types.includes("short_answer") ? "short_answer" : (config.question_types[0] ?? "short_answer"),
      marks: 4,
      body: [
        { block_type: "text", content: { text: "Explain why concrete is reinforced with steel." } },
        { block_type: "answer_area", content: { lines: 8 } },
      ],
      answer: [{ block_type: "text", content: { text: "Concrete is strong in compression but weak in tension, so steel bars carry the tensile loads. Steel and concrete have similar thermal expansion, so they stay bonded as temperature changes." } }],
      marking_criteria: [
        {
          block_type: "list",
          content: {
            ordered: false,
            // Written answers use bands: highest first, top band = the question's marks.
            items: [
              "4 marks: Explains that concrete is weak in tension, that steel carries the tension, and why the two work together (e.g. bonding, similar thermal expansion)",
              "2-3 marks: Explains the roles of concrete and steel without explaining why they work together",
              "1 mark: Identifies that steel strengthens the concrete",
            ],
          },
        },
      ],
    },
    example_multiple_choice: {
      type_key: "multiple_choice",
      marks: 1,
      body: [{ block_type: "text", content: { text: "What is the temperature?" } }],
      mcq_options: [
        { content: [{ block_type: "text", content: { text: "$1.6\\times10^{12}$ K" } }], is_correct: false },
        { content: [{ block_type: "text", content: { text: "$5.2\\times10^{3}$ K" } }], is_correct: true },
      ],
      answer: [{ block_type: "text", content: { text: "B" } }],
      solution: [{ block_type: "text", content: { text: "Explain why B is correct and why the closest distractor is wrong." } }],
      // Exactly one criterion for a one-mark multiple-choice question.
      marking_criteria: [{ block_type: "list", content: { ordered: false, items: ["1 mark: selects B, $5.2\\times10^{3}$ K, because ..."] } }],
    },
  };
}

export async function buildSkillBlob(
  config: CourseFullConfig,
  instructionsMarkdown: string
): Promise<Blob> {
  const nodes = flattenNodes(config.nodes);
  const zip = new JSZip();
  zip.file("SKILL.md", buildSkillMarkdown(config, instructionsMarkdown));
  zip.file("WORKFLOW.md", questionImportWorkflow);
  zip.file("CONVENTIONS.md", importConventionsMarkdown);
  zip.file("scripts/check_conventions.py", checkConventionsScript);
  // Compact on purpose: this file is a machine reference. Agents search it with
  // scripts/index_nodes.py; they never need it in context.
  zip.file("import-schema.json", JSON.stringify(buildImportSchema(config)));
  zip.file("nodes.txt", nodesIndexMarkdown(nodes));
  for (const [path, contents] of Object.entries(questionImportScripts)) zip.file(path, contents);
  return zip.generateAsync({ type: "blob" });
}

export async function downloadSkill(courseId: string): Promise<void> {
  const config = await data.getCourseFullConfig(courseId);
  if (!config) throw new Error("Course not found");
  const instructions = await data.getInstructions(courseId);
  const blob = await buildSkillBlob(config, instructions.instructions_markdown);
  downloadBlob(blob, `${slugName(config.name)}.skill`);
}

// ---------- course export (.qb) ----------

function mimeExtension(mime: string): string {
  switch (mime) {
    case "image/png": return "png";
    case "image/jpeg": return "jpg";
    case "image/gif": return "gif";
    case "image/webp": return "webp";
    case "image/svg+xml": return "svg";
    default: return "bin";
  }
}

export interface CourseExportFilters {
  typeKeys?: string[];
  difficulties?: number[];
  institutions?: string[];
  tags?: string[];
}

export interface CourseExportOptions {
  /** Export course structure without question content. */
  includeQuestions?: boolean;
  /** Include the review schedule and attempt history. On by default for a course bundle. */
  includeLearningData?: boolean;
  /** Include the free-text answers the student typed during practice. Off by default. */
  includeResponseText?: boolean;
}

export type ExportProgress = (percent: number) => void;

/** Bumped whenever the course bundle shape changes. */
export const COURSE_EXPORT_SCHEMA_VERSION = 3;
export const SUPPORTED_COURSE_EXPORT_VERSIONS = [1, 2, COURSE_EXPORT_SCHEMA_VERSION];

export interface LearningBundle {
  review_policy: Record<string, unknown> | null;
  review_state: Array<Record<string, unknown>>;
  attempts: Array<Record<string, unknown>>;
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function optionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Review schedule + attempt history for one course, ready to be written to JSON. */
async function readLearningData(
  courseId: string,
  includeResponseText: boolean
): Promise<LearningBundle> {
  const reviewRows = await all<Record<string, unknown>>(
    `SELECT review_state.question_id AS question_id, review_state.next_due_at AS next_due_at,
            review_state.interval_days AS interval_days, review_state.last_reviewed_at AS last_reviewed_at,
            review_state.review_count AS review_count, review_state.lapse_count AS lapse_count,
            review_state.ladder_step AS ladder_step, review_state.last_rating AS last_rating,
            review_state.last_outcome AS last_outcome, review_state.updated_at AS updated_at
       FROM question_review_state AS review_state
       JOIN question ON question.question_id = review_state.question_id
      WHERE question.course_id = ?`,
    [courseId]
  );
  const attemptRows = await all<Record<string, unknown>>(
    `SELECT practice_attempt.question_id AS question_id, practice_attempt.status AS status,
            practice_attempt.correct AS correct, practice_attempt.time_spent_sec AS time_spent_sec,
            practice_attempt.user_notes AS user_notes, practice_attempt.created_at AS created_at,
            practice_attempt.response_text AS response_text, practice_attempt.confidence AS confidence,
            practice_attempt.self_rating AS self_rating, practice_attempt.hints_revealed AS hints_revealed,
            practice_attempt.scored_by AS scored_by, practice_attempt.score_earned AS score_earned,
            practice_attempt.score_possible AS score_possible
       FROM practice_attempt
       JOIN question ON question.question_id = practice_attempt.question_id
      WHERE question.course_id = ?
      ORDER BY practice_attempt.created_at`,
    [courseId]
  );
  const policy = await data.getReviewPolicy();
  return {
    review_policy: { ladder: policy.ladder, again_minutes: policy.againMinutes },
    review_state: reviewRows.map((row) => ({
      question_id: row.question_id,
      next_due_at: optionalText(row.next_due_at),
      interval_days: Number(row.interval_days) || 0,
      last_reviewed_at: optionalText(row.last_reviewed_at),
      review_count: Number(row.review_count) || 0,
      lapse_count: Number(row.lapse_count) || 0,
      ladder_step: Number(row.ladder_step) || 0,
      last_rating: optionalText(row.last_rating),
      last_outcome: optionalText(row.last_outcome),
      updated_at: optionalText(row.updated_at),
    })),
    attempts: attemptRows.map((row) => ({
      question_id: row.question_id,
      status: String(row.status),
      // `correct` is only meaningful for objectively scored attempts; keep the
      // provenance column so an imported history is not silently re-graded.
      correct: optionalNumber(row.correct),
      time_spent_sec: optionalNumber(row.time_spent_sec),
      user_notes: optionalText(row.user_notes),
      created_at: optionalText(row.created_at) ?? nowUtc(),
      response_text: includeResponseText ? optionalText(row.response_text) : null,
      confidence: optionalText(row.confidence),
      self_rating: optionalText(row.self_rating),
      hints_revealed: Number(row.hints_revealed) || 0,
      scored_by: optionalText(row.scored_by),
      score_earned: optionalNumber(row.score_earned),
      score_possible: optionalNumber(row.score_possible),
    })),
  };
}

export async function exportCourse(
  courseId: string,
  filters: CourseExportFilters = {},
  options: CourseExportOptions = {},
  onProgress?: ExportProgress
): Promise<void> {
  const includeQuestions = options.includeQuestions !== false;
  const includeLearningData = options.includeLearningData !== false;
  onProgress?.(0);
  const config = await data.getCourseFullConfig(courseId);
  if (!config) throw new Error("Course not found");
  const preAssetWork = 3 + (includeQuestions && includeLearningData ? 1 : 0);
  const row = await data.getCourseRow(courseId);
  const allQuestions = includeQuestions ? await data.getCourseQuestions(courseId) : [];
  const questions = allQuestions.filter((question) =>
    (!filters.typeKeys?.length || filters.typeKeys.includes(question.type_key)) &&
    (!filters.difficulties?.length || (question.difficulty != null && filters.difficulties.includes(question.difficulty))) &&
    (!filters.institutions?.length || (question.source?.institution != null && filters.institutions.includes(question.source.institution))) &&
    (!filters.tags?.length || question.tags.some((tag) => filters.tags!.includes(tag)))
  );
  const includedQuestionIds = new Set<string>();
  const includeQuestionTree = (question: Question) => {
    includedQuestionIds.add(question.question_id);
    question.parts.forEach(includeQuestionTree);
  };
  questions.forEach(includeQuestionTree);
  const drawingNotebooks = includeQuestions
    ? (await data.listDrawingNotebooksForCourse(courseId)).filter((notebook) => includedQuestionIds.has(notebook.question_id))
    : [];
  const learning = includeQuestions && includeLearningData ? await readLearningData(courseId, options.includeResponseText === true) : null;
  const stimuli = includeQuestions ? await data.listStimuliForCourse(courseId) : [];
  const stimuliWithContent: StimulusExport[] = [];
  for (const s of stimuli) {
    const full = await data.getStimulus(s.stimulus_id);
    if (full) {
      stimuliWithContent.push({
        stimulus_id: full.stimulus_id,
        course_id: full.course_id,
        title: full.title,
        created_at: full.created_at,
        updated_at: full.updated_at,
        blocks: full.blocks.map((b: any) => ({
          block_id: b.block_id,
          position: b.position,
          block_type: b.block_type,
          content: b.content,
        })),
      });
    }
  }
  const questionStimuli: QuestionStimulusLink[] = [];
  for (const q of questions) {
    const qs = await data.getStimuliForQuestion(q.question_id);
    for (const s of qs) {
      questionStimuli.push({ question_id: q.question_id, stimulus_id: s.stimulus_id });
    }
  }
  const seen = collectReferencedAssetIdsWithStimuli(questions, stimuliWithContent);
  const workTotal = preAssetWork + seen.size + 2;
  let completedWork = preAssetWork;
  const report = (fraction = 0) => onProgress?.(Math.min(99, ((completedWork + fraction) / workTotal) * 100));
  report();
  const zip = new JSZip();
  zip.file(
    "course.json",
    JSON.stringify(
      {
        export_schema_version: COURSE_EXPORT_SCHEMA_VERSION,
        exported_at: new Date().toISOString(),
        includes: {
          course_structure: true,
          questions: includeQuestions,
          images: includeQuestions,
          learning_data: includeQuestions && includeLearningData,
          typed_answers: includeQuestions && includeLearningData && options.includeResponseText === true,
          generated_files: false,
          stimuli: stimuliWithContent.length > 0,
          question_stimuli: questionStimuli.length > 0,
          drawing_notebooks: drawingNotebooks.length > 0,
        },
        course: {
          ...config,
          description: row?.description ?? null,
          subject: row?.subject ?? null,
          curriculum: row?.curriculum ?? null,
          version_year: row?.version_year ?? null,
        },
        questions,
        learning,
        stimuli: stimuliWithContent,
        question_stimuli: questionStimuli,
        drawing_notebooks: drawingNotebooks,
      }, null, 2
    )
  );
  completedWork++;
  report();
  for (const assetId of seen) {
    const blob = await idb.getAsset(assetId);
    if (blob) zip.file(`assets/${assetId}.${mimeExtension(blob.type || "")}`, blob);
    completedWork++;
    report();
  }
  zip.file(
    "README.txt",
    [
      `${config.name} — Quaestio course bundle`,
      "",
      "Contents:",
      includeQuestions
        ? "- course.json: course structure, difficulty and tag definitions, and the questions listed in it."
        : "- course.json: course structure, difficulty and tag definitions.",
      includeQuestions ? `- assets/: images and diagrams referenced by the exported questions (${seen.size} file(s)).` : null,
      includeQuestions ? null : "- Questions, images and practice history are not included.",
      `- learning: ${learning ? `review schedule and ${learning.attempts.length} practice attempt record(s)` : "not included"}.`,
      learning ? `- typed answers: ${options.includeResponseText === true ? "included" : "excluded"}.` : null,
      includeQuestions ? "- Generated test files are not included; regenerate them from the questions." : null,
      stimuliWithContent.length > 0 ? `- Includes ${stimuliWithContent.length} stimulus(es) with question links.` : null,
      "",
      "Importing replaces the course with the same id, or asks whether to add it as a new course.",
      "Attempt history is restored without its practice session, so the schedule carries over but session history does not.",
    ]
      .filter((line) => line !== null)
      .join("\n") + "\n"
  );
  completedWork++;
  const zipBlob = await zip.generateAsync({ type: "blob" }, (metadata) => report(metadata.percent / 100));
  onProgress?.(100);
  downloadBlob(zipBlob, `${slugName(config.name)}.qb`);
}

/** Export the question records and their binary assets without course configuration. */
export async function exportQuestions(courseId: string, filters: CourseExportFilters = {}, onProgress?: ExportProgress): Promise<void> {
  onProgress?.(0);
  const config = await data.getCourseFullConfig(courseId);
  if (!config) throw new Error("Course not found");
  const allQuestions = await data.getCourseQuestions(courseId);
  const questions = allQuestions.filter((question) =>
    (!filters.typeKeys?.length || filters.typeKeys.includes(question.type_key)) &&
    (!filters.difficulties?.length || (question.difficulty != null && filters.difficulties.includes(question.difficulty))) &&
    (!filters.institutions?.length || (question.source?.institution != null && filters.institutions.includes(question.source.institution))) &&
    (!filters.tags?.length || question.tags.some((tag) => filters.tags!.includes(tag)))
  );
  const zip = new JSZip();
  zip.file("questions.json", JSON.stringify({
    export_schema_version: 1,
    course_name: config.name,
    exported_at: new Date().toISOString(),
    includes: {
      course_structure: false,
      questions: true,
      images: true,
      learning_data: false,
      typed_answers: false,
      generated_files: false,
    },
    questions,
  }, null, 2));
  zip.file("README.txt", "Editable question export. Edit questions.json; binary files referenced by asset_id are in assets/. Keep asset IDs and filenames unchanged so image blocks continue to resolve.\n\nThis package deliberately contains questions and their images only: no course structure, no review schedule, no attempt history, no typed answers, and no generated files. Use the .qb course export for a full backup.\n");
  const seen = collectReferencedAssetIds(questions);
  const workTotal = 2 + seen.size + 2;
  let completedWork = 2;
  const report = (fraction = 0) => onProgress?.(Math.min(99, ((completedWork + fraction) / workTotal) * 100));
  report();
  for (const assetId of seen) {
    const blob = await idb.getAsset(assetId);
    if (blob) zip.file(`assets/${assetId}.${mimeExtension(blob.type || "")}`, blob);
    completedWork++;
    report();
  }
  completedWork++;
  const zipBlob = await zip.generateAsync({ type: "blob" }, (metadata) => report(metadata.percent / 100));
  onProgress?.(100);
  downloadBlob(zipBlob, `${slugName(config.name)}-questions.qbx`);
}

// ---------- course import (.qb) ----------

export interface StimulusExport {
  stimulus_id: string;
  course_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  blocks: Array<{
    block_id: string;
    position: number;
    block_type: string;
    content: Record<string, any>;
  }>;
}

export interface QuestionStimulusLink {
  question_id: string;
  stimulus_id: string;
}

export interface ParsedBundle {
  course: CourseFullConfig & {
    description?: string | null;
    subject?: string | null;
    curriculum?: string | null;
    version_year?: string | null;
    /** Set by the built-in starter bundle so the UI can offer to remove it. */
    is_sample?: boolean;
  };
  questions: Question[];
  assetBlobs: Map<string, Blob>;
  /** Present from export version 2 onwards. */
  learning?: LearningBundle | null;
  stimuli?: StimulusExport[];
  question_stimuli?: QuestionStimulusLink[];
  drawing_notebooks?: DrawingNotebook[];
}

export async function parseCourseBundle(file: File): Promise<ParsedBundle> {
  let archive: JSZip;
  try {
    archive = await JSZip.loadAsync(file);
  } catch {
    throw new Error("This file is not a valid .qb course bundle.");
  }
  const courseJsonFile = archive.file("course.json");
  if (!courseJsonFile) {
    throw new Error("This .qb bundle has no course.json — it may be corrupted.");
  }
  let courseJson: Record<string, any>;
  try {
    courseJson = JSON.parse(await courseJsonFile.async("string"));
  } catch {
    throw new Error("This .qb bundle's course.json is not valid JSON — it may be corrupted.");
  }
  if (!SUPPORTED_COURSE_EXPORT_VERSIONS.includes(courseJson.export_schema_version)) {
    throw new Error(
      `Unsupported export schema version ${courseJson.export_schema_version} — this app supports version ${SUPPORTED_COURSE_EXPORT_VERSIONS.join(" and ")}.`
    );
  }
  // Validate before anything is written: the replace path deletes the existing
  // course first, so a malformed bundle must be rejected here, not mid-insert.
  const course = courseJson.course;
  if (!course || typeof course.course_id !== "string" || !course.course_id) {
    throw new Error("This .qb bundle has no course id — it may be corrupted.");
  }
  if (typeof course.name !== "string" || !course.name.trim()) {
    throw new Error("This .qb bundle's course has no name, so it cannot be imported.");
  }
  if (courseJson.questions != null && !Array.isArray(courseJson.questions)) {
    throw new Error("This .qb bundle's question list is malformed.");
  }
  let drawingNotebooks: DrawingNotebook[] = [];
  if (courseJson.drawing_notebooks != null) {
    try { drawingNotebooks = validateDrawingNotebooks(courseJson.drawing_notebooks); }
    catch (error) { throw new Error(`This .qb bundle has invalid drawing data: ${error instanceof Error ? error.message : String(error)}`); }
  }
  const assetBlobs = new Map<string, Blob>();
  const assetFolder = archive.folder("assets");
  if (assetFolder) {
    for (const path in assetFolder.files) {
      const entry = assetFolder.files[path];
      if (entry.dir) continue;
      const name = path.split("/").pop() ?? "";
      const assetId = name.split(".").slice(0, -1).join(".") || name;
      if (!assetBlobs.has(assetId)) assetBlobs.set(assetId, await entry.async("blob"));
    }
  }
  return {
    course,
    questions: courseJson.questions ?? [],
    assetBlobs,
    learning: courseJson.learning ?? null,
    stimuli: Array.isArray(courseJson.stimuli) ? courseJson.stimuli : undefined,
    question_stimuli: Array.isArray(courseJson.question_stimuli) ? courseJson.question_stimuli : undefined,
    drawing_notebooks: drawingNotebooks,
  };
}

async function wipeCourseData(courseId: string): Promise<void> {
  const existing = await getFirst("SELECT course_id FROM course WHERE course_id = ?", [courseId]);
  if (existing) await data.deleteCourse(courseId);
}

const IMAGE_TYPES = new Set(["image", "diagram", "graph"]);

/** Every asset id a question tree references: declared assets and any content
 *  slot or MCQ option block. Mirrors what the importer scans. */
function collectReferencedAssetIds(questions: Question[]): Set<string> {
  const seen = new Set<string>();
  const scanBlocks = (blocks: Array<{ content?: Record<string, any> }> | undefined) => {
    for (const block of blocks ?? []) {
      const assetId = block.content?.asset_path;
      if (typeof assetId === "string" && assetId) seen.add(assetId);
    }
  };
  const walk = (q: Question) => {
    for (const a of q.assets ?? []) seen.add(a.asset_id);
    for (const slot of ["body", "hint", "answer", "solution", "marking_criteria"] as const) scanBlocks(q[slot]);
    for (const option of q.mcq_options ?? []) scanBlocks(option.content);
    for (const p of q.parts ?? []) walk(p);
  };
  for (const q of questions) walk(q);
  return seen;
}

function collectReferencedAssetIdsWithStimuli(
  questions: Question[],
  stimuli?: StimulusExport[]
): Set<string> {
  const seen = collectReferencedAssetIds(questions);
  const scanBlocks = (blocks: Array<{ content?: Record<string, any> }> | undefined) => {
    for (const block of blocks ?? []) {
      const assetId = block.content?.asset_path;
      if (typeof assetId === "string" && assetId) seen.add(assetId);
    }
  };
  for (const s of stimuli ?? []) {
    scanBlocks(s.blocks as any);
  }
  return seen;
}

interface ImportCtx {
  courseId: string;
  nodeMap: Map<string, string>;
  questionMap: Map<string, string>;
  usedQuestionIds: Set<string>;
  assetMap: Map<string, string>;
  assetRows: Set<string>;
  stimulusMap?: Map<string, string>;
}

async function getOrCreateTag(courseId: string, name: string): Promise<string> {
  const row = await getFirst("SELECT tag_id FROM tag WHERE course_id = ? AND name = ?", [
    courseId,
    name,
  ]);
  if (row) return row.tag_id;
  const tagId = newId("tag");
  await run("INSERT INTO tag (tag_id, course_id, name) VALUES (?, ?, ?)", [tagId, courseId, name]);
  return tagId;
}

async function getAllowedTagId(courseId: string, name: string): Promise<string> {
  const row = await getFirst("SELECT tag_id FROM tag WHERE course_id = ? AND name = ?", [courseId, name]);
  if (!row) throw new Error(`Tag '${name}' is not in this course's allowed tag list.`);
  return row.tag_id;
}

async function insertSourceIfNeeded(question: Question): Promise<string | null> {
  const s = question.source;
  if (!s || !s.name) return null;
  const candidates = await all("SELECT source_id, year, institution FROM source WHERE name = ?", [
    s.name,
  ]);
  for (const c of candidates) {
    if ((c.year ?? null) === (s.year ?? null) && (c.institution ?? null) === (s.institution ?? null)) {
      return c.source_id;
    }
  }
  const sourceId = newId("src");
  await run(
    "INSERT INTO source (source_id, name, year, institution, original_question_no) VALUES (?, ?, ?, ?, ?)",
    [sourceId, s.name, s.year ?? null, s.institution ?? null, s.original_question_no ?? null]
  );
  return sourceId;
}

async function insertQuestion(
  question: Question,
  ctx: ImportCtx,
  sourceAlready: Map<string, string | null>
): Promise<string> {
  const questionId = claimQuestionId(question.question_id, ctx.usedQuestionIds);
  ctx.questionMap.set(question.question_id, questionId);
  const parentId = question.parent_question_id
    ? (ctx.questionMap.get(question.parent_question_id) ?? null)
    : null;
  // Key the memo on the paper's identity, not the whole source object: every
  // question from one paper must share a single source row.
  const sourceKey = question.source?.name
    ? `${question.source.name}\u0000${question.source.year ?? ""}\u0000${question.source.institution ?? ""}`
    : "";
  let sourceId = sourceKey ? (sourceAlready.get(sourceKey) ?? null) : null;
  if (sourceKey && !sourceId) {
    sourceId = await insertSourceIfNeeded(question);
    sourceAlready.set(sourceKey, sourceId);
  }
  await run(
    `INSERT INTO question (question_id, course_id, type_key, difficulty, marks, parent_question_id,
        part_label, notes, review_status, classification_confidence, source_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      questionId,
      ctx.courseId,
      question.type_key,
      question.difficulty,
      question.marks,
      parentId,
      question.part_label,
      question.notes,
      question.review_status,
      question.classification_confidence,
      sourceId,
      question.created_at ?? nowUtc(),
      question.updated_at ?? nowUtc(),
    ]
  );
  let primarySet = false;
  for (const nodeId of question.node_ids ?? []) {
    // Skip ids that were not part of this bundle rather than writing a dangling FK.
    const mapped = ctx.nodeMap.get(nodeId);
    if (!mapped) continue;
    await run(
      "INSERT INTO question_classification (question_id, node_id, is_primary) VALUES (?, ?, ?)",
      [questionId, mapped, primarySet ? 0 : 1]
    );
    primarySet = true;
  }
  // A question/tag pair is unique in the join table. Bundles from older
  // exports may repeat a tag, so normalize and de-duplicate before inserting.
  const insertedTagNames = new Set<string>();
  for (const rawTag of question.tags ?? []) {
    const tag = rawTag.trim();
    if (!tag || insertedTagNames.has(tag)) continue;
    insertedTagNames.add(tag);
    const tagId = await getAllowedTagId(ctx.courseId, tag);
    await run("INSERT INTO question_tag (question_id, tag_id) VALUES (?, ?)", [questionId, tagId]);
  }
  const slotLists: Array<[string, Question["body"]]> = [
    ["body", question.body],
    ["hint", question.hint],
    ["answer", question.answer],
    ["solution", question.solution],
    ["marking_criteria", question.marking_criteria],
  ];
  for (const [slot, blocks] of slotLists) {
    for (let i = 0; i < (blocks ?? []).length; i++) {
      const b = blocks[i];
      let content = b.content;
      if (IMAGE_TYPES.has(b.block_type) && typeof content?.asset_path === "string") {
        const mapped = ctx.assetMap.get(content.asset_path);
        if (mapped) content = { ...content, asset_path: mapped };
      }
      await run(
        "INSERT INTO content_block (block_id, question_id, slot, position, block_type, content_json) VALUES (?, ?, ?, ?, ?, ?)",
        [newId("blk"), questionId, slot, i, b.block_type, JSON.stringify(content ?? {})]
      );
    }
  }
  for (const [position, option] of (question.mcq_options ?? []).entries()) {
    const content = (option.content ?? []).map((block) => {
      if (!IMAGE_TYPES.has(block.block_type) || typeof block.content?.asset_path !== "string") return block;
      const mapped = ctx.assetMap.get(block.content.asset_path);
      return mapped ? { ...block, content: { ...block.content, asset_path: mapped } } : block;
    });
    await run(
      "INSERT INTO mcq_option (option_id, question_id, position, content_json, is_correct) VALUES (?, ?, ?, ?, ?)",
      [newId("opt"), questionId, position, JSON.stringify(content), option.is_correct ? 1 : 0]
    );
  }
  for (const a of question.assets ?? []) {
    const mapped = ctx.assetMap.get(a.asset_id) ?? a.asset_id;
    if (ctx.assetRows.has(mapped)) continue;
    await run(
      `INSERT INTO asset (asset_id, question_id, file_path, mime_type, width, height, alt_text, caption, original_filename)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [mapped, questionId, mapped, a.mime_type, a.width, a.height, a.alt_text, a.caption, null]
    );
    ctx.assetRows.add(mapped);
  }
  for (const part of question.parts ?? []) {
    await insertQuestion(part, ctx, sourceAlready);
  }
  return questionId;
}

export async function applyCourseBundle(
  bundle: ParsedBundle,
  mode: "replace" | "new",
  requestedCourseId?: string,
  onProgress?: ExportProgress
): Promise<string> {
  const src = bundle.course;
  const courseId = mode === "new" ? (requestedCourseId ?? newId("course")) : src.course_id;
  if (mode === "replace") {
    // shortcut: the old course is deleted before the new rows are written, so a
    // bundle that passes validation but still fails mid-insert leaves a half
    // course. Upgrade to a single transaction if bundles ever come from an
    // untrusted source.
    await wipeCourseData(courseId);
  }
  onProgress?.(5);
  const existingQuestionRows = await all<{ question_id: string }>("SELECT question_id FROM question");
  const ctx: ImportCtx = {
    courseId,
    nodeMap: new Map(),
    questionMap: new Map(),
    usedQuestionIds: new Set(existingQuestionRows.map((row) => String(row.question_id))),
    assetMap: new Map(),
    assetRows: new Set(),
    stimulusMap: new Map(),
  };

  // Asset IDs are unique in both IndexedDB and the SQL asset table. Include
  // both stores: old/partial imports can leave a SQL row without a blob.
  const existingAssetRows = await all<{ asset_id: string }>("SELECT asset_id FROM asset");
  ctx.assetRows = new Set(existingAssetRows.map((asset) => asset.asset_id));
  const existingAssets = new Set([
    ...await idb.listAssetIds(),
    ...ctx.assetRows,
  ]);
  const bundleAssetIds = new Set(bundle.assetBlobs.keys());
  const collectQuestionAssets = (questions: Question[]) => {
    for (const question of questions) {
      for (const asset of question.assets ?? []) bundleAssetIds.add(asset.asset_id);
      for (const slot of [question.body, question.hint, question.answer, question.solution, question.marking_criteria]) {
        for (const block of slot ?? []) {
          const assetPath = block.content?.asset_path;
          if (typeof assetPath === "string" && assetPath) bundleAssetIds.add(assetPath);
        }
      }
      for (const option of question.mcq_options ?? []) {
        for (const block of option.content ?? []) {
          const assetPath = block.content?.asset_path;
          if (typeof assetPath === "string" && assetPath) bundleAssetIds.add(assetPath);
        }
      }
      collectQuestionAssets(question.parts ?? []);
    }
  };
  collectQuestionAssets(bundle.questions);
  // Reuse an existing asset id when its bytes are already stored (content-hash
  // dedupe), so repeated imports do not duplicate blobs. Only mint a fresh id on
  // a genuine collision (same id, different bytes).
  const hashToTarget = new Map<string, string>();
  for (const assetId of bundleAssetIds) {
    const blob = bundle.assetBlobs.get(assetId);
    let target: string;
    if (blob) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const hash = await contentHash(bytes);
      if (existingAssets.has(hash)) {
        target = hash;
      } else if (hashToTarget.has(hash)) {
        target = hashToTarget.get(hash)!;
      } else if (existingAssets.has(assetId)) {
        target = newId("asset");
      } else {
        target = assetId;
      }
      hashToTarget.set(hash, target);
    } else {
      target = existingAssets.has(assetId) ? newId("asset") : assetId;
    }
    ctx.assetMap.set(assetId, target);
    existingAssets.add(target);
  }

  const now = nowUtc();
  await run(
    `INSERT INTO course (course_id, name, description, subject, curriculum, version_year,
        schema_version, allow_multi_classification, is_sample, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      courseId,
      src.name,
      src.description ?? null,
      src.subject ?? null,
      src.curriculum ?? null,
      src.version_year ?? null,
      src.schema_version ?? 1,
      src.allow_multi_classification ? 1 : 0,
      src.is_sample ? 1 : 0,
      now,
      now,
    ]
  );
  for (const level of src.hierarchy ?? []) {
    await run(
      "INSERT INTO course_level_def (course_id, level_index, label, required) VALUES (?, ?, ?, ?)",
      [courseId, level.level_index, level.label, level.required ? 1 : 0]
    );
  }
  for (const d of src.difficulty_levels ?? []) {
    await run("INSERT INTO difficulty_level (course_id, level, label) VALUES (?, ?, ?)", [
      courseId,
      d.level,
      d.label,
    ]);
  }
  const glossaryTerms = src.glossary ?? data.defaultGlossaryTerms();
  for (const g of glossaryTerms) {
    const term = String(g?.term ?? "").trim();
    const definition = String(g?.definition ?? "").trim();
    if (!term || !definition) continue;
    await run("INSERT INTO course_glossary (course_id, term, definition) VALUES (?, ?, ?)", [
      courseId,
      term,
      definition,
    ]);
  }
  const existingTypes = await all("SELECT type_key FROM question_type");
  const typeSet = new Set(existingTypes.map((r) => r.type_key));
  for (const key of src.question_types ?? []) {
    if (!typeSet.has(key)) {
      await run("INSERT INTO question_type (type_key, display_name) VALUES (?, ?)", [
        key,
        key
          .split("_")
          .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
          .join(" "),
      ]);
    }
  }
  for (const tag of src.tags ?? []) {
    await getOrCreateTag(courseId, tag);
  }
  if (!(src.tags ?? []).includes("action_required")) {
    await run("INSERT INTO tag (tag_id, course_id, name) VALUES (?, ?, ?)", [newId("tag"), courseId, "action_required"]);
  }
  // nodes, parents before children (pre-order walk)
  const fullFlat: CourseNode[] = [];
  const walkAll = (list: CourseNode[]) => {
    for (const n of list) {
      fullFlat.push(n);
      walkAll(n.children);
    }
  };
  walkAll(src.nodes ?? []);
  for (const node of fullFlat) {
    const nodeId = newId("node");
    ctx.nodeMap.set(node.node_id, nodeId);
    await run(
      `INSERT INTO course_node (node_id, course_id, parent_node_id, level_index, name, code, description, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nodeId,
        courseId,
        node.parent_node_id ? (ctx.nodeMap.get(node.parent_node_id) ?? null) : null,
        node.level_index,
        node.name,
        node.code,
        node.description,
        node.sort_order,
        now,
        now,
      ]
    );
  }
  onProgress?.(25);

  const sourceAlready = new Map<string, string | null>();
  let completedQuestions = 0;
  const questionTotal = Math.max(1, bundle.questions.length);
  for (const q of bundle.questions) {
    await insertQuestion(q, ctx, sourceAlready);
    completedQuestions++;
    onProgress?.(25 + (completedQuestions / questionTotal) * 55);
  }
  onProgress?.(82);
  for (const [assetId, blob] of bundle.assetBlobs) {
    await idb.putAsset(ctx.assetMap.get(assetId) ?? assetId, blob);
  }
  onProgress?.(94);
  await restoreLearningData(bundle.learning, ctx);
  await restoreStimuli(bundle, ctx);
  await data.importDrawingNotebooks(bundle.drawing_notebooks ?? [], ctx.questionMap);
  onProgress?.(100);
  return courseId;
}

/**
 * Puts the review schedule and attempt history back, keyed by the ids the
 * questions were given on import. Sessions are deliberately not restored: the
 * plan was a snapshot of one sitting on one device, and replaying it would
 * re-offer questions the student has already answered here.
 */
async function restoreLearningData(
  learning: LearningBundle | null | undefined,
  ctx: ImportCtx
): Promise<void> {
  if (!learning) return;
  const now = nowUtc();
  // Synchronous callback: `transaction` commits when it returns, so an async
  // body would commit before these inserts ran and lose atomicity.
  await transaction((database) => {
    for (const row of learning.review_state ?? []) {
      const questionId = ctx.questionMap.get(String(row.question_id));
      if (!questionId) continue;
      database.run(
        `INSERT INTO question_review_state
           (question_id, next_due_at, interval_days, last_reviewed_at, review_count, lapse_count, ladder_step, last_rating, last_outcome, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(question_id) DO UPDATE SET
           next_due_at = excluded.next_due_at,
           interval_days = excluded.interval_days,
           last_reviewed_at = excluded.last_reviewed_at,
           review_count = excluded.review_count,
           lapse_count = excluded.lapse_count,
           ladder_step = excluded.ladder_step,
           last_rating = excluded.last_rating,
           last_outcome = excluded.last_outcome,
           updated_at = excluded.updated_at`,
        [
          questionId,
          optionalText(row.next_due_at),
          typeof row.interval_days === "number" && Number.isFinite(row.interval_days) ? row.interval_days : 0,
          optionalText(row.last_reviewed_at),
          typeof row.review_count === "number" ? row.review_count : 0,
          typeof row.lapse_count === "number" ? row.lapse_count : 0,
          typeof row.ladder_step === "number" ? row.ladder_step : 0,
          isSelfRating(row.last_rating) ? row.last_rating : null,
          isReviewOutcome(row.last_outcome) ? row.last_outcome : null,
          optionalText(row.updated_at) ?? now,
        ]
      );
    }
    for (const row of learning.attempts ?? []) {
      const questionId = ctx.questionMap.get(String(row.question_id));
      if (!questionId) continue;
      const status = String(row.status ?? "seen");
      database.run(
        `INSERT INTO practice_attempt
           (attempt_id, session_id, question_id, status, correct, time_spent_sec, user_notes, created_at,
            response_text, confidence, self_rating, hints_revealed, scored_by, score_earned, score_possible)
         VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId("att"),
          questionId,
          isAttemptStatus(status) ? status : "seen",
          // `correct` is a self-report or an app score. Only trust it when the
          // bundle says an objective marker decided it.
          optionalNumber(row.correct),
          optionalNumber(row.time_spent_sec),
          optionalText(row.user_notes),
          optionalText(row.created_at) ?? now,
          optionalText(row.response_text),
          optionalText(row.confidence),
          isSelfRating(row.self_rating) ? row.self_rating : null,
          typeof row.hints_revealed === "number" ? row.hints_revealed : 0,
          optionalText(row.scored_by),
          optionalNumber(row.score_earned),
          optionalNumber(row.score_possible),
        ]
      );
    }
  });
}

async function restoreStimuli(bundle: ParsedBundle, ctx: ImportCtx): Promise<void> {
  const stimuli = bundle.stimuli ?? [];
  if (stimuli.length === 0) return;
  const now = nowUtc();
  for (const s of stimuli) {
    const stimulusId = newId("stim");
    await run(
      `INSERT INTO stimulus (stimulus_id, course_id, title, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [stimulusId, ctx.courseId, s.title ?? null, s.created_at ?? now, s.updated_at ?? now]
    );
    const stmts: Array<[string, any[]]> = [];
    for (let i = 0; i < (s.blocks ?? []).length; i++) {
      const b = s.blocks[i];
      let content = b.content;
      if (IMAGE_TYPES.has(b.block_type) && typeof content?.asset_path === "string") {
        const mapped = ctx.assetMap.get(content.asset_path);
        if (mapped) content = { ...content, asset_path: mapped };
      }
      stmts.push([
        "INSERT INTO stimulus_block (block_id, stimulus_id, position, block_type, content_json) VALUES (?, ?, ?, ?, ?)",
        [newId("blk"), stimulusId, i, b.block_type, JSON.stringify(content ?? {})],
      ]);
    }
    if (stmts.length) {
      await runMany(stmts);
    }
    ctx.stimulusMap = ctx.stimulusMap ?? new Map();
    ctx.stimulusMap.set(s.stimulus_id, stimulusId);
  }
  const links = bundle.question_stimuli ?? [];
  for (const link of links) {
    const qid = ctx.questionMap.get(link.question_id);
    const sid = (ctx.stimulusMap ?? new Map()).get(link.stimulus_id);
    if (qid && sid) {
      await run(
        `INSERT OR IGNORE INTO question_stimulus (question_id, stimulus_id) VALUES (?, ?)`,
        [qid, sid]
      );
    }
  }
}

/**
 * `onIdCollision` lets the UI ask the question in its own accessible dialog;
 * without it the browser confirm() prompt is used.
 */
export async function importCourseFile(
  file: File,
  onIdCollision?: (info: { course_id: string; course_name: string }) => Promise<"replace" | "new">,
  onProgress?: ExportProgress
): Promise<{ course_id: string; course_name: string }> {
  onProgress?.(0);
  const bundle = await parseCourseBundle(file);
  onProgress?.(2);
  const existing = await getFirst("SELECT course_id FROM course WHERE course_id = ?", [
    bundle.course.course_id,
  ]);
  let courseId: string;
  if (existing) {
    const choice = onIdCollision
      ? await onIdCollision({ course_id: bundle.course.course_id, course_name: bundle.course.name })
      : window.confirm(
          `A course with id '${bundle.course.course_id}' already exists. Replace it with the imported one, or add as a new course?`
        )
        ? "replace"
        : "new";
    courseId =
      choice === "replace"
        ? await applyCourseBundle(bundle, "replace", undefined, onProgress)
        : await importAsNewCourse(bundle, onProgress);
  } else {
    courseId = await importAsNewCourse(bundle, onProgress);
  }
  return { course_id: courseId, course_name: bundle.course.name };
}

async function importAsNewCourse(bundle: ParsedBundle, onProgress?: ExportProgress): Promise<string> {
  const courseId = newId("course");
  try {
    return await applyCourseBundle(bundle, "new", courseId, onProgress);
  } catch (error) {
    // Bundle import writes in stages; remove partial rows/blobs if one stage
    // fails so retrying cannot leave another half-imported course behind.
    const partial = await getFirst("SELECT course_id FROM course WHERE course_id = ?", [courseId]);
    if (partial) await data.deleteCourse(courseId);
    throw error;
  }
}
