import { all, flush, getFirst, run, runMany, transaction } from "./db/sqlite";
import { newId, newQuestionId, nowUtc } from "./id";
import { deleteAssetBlob, finalizeQuestionAssets } from "./assets";
import { buildTestOutputs, deleteTestOutputs, ensureTestFileUrl, storeTestFiles, storeTestSolutionFile } from "./tests";
import { getTestFile } from "./db/indexeddb";
import { buildDocxSolutions } from "./docx";
import { buildPdfSolutions } from "./pdf";
import type {
  AttemptInput,
  AttemptStatus,
  AttemptSummary,
  Confidence,
  Course,
  CourseFullConfig,
  CourseNode,
  DifficultyLevel,
  DueQueue,
  DueQueueItem,
  GeneratedTestMeta,
  ImportResponse,
  LevelDef,
  NodeCount,
  PracticeFilters,
  PracticePoolCounts,
  PracticeSessionSummary,
  Question,
  QuestionCountsResponse,
  QuestionListItem,
  QuestionListResponse,
  RandomQuestionResponse,
  ResponseCapture,
  ReviewOutcome,
  ReviewPolicy,
  ReviewStateRow,
  ScoredBy,
  SelfRating,
  SessionMode,
  SessionPlanItem,
  SessionTopicCoverage,
  Source,
  StudyProgress,
  TestSectionInput,
  TestSectionResult,
  TopicProgress,
} from "../api/types";
import {
  dueReason,
  emptyReviewState,
  formatSqlUtc,
  isSelfRating,
  newlyDueReviewState,
  nextReviewState,
  normalizePolicy,
  parseSqlUtc,
  rankDueQuestions,
} from "./reviewSchedule";
import type { ReviewState } from "./reviewSchedule";
import { buildSessionPlan, suggestedSessionSize } from "./sessionPlan";
import type { PoolItem } from "./sessionPlan";
import { EMPTY_ACTIVITY, describeMarkingMix, pickNextAction, rollupTopicActivity } from "./studyProgress";
import type { NodeActivity } from "./studyProgress";
import { selectQuestionIndexes } from "./questionSelection";

// ---------- helpers ----------

function parseJson(raw: string | null | undefined): Record<string, any> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, any>;
  } catch {
    return {};
  }
}

type SqlRow = Record<string, any>;

function boolFrom(row: SqlRow, field: string): boolean {
  const v = row[field];
  return v === 1 || v === "1" || v === true;
}

function titleCaseKey(key: string): string {
  return key
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

// ---------- courses ----------

export async function listCourses(): Promise<Course[]> {
  return getCourseRows();
}

async function getCourseRows(): Promise<Course[]> {
  const rows = await all<SqlRow>(
    `SELECT course_id, name, description, subject, curriculum, version_year,
            schema_version, allow_multi_classification, is_sample, created_at, updated_at
     FROM course ORDER BY is_sample DESC, name`
  );
  return rows.map(courseOut);
}

function courseOut(r: SqlRow): Course {
  return {
    course_id: r.course_id,
    name: r.name,
    description: r.description,
    subject: r.subject,
    curriculum: r.curriculum,
    version_year: r.version_year,
    schema_version: r.schema_version,
    allow_multi_classification: boolFrom(r, "allow_multi_classification"),
    is_sample: boolFrom(r, "is_sample"),
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export async function getCourseRow(courseId: string): Promise<Course | null> {
  const rows = await all<SqlRow>(
    `SELECT course_id, name, description, subject, curriculum, version_year,
            schema_version, allow_multi_classification, is_sample, created_at, updated_at
     FROM course WHERE course_id = ?`,
    [courseId]
  );
  return rows.length ? courseOut(rows[0]) : null;
}

async function courseRow(courseId: string): Promise<SqlRow | null> {
  return getFirst<SqlRow>("SELECT * FROM course WHERE course_id = ?", [courseId]);
}

export async function getCourseFullConfig(courseId: string): Promise<CourseFullConfig | null> {
  const course = await courseRow(courseId);
  if (!course) return null;
  const [nodesRaw, typesRaw, tagsRaw, levelsRaw, diffsRaw] = await Promise.all([
    all<SqlRow>("SELECT * FROM course_node WHERE course_id = ?", [courseId]),
    all<SqlRow>(
      "SELECT type_key FROM question_type WHERE course_id = ? OR course_id IS NULL ORDER BY type_key",
      [courseId]
    ),
    all<SqlRow>("SELECT name FROM tag WHERE course_id = ? ORDER BY name", [courseId]),
    all<SqlRow>(
      "SELECT level_index, label, required FROM course_level_def WHERE course_id = ? ORDER BY level_index",
      [courseId]
    ),
    all<SqlRow>(
      "SELECT level, label FROM difficulty_level WHERE course_id = ? ORDER BY level",
      [courseId]
    ),
  ]);
  return {
    course_id: course.course_id,
    name: course.name,
    schema_version: course.schema_version,
    hierarchy: levelsRaw.map((l) => ({
      level_index: l.level_index,
      label: l.label,
      required: boolFrom(l, "required"),
    })),
    allow_multi_classification: boolFrom(course, "allow_multi_classification"),
    difficulty_levels: diffsRaw.map((d) => ({ level: d.level, label: d.label })),
    question_types: typesRaw.map((t) => t.type_key),
    tags: tagsRaw.map((t) => t.name),
    nodes: buildNodeTree(nodesRaw),
  };
}

export function buildNodeTree(raw: Array<SqlRow>): CourseNode[] {
  const byId = new Map<string, SqlRow>();
  for (const n of raw) byId.set(n.node_id, n);
  const children0 = new Map<string, SqlRow[]>();
  for (const n of raw) {
    const key = n.parent_node_id ?? "";
    if (!children0.has(key)) children0.set(key, []);
    children0.get(key)!.push(n);
  }
  for (const list of children0.values()) {
    list.sort((a, b) => a.sort_order - b.sort_order);
  }
  const build = (id: string): CourseNode => {
    const n = byId.get(id)!;
    return {
      node_id: n.node_id,
      course_id: n.course_id,
      parent_node_id: n.parent_node_id,
      level_index: n.level_index,
      name: n.name,
      code: n.code,
      description: n.description,
      sort_order: n.sort_order,
      children: (children0.get(id) ?? []).map((c) => build(c.node_id)),
    };
  };
  return (children0.get("") ?? []).map((c) => build(c.node_id));
}

export async function createCourse(payload: {
  name: string;
  description?: string | null;
  subject?: string | null;
  curriculum?: string | null;
  version_year?: string | null;
  allow_multi_classification?: boolean;
  is_sample?: boolean;
  hierarchy?: LevelDef[];
  difficulty_levels?: DifficultyLevel[];
  question_types?: string[];
}): Promise<CourseFullConfig> {
  const courseId = newId("course");
  const now = nowUtc();
  await run(
    `INSERT INTO course (course_id, name, description, subject, curriculum, version_year,
        schema_version, allow_multi_classification, is_sample, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
    [
      courseId,
      payload.name,
      payload.description ?? null,
      payload.subject ?? null,
      payload.curriculum ?? null,
      payload.version_year ?? null,
      payload.allow_multi_classification ?? true ? 1 : 0,
      payload.is_sample ? 1 : 0,
      now,
      now,
    ]
  );
  await run("INSERT INTO tag (tag_id, course_id, name) VALUES (?, ?, ?)", [newId("tag"), courseId, "action_required"]);
  const hierarchy = payload.hierarchy ?? [];
  for (const level of hierarchy) {
    await run(
      "INSERT INTO course_level_def (course_id, level_index, label, required) VALUES (?, ?, ?, ?)",
      [courseId, level.level_index, level.label, level.required ? 1 : 0]
    );
  }
  const difficultyLevels = payload.difficulty_levels ?? [
    { level: 1, label: "Very Easy" },
    { level: 2, label: "Easy" },
    { level: 3, label: "Difficult" },
    { level: 4, label: "Very Difficult" },
  ];
  for (const d of difficultyLevels) {
    await run(
      "INSERT INTO difficulty_level (course_id, level, label) VALUES (?, ?, ?)",
      [courseId, d.level, d.label]
    );
  }
  const questionTypes =
    payload.question_types ?? ["multiple_choice", "short_answer", "extended_response"];
  const existing = await all<SqlRow>("SELECT type_key FROM question_type");
  const have = new Set(existing.map((r) => r.type_key));
  for (const key of questionTypes) {
    if (!have.has(key)) {
      await run(
        "INSERT INTO question_type (type_key, display_name) VALUES (?, ?)",
        [key, titleCaseKey(key)]
      );
      have.add(key);
    }
  }
  const config = await getCourseFullConfig(courseId);
  if (!config) throw new Error("Course not found");
  return config;
}

export async function deleteCourse(courseId: string): Promise<void> {
  const course = await courseRow(courseId);
  if (!course) throw new Error("Course not found");

  const roots = await all<SqlRow>(
    "SELECT question_id FROM question WHERE course_id = ? AND parent_question_id IS NULL",
    [courseId]
  );
  for (const row of roots) await deleteAssetBlobsFor(String(row.question_id));

  const tests = await all<SqlRow>("SELECT test_id FROM generated_test WHERE course_id = ?", [courseId]);
  for (const row of tests) await deleteTestOutputs(String(row.test_id));

  const sources = await all<SqlRow>(
    "SELECT DISTINCT source_id FROM question WHERE course_id = ? AND source_id IS NOT NULL",
    [courseId]
  );
  await transaction((database) => {
    database.run(
      `DELETE FROM practice_attempt
       WHERE question_id IN (SELECT question_id FROM question WHERE course_id = ?)
          OR session_id IN (SELECT session_id FROM practice_session WHERE course_id = ?)`,
      [courseId, courseId]
    );
    database.run(
      `UPDATE import_question SET final_question_id = NULL
       WHERE final_question_id IN (SELECT question_id FROM question WHERE course_id = ?)`,
      [courseId]
    );
    database.run("DELETE FROM generated_test WHERE course_id = ?", [courseId]);
    database.run("DELETE FROM import_job WHERE course_id = ?", [courseId]);
    database.run("DELETE FROM question WHERE course_id = ?", [courseId]);
    database.run("DELETE FROM practice_session WHERE course_id = ?", [courseId]);
    database.run("UPDATE question_type SET course_id = NULL WHERE course_id = ? AND EXISTS (SELECT 1 FROM question WHERE question.type_key = question_type.type_key)", [courseId]);
    database.run("DELETE FROM question_type WHERE course_id = ?", [courseId]);
    for (const source of sources) {
      database.run(
        "DELETE FROM source WHERE source_id = ? AND NOT EXISTS (SELECT 1 FROM question WHERE question.source_id = source.source_id)",
        [source.source_id]
      );
    }
    database.run("DELETE FROM course WHERE course_id = ?", [courseId]);
  });
  await flush();
}

// ---------- levels ----------

/**
 * Clears one course's practice history: attempts, sessions and the review
 * schedule. The questions themselves stay exactly as they are. Used by the
 * sample course's "start again" action; kept generic so any disposable course
 * can use it.
 */
export async function resetCourseProgress(courseId: string): Promise<void> {
  await transaction((database) => {
    database.run(
      `DELETE FROM practice_attempt
       WHERE question_id IN (SELECT question_id FROM question WHERE course_id = ?)
          OR session_id IN (SELECT session_id FROM practice_session WHERE course_id = ?)`,
      [courseId, courseId]
    );
    database.run(
      `DELETE FROM question_review_state
       WHERE question_id IN (SELECT question_id FROM question WHERE course_id = ?)`,
      [courseId]
    );
    database.run("DELETE FROM practice_session WHERE course_id = ?", [courseId]);
  });
  await flush();
}

export async function addLevel(courseId: string, level: LevelDef): Promise<LevelDef> {
  const existing = await getFirst<SqlRow>(
    "SELECT level_index FROM course_level_def WHERE course_id = ? AND level_index = ?",
    [courseId, level.level_index]
  );
  if (existing) throw new Error(`Level index ${level.level_index} already exists`);
  await run(
    "INSERT INTO course_level_def (course_id, level_index, label, required) VALUES (?, ?, ?, ?)",
    [courseId, level.level_index, level.label, level.required ? 1 : 0]
  );
  return { level_index: level.level_index, label: level.label, required: level.required };
}

export async function updateLevel(
  courseId: string,
  levelIndex: number,
  level: LevelDef
): Promise<LevelDef> {
  const existing = await getFirst<SqlRow>(
    "SELECT level_index FROM course_level_def WHERE course_id = ? AND level_index = ?",
    [courseId, levelIndex]
  );
  if (!existing) throw new Error("Level not found");
  await run(
    "UPDATE course_level_def SET label = ?, required = ? WHERE course_id = ? AND level_index = ?",
    [level.label, level.required ? 1 : 0, courseId, levelIndex]
  );
  return { level_index: levelIndex, label: level.label, required: level.required };
}

export async function deleteLevel(courseId: string, levelIndex: number): Promise<void> {
  const existing = await getFirst<SqlRow>(
    "SELECT level_index FROM course_level_def WHERE course_id = ? AND level_index = ?",
    [courseId, levelIndex]
  );
  if (!existing) throw new Error("Level not found");
  const inUse = await getFirst<SqlRow>(
    "SELECT node_id FROM course_node WHERE course_id = ? AND level_index = ? LIMIT 1",
    [courseId, levelIndex]
  );
  if (inUse) {
    throw new Error(
      "Cannot delete a level that still has categories. Reassign or delete them first."
    );
  }
  await run("DELETE FROM course_level_def WHERE course_id = ? AND level_index = ?", [
    courseId,
    levelIndex,
  ]);
}

// ---------- nodes ----------

export async function createNode(
  courseId: string,
  payload: { level_index: number; parent_node_id?: string | null; name: string; code?: string | null }
): Promise<CourseNode> {
  const nodeId = newId("node");
  const now = nowUtc();
  await run(
    `INSERT INTO course_node (node_id, course_id, parent_node_id, level_index, name, code, description, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, 0, ?, ?)`,
    [
      nodeId,
      courseId,
      payload.parent_node_id ?? null,
      payload.level_index,
      payload.name,
      payload.code ?? null,
      now,
      now,
    ]
  );
  return {
    node_id: nodeId,
    course_id: courseId,
    parent_node_id: payload.parent_node_id ?? null,
    level_index: payload.level_index,
    name: payload.name,
    code: payload.code ?? null,
    description: null,
    sort_order: 0,
    children: [],
  };
}

export async function updateNode(
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
  const existing = await getFirst<SqlRow>(
    "SELECT * FROM course_node WHERE node_id = ? AND course_id = ?",
    [nodeId, courseId]
  );
  if (!existing) throw new Error("Node not found");
  const sets: string[] = [];
  const params: any[] = [];
  const keys: Array<keyof typeof payload> = [
    "name",
    "code",
    "description",
    "sort_order",
    "parent_node_id",
  ];
  for (const k of keys) {
    if (k in payload) {
      sets.push(`${k} = ?`);
      params.push((payload as any)[k] ?? null);
    }
  }
  sets.push("updated_at = ?");
  params.push(nowUtc());
  params.push(nodeId, courseId);
  await run(`UPDATE course_node SET ${sets.join(", ")} WHERE node_id = ? AND course_id = ?`, params);
  return {
    node_id: nodeId,
    course_id: courseId,
    parent_node_id: (payload.parent_node_id ?? null) as string | null,
    level_index: payload.parent_node_id === undefined ? existing.level_index : existing.level_index,
    name: (payload.name ?? existing.name) as string,
    code: (payload.code ?? existing.code) as string | null,
    description: (payload.description ?? existing.description) as string | null,
    sort_order: (payload.sort_order ?? existing.sort_order) as number,
    children: [],
  };
}

export async function deleteNode(courseId: string, nodeId: string): Promise<void> {
  const existing = await getFirst<SqlRow>(
    "SELECT node_id FROM course_node WHERE node_id = ? AND course_id = ?",
    [nodeId, courseId]
  );
  if (!existing) throw new Error("Node not found");
  await run("DELETE FROM course_node WHERE node_id = ?", [nodeId]);
}

// ---------- question filtering ----------

interface FilterOptions {
  courseId: string;
  approvedOnly?: boolean;
  wholeQuestions?: boolean;
  typeKey?: string | string[];
  typeKeys?: string[];
  difficulty?: number | string;
  difficulties?: Array<number | string>;
  difficultyMin?: number | string;
  difficultyMax?: number | string;
  marksMin?: number;
  marksMax?: number;
  nodeIds?: string[];
  tag?: string;
  q?: string;
  institutionYears?: Array<{ institution: string; years: number[] }>;
}

function buildFilters(opts: FilterOptions): { where: string[]; params: any[] } {
  const where: string[] = ["q.course_id = ?"];
  const params: any[] = [opts.courseId];
  if (opts.approvedOnly) {
    where.push("q.review_status = 'approved'");
  }
  if (opts.wholeQuestions) {
    where.push("q.parent_question_id IS NULL");
  }
  if (opts.institutionYears?.length) {
    const clauses: string[] = [];
    for (const selection of opts.institutionYears) {
      if (selection.years.length) {
        clauses.push(`(q.source_id IN (SELECT source_id FROM source WHERE COALESCE(NULLIF(TRIM(institution), ''), TRIM(name)) = ? AND year IN (${selection.years.map(() => "?").join(", ")})))`);
        params.push(selection.institution, ...selection.years);
      } else {
        clauses.push("(q.source_id IN (SELECT source_id FROM source WHERE COALESCE(NULLIF(TRIM(institution), ''), TRIM(name)) = ?))");
        params.push(selection.institution);
      }
    }
    where.push(`(${clauses.join(" OR ")})`);
  }
  if (opts.typeKey !== undefined && opts.typeKey !== null && opts.typeKey !== "") {
    const keys = Array.isArray(opts.typeKey) ? opts.typeKey : [opts.typeKey];
    // An empty array is the UI's "Any question type" selection. Treat it as
    // no type constraint instead of emitting `IN ()`, which matches no rows.
    if (keys.length) {
      where.push(`q.type_key IN (${keys.map(() => "?").join(", ")})`);
      params.push(...keys);
    }
  }
  if (opts.typeKeys && opts.typeKeys.length) {
    where.push(`q.type_key IN (${opts.typeKeys.map(() => "?").join(", ")})`);
    params.push(...opts.typeKeys);
  }
  if (opts.difficulty !== undefined && opts.difficulty !== null && opts.difficulty !== "") {
    where.push("q.difficulty = ?");
    params.push(Number(opts.difficulty));
  }
  if (opts.difficulties && opts.difficulties.length) {
    where.push(`q.difficulty IN (${opts.difficulties.map(() => "?").join(", ")})`);
    params.push(...opts.difficulties.map((d) => Number(d)));
  }
  if (opts.difficultyMin !== undefined && opts.difficultyMin !== null && opts.difficultyMin !== "") {
    where.push("q.difficulty >= ?");
    params.push(Number(opts.difficultyMin));
  }
  if (opts.difficultyMax !== undefined && opts.difficultyMax !== null && opts.difficultyMax !== "") {
    where.push("q.difficulty <= ?");
    params.push(Number(opts.difficultyMax));
  }
  if (opts.marksMin !== undefined && opts.marksMin !== null) {
    where.push("q.marks >= ?");
    params.push(opts.marksMin);
  }
  if (opts.marksMax !== undefined && opts.marksMax !== null) {
    where.push("q.marks <= ?");
    params.push(opts.marksMax);
  }
  if (opts.nodeIds && opts.nodeIds.length) {
    where.push(
      `q.question_id IN (SELECT question_id FROM question_classification WHERE node_id IN (${opts.nodeIds
        .map(() => "?")
        .join(", ")}))`
    );
    params.push(...opts.nodeIds);
  }
  if (opts.tag) {
    where.push(
      `q.question_id IN (
        SELECT qt.question_id FROM question_tag qt JOIN tag tg ON tg.tag_id = qt.tag_id
        WHERE tg.course_id = ? AND tg.name = ?
      )`
    );
    params.push(opts.courseId, opts.tag);
  }
  if (opts.q) {
    where.push(
      `(q.question_id LIKE ?
        OR q.source_id IN (SELECT source_id FROM source WHERE original_question_no LIKE ?)
        OR q.question_id IN (
          SELECT question_id FROM content_block WHERE slot = 'body' AND content_json LIKE ?
        ))`
    );
    const search = `%${opts.q}%`;
    params.push(search, search, search);
  }
  return { where, params };
}

async function snippetMap(questionIds: string[], length: number): Promise<Map<string, string>> {
  if (!questionIds.length) return new Map();
  const rows = await all<SqlRow>(
    `SELECT question_id, slot, position, block_type, content_json FROM content_block
     WHERE question_id IN (${questionIds.map(() => "?").join(", ")}) AND slot = 'body'
     ORDER BY question_id, position`,
    questionIds
  );
  const firstBy = new Map<string, SqlRow>();
  for (const r of rows) {
    if (!firstBy.has(r.question_id)) firstBy.set(r.question_id, r);
  }
  const out = new Map<string, string>();
  for (const [id, row] of firstBy) {
    const content = parseJson(row.content_json);
    const text = typeof content.text === "string"
      ? content.text
      : typeof content.latex === "string" && row.block_type === "equation"
        ? `$${content.latex}$`
        : content.latex;
    if (typeof text === "string" && text.trim()) {
      const s = text.trim();
      let preview = s;
      if (s.length > length) {
        preview = s.slice(0, length);
        const dollarCount = (preview.match(/\$/g) ?? []).length;
        if (dollarCount % 2 === 1) preview = preview.slice(0, preview.lastIndexOf("$"));
        out.set(id, preview + "…");
      } else {
        out.set(id, preview);
      }
    } else {
      out.set(id, "");
    }
  }
  return out;
}

// ---------- question serialization ----------

const BLOCK_SQL =
  "SELECT block_id, slot, position, block_type, content_json FROM content_block WHERE question_id = ? ORDER BY position";

function blockOut(b: SqlRow): Question["body"][number] {
  return {
    block_id: b.block_id,
    slot: b.slot,
    position: b.position,
    block_type: b.block_type,
    content: parseJson(b.content_json),
  };
}

export async function questionToOut(q: SqlRow, includeParts: boolean): Promise<Question> {
  const [blocks, nodeRows, tagRows, assets, source] = await Promise.all([
    all<SqlRow>(BLOCK_SQL, [q.question_id]),
    all<SqlRow>("SELECT node_id FROM question_classification WHERE question_id = ?", [
      q.question_id,
    ]),
    all<SqlRow>(
      `SELECT t.name FROM tag t JOIN question_tag qt ON qt.tag_id = t.tag_id
       WHERE qt.question_id = ? ORDER BY t.name`,
      [q.question_id]
    ),
    all<SqlRow>(
      "SELECT asset_id, file_path, mime_type, width, height, alt_text, caption FROM asset WHERE question_id = ?",
      [q.question_id]
    ),
    q.source_id
      ? getFirst<SqlRow>("SELECT * FROM source WHERE source_id = ?", [q.source_id])
      : Promise.resolve(null),
  ]);
  const mcqRows = await all<SqlRow>(
    "SELECT position, content_json, is_correct FROM mcq_option WHERE question_id = ? ORDER BY position ASC",
    [q.question_id]
  );
  const sourceOut: Source | null =
    source && source.name
      ? {
          name: source.name,
          year: source.year ?? null,
          institution: source.institution ?? null,
          original_question_no: source.original_question_no ?? null,
        }
      : null;
  const slotOf = (slot: string) =>
    blocks.filter((b) => b.slot === slot).map((b) => blockOut(b));
  let parts: Question[] = [];
  if (includeParts) {
    const childRows = await all<SqlRow>(
      "SELECT * FROM question WHERE parent_question_id = ? ORDER BY part_label COLLATE NOCASE ASC, question_id",
      [q.question_id]
    );
    for (const child of childRows) {
      parts.push(await questionToOut(child, false));
    }
  }
  return {
    question_id: q.question_id,
    course_id: q.course_id,
    type_key: q.type_key,
    difficulty: q.difficulty ?? null,
    marks: q.marks ?? null,
    parent_question_id: q.parent_question_id ?? null,
    part_label: q.part_label ?? null,
    notes: q.notes ?? null,
    review_status: q.review_status,
    classification_confidence: q.classification_confidence ?? null,
    node_ids: nodeRows.map((r) => r.node_id),
    tags: tagRows.map((r) => r.name),
    body: slotOf("body"),
    mcq_options: mcqRows.map((row) => ({
      position: Number(row.position),
      content: JSON.parse(String(row.content_json)).map((block: any, i: number) => ({
        block_id: `option-${q.question_id}-${row.position}-${i}`,
        slot: "body" as const,
        position: i,
        block_type: block.block_type,
        content: block.content ?? {},
      })),
      is_correct: Boolean(row.is_correct),
    })),
    hint: slotOf("hint"),
    answer: slotOf("answer"),
    solution: slotOf("solution"),
    marking_criteria: slotOf("marking_criteria"),
    assets: assets.map((a) => ({
      asset_id: a.asset_id,
      file_path: a.file_path,
      mime_type: a.mime_type,
      width: a.width ?? null,
      height: a.height ?? null,
      alt_text: a.alt_text ?? null,
      caption: a.caption ?? null,
    })),
    source: sourceOut,
    parts,
    created_at: q.created_at,
    updated_at: q.updated_at,
  };
}

async function hydrateQuestion(questionId: string): Promise<Question> {
  const q = await getFirst<SqlRow>("SELECT * FROM question WHERE question_id = ?", [questionId]);
  if (!q) throw new Error("Question not found");
  return questionToOut(q, true);
}

async function hydrateQuestions(questionIds: string[]): Promise<Question[]> {
  if (!questionIds.length) return [];
  const queryInBatches = async (ids: string[], sql: (placeholders: string) => string) => {
    const rows: SqlRow[] = [];
    for (let offset = 0; offset < ids.length; offset += 400) {
      const batch = ids.slice(offset, offset + 400);
      rows.push(...await all<SqlRow>(sql(`(${batch.map(() => "?").join(",")})`), batch));
    }
    return rows;
  };
  const roots = await queryInBatches(
    questionIds,
    (inClause) => `SELECT * FROM question WHERE question_id IN ${inClause}`
  );
  const children = await queryInBatches(
    questionIds,
    (inClause) => `SELECT * FROM question WHERE parent_question_id IN ${inClause} ORDER BY parent_question_id, part_label COLLATE NOCASE ASC, question_id`
  );
  const allQuestions = [...roots, ...children];
  const relatedIds = [...new Set(allQuestions.map((q) => String(q.question_id)))];
  const sourceIds = [...new Set(allQuestions.map((q) => q.source_id).filter((id): id is string => !!id))];
  const [blocks, nodes, tags, assets, mcqRows, sources] = await Promise.all([
    queryInBatches(relatedIds, (inClause) => `SELECT * FROM content_block WHERE question_id IN ${inClause} ORDER BY question_id, position`),
    queryInBatches(relatedIds, (inClause) => `SELECT question_id, node_id FROM question_classification WHERE question_id IN ${inClause}`),
    queryInBatches(relatedIds, (inClause) => `SELECT qt.question_id, t.name FROM tag t JOIN question_tag qt ON qt.tag_id = t.tag_id WHERE qt.question_id IN ${inClause} ORDER BY qt.question_id, t.name`),
    queryInBatches(relatedIds, (inClause) => `SELECT * FROM asset WHERE question_id IN ${inClause}`),
    queryInBatches(relatedIds, (inClause) => `SELECT question_id, position, content_json, is_correct FROM mcq_option WHERE question_id IN ${inClause} ORDER BY question_id, position`),
    queryInBatches(sourceIds, (inClause) => `SELECT * FROM source WHERE source_id IN ${inClause}`),
  ]);
  const groupBy = (rows: SqlRow[], field: string) => {
    const grouped = new Map<string, SqlRow[]>();
    for (const row of rows) {
      const key = String(row[field]);
      const group = grouped.get(key) ?? [];
      group.push(row);
      grouped.set(key, group);
    }
    return grouped;
  };
  const blocksByQuestion = groupBy(blocks, "question_id");
  const nodesByQuestion = groupBy(nodes, "question_id");
  const tagsByQuestion = groupBy(tags, "question_id");
  const assetsByQuestion = groupBy(assets, "question_id");
  const mcqByQuestion = groupBy(mcqRows, "question_id");
  const sourcesById = groupBy(sources, "source_id");
  const childrenByParent = groupBy(children, "parent_question_id");
  const toQuestion = (q: SqlRow, includeParts: boolean): Question => {
    const id = String(q.question_id);
    const questionBlocks = blocksByQuestion.get(id) ?? [];
    const slotOf = (slot: string) => questionBlocks.filter((block) => block.slot === slot).map(blockOut);
    const sourceRows = q.source_id ? sourcesById.get(String(q.source_id)) ?? [] : [];
    const source = sourceRows.length
      ? {
          name: sourceRows[0].name,
          year: sourceRows[0].year ?? null,
          institution: sourceRows[0].institution ?? null,
          original_question_no: sourceRows[0].original_question_no ?? null,
        }
      : null;
    return {
      question_id: id,
      course_id: q.course_id,
      type_key: q.type_key,
      difficulty: q.difficulty ?? null,
      marks: q.marks ?? null,
      parent_question_id: q.parent_question_id ?? null,
      part_label: q.part_label ?? null,
      notes: q.notes ?? null,
      review_status: q.review_status,
      classification_confidence: q.classification_confidence ?? null,
      node_ids: (nodesByQuestion.get(id) ?? []).map((row) => row.node_id),
      tags: (tagsByQuestion.get(id) ?? []).map((row) => row.name),
      body: slotOf("body"),
      mcq_options: (mcqByQuestion.get(id) ?? []).map((row) => ({
        position: Number(row.position),
        content: JSON.parse(String(row.content_json)).map((block: any, i: number) => ({
          block_id: `option-${id}-${row.position}-${i}`,
          slot: "body" as const,
          position: i,
          block_type: block.block_type,
          content: block.content ?? {},
        })),
        is_correct: boolFrom(row, "is_correct"),
      })),
      hint: slotOf("hint"),
      answer: slotOf("answer"),
      solution: slotOf("solution"),
      marking_criteria: slotOf("marking_criteria"),
      assets: (assetsByQuestion.get(id) ?? []).map((asset) => ({
        asset_id: asset.asset_id,
        file_path: asset.file_path,
        mime_type: asset.mime_type,
        width: asset.width ?? null,
        height: asset.height ?? null,
        alt_text: asset.alt_text ?? null,
        caption: asset.caption ?? null,
      })),
      source,
      parts: includeParts ? (childrenByParent.get(id) ?? []).map((part) => toQuestion(part, false)) : [],
      created_at: q.created_at,
      updated_at: q.updated_at,
    };
  };
  const questionById = new Map(roots.map((q) => [String(q.question_id), q]));
  return questionIds.map((id) => {
    const q = questionById.get(id);
    if (!q) throw new Error(`Question not found: ${id}`);
    return toQuestion(q, true);
  });
}

export function getQuestion(questionId: string): Promise<Question> {
  return hydrateQuestion(questionId);
}

export async function getCourseQuestions(courseId: string): Promise<Question[]> {
  const f = buildFilters({ courseId, approvedOnly: false, wholeQuestions: true });
  const rows = await all(
    `SELECT q.question_id FROM question q WHERE ${f.where.join(" AND ")} ORDER BY q.created_at ASC`,
    f.params
  );
  const out: Question[] = [];
  for (const r of rows) out.push(await hydrateQuestion(r.question_id));
  return out;
}

function sourceOutFrom(rows: SqlRow[]): Source | null {
  if (!rows.length) return null;
  const s = rows[0];
  return {
    name: s.name,
    year: s.year ?? null,
    institution: s.institution ?? null,
    original_question_no: s.original_question_no ?? null,
  };
}

// ---------- question CRUD ----------

type BlockPayload = { block_type: string; content: Record<string, any> };

export interface QuestionCreatePayload {
  course_id?: string;
  type_key: string;
  difficulty?: number | null;
  marks?: number | null;
  parent_question_id?: string | null;
  part_label?: string | null;
  notes?: string | null;
  node_ids?: string[];
  tag_names?: string[];
  body?: BlockPayload[];
  hint?: BlockPayload[];
  answer?: BlockPayload[];
  solution?: BlockPayload[];
  marking_criteria?: BlockPayload[];
  mcq_options?: Array<{ content: BlockPayload[]; is_correct?: boolean }>;
  parts?: Array<QuestionCreatePayload & { question_id?: string }>;
  source_name?: string;
  source_year?: number;
  source_institution?: string;
  source_original_question_no?: string;
  review_status?: string;
  classification_confidence?: string | null;
}

const SLOTS = ["body", "hint", "answer", "solution", "marking_criteria"] as const;

async function insertBlocks(
  questionId: string,
  slot: string,
  blocks: BlockPayload[] | undefined,
  statements: Array<[string, any[]]>,
  idPrefix = "blk"
): Promise<string[]> {
  const ids: string[] = [];
  (blocks ?? []).forEach((b, i) => {
    const blockId = newId(idPrefix);
    ids.push(blockId);
    statements.push([
      "INSERT INTO content_block (block_id, question_id, slot, position, block_type, content_json) VALUES (?, ?, ?, ?, ?, ?)",
      [blockId, questionId, slot, i, b.block_type, JSON.stringify(b.content ?? {})],
    ]);
  });
  return ids;
}

async function getOrCreateTag(courseId: string, name: string): Promise<string> {
  const row = await getFirst<SqlRow>("SELECT tag_id FROM tag WHERE course_id = ? AND name = ?", [
    courseId,
    name,
  ]);
  if (row) return row.tag_id;
  throw new Error(`Tag '${name}' is not in this course's allowed tag list. Update the list in Course Settings first.`);
}

export async function updateCourseName(courseId: string, name: string): Promise<void> {
  const normalized = name.trim();
  if (!normalized) throw new Error("Course name can't be empty.");
  if (!(await courseRow(courseId))) throw new Error("Course not found.");
  await run("UPDATE course SET name = ?, updated_at = ? WHERE course_id = ?", [normalized, nowUtc(), courseId]);
}

export async function updateCourseTags(courseId: string, names: string[]): Promise<void> {
  const normalized = Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));
  if (!normalized.includes("action_required")) normalized.unshift("action_required");
  const existing = await all<SqlRow>("SELECT name FROM tag WHERE course_id = ?", [courseId]);
  const oldNames = new Set(existing.map((row) => String(row.name)));
  await transaction((database) => {
    for (const name of normalized) {
      if (!oldNames.has(name)) database.run("INSERT INTO tag (tag_id, course_id, name) VALUES (?, ?, ?)", [newId("tag"), courseId, name]);
    }
    for (const name of oldNames) {
      if (!normalized.includes(name)) database.run("DELETE FROM tag WHERE course_id = ? AND name = ?", [courseId, name]);
    }
  });
}

interface SlotBlockSummary {
  slot: string;
  position: number;
  block_type: string;
  content_json: string;
}

async function finalizeAssetsForStatements(
  questionId: string,
  statements: Array<[string, any[]]>
): Promise<void> {
  const summaries: SlotBlockSummary[] = [];
  for (const [sql, params] of statements) {
    if (sql.includes("INSERT INTO content_block")) {
      summaries.push({
        slot: String(params[2]),
        position: Number(params[3]),
        block_type: String(params[4]),
        content_json: String(params[5]),
      });
    } else if (sql.includes("INSERT INTO mcq_option")) {
      let blocks: any[] = [];
      try { blocks = JSON.parse(String(params[3])); } catch { /* Ignore malformed option content. */ }
      for (const block of blocks) summaries.push({
        slot: "body",
        position: Number(params[2]),
        block_type: String(block.block_type ?? ""),
        content_json: JSON.stringify(block.content ?? {}),
      });
    }
  }
  await finalizeQuestionAssets(questionId, summaries);
}

export async function createQuestion(payload: QuestionCreatePayload): Promise<Question> {
  if (!payload.course_id) throw new Error("Course not found");
  const course = await courseRow(payload.course_id);
  if (!course) throw new Error("Course not found");
  const type = await getFirst<SqlRow>(
    "SELECT type_key FROM question_type WHERE type_key = ?",
    [payload.type_key]
  );
  if (!type) throw new Error(`Unknown question type '${payload.type_key}'`);

  let sourceId: string | null = null;
  if (payload.source_name && payload.source_name.trim()) {
    sourceId = newId("src");
    await run(
      `INSERT INTO source (source_id, name, year, institution, original_question_no) VALUES (?, ?, ?, ?, ?)`,
      [
        sourceId,
        payload.source_name.trim(),
        payload.source_year ?? null,
        payload.source_institution ?? null,
        payload.source_original_question_no ?? null,
      ]
    );
  }

  const questionId = newQuestionId();
  const now = nowUtc();
  await run(
    `INSERT INTO question (question_id, course_id, type_key, difficulty, marks, parent_question_id,
        part_label, notes, review_status, classification_confidence, source_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      questionId,
      payload.course_id,
      payload.type_key,
      payload.difficulty ?? null,
      payload.marks ?? null,
      payload.parent_question_id ?? null,
      payload.part_label ?? null,
      payload.notes ?? null,
      payload.review_status ?? "approved",
      payload.classification_confidence ?? null,
      sourceId,
      now,
      now,
    ]
  );

  const statements: Array<[string, any[]]> = [];
  (payload.node_ids ?? []).forEach((nodeId, i) => {
    statements.push([
      "INSERT INTO question_classification (question_id, node_id, is_primary) VALUES (?, ?, ?)",
      [questionId, nodeId, i === 0 ? 1 : 0],
    ]);
  });
  const insertedTagNames = new Set<string>();
  for (const rawTagName of payload.tag_names ?? []) {
    const tagName = rawTagName.trim();
    if (!tagName || insertedTagNames.has(tagName)) continue;
    insertedTagNames.add(tagName);
    const tagId = await getOrCreateTag(payload.course_id!, tagName.trim());
    statements.push([
      "INSERT INTO question_tag (question_id, tag_id) VALUES (?, ?)",
      [questionId, tagId],
    ]);
  }
  const blockIds: string[] = [];
  for (const slot of SLOTS) {
    const ids = await insertBlocks(questionId, slot, (payload as any)[slot], statements);
    blockIds.push(...ids);
  }
  (payload.mcq_options ?? []).forEach((opt, i) => {
    statements.push([
      "INSERT INTO mcq_option (option_id, question_id, position, content_json, is_correct) VALUES (?, ?, ?, ?, ?)",
      [
        newId("opt"),
        questionId,
        i,
        JSON.stringify(opt.content ?? []),
        opt.is_correct ? 1 : 0,
      ],
    ]);
  });
  await runMany(statements);
  await finalizeAssetsForStatements(questionId, statements);
  for (const part of payload.parts ?? []) {
    const { question_id: _questionId, parts: _parts, ...partPayload } = part;
    await createQuestion({ ...partPayload, course_id: payload.course_id, parent_question_id: questionId });
  }
  return hydrateQuestion(questionId);
}

export async function updateQuestion(
  questionId: string,
  payload: Partial<QuestionCreatePayload>
): Promise<Question> {
  const existing = await getFirst<SqlRow>(
    "SELECT * FROM question WHERE question_id = ?",
    [questionId]
  );
  if (!existing) throw new Error("Question not found");

  const sets: string[] = [];
  const params: any[] = [];
  const scalarKeys = ["type_key", "difficulty", "marks", "notes", "review_status"] as const;
  for (const k of scalarKeys) {
    if (k in payload && (payload as any)[k] !== undefined) {
      sets.push(`${k} = ?`);
      params.push((payload as any)[k] ?? null);
    }
  }
  const sourceKeys = ["source_name", "source_year", "source_institution", "source_original_question_no"] as const;
  if (sourceKeys.some((key) => key in payload)) {
    const sourceName = (payload.source_name ?? "").trim();
    if (sourceName) {
      const sourceId = newId("src");
      await run(
        "INSERT INTO source (source_id, name, year, institution, original_question_no) VALUES (?, ?, ?, ?, ?)",
        [sourceId, sourceName, payload.source_year ?? null, payload.source_institution?.trim() || null, payload.source_original_question_no?.trim() || null]
      );
      sets.push("source_id = ?");
      params.push(sourceId);
    } else {
      sets.push("source_id = ?");
      params.push(null);
    }
  }
  sets.push("updated_at = ?");
  params.push(nowUtc());
  params.push(questionId);
  if (sets.length) {
    await run(`UPDATE question SET ${sets.join(", ")} WHERE question_id = ?`, params);
  }

  if (payload.node_ids) {
    await run("DELETE FROM question_classification WHERE question_id = ?", [questionId]);
    const statements: Array<[string, any[]]> = [];
    payload.node_ids.forEach((nodeId, i) => {
      statements.push([
        "INSERT INTO question_classification (question_id, node_id, is_primary) VALUES (?, ?, ?)",
        [questionId, nodeId, i === 0 ? 1 : 0],
      ]);
    });
    for (const [s, p] of statements) await run(s, p);
  }
  if (payload.tag_names) {
    await run("DELETE FROM question_tag WHERE question_id = ?", [questionId]);
    const insertedTagNames = new Set<string>();
    for (const rawTagName of payload.tag_names) {
      const tagName = rawTagName.trim();
      if (!tagName || insertedTagNames.has(tagName)) continue;
      insertedTagNames.add(tagName);
      const tagId = await getOrCreateTag(existing.course_id, tagName);
      await run("INSERT INTO question_tag (question_id, tag_id) VALUES (?, ?)", [
        questionId,
        tagId,
      ]);
    }
  }
  if (payload.mcq_options !== undefined) {
    await run("DELETE FROM mcq_option WHERE question_id = ?", [questionId]);
    const options: Array<[string, any[]]> = [];
    payload.mcq_options.forEach((option, position) => options.push([
      "INSERT INTO mcq_option (option_id, question_id, position, content_json, is_correct) VALUES (?, ?, ?, ?, ?)",
      [newId("opt"), questionId, position, JSON.stringify(option.content ?? []), option.is_correct ? 1 : 0],
    ]));
    if (options.length) {
      await runMany(options);
      await finalizeAssetsForStatements(questionId, options);
    }
  }
  const statements: Array<[string, any[]]> = [];
  for (const slot of SLOTS) {
    const value = (payload as any)[slot];
    if (value !== undefined && value !== null) {
      await run("DELETE FROM content_block WHERE question_id = ? AND slot = ?", [
        questionId,
        slot,
      ]);
      await insertBlocks(questionId, slot, value, statements);
    }
  }
  if (statements.length) {
    await runMany(statements);
    await finalizeAssetsForStatements(questionId, statements);
  }
  if (payload.parts !== undefined) {
    const existingParts = await all<SqlRow>("SELECT question_id FROM question WHERE parent_question_id = ?", [questionId]);
    const retainedIds = new Set(payload.parts.map((part) => part.question_id).filter((id): id is string => !!id));
    for (const part of payload.parts) {
      const { question_id: partId, parts: _parts, ...partPayload } = part;
      if (partId && existingParts.some((row) => row.question_id === partId)) {
        await updateQuestion(partId, partPayload);
      } else {
        await createQuestion({ ...partPayload, course_id: existing.course_id, parent_question_id: questionId });
      }
    }
    for (const row of existingParts) {
      if (!retainedIds.has(String(row.question_id))) await deleteQuestion(String(row.question_id));
    }
  }
  return hydrateQuestion(questionId);
}

async function deleteAssetBlobsFor(questionId: string): Promise<void> {
  const ids = await all<SqlRow>("SELECT asset_id FROM asset WHERE question_id = ?", [
    questionId,
  ]);
  for (const row of ids) await deleteAssetBlob(row.asset_id);
  const children = await all<SqlRow>(
    "SELECT question_id FROM question WHERE parent_question_id = ?",
    [questionId]
  );
  for (const child of children) await deleteAssetBlobsFor(child.question_id);
}

export async function deleteQuestion(questionId: string): Promise<void> {
  const existing = await getFirst<SqlRow>(
    "SELECT question_id FROM question WHERE question_id = ?",
    [questionId]
  );
  if (!existing) throw new Error("Question not found");
  await run("DELETE FROM practice_attempt WHERE question_id = ?", [questionId]);
  await run("UPDATE import_question SET final_question_id = NULL WHERE final_question_id = ?", [
    questionId,
  ]);
  await deleteAssetBlobsFor(questionId);
  await run("DELETE FROM question WHERE question_id = ?", [questionId]);
}

/** Remove question content and its related data while preserving all course structure. */
export async function clearQuestions(): Promise<void> {
  // Clear references that do not cascade before deleting question trees.
  await run("DELETE FROM practice_attempt");
  await run("UPDATE import_question SET final_question_id = NULL");

  const tests = await all<SqlRow>("SELECT test_id FROM generated_test");
  for (const row of tests) await deleteTestOutputs(row.test_id);
  await run("DELETE FROM generated_test");
  await run("DELETE FROM import_question");
  await run("DELETE FROM import_job");
  await run("DELETE FROM practice_session");

  const roots = await all<SqlRow>(
    "SELECT question_id FROM question WHERE parent_question_id IS NULL"
  );
  for (const row of roots) await deleteAssetBlobsFor(String(row.question_id));
  await run("DELETE FROM question");
  await run("DELETE FROM source");
  // Settings reloads immediately after this resolves. Persist synchronously so
  // the reload cannot restore the pre-clear database from IndexedDB.
  await flush();
}

// ---------- listing / counts / random ----------

const SORT_SQL: Record<string, string> = {
  created_desc: "q.created_at DESC",
  created_asc: "q.created_at ASC",
  difficulty_asc: "q.difficulty ASC",
  difficulty_desc: "q.difficulty DESC",
  random: "RANDOM()",
};

export async function listQuestions(
  courseId: string,
  filters: {
    node_id?: string | string[];
    type?: string | string[];
    difficulty?: string | number | Array<string | number>;
    tag?: string;
    q?: string;
    sort?: string;
    page?: number;
    page_size?: number;
    source_filters?: Array<{ institution: string; years: number[] }>;
  } = {}
): Promise<QuestionListResponse> {
  const difficulty = filters.difficulty;
  const f = buildFilters({
    courseId,
    approvedOnly: true,
    wholeQuestions: true,
    typeKey: filters.type,
    difficulties: Array.isArray(difficulty) ? difficulty : undefined,
    difficulty: Array.isArray(difficulty) ? undefined : (difficulty as string | number | undefined),
    nodeIds: filters.node_id ? (Array.isArray(filters.node_id) ? filters.node_id : [filters.node_id]) : undefined,
    tag: filters.tag,
    q: filters.q,
    institutionYears: filters.source_filters,
  });
  const whereSql = f.where.join(" AND ");
  const totalRow = await getFirst<SqlRow>(
    `SELECT COUNT(*) AS c FROM question q WHERE ${whereSql}`,
    f.params
  );
  const total = totalRow ? Number(totalRow.c) : 0;
  const page = filters.page ?? 1;
  const pageSize = filters.page_size ?? 25;
  const sortSql = SORT_SQL[filters.sort ?? ""] ?? SORT_SQL.created_desc;
  const rows = await all<SqlRow>(
    `SELECT q.question_id, q.type_key, q.difficulty, q.marks,
            s.name, s.year, s.institution, s.original_question_no
     FROM question q LEFT JOIN source s ON s.source_id = q.source_id
     WHERE ${whereSql}
     ORDER BY ${sortSql}
     LIMIT ? OFFSET ?`,
    [...f.params, pageSize, (page - 1) * pageSize]
  );
  const snippets = await snippetMap(rows.map((r) => r.question_id), 160);
  const items: QuestionListItem[] = rows.map((r) => ({
    question_id: r.question_id,
    type_key: r.type_key,
    difficulty: r.difficulty ?? null,
    marks: r.marks ?? null,
    snippet: snippets.get(r.question_id) ?? "",
    source: sourceOutFrom([r]),
  }));
  return { total, page, page_size: pageSize, items };
}

export async function questionSourceOptions(courseId: string): Promise<{ institutions: Array<{ name: string; years: number[] }> }> {
  const rows = await all<SqlRow>(
    `SELECT s.year, COALESCE(NULLIF(TRIM(s.institution), ''), TRIM(s.name)) AS institution
     FROM source s JOIN question q ON q.source_id = s.source_id
     WHERE q.course_id = ? AND q.review_status = 'approved' AND q.parent_question_id IS NULL
     GROUP BY COALESCE(NULLIF(TRIM(s.institution), ''), TRIM(s.name)), s.year
     ORDER BY institution, COALESCE(s.year, 0) DESC`,
    [courseId]
  );
  const byInstitution = new Map<string, Set<number>>();
  for (const row of rows) {
    if (row.institution == null) continue;
    const years = byInstitution.get(String(row.institution)) ?? new Set<number>();
    if (row.year != null) years.add(Number(row.year));
    byInstitution.set(String(row.institution), years);
  }
  return { institutions: [...byInstitution].sort(([a], [b]) => a.localeCompare(b)).map(([name, years]) => ({ name, years: [...years].sort((a, b) => b - a) })) };
}

export async function questionSourceCounts(
  courseId: string,
  opts: { type?: string[]; difficulties?: number[]; node_ids?: string[]; tag?: string } = {}
): Promise<Record<string, { total: number; years: Record<string, number> }>> {
  const filters = buildFilters({
    courseId, approvedOnly: true, wholeQuestions: true,
    typeKey: opts.type, difficulties: opts.difficulties, nodeIds: opts.node_ids, tag: opts.tag,
  });
  const rows = await all<SqlRow>(
    `SELECT COALESCE(NULLIF(TRIM(s.institution), ''), TRIM(s.name)) AS institution,
            s.year, COUNT(*) AS count
     FROM question q JOIN source s ON s.source_id = q.source_id
     WHERE ${filters.where.join(" AND ")}
     GROUP BY institution, s.year ORDER BY institution, s.year`,
    filters.params
  );
  const counts: Record<string, { total: number; years: Record<string, number> }> = {};
  for (const row of rows) {
    if (row.institution == null) continue;
    const name = String(row.institution);
    const count = Number(row.count);
    const item = counts[name] ??= { total: 0, years: {} };
    item.total += count;
    if (row.year != null) item.years[String(row.year)] = count;
  }
  return counts;
}

export async function renameInstitution(courseId: string, currentName: string, nextName: string): Promise<number> {
  const trimmed = nextName.trim();
  if (!trimmed) throw new Error("Institution name cannot be empty.");
  const matchingSources = await all<SqlRow>(
    `SELECT DISTINCT s.source_id, s.name, s.year, s.institution, s.original_question_no,
       EXISTS(SELECT 1 FROM question other_q WHERE other_q.source_id = s.source_id AND other_q.course_id <> ?) AS shared
     FROM source s JOIN question q ON q.source_id = s.source_id
     WHERE q.course_id = ? AND COALESCE(NULLIF(TRIM(s.institution), ''), TRIM(s.name)) = ?`,
    [courseId, courseId, currentName]
  );
  if (!matchingSources.length) return 0;
  await transaction((database) => {
    for (const source of matchingSources) {
      const sourceId = String(source.source_id);
      if (boolFrom(source, "shared")) {
        const courseSourceId = newId("src");
        database.run(
          "INSERT INTO source (source_id, name, year, institution, original_question_no) VALUES (?, ?, ?, ?, ?)",
          [courseSourceId, source.name, source.year ?? null, trimmed, source.original_question_no ?? null]
        );
        database.run("UPDATE question SET source_id = ? WHERE source_id = ? AND course_id = ?", [courseSourceId, sourceId, courseId]);
      } else {
        database.run("UPDATE source SET institution = ? WHERE source_id = ?", [trimmed, sourceId]);
      }
    }
  });
  return matchingSources.length;
}

export async function questionCounts(
  courseId: string,
  opts: {
    type?: string | string[];
    difficulty?: string | number;
    difficulties?: Array<string | number>;
    node_ids?: string[];
  } = {}
): Promise<QuestionCountsResponse> {
  const f = buildFilters({
    courseId,
    approvedOnly: true,
    wholeQuestions: true,
    typeKey: opts.type,
    difficulty: opts.difficulty,
    difficulties: opts.difficulties,
    nodeIds: opts.node_ids,
  });
  const whereSql = f.where.join(" AND ");
  const totalRow = await getFirst<SqlRow>(
    `SELECT COUNT(*) AS c FROM question q WHERE ${whereSql}`,
    f.params
  );
  const total = totalRow ? Number(totalRow.c) : 0;

  const nodesRaw = await all<SqlRow>(
    "SELECT * FROM course_node WHERE course_id = ? ORDER BY sort_order",
    [courseId]
  );
  const nodeRows = await all<SqlRow>(
    `SELECT node_id, question_id FROM question_classification
     WHERE question_id IN (SELECT question_id FROM question q WHERE ${whereSql})
     `,
    f.params
  );
  const questionIdsByNode = new Map<string, Set<string>>();
  for (const r of nodeRows) {
    const ids = questionIdsByNode.get(r.node_id) ?? new Set<string>();
    ids.add(String(r.question_id));
    questionIdsByNode.set(r.node_id, ids);
  }
  const byId = new Map(nodesRaw.map((n) => [n.node_id, n]));
  const rollup = (id: string): { node: NodeCount; questionIds: Set<string> } => {
    const n = byId.get(id)!;
    const questionIds = new Set(questionIdsByNode.get(id) ?? []);
    const childResults = nodesRaw
      .filter((c) => c.parent_node_id === id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((c) => rollup(c.node_id));
    for (const child of childResults) {
      child.questionIds.forEach((questionId) => questionIds.add(questionId));
    }
    return {
      node: {
        node_id: n.node_id,
        name: n.name,
        level_index: n.level_index,
        count: questionIds.size,
        children: childResults.map((child) => child.node),
      },
      questionIds,
    };
  };
  const byNode = nodesRaw
    .filter((n) => n.parent_node_id === null)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((n) => rollup(n.node_id).node);

  const byTypeRows = await all<SqlRow>(
    `SELECT type_key, COUNT(*) AS c FROM question q WHERE ${whereSql} GROUP BY type_key`,
    f.params
  );
  const byType: Record<string, number> = {};
  for (const r of byTypeRows) byType[r.type_key] = Number(r.c);

  const byDiffRows = await all<SqlRow>(
    `SELECT difficulty, COUNT(*) AS c FROM question q WHERE ${whereSql} GROUP BY difficulty`,
    f.params
  );
  const byDifficulty: Record<string, number> = {};
  for (const r of byDiffRows) byDifficulty[String(r.difficulty)] = Number(r.c);

  return { total, by_node: byNode, by_type: byType, by_difficulty: byDifficulty };
}

export async function randomQuestion(params: {
  course_id: string;
  node_id?: string | string[];
  type?: string | string[];
  difficulty?: string | number | Array<string | number>;
  tag?: string;
  exclude_question_ids?: Array<string | number>;
  exclude_recent_days?: number;
  source_filters?: Array<{ institution: string; years: number[] }>;
}): Promise<RandomQuestionResponse> {
  const difficulty = params.difficulty;
  const f = buildFilters({
    courseId: params.course_id,
    approvedOnly: true,
    wholeQuestions: true,
    typeKey: params.type,
    difficulties: Array.isArray(difficulty) ? difficulty : undefined,
    difficulty: Array.isArray(difficulty) ? undefined : (difficulty as string | number | undefined),
    nodeIds: params.node_id
      ? Array.isArray(params.node_id)
        ? params.node_id
        : [params.node_id]
      : undefined,
    tag: params.tag,
    institutionYears: params.source_filters,
  });
  const where2 = [...f.where];
  const params2 = [...f.params];
  const excludes = (params.exclude_question_ids ?? []).map((x) => String(x));
  if (excludes.length) {
    where2.push(`q.question_id NOT IN (${excludes.map(() => "?").join(", ")})`);
    params2.push(...excludes);
  }
  if (params.exclude_recent_days) {
    where2.push(
      `q.question_id NOT IN (
        SELECT question_id FROM practice_attempt
        WHERE created_at >= datetime('now', ?)
      )`
    );
    params2.push(`-${params.exclude_recent_days} days`);
  }
  const cond = where2.join(" AND ");
  const countRow = await getFirst<SqlRow>(
    `SELECT COUNT(*) AS c FROM question q WHERE ${cond}`,
    params2
  );
  const matchingCount = countRow ? Number(countRow.c) : 0;
  if (!matchingCount) return { matching_count: 0, question: null };
  const offset = Math.floor(Math.random() * matchingCount);
  const row = await getFirst<SqlRow>(
    `SELECT q.question_id FROM question q WHERE ${cond} ORDER BY q.question_id LIMIT 1 OFFSET ?`,
    [...params2, offset]
  );
  if (!row) return { matching_count: 0, question: null };
  const question = await hydrateQuestion(row.question_id);
  return { matching_count: matchingCount, question };
}

// ---------- practice ----------

// ---------- study settings ----------

const SETTING_REVIEW_POLICY = "review_policy";
const SETTING_QUEUE_PAUSE = "review_queue_paused_until";
const SETTING_RESPONSE_CAPTURE = "save_response_text";
const SETTING_TIMER = "practice_timer";

export async function getSetting(key: string): Promise<string | null> {
  const row = await getFirst<SqlRow>("SELECT value FROM app_setting WHERE setting_key = ?", [key]);
  return row && row.value != null ? String(row.value) : null;
}

export async function setSetting(key: string, value: string | null): Promise<void> {
  if (value == null) {
    await run("DELETE FROM app_setting WHERE setting_key = ?", [key]);
    return;
  }
  await run(
    "INSERT OR REPLACE INTO app_setting (setting_key, value, updated_at) VALUES (?, ?, datetime('now'))",
    [key, value]
  );
}

export async function getReviewPolicy(): Promise<ReviewPolicy> {
  const raw = await getSetting(SETTING_REVIEW_POLICY);
  if (!raw) return normalizePolicy(null);
  try {
    return normalizePolicy(JSON.parse(raw));
  } catch {
    return normalizePolicy(null);
  }
}

export async function setReviewPolicy(policy: ReviewPolicy): Promise<void> {
  await setSetting(SETTING_REVIEW_POLICY, JSON.stringify(normalizePolicy(policy)));
}

export async function getQueuePause(): Promise<{ paused_until: string | null; paused: boolean }> {
  const until = await getSetting(SETTING_QUEUE_PAUSE);
  if (!until) return { paused_until: null, paused: false };
  return { paused_until: until, paused: until > nowUtc() };
}

export async function setQueuePause(pausedUntil: string | null): Promise<void> {
  await setSetting(SETTING_QUEUE_PAUSE, pausedUntil);
}

/** Whether free-response text is kept on the device. Defaults to keeping it. */
export async function getResponseCapture(): Promise<ResponseCapture> {
  return (await getSetting(SETTING_RESPONSE_CAPTURE)) === "off" ? "off" : "on";
}

export async function setResponseCapture(value: ResponseCapture): Promise<void> {
  await setSetting(SETTING_RESPONSE_CAPTURE, value);
}

/** The timer is opt-in: elapsed time is not treated as evidence of mastery. */
export async function getTimerEnabled(): Promise<boolean> {
  return (await getSetting(SETTING_TIMER)) === "on";
}

export async function setTimerEnabled(enabled: boolean): Promise<void> {
  await setSetting(SETTING_TIMER, enabled ? "on" : "off");
}

// ---------- review schedule ----------

const REVIEW_COLUMNS = `question_id, next_due_at, interval_days, last_reviewed_at, review_count,
                       lapse_count, ladder_step, last_rating, last_outcome, updated_at`;

function reviewStateFromRow(r: SqlRow): ReviewStateRow {
  return {
    question_id: String(r.question_id),
    next_due_at: r.next_due_at == null ? null : String(r.next_due_at),
    interval_days: Number(r.interval_days ?? 0),
    last_reviewed_at: r.last_reviewed_at == null ? null : String(r.last_reviewed_at),
    review_count: Number(r.review_count ?? 0),
    lapse_count: Number(r.lapse_count ?? 0),
    ladder_step: Number(r.ladder_step ?? 0),
    last_rating: isSelfRating(r.last_rating) ? r.last_rating : null,
    last_outcome: r.last_outcome == null ? null : (String(r.last_outcome) as ReviewOutcome),
    updated_at: r.updated_at == null ? "" : String(r.updated_at),
  };
}

export async function getReviewState(questionId: string): Promise<ReviewStateRow> {
  const row = await getFirst<SqlRow>(
    `SELECT ${REVIEW_COLUMNS} FROM question_review_state WHERE question_id = ?`,
    [questionId]
  );
  return row ? reviewStateFromRow(row) : emptyReviewState(questionId, nowUtc());
}

const REVIEW_UPSERT = `INSERT INTO question_review_state (${REVIEW_COLUMNS})
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
    updated_at = excluded.updated_at`;

function reviewStateParams(state: ReviewStateRow): any[] {
  return [
    state.question_id,
    state.next_due_at,
    state.interval_days,
    state.last_reviewed_at,
    state.review_count,
    state.lapse_count,
    state.ladder_step,
    state.last_rating,
    state.last_outcome,
    state.updated_at,
  ];
}

/** Put a question on the queue as of now, without pretending it was reviewed. */
export async function enqueueForReview(questionId: string, at?: string): Promise<ReviewStateRow> {
  const state = newlyDueReviewState(questionId, at ?? nowUtc());
  await run(REVIEW_UPSERT, reviewStateParams(state));
  return state;
}

// ---------- attempt lifecycle ----------

const ATTEMPT_COLUMNS = `attempt_id, session_id, question_id, status, correct, time_spent_sec,
                         user_notes, created_at, response_text, confidence, self_rating,
                         hints_revealed, scored_by, score_earned, score_possible`;

export async function recordAttempt(payload: AttemptInput): Promise<{ attempt_id: string; created_at: string }> {
  const exists = await getFirst<SqlRow>("SELECT question_id FROM question WHERE question_id = ?", [
    payload.question_id,
  ]);
  if (!exists) throw new Error("Question not found");
  const capture = await getResponseCapture();
  const attemptId = newId("att");
  const createdAt = nowUtc();
  // `correct` is only written when the app itself decided the answer. A mark the
  // student typed is stored as a score with its provenance attached, so nothing
  // downstream can mistake it for an app-verified result.
  const objective = payload.scored_by === "objective" && payload.correct != null;
  await run(
    `INSERT INTO practice_attempt (${ATTEMPT_COLUMNS})
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      attemptId,
      payload.session_id ?? null,
      payload.question_id,
      payload.status,
      objective ? (payload.correct ? 1 : 0) : null,
      payload.time_spent_sec ?? null,
      payload.user_notes ?? null,
      createdAt,
      capture === "on" ? payload.response_text ?? null : null,
      payload.confidence ?? null,
      payload.self_rating ?? null,
      payload.hints_revealed ?? 0,
      payload.scored_by ?? null,
      payload.score_earned ?? null,
      payload.score_possible ?? null,
    ]
  );
  return { attempt_id: attemptId, created_at: createdAt };
}

export interface ReviewSubmission {
  session_id?: string | null;
  question_id: string;
  rating: SelfRating;
  /** Set only when something objective decided the outcome, such as a marked MCQ. */
  objective_correct?: boolean | null;
  response_text?: string | null;
  confidence?: Confidence | null;
  hints_revealed?: number | null;
  time_spent_sec?: number | null;
  user_notes?: string | null;
  score_earned?: number | null;
  score_possible?: number | null;
}

/**
 * Finish one review: the attempt, the self-rating and the new due date are
 * written together, so a rating can never be saved without moving the question
 * and a question can never move without the student's rating being recorded.
 */
export async function recordReview(
  input: ReviewSubmission
): Promise<{ attempt_id: string; review: ReviewStateRow }> {
  const exists = await getFirst<SqlRow>("SELECT question_id FROM question WHERE question_id = ?", [
    input.question_id,
  ]);
  if (!exists) throw new Error("Question not found");
  const policy = await getReviewPolicy();
  const at = nowUtc();
  const previous = await getReviewState(input.question_id);
  const review = nextReviewState(previous, {
    rating: input.rating,
    objectiveCorrect: input.objective_correct ?? null,
    at,
    policy,
  });
  const capture = await getResponseCapture();
  const attemptId = newId("att");
  const objective = input.objective_correct != null;

  await transaction((database) => {
    database.run(
      `INSERT INTO practice_attempt (${ATTEMPT_COLUMNS})
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        attemptId,
        input.session_id ?? null,
        input.question_id,
        "reviewed",
        objective ? (input.objective_correct ? 1 : 0) : null,
        input.time_spent_sec ?? null,
        input.user_notes ?? null,
        at,
        capture === "on" ? input.response_text ?? null : null,
        input.confidence ?? null,
        input.rating,
        input.hints_revealed ?? 0,
        objective ? "objective" : null,
        input.score_earned ?? null,
        input.score_possible ?? null,
      ]
    );
    database.run(REVIEW_UPSERT, reviewStateParams(review));
    if (input.session_id) {
      database.run(
        `UPDATE practice_session
         SET completed_count = (SELECT COUNT(DISTINCT question_id) FROM practice_attempt
                                WHERE session_id = ? AND status = 'reviewed'),
             status = CASE WHEN completed_count + 1 >= planned_count THEN 'completed' ELSE status END,
             updated_at = ?
         WHERE session_id = ?`,
        [input.session_id, at, input.session_id]
      );
    }
  });
  return { attempt_id: attemptId, review };
}

/** Attempts for one question, newest first, for the "inspect your answers" view. */
export async function questionAttempts(questionId: string, limit = 20): Promise<AttemptSummary[]> {
  const rows = await all<SqlRow>(
    `SELECT ${ATTEMPT_COLUMNS} FROM practice_attempt WHERE question_id = ? ORDER BY created_at DESC LIMIT ?`,
    [questionId, limit]
  );
  return rows.map((r) => ({
    attempt_id: String(r.attempt_id),
    session_id: r.session_id ?? null,
    question_id: String(r.question_id),
    status: String(r.status) as AttemptStatus,
    correct: r.correct == null ? null : boolFrom(r, "correct"),
    scored_by: (r.scored_by ?? null) as ScoredBy | null,
    score_earned: r.score_earned == null ? null : Number(r.score_earned),
    score_possible: r.score_possible == null ? null : Number(r.score_possible),
    time_spent_sec: r.time_spent_sec == null ? null : Number(r.time_spent_sec),
    user_notes: r.user_notes ?? null,
    response_text: r.response_text ?? null,
    confidence: (r.confidence ?? null) as Confidence | null,
    self_rating: (r.self_rating ?? null) as SelfRating | null,
    hints_revealed: Number(r.hints_revealed ?? 0),
    created_at: String(r.created_at),
  }));
}

export async function recentQuestions(
  courseId: string,
  limit: number = 10
): Promise<Array<{ question_id: string; course_id: string; snippet: string; type_key: string; status: string; scored_by: string | null; seen_at: string }>> {
  const rows = await all<SqlRow>(
    `SELECT a.question_id, q.type_key, q.course_id, MAX(a.created_at) AS last_seen,
            (SELECT a2.status FROM practice_attempt a2
             WHERE a2.question_id = a.question_id ORDER BY a2.created_at DESC LIMIT 1) AS latest_status,
            (SELECT a3.scored_by FROM practice_attempt a3
             WHERE a3.question_id = a.question_id ORDER BY a3.created_at DESC LIMIT 1) AS latest_scored_by
     FROM practice_attempt a JOIN question q ON q.question_id = a.question_id
     WHERE q.course_id = ?
     GROUP BY a.question_id
     ORDER BY last_seen DESC
     LIMIT ?`,
    [courseId, limit]
  );
  const snippets = await snippetMap(rows.map((r) => r.question_id), 90);
  return rows.map((r) => ({
    question_id: r.question_id,
    course_id: r.course_id,
    snippet: snippets.get(r.question_id) ?? "",
    type_key: r.type_key,
    status: r.latest_status ?? "seen",
    scored_by: r.latest_scored_by ?? null,
    seen_at: r.last_seen,
  }));
}

// ---------- practice pool, sessions and queues ----------

interface PoolWhere {
  where: string[];
  params: any[];
}

/**
 * Turn the filters the student picked into SQL. Kept in one place so the counts,
 * the pool and the session plan can never disagree about what "matching" means.
 */
function practiceWhere(filters: PracticeFilters, dueAt: string | null): PoolWhere {
  const f = buildFilters({
    courseId: filters.course_id,
    approvedOnly: true,
    wholeQuestions: true,
    typeKey: filters.type_key ?? undefined,
    difficultyMin: filters.difficulty_min ?? undefined,
    difficultyMax: filters.difficulty_max ?? undefined,
    nodeIds: filters.node_ids?.length ? filters.node_ids : undefined,
    tag: filters.tag ?? undefined,
    institutionYears: filters.source_filters,
  });
  const where = [...f.where];
  const params = [...f.params];
  if (dueAt) {
    where.push(
      `q.question_id IN (SELECT question_id FROM question_review_state
                         WHERE next_due_at IS NOT NULL AND next_due_at <= ?)`
    );
    params.push(dueAt);
  }
  return { where, params };
}

const PRIMARY_NODE_SQL = `(SELECT qc.node_id FROM question_classification qc
                          WHERE qc.question_id = q.question_id
                          ORDER BY qc.is_primary DESC, qc.node_id LIMIT 1)`;

async function poolRows(filters: PracticeFilters, dueAt: string | null): Promise<Array<{ question_id: string; topic_id: string | null }>> {
  const { where, params } = practiceWhere(filters, dueAt);
  const rows = await all<SqlRow>(
    `SELECT q.question_id, ${PRIMARY_NODE_SQL} AS primary_node
     FROM question q WHERE ${where.join(" AND ")} ORDER BY q.question_id`,
    params
  );
  return rows.map((r) => ({ question_id: String(r.question_id), topic_id: r.primary_node ?? null }));
}

export interface PoolCountOptions {
  /** Questions already taken in this session, so the student is not shown the same one twice. */
  excludeIds?: string[];
  /** Questions attempted in the last N days, for "avoid recently attempted". */
  avoidRecentDays?: number | null;
  /** Restrict to questions the schedule says are due. */
  dueAt?: string | null;
}

/**
 * Three deliberately separate numbers, because collapsing them is what makes
 * "nothing matches" confusing: what the filters match, what is still available
 * in this session, and what is merely on a cooldown.
 */
export async function practicePoolCounts(
  filters: PracticeFilters,
  options: PoolCountOptions = {}
): Promise<PracticePoolCounts> {
  const { where, params } = practiceWhere(filters, options.dueAt ?? null);
  const baseWhere = where.join(" AND ");
  const countOf = async (extra: { sql: string; params: any[] }): Promise<number> => {
    const clause = extra.sql ? `${baseWhere} AND ${extra.sql}` : baseWhere;
    const row = await getFirst<SqlRow>(
      `SELECT COUNT(*) AS total FROM question q WHERE ${clause}`,
      [...params, ...extra.params]
    );
    return Number(row?.total ?? 0);
  };

  const filterMatch = await countOf({ sql: "", params: [] });
  const exclude = (options.excludeIds ?? []).map(String);
  const eligible = await countOf({
    sql: exclude.length ? `q.question_id NOT IN (${exclude.map(() => "?").join(", ")})` : "",
    params: exclude,
  });
  const recentDays = Number(options.avoidRecentDays ?? 0);
  const recentClause =
    recentDays > 0
      ? {
          sql: `q.question_id NOT IN (SELECT question_id FROM practice_attempt WHERE created_at >= datetime('now', ?))`,
          params: [`-${recentDays} days`],
        }
      : { sql: "", params: [] as any[] };
  const withRecent = await countOf(recentClause);

  return {
    filter_match_count: filterMatch,
    eligible_count: eligible,
    excluded_seen_count: Math.max(0, filterMatch - eligible),
    recently_excluded_count: Math.max(0, filterMatch - withRecent),
  };
}

export interface StartSessionInput {
  course_id: string;
  mode: SessionMode;
  filters: PracticeFilters;
  /** Cap the plan, or leave null to take the whole pool. */
  size?: number | null;
}

function planTopicByQuestion(items: SessionPlanItem[]): Map<string, string | null> {
  return new Map(items.map((i) => [i.question_id, i.topic_id ?? null]));
}

/**
 * A session is a stored list of questions, not a pile of filters. Persisting the
 * plan is what lets the app say "you have practised all 12 of these", explain why
 * a question is being shown, and keep an unfinished session across a reload.
 */
export async function startPracticeSession(input: StartSessionInput): Promise<PracticeSessionSummary> {
  const course = await courseRow(input.course_id);
  if (!course) throw new Error("Course not found");
  const at = nowUtc();
  const filters: PracticeFilters = { ...input.filters, course_id: input.course_id };
  const dueAt = input.mode === "due_review" ? at : null;

  let pool: PoolItem[] = (await poolRows(filters, dueAt)).map((r) => ({
    question_id: r.question_id,
    topic_id: r.topic_id,
  }));

  if (input.mode === "due_review") {
    const states = await reviewStatesForIds(pool.map((p) => p.question_id));
    const topics = planTopicByQuestion(pool as SessionPlanItem[]);
    pool = rankDueQuestions(states, at, 10000).map((state) => {
      const reason = dueReason(state, at, { includeRatedDifficult: true });
      return {
        question_id: state.question_id,
        topic_id: topics.get(state.question_id) ?? null,
        reason_kind: reason.kind,
        reason_text: reason.text,
      };
    });
  }

  // A due session is a batch, not a backlog: the queue stays visible and the
  // student is told how much is left, instead of being handed all 300 at once.
  const size = input.size ?? suggestedSessionSize(input.mode, pool.length) ?? null;
  const plan = buildSessionPlan(pool, { mode: input.mode, size });
  const sessionId = newId("sess");
  await run(
    `INSERT INTO practice_session (session_id, course_id, filter_json, mode, created_at,
                                   config_json, plan_json, status, planned_count, completed_count, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, 0, ?)`,
    [
      sessionId,
      input.course_id,
      JSON.stringify(filters),
      input.mode,
      at,
      JSON.stringify({ mode: input.mode, size, started_at: at, dominant_topic_share: plan.dominant_topic_share }),
      JSON.stringify({ items: plan.items, topic_coverage: plan.topic_coverage }),
      plan.question_ids.length,
      at,
    ]
  );

  const poolCounts = await practicePoolCounts(filters, {
    avoidRecentDays: filters.avoid_recent_days,
  });
  return {
    session_id: sessionId,
    course_id: input.course_id,
    mode: input.mode,
    status: "active",
    filters,
    created_at: at,
    updated_at: at,
    planned_count: plan.question_ids.length,
    completed_count: 0,
    remaining_count: plan.question_ids.length,
    next_question_id: plan.question_ids[0] ?? null,
    plan: plan.items,
    topic_coverage: plan.topic_coverage,
    dominant_topic_share: plan.dominant_topic_share,
    pool: poolCounts,
  };
}
export async function reviewStatesForIds(questionIds: string[]): Promise<ReviewState[]> {
  if (!questionIds.length) return [];
  const rows = await all<SqlRow>(
    `SELECT ${REVIEW_COLUMNS} FROM question_review_state
     WHERE question_id IN (${questionIds.map(() => "?").join(", ")})`,
    questionIds
  );
  return rows.map(reviewStateFromRow);
}

function sessionSummaryFromRow(
  row: SqlRow,
  plan: { items?: SessionPlanItem[]; topic_coverage?: SessionTopicCoverage[] },
  remaining: string[],
  pool: PracticePoolCounts
): PracticeSessionSummary {
  const items = plan.items ?? [];
  const config = parseJson(row.config_json);
  return {
    session_id: String(row.session_id),
    course_id: String(row.course_id),
    mode: String(row.mode ?? "focused") as SessionMode,
    status: (String(row.status ?? "active") as PracticeSessionSummary["status"]),
    filters: parseJson(row.filter_json) as unknown as PracticeFilters,
    created_at: String(row.created_at),
    updated_at: row.updated_at == null ? null : String(row.updated_at),
    planned_count: Number(row.planned_count ?? items.length),
    completed_count: Number(row.completed_count ?? 0),
    remaining_count: remaining.length,
    next_question_id: remaining[0] ?? null,
    plan: items,
    topic_coverage: plan.topic_coverage ?? [],
    dominant_topic_share: typeof config.dominant_topic_share === "number" ? config.dominant_topic_share : 0,
    pool,
  };
}

async function offeredQuestionIds(sessionId: string): Promise<Set<string>> {
  const rows = await all<SqlRow>(
    "SELECT DISTINCT question_id FROM practice_attempt WHERE session_id = ?",
    [sessionId]
  );
  return new Set(rows.map((r) => String(r.question_id)));
}

export async function getPracticeSession(sessionId: string): Promise<PracticeSessionSummary | null> {
  const row = await getFirst<SqlRow>("SELECT * FROM practice_session WHERE session_id = ?", [sessionId]);
  if (!row) return null;
  const plan = parseJson(row.plan_json);
  const items: SessionPlanItem[] = Array.isArray(plan.items) ? plan.items : [];
  const offered = await offeredQuestionIds(sessionId);
  const remaining = items.filter((i) => !offered.has(i.question_id)).map((i) => i.question_id);
  const filters = parseJson(row.filter_json) as unknown as PracticeFilters;
  const pool = await practicePoolCounts(filters, {
    excludeIds: [...offered],
    avoidRecentDays: filters?.avoid_recent_days,
  });
  return sessionSummaryFromRow(row, { items, topic_coverage: plan.topic_coverage }, remaining, pool);
}

export async function getActiveSession(
  courseId: string,
  mode?: SessionMode
): Promise<PracticeSessionSummary | null> {
  const row = await getFirst<SqlRow>(
    `SELECT session_id FROM practice_session
     WHERE course_id = ? AND status = 'active' ${mode ? "AND mode = ?" : ""}
     ORDER BY created_at DESC LIMIT 1`,
    mode ? [courseId, mode] : [courseId]
  );
  if (!row) return null;
  return getPracticeSession(String(row.session_id));
}

export async function setSessionStatus(sessionId: string, status: "active" | "completed" | "abandoned"): Promise<void> {
  await run("UPDATE practice_session SET status = ?, updated_at = ? WHERE session_id = ?", [
    status,
    nowUtc(),
    sessionId,
  ]);
}

/**
 * Clear the questions this session already offered, keeping the plan and every
 * review the student has actually completed.
 */
export async function resetPracticeSession(sessionId: string): Promise<PracticeSessionSummary | null> {
  await run("DELETE FROM practice_attempt WHERE session_id = ? AND status = 'seen'", [sessionId]);
  await run(
    "UPDATE practice_session SET status = 'active', completed_count = 0, updated_at = ? WHERE session_id = ?",
    [nowUtc(), sessionId]
  );
  return getPracticeSession(sessionId);
}

/** Drop a session without touching the attempts or the review schedule behind it. */
export async function discardPracticeSession(sessionId: string): Promise<void> {
  await run("DELETE FROM practice_session WHERE session_id = ?", [sessionId]);
}

// ---------- question activity ----------

export interface QuestionActivity {
  question_id: string;
  type_key: string;
  events: number;
  attempted: number;
  reviewed: number;
  difficult: number;
  lapses: number;
  objective_reviews: number;
  self_reviews: number;
  last_event_at: string | null;
  state: ReviewState;
  node_ids: string[];
  primary_node: string | null;
}

const ATTEMPT_AGGREGATE_SQL = `SELECT a.question_id AS question_id,
    COUNT(*) AS events,
    MAX(CASE WHEN a.status IN ('attempted', 'revealed', 'reviewed') THEN 1 ELSE 0 END) AS attempted,
    MAX(CASE WHEN a.status = 'reviewed' THEN 1 ELSE 0 END) AS reviewed,
    SUM(CASE WHEN a.status = 'reviewed' AND a.self_rating IN ('again', 'hard') THEN 1 ELSE 0 END) AS difficult,
    SUM(CASE WHEN a.status = 'reviewed' AND (a.self_rating = 'again' OR (a.scored_by = 'objective' AND a.correct = 0)) THEN 1 ELSE 0 END) AS lapses,
    SUM(CASE WHEN a.status = 'reviewed' AND a.scored_by = 'objective' THEN 1 ELSE 0 END) AS objective_reviews,
    SUM(CASE WHEN a.status = 'reviewed' AND a.scored_by IS NOT NULL AND a.scored_by <> 'objective' THEN 1 ELSE 0 END) AS self_reviews,
    MAX(a.created_at) AS last_event_at
  FROM practice_attempt a GROUP BY a.question_id`;

/** One row per approved, whole question: attempts on the left, schedule on the right. */
export async function loadQuestionActivity(courseId: string): Promise<QuestionActivity[]> {
  const rows = await all<SqlRow>(
    `SELECT q.question_id, q.type_key,
       COALESCE(p.events, 0) AS events,
       COALESCE(p.attempted, 0) AS attempted,
       COALESCE(p.reviewed, 0) AS reviewed,
       COALESCE(p.difficult, 0) AS difficult,
       COALESCE(p.lapses, 0) AS lapses,
       COALESCE(p.objective_reviews, 0) AS objective_reviews,
       COALESCE(p.self_reviews, 0) AS self_reviews,
       p.last_event_at,
       ${PRIMARY_NODE_SQL} AS primary_node,
       rs.question_id AS state_present, rs.next_due_at, rs.interval_days, rs.last_reviewed_at,
       rs.review_count, rs.lapse_count, rs.ladder_step, rs.last_rating, rs.last_outcome, rs.updated_at
     FROM question q
     LEFT JOIN (${ATTEMPT_AGGREGATE_SQL}) p ON p.question_id = q.question_id
     LEFT JOIN question_review_state rs ON rs.question_id = q.question_id
     WHERE q.course_id = ? AND q.review_status = 'approved' AND q.parent_question_id IS NULL
     ORDER BY q.question_id`,
    [courseId]
  );
  const classificationRows = await all<SqlRow>(
    "SELECT question_id, node_id FROM question_classification WHERE question_id IN (SELECT question_id FROM question WHERE course_id = ?)",
    [courseId]
  );
  const nodesByQuestion = new Map<string, string[]>();
  for (const c of classificationRows) {
    const list = nodesByQuestion.get(c.question_id) ?? [];
    list.push(String(c.node_id));
    nodesByQuestion.set(c.question_id, list);
  }
  return rows.map((r) => ({
    question_id: String(r.question_id),
    type_key: String(r.type_key ?? ""),
    events: Number(r.events ?? 0),
    attempted: Number(r.attempted ?? 0),
    reviewed: Number(r.reviewed ?? 0),
    difficult: Number(r.difficult ?? 0),
    lapses: Number(r.lapses ?? 0),
    objective_reviews: Number(r.objective_reviews ?? 0),
    self_reviews: Number(r.self_reviews ?? 0),
    last_event_at: r.last_event_at ?? null,
    state: r.state_present == null ? emptyReviewState(String(r.question_id), nowUtc()) : reviewStateFromRow(r),
    node_ids: nodesByQuestion.get(String(r.question_id)) ?? [],
    primary_node: r.primary_node ?? null,
  }));
}

const MINUTES_PER_REVIEW = 1.5;

export async function dueQueue(courseId: string, limit = 10): Promise<DueQueue> {
  const at = nowUtc();
  const activity = await loadQuestionActivity(courseId);
  const scheduled = activity.filter((a) => a.state.next_due_at != null).map((a) => a.state);
  const ranked = rankDueQuestions(scheduled, at, 10000);
  const byId = new Map(activity.map((a) => [a.question_id, a]));
  const items: DueQueueItem[] = ranked.slice(0, Math.max(1, limit)).map((state) => {
    const row = byId.get(state.question_id);
    const reason = dueReason(state, at, { includeRatedDifficult: true });
    return {
      question_id: state.question_id,
      snippet: "",
      type_key: row?.type_key ?? "",
      next_due_at: state.next_due_at,
      reason_kind: reason.kind,
      reason_text: reason.text,
      interval_days: state.interval_days,
      review_count: state.review_count,
      lapse_count: state.lapse_count,
      last_rating: state.last_rating,
      last_outcome: state.last_outcome,
    };
  });
  if (items.length) {
    const snippets = await snippetMap(items.map((i) => i.question_id), 90);
    for (const item of items) item.snippet = snippets.get(item.question_id) ?? "";
  }
  const pause = await getQueuePause();
  return {
    due_count: ranked.length,
    items,
    paused_until: pause.paused_until,
    paused: pause.paused,
    estimated_minutes: Math.max(1, Math.round(items.length * MINUTES_PER_REVIEW)),
  };
}

export async function studyProgress(courseId: string): Promise<StudyProgress> {
  const at = nowUtc();
  const activity = await loadQuestionActivity(courseId);
  const nodes = buildNodeTree(
    await all<SqlRow>("SELECT * FROM course_node WHERE course_id = ? ORDER BY sort_order, name", [courseId])
  );
  const snippets = await snippetMap(
    activity.filter((a) => a.difficult >= 2 || a.lapses >= 2).map((a) => a.question_id),
    90
  );

  const direct = new Map<string, NodeActivity>();
  const bump = (nodeId: string, a: QuestionActivity): void => {
    const current = direct.get(nodeId) ?? EMPTY_ACTIVITY;
    const due = a.state.next_due_at != null && a.state.next_due_at <= at;
    direct.set(nodeId, {
      questions: current.questions + 1,
      seen: current.seen + (a.events > 0 ? 1 : 0),
      attempted: current.attempted + (a.attempted > 0 ? 1 : 0),
      reviewed: current.reviewed + (a.reviewed > 0 ? 1 : 0),
      due_now: current.due_now + (due ? 1 : 0),
      review_events: current.review_events + a.reviewed,
      lapses: current.lapses + a.lapses,
      difficult_ratings: current.difficult_ratings + a.difficult,
      objective_reviews: current.objective_reviews + a.objective_reviews,
      self_reviews: current.self_reviews + a.self_reviews,
      last_reviewed_at: laterTimestamp(current.last_reviewed_at, a.state.last_reviewed_at ?? a.last_event_at),
    });
  };
  for (const a of activity) {
    for (const nodeId of a.node_ids.length ? a.node_ids : a.primary_node ? [a.primary_node] : []) {
      bump(nodeId, a);
    }
  }

  const topics: TopicProgress[] = rollupTopicActivity(nodes, direct, at).map((t) => ({
    node_id: t.node_id,
    name: t.name,
    level_index: t.level_index,
    questions: t.questions,
    subtree_questions: t.subtree_questions,
    subtree_reviewed: t.subtree_reviewed,
    subtree_due_now: t.subtree_due_now,
    seen: t.seen,
    attempted: t.attempted,
    reviewed: t.reviewed,
    due_now: t.due_now,
    review_events: t.review_events,
    lapses: t.lapses,
    difficult_ratings: t.difficult_ratings,
    objective_reviews: t.objective_reviews,
    self_reviews: t.self_reviews,
    last_reviewed_at: t.last_reviewed_at,
    days_since_review: t.days_since_review,
    evidence: t.evidence,
    standing: t.standing,
    evidence_note: t.evidence_note,
  }));

  const dueNow = activity.filter((a) => a.state.next_due_at != null && a.state.next_due_at <= at).length;
  const weekAgo = daysBefore(at, 7);
  const reviewed = activity.filter((a) => a.reviewed > 0).length;
  const objectiveReviews = activity.reduce((n, a) => n + a.objective_reviews, 0);
  const selfReviews = activity.reduce((n, a) => n + a.self_reviews, 0);
  const pause = await getQueuePause();

  return {
    course_id: courseId,
    generated_at: at,
    total_questions: activity.length,
    ever_seen: activity.filter((a) => a.events > 0).length,
    attempted: activity.filter((a) => a.attempted > 0).length,
    reviewed,
    due_now: dueNow,
    queue_paused_until: pause.paused ? pause.paused_until : null,
    reviewed_last_7_days: activity.filter(
      (a) => a.reviewed > 0 && (a.state.last_reviewed_at ?? a.last_event_at ?? "") >= weekAgo
    ).length,
    objective_reviews: objectiveReviews,
    self_reviews: selfReviews,
    marking_mix_note: describeMarkingMix(objectiveReviews, selfReviews),
    topics,
    repeated_difficulty: activity
      .filter((a) => a.difficult >= 2 || a.lapses >= 2)
      .sort((a, b) => b.difficult + b.lapses - (a.difficult + a.lapses))
      .slice(0, 8)
      .map((a) => ({
        question_id: a.question_id,
        snippet: snippets.get(a.question_id) ?? "",
        type_key: a.type_key,
        hard_or_again: a.difficult,
        lapses: a.lapses,
        last_rating: a.state.last_rating,
        last_reviewed_at: a.state.last_reviewed_at,
      })),
    next_action: pickNextAction({
      totalQuestions: activity.length,
      dueNow,
      topics,
      queuePaused: pause.paused,
    }),
  };
}

function daysBefore(at: string, days: number): string {
  const epoch = parseSqlUtc(at);
  return epoch == null ? at : formatSqlUtc(epoch - days * 86400000);
}

function laterTimestamp(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

// ---------- instructions / skill ----------

export async function getInstructions(courseId: string): Promise<{ course_id: string; instructions_markdown: string }> {
  const config = await getCourseFullConfig(courseId);
  if (!config) throw new Error("Course not found");
  return { course_id: courseId, instructions_markdown: buildInstructionsMarkdown(config) };
}

export function buildInstructionsMarkdown(config: CourseFullConfig): string {
  const lines: string[] = [];
  lines.push(`# COURSE: ${config.name}`);
  lines.push(`schema_version: ${config.schema_version}`);
  lines.push("");
  lines.push("## STRUCTURE");
  for (const level of config.hierarchy) {
    lines.push(`Level ${level.level_index + 1}: ${level.label}${level.required ? "" : " (optional)"}`);
  }
  lines.push("");
  lines.push("## VALID NODES");
  const walk = (nodes: CourseNode[], depth: number): string[] => {
    const out: string[] = [];
    for (const n of nodes) {
      out.push(`${"  ".repeat(depth)}${n.code ? `${n.code} — ` : ""}${n.name}`);
      out.push(...walk(n.children, depth + 1));
    }
    return out;
  };
  lines.push(...walk(config.nodes, 0));
  lines.push("");
  lines.push("## QUESTION TYPES");
  lines.push(config.question_types.join(", "));
  lines.push("");
  lines.push("## VALID TAGS");
  lines.push(...config.tags.map((tag) => `- ${tag}`));
  lines.push("Use only these exact tags. Never invent tags; only the user can edit this list.");
  lines.push("");
  lines.push("## DIFFICULTY");
  lines.push(config.difficulty_levels.map((d) => `"${d.level} = ${d.label}"`).join(", "));
  lines.push("");
  lines.push("## CLASSIFICATION RULES");
  lines.push(
    config.allow_multi_classification
      ? "- A question MAY be classified under more than one node."
      : "- A question MUST be classified under exactly one node."
  );
  lines.push("- A question may span more than one node only when the answer genuinely uses both.");
  lines.push("- Never mark a classification as low or medium confidence if you are sure of it.");
  lines.push(
    "- If you are unsure but the question is otherwise complete, still import it but set classification_confidence to low."
  );
  lines.push("");
  lines.push("## OUTPUT FORMAT");
  lines.push("The output must be JSON matching schema_version 1 and the import format.");
  lines.push("Multi-part questions: the parent carries the shared stem and `parts` each carry one marked subsection.");
  return lines.join("\n");
}

// ---------- import ----------

export async function importJson(courseId: string, data: any): Promise<ImportResponse> {
  const course = await courseRow(courseId);
  if (!course) throw new Error("Course not found");
  const jobWarnings: string[] = [];
  if (data && data.course_id !== null && data.course_id !== undefined && String(data.course_id) !== String(courseId)) {
    const fileCourseName = data.course_name ? String(data.course_name).trim() : "";
    const nameMatches = fileCourseName !== "" && fileCourseName.toLowerCase() === course.name.trim().toLowerCase();
    if (nameMatches) {
      jobWarnings.push(
        `This file was generated for course id '${data.course_id}', but you're importing into '${course.name}' (id '${courseId}'). ` +
          `Course and node ids are regenerated when a course is re-imported, so the file was matched by course name and node codes instead.`
      );
    } else if (fileCourseName) {
      throw new Error(
        `This file is for course '${fileCourseName}' (id '${data.course_id}'), not '${course.name}' (id '${courseId}').`
      );
    } else {
      throw new Error(
        `This file was generated for course id '${data.course_id}', not '${courseId}'. If you re-imported this course and its ids were regenerated, add "course_name" to the file (see the course skill) so it can be matched by name.`
      );
    }
  }
  const config = await getCourseFullConfig(courseId);
  if (!config) throw new Error("Course not found");
  const validTypeKeys = new Set(config.question_types);
  const validTags = new Set(config.tags);
  const validDifficulties = config.difficulty_levels.map((d) => d.level);
  const validNodeIds = new Set<string>();
  const codeToNodeId = new Map<string, string>();
  const pathToNodeId = new Map<string, string>();
  const nameToNodeIds = new Map<string, string[]>();
  const collect = (nodes: CourseNode[], parentPath: string) => {
    for (const n of nodes) {
      validNodeIds.add(n.node_id);
      if (n.code) codeToNodeId.set(String(n.code), n.node_id);
      const fullPath = parentPath ? `${parentPath} / ${n.name}` : n.name;
      pathToNodeId.set(fullPath, n.node_id);
      const list = nameToNodeIds.get(n.name) ?? [];
      list.push(n.node_id);
      nameToNodeIds.set(n.name, list);
      collect(n.children, fullPath);
    }
  };
  collect(config.nodes, "");

  const jobId = newId("imp");
  const now = nowUtc();
  await run(
    "INSERT INTO import_job (import_job_id, course_id, source_filename, status, created_at) VALUES (?, ?, ?, 'processing', ?)",
    [jobId, courseId, data?.source_filename ?? null, now]
  );

  const questions: any[] = data?.questions ?? [];
  const results: ImportResponse["results"] = [];
  let importedCount = 0;
  let errorCount = 0;

  const hasValue = (value: any): boolean => {
    if (typeof value === "string") return value.trim().length > 0;
    if (typeof value === "number") return Number.isFinite(value) && value > 0;
    if (Array.isArray(value)) return value.some(hasValue);
    if (value && typeof value === "object") return Object.values(value).some(hasValue);
    return false;
  };
  const hasContent = (blocks: any): boolean =>
    Array.isArray(blocks) && blocks.some((block) => hasValue(block?.content));

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!validTypeKeys.has(q.type_key)) {
      errors.push(
        `Unknown question type '${q.type_key}'. Valid types: ${[...validTypeKeys].sort().join(", ")}`
      );
    }
    const invalidTags = [...new Set((q.tags ?? []).map(String).filter((tag: string) => !validTags.has(tag)))];
    if (invalidTags.length) {
      errors.push(`Tags not allowed for this course: ${invalidTags.join(", ")}. Valid tags: ${[...validTags].sort().join(", ")}`);
    }
    if (validDifficulties.length && !validDifficulties.includes(q.difficulty)) {
      errors.push(
        `Invalid difficulty level ${q.difficulty}. Valid: ${[...validDifficulties].sort().join(", ")}`
      );
    }
    const byCode = Array.isArray(q.node_codes) && q.node_codes.length > 0;
    const byName = Array.isArray(q.node_names) && q.node_names.length > 0;
    let nodeRefs: string[] = [];
    if (byCode) nodeRefs = q.node_codes.map(String);
    else if (byName) nodeRefs = q.node_names.map(String);
    else nodeRefs = (q.node_ids ?? []).map(String);
    const resolvedNodes: Array<{ node_id: string; ref: string; remapped: boolean }> = [];
    const unknownNodes: string[] = [];
    const seenNodes = new Set<string>();
    for (const ref of nodeRefs) {
      let target: string | null = null;
      let remapped = false;
      if (validNodeIds.has(ref)) {
        target = ref;
      } else if (codeToNodeId.has(ref)) {
        target = codeToNodeId.get(ref)!;
        remapped = true;
      } else if (pathToNodeId.has(ref)) {
        target = pathToNodeId.get(ref)!;
        remapped = true;
      } else {
        const cands = nameToNodeIds.get(ref);
        if (cands && cands.length === 1) {
          target = cands[0];
          remapped = true;
        } else if (cands && cands.length > 1) {
          unknownNodes.push(`${ref} (matches ${cands.length} nodes — use a full path)`);
          continue;
        }
      }
      if (!target) {
        unknownNodes.push(ref);
      } else if (!seenNodes.has(target)) {
        seenNodes.add(target);
        resolvedNodes.push({ node_id: target, ref, remapped });
      }
    }
    if (unknownNodes.length) {
      errors.push(
        `Unknown node${unknownNodes.length > 1 ? "s" : ""}: ${unknownNodes.join(", ")}. Every node must be a valid node_id, node code, node name or full node path from the course's import-schema.json.`
      );
    }
    const remapped = resolvedNodes.filter((n) => n.remapped);
    if (remapped.length) {
      warnings.push(
        `Classified ${
          remapped.length > 1 ? "using stable references" : "by stable reference"
        } (${remapped.map((n) => n.ref).join(", ")}) — node ids were regenerated when this course was re-imported.`
      );
    }
    const hasBody = Array.isArray(q.body) && q.body.length > 0;
    if (!hasBody) errors.push("Question has no body content blocks");
    const parts: any[] = Array.isArray(q.parts) ? q.parts : [];
    if (parts.length > 0) {
      const missingAnswers: string[] = [];
      const missingGuides: string[] = [];
      parts.forEach((part, partIndex) => {
        const label = part.part_label ? `part ${part.part_label}` : `part ${partIndex + 1}`;
        if (!hasContent(part.answer) && !hasContent(part.solution)) missingAnswers.push(label);
        if (!hasContent(part.marking_criteria)) missingGuides.push(label);
      });
      if (missingAnswers.length) {
        warnings.push(`No answer or solution provided for ${missingAnswers.join(", ")}`);
      }
      if (missingGuides.length) {
        warnings.push(`No marking guide (marking_criteria) provided for ${missingGuides.join(", ")}`);
      }
    } else {
      const hasMc = hasContent(q.marking_criteria);
      const hasAnswer = hasContent(q.answer);
      const hasSolution = hasContent(q.solution);
      if (!hasMc && !hasAnswer && !hasSolution) {
        warnings.push("No marking guide, answer, or solution provided for this question");
      } else if (!hasMc) {
        warnings.push("No marking guide (marking_criteria) provided — only answer/solution");
      }
    }
    const confidence = q.classification_confidence ?? "medium";
    await run(
      `INSERT INTO import_question (import_question_id, import_job_id, proposed_json, confidence, resolution, final_question_id)
       VALUES (?, ?, ?, ?, ?, NULL)`,
      [newId("iq"), jobId, JSON.stringify(q), confidence, errors.length ? "rejected" : "approved"]
    );
    if (errors.length) {
      errorCount++;
      results.push({ index: i, status: "error", errors, warnings });
      continue;
    }
    let sourceId: string | null = null;
    if (q.source && q.source.name) {
      sourceId = newId("src");
      await run(
        "INSERT INTO source (source_id, name, year, institution, original_question_no) VALUES (?, ?, ?, ?, ?)",
        [sourceId, q.source.name, q.source.year ?? null, q.source.institution ?? null, q.source.original_question_no ?? null]
      );
    }
    const parentId = newQuestionId();
    await run(
      `INSERT INTO question (question_id, course_id, type_key, difficulty, marks, review_status, classification_confidence, source_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'approved', ?, ?, ?, ?)`,
      [parentId, courseId, q.type_key, q.difficulty ?? null, q.marks ?? null, confidence, sourceId, now, now]
    );
    const statements: Array<[string, any[]]> = [];
    resolvedNodes.forEach((n, idx) => {
      statements.push([
        "INSERT INTO question_classification (question_id, node_id, is_primary) VALUES (?, ?, ?)",
        [parentId, n.node_id, idx === 0 ? 1 : 0],
      ]);
    });
    for (const tagName of q.tags ?? []) {
      const tagId = await getOrCreateTag(courseId, tagName);
      statements.push(["INSERT INTO question_tag (question_id, tag_id) VALUES (?, ?)", [parentId, tagId]]);
    }
    for (const slot of SLOTS) {
      if (Array.isArray(q[slot])) {
        await insertBlocks(parentId, slot, q[slot], statements);
      }
    }
    (q.mcq_options ?? []).forEach((option: any, position: number) => {
      statements.push([
        "INSERT INTO mcq_option (option_id, question_id, position, content_json, is_correct) VALUES (?, ?, ?, ?, ?)",
        [newId("opt"), parentId, position, JSON.stringify(option.content ?? []), option.is_correct ? 1 : 0],
      ]);
    });
    await runMany(statements);
    await finalizeAssetsForStatements(parentId, statements);
    const importPart = async (part: any, partParentId: string, inheritedType: string): Promise<void> => {
      const partId = newQuestionId();
      await run(
        `INSERT INTO question (question_id, course_id, type_key, marks, parent_question_id, part_label, review_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'approved', ?, ?)`,
        [partId, courseId, part.type_key ?? inheritedType, part.marks ?? null, partParentId, part.part_label ?? null, now, now]
      );
      const partStatements: Array<[string, any[]]> = [];
      for (const slot of SLOTS) {
        if (Array.isArray(part[slot])) {
          await insertBlocks(partId, slot, part[slot], partStatements);
        }
      }
      await runMany(partStatements);
      await finalizeAssetsForStatements(partId, partStatements);
      for (const child of Array.isArray(part.parts) ? part.parts : []) {
        await importPart(child, partId, part.type_key ?? inheritedType);
      }
    };
    for (const part of parts) await importPart(part, parentId, q.type_key);
    importedCount++;
    results.push({ index: i, status: "imported", question_id: parentId, errors, warnings });
  }

  await run("UPDATE import_job SET status = ? WHERE import_job_id = ?", [
    importedCount ? "imported" : "failed",
    jobId,
  ]);
  return { import_job_id: jobId, imported_count: importedCount, error_count: errorCount, results, warnings: jobWarnings };
}

// ---------- test generation ----------

export interface GenerateTestPayload {
  title?: string;
  node_ids?: string[];
  type_key?: string;
  difficulty_min?: number;
  difficulty_max?: number;
  target_marks?: number;
  format?: "docx" | "pdf";
  shuffle?: boolean;
  sections?: TestSectionInput[];
  selectionTimeoutMs?: number;
  onProgress?: (progress: { phase: "selecting" | "hydrating" | "paper" | "preview" | "saving"; questionCount?: number; completedQuestions?: number }) => void;
}

async function matchingQuestionIds(
  courseId: string,
  opts: {
    type_key?: string;
    type_keys?: string[];
    difficulties?: Array<number | string>;
    difficulty_min?: number;
    difficulty_max?: number;
    marks_min?: number;
    marks_max?: number;
    node_ids?: string[];
    institutionYears?: Array<{ institution: string; years: number[] }>;
    limit?: number;
  }
): Promise<SqlRow[]> {
  const f = buildFilters({
    courseId,
    approvedOnly: true,
    wholeQuestions: true,
    typeKey: opts.type_key,
    typeKeys: opts.type_keys,
    difficulties: opts.difficulties,
    difficultyMin: opts.difficulty_min,
    difficultyMax: opts.difficulty_max,
    marksMin: opts.marks_min,
    marksMax: opts.marks_max,
    nodeIds: opts.node_ids,
    institutionYears: opts.institutionYears,
  });
  const limitSql = opts.limit ? "LIMIT ?" : "";
  const params = opts.limit ? [...f.params, opts.limit] : f.params;
  return all<SqlRow>(
    `SELECT q.question_id FROM question q WHERE ${f.where.join(
      " AND "
    )} ORDER BY q.created_at ASC ${limitSql}`,
    params
  );
}

async function matchingQuestionMarks(
  courseId: string,
  opts: Parameters<typeof matchingQuestionIds>[1]
): Promise<SqlRow[]> {
  const f = buildFilters({
    courseId, approvedOnly: true, wholeQuestions: true,
    typeKey: opts.type_key, typeKeys: opts.type_keys,
    difficulties: opts.difficulties, difficultyMin: opts.difficulty_min,
    difficultyMax: opts.difficulty_max, marksMin: opts.marks_min,
    marksMax: opts.marks_max, nodeIds: opts.node_ids,
    institutionYears: opts.institutionYears,
  });
  return all<SqlRow>(
    `SELECT q.question_id, q.marks FROM question q WHERE ${f.where.join(" AND ")} AND q.marks IS NOT NULL`,
    f.params
  );
}

export async function estimateTestSections(
  courseId: string,
  sections: TestSectionInput[]
): Promise<Array<{ question_count: number; available_marks: number }>> {
  return Promise.all(sections.map(async (sec) => {
    const opts = {
      type_keys: sec.type_keys,
      difficulties: sec.difficulties,
      node_ids: sec.node_ids,
      institutionYears: sec.source_filters,
    };
    const f = buildFilters({
      courseId, approvedOnly: true, wholeQuestions: true,
      typeKeys: opts.type_keys, difficulties: opts.difficulties, nodeIds: opts.node_ids, institutionYears: opts.institutionYears,
    });
    const row = await getFirst<SqlRow>(
      `SELECT COUNT(*) AS question_count, COALESCE(SUM(q.marks), 0) AS available_marks FROM question q WHERE ${f.where.join(" AND ")} AND q.marks IS NOT NULL`,
      f.params
    );
    return {
      question_count: Number(row?.question_count ?? 0),
      available_marks: round2(Number(row?.available_marks ?? 0)),
    };
  }));
}

function shuffleList<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function recordGenerationTiming(name: string, start: number): void {
  const endMark = `${name}:end`;
  performance.mark(endMark);
  performance.measure(name, { start, end: endMark });
}

async function selectForMarks(
  courseId: string,
  target: number,
  opts: Parameters<typeof matchingQuestionIds>[1],
  selectionDeadline = Infinity,
  onHydrating?: () => void,
  cachedCandidates?: Promise<SqlRow[]>,
  timingPrefix?: string
): Promise<{ questions: Question[]; selectionLimited: boolean }> {
  const queryStart = performance.now();
  if (timingPrefix) performance.mark(`${timingPrefix}:candidate-query:start`);
  const rows = [...await (cachedCandidates ?? matchingQuestionMarks(courseId, opts))];
  if (timingPrefix) recordGenerationTiming(`${timingPrefix}:candidate-query`, queryStart);
  // Shuffle only question IDs and marks in memory; full question data is loaded after selection.
  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }
  const selectionStart = performance.now();
  if (timingPrefix) performance.mark(`${timingPrefix}:selection:start`);
  const { indexes, selectionLimited } = selectQuestionIndexes(
    rows.map((row) => Number(row.marks)),
    Math.max(1, Math.round(target * 100)),
    { deadline: selectionDeadline }
  );
  const pickedRows = indexes.map((index) => rows[index]);
  if (timingPrefix) recordGenerationTiming(`${timingPrefix}:selection`, selectionStart);
  onHydrating?.();
  const hydrateStart = performance.now();
  if (timingPrefix) performance.mark(`${timingPrefix}:hydration:start`);
  const questions = await hydrateQuestions(pickedRows.map((row) => String(row.question_id)));
  if (timingPrefix) recordGenerationTiming(`${timingPrefix}:hydration`, hydrateStart);
  return {
    questions,
    selectionLimited,
  };
}

async function sectionQuestions(
  courseId: string,
  index: number,
  sec: TestSectionInput,
  config: CourseFullConfig,
  selectionDeadline: number,
  onHydrating: () => void,
  candidateCache: Map<string, Promise<SqlRow[]>>,
  timingPrefix: string
): Promise<{ questions: Question[]; marks: number; selectionLimited: boolean }> {
  const hasMarks = sec.marks !== undefined && sec.marks !== null;
  if (!hasMarks) throw new Error(`Section ${index}: set a marks target.`);
  const opts = {
    type_key: undefined,
    type_keys: sec.type_keys,
    difficulties: sec.difficulties,
    node_ids: sec.node_ids,
    institutionYears: sec.source_filters,
  };
  const signature = JSON.stringify({
    courseId,
    type_key: opts.type_key ?? null,
    type_keys: [...(opts.type_keys ?? [])].sort(),
    difficulties: [...(opts.difficulties ?? [])].map(Number).sort((a, b) => a - b),
    node_ids: [...(opts.node_ids ?? [])].sort(),
    institutionYears: [...(opts.institutionYears ?? [])]
      .map(({ institution, years }) => ({ institution, years: [...years].sort((a, b) => a - b) }))
      .sort((a, b) => a.institution.localeCompare(b.institution)),
  });
  let cachedCandidates = candidateCache.get(signature);
  if (!cachedCandidates) {
    cachedCandidates = matchingQuestionMarks(courseId, opts);
    candidateCache.set(signature, cachedCandidates);
  }
  const display = sec.name || `Section ${index + 1}`;
  const { questions, selectionLimited } = await selectForMarks(courseId, sec.marks!, opts, selectionDeadline, onHydrating, cachedCandidates, timingPrefix);
  const secMarks = round2(questions.reduce((sum, q) => sum + (q.marks ?? 0), 0));
  if (!questions.length) {
    throw new Error(
      `No approved questions match ${display}. Try widening the topics/type filters, or set marks on matching questions.`
    );
  }
  const _ = config; // selection is course-scoped already
  void _;
  return { questions, marks: secMarks, selectionLimited };
}

export async function generateTest(
  courseId: string,
  payload: GenerateTestPayload
): Promise<GeneratedTestMeta> {
  const config = await getCourseFullConfig(courseId);
  if (!config) throw new Error("Course not found");
  const sections = payload.sections ?? [];
  const single = sections.length <= 1;
  let work: Array<TestSectionInput & { label: string | null; display: string }>;
  if (!sections.length) {
    if (!payload.target_marks || payload.target_marks <= 0) {
      throw new Error("target_marks must be greater than 0");
    }
    work = [{ marks: payload.target_marks, label: null, display: "Section 1" }];
  } else {
    work = sections.map((sec, i) => ({
      ...sec,
      label: sec.name ?? (single ? null : `Section ${String.fromCharCode(65 + i)}`),
      display: sec.name ?? `Section ${i + 1}`,
    }));
  }

  const sectionResults: TestSectionResult[] = [];
  const allQuestions: Question[] = [];
  const sectionQuestionsByWork: Array<{ label: string | null; questions: Question[] }> = [];
  let targetMarks = 0;
  const testId = newId("test");
  const timingPrefix = `test-generation:${testId}`;
  const generationStart = performance.now();
  performance.mark(`${timingPrefix}:start`);
  const selectionStart = performance.now();
  performance.mark(`${timingPrefix}:selection-and-hydration:start`);
  payload.onProgress?.({ phase: "selecting" });
  const selectionDeadline = performance.now() + (payload.selectionTimeoutMs ?? Infinity);
  const candidateCache = new Map<string, Promise<SqlRow[]>>();
  const selected = await Promise.all(work.map((sec, i) => sectionQuestions(
    courseId, i, sec, config, selectionDeadline,
    () => payload.onProgress?.({ phase: "hydrating" }),
    candidateCache,
    `${timingPrefix}:section-${i + 1}`
  )));
  recordGenerationTiming(`${timingPrefix}:selection-and-hydration`, selectionStart);
  const questionCount = selected.reduce((sum, item) => sum + item.questions.length, 0);
  for (let i = 0; i < work.length; i++) {
    const sec = work[i];
    const { questions, marks } = selected[i];
    const picked = payload.shuffle === false ? questions : shuffleList(questions);
    allQuestions.push(...picked);
    sectionQuestionsByWork.push({ label: sec.label, questions: picked });
    sectionResults.push({
      name: sec.label ?? sec.display,
      question_count: picked.length,
      marks,
      count_requested: null,
      marks_requested: sec.marks ?? null,
      selection_limited: selected[i].selectionLimited,
    });
    if (sec.marks !== undefined && sec.marks !== null) targetMarks += sec.marks;
  }

  if (!allQuestions.length) {
    throw new Error("No questions were selected for this test.");
  }

  const title = payload.title?.trim() || `${config.name} — Practice Test`;
  const format = payload.format ?? "docx";
  const achieved = round2(allQuestions.reduce((sum, q) => sum + (q.marks ?? 0), 0));
  const renderStart = performance.now();
  performance.mark(`${timingPrefix}:render-and-export:start`);
  const files = await buildTestOutputs({
    testId,
    title,
    courseName: config.name,
    format,
    questions: allQuestions,
    sectionResults,
    achievedMarks: achieved,
    sections: sectionQuestionsByWork,
    onProgress: payload.onProgress,
  });
  recordGenerationTiming(`${timingPrefix}:render-and-export`, renderStart);
  payload.onProgress?.({ phase: "saving", questionCount });
  const savingStart = performance.now();
  performance.mark(`${timingPrefix}:saving:start`);
  await storeTestFiles(testId, files);
  const testUrl = (await ensureTestFileUrl(testId, "test")) ?? "";
  const previewUrl = (await ensureTestFileUrl(testId, "preview")) ?? "";
  const extension = format === "pdf" ? "pdf" : "docx";

  await run(
    `INSERT INTO generated_test (test_id, course_id, title, format, target_marks, achieved_marks,
        question_count, filter_json, question_ids_json, test_file_path, solutions_file_path, preview_file_path, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      testId,
      courseId,
      title,
      format,
      round2(targetMarks),
      achieved,
      allQuestions.length,
      JSON.stringify({
        ...payload,
        generated_sections: sectionQuestionsByWork.map((section) => ({
          label: section.label,
          question_ids: section.questions.map((question) => question.question_id),
        })),
      }),
      JSON.stringify(allQuestions.map((q) => q.question_id)),
      `${testId}-test.${extension}`,
      "",
      `${testId}-preview.pdf`,
      nowUtc(),
    ]
  );
  recordGenerationTiming(`${timingPrefix}:saving`, savingStart);
  recordGenerationTiming(`${timingPrefix}:total`, generationStart);
  return {
    test_id: testId,
    title,
    format,
    target_marks: round2(targetMarks),
    achieved_marks: achieved,
    question_count: allQuestions.length,
    test_download_url: testUrl,
    preview_url: previewUrl,
    created_at: nowUtc(),
    section_results: sectionResults,
  };
}

export async function listTests(courseId: string, limit: number = 20): Promise<GeneratedTestMeta[]> {
  const rows = await all<SqlRow>(
    `SELECT * FROM generated_test WHERE course_id = ? ORDER BY created_at DESC LIMIT ?`,
    [courseId, limit]
  );
  const out: GeneratedTestMeta[] = [];
  for (const r of rows) {
    const testUrl = (await ensureTestFileUrl(r.test_id, "test")) ?? "";
    const previewUrl = (await ensureTestFileUrl(r.test_id, "preview")) ?? "";
    out.push({
      test_id: r.test_id,
      title: r.title,
      format: r.format,
      target_marks: r.target_marks,
      achieved_marks: r.achieved_marks,
      question_count: r.question_count,
      created_at: r.created_at,
      test_download_url: testUrl,
      preview_url: previewUrl,
      solutions_available: Boolean(await getTestFile(r.test_id, "solutions")),
    });
  }
  return out;
}

export async function generateTestSolutions(testId: string): Promise<void> {
  const row = await getFirst<SqlRow>("SELECT * FROM generated_test WHERE test_id = ?", [testId]);
  if (!row) throw new Error("Generated test not found");
  const questionIds = JSON.parse(String(row.question_ids_json)) as string[];
  const questions = await hydrateQuestions(questionIds);
  const savedFilter = parseJson(String(row.filter_json));
  const generatedSections = Array.isArray(savedFilter.generated_sections)
    ? savedFilter.generated_sections as Array<{ label: string | null; question_ids: string[] }>
    : [];
  const questionById = new Map(questions.map((question) => [question.question_id, question]));
  const sections = generatedSections.length
    ? generatedSections.map((section) => ({
        label: section.label,
        questions: section.question_ids.map((id) => questionById.get(id)).filter((question): question is Question => !!question),
      }))
    : [{ label: null, questions }];
  const output = row.format === "pdf"
    ? await buildPdfSolutions(String(row.title), sections)
    : await buildDocxSolutions(String(row.title), sections);
  await storeTestSolutionFile(testId, output);
}

export async function deleteTest(testId: string): Promise<void> {
  await deleteTestOutputs(testId);
  await run("DELETE FROM generated_test WHERE test_id = ?", [testId]);
}
