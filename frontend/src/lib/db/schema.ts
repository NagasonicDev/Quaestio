export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS course (
  course_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  subject TEXT,
  curriculum TEXT,
  version_year TEXT,
  schema_version INTEGER NOT NULL DEFAULT 1,
  allow_multi_classification INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  is_sample INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS course_level_def (
  course_id TEXT NOT NULL REFERENCES course(course_id) ON DELETE CASCADE,
  level_index INTEGER NOT NULL,
  label TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (course_id, level_index)
);

CREATE TABLE IF NOT EXISTS course_node (
  node_id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES course(course_id) ON DELETE CASCADE,
  parent_node_id TEXT REFERENCES course_node(node_id) ON DELETE CASCADE,
  level_index INTEGER NOT NULL,
  name TEXT NOT NULL,
  code TEXT,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_course_node_parent ON course_node(parent_node_id);
CREATE INDEX IF NOT EXISTS idx_course_node_course_level ON course_node(course_id, level_index);

CREATE TABLE IF NOT EXISTS difficulty_level (
  course_id TEXT NOT NULL REFERENCES course(course_id) ON DELETE CASCADE,
  level INTEGER NOT NULL,
  label TEXT NOT NULL,
  PRIMARY KEY (course_id, level)
);

CREATE TABLE IF NOT EXISTS question_type (
  type_key TEXT PRIMARY KEY,
  course_id TEXT REFERENCES course(course_id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  schema_json TEXT
);

CREATE TABLE IF NOT EXISTS tag (
  tag_id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES course(course_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  UNIQUE (course_id, name)
);

CREATE TABLE IF NOT EXISTS source (
  source_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  year INTEGER,
  institution TEXT,
  paper TEXT,
  original_page INTEGER,
  original_question_no TEXT,
  original_filename TEXT,
  import_job_id TEXT
);

CREATE TABLE IF NOT EXISTS question (
  question_id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES course(course_id),
  type_key TEXT NOT NULL REFERENCES question_type(type_key),
  difficulty INTEGER,
  marks REAL,
  parent_question_id TEXT REFERENCES question(question_id) ON DELETE CASCADE,
  part_label TEXT,
  source_id TEXT REFERENCES source(source_id),
  notes TEXT,
  review_status TEXT NOT NULL DEFAULT 'approved',
  classification_confidence TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_question_course ON question(course_id);
CREATE INDEX IF NOT EXISTS idx_question_type ON question(type_key);
CREATE INDEX IF NOT EXISTS idx_question_difficulty ON question(difficulty);
CREATE INDEX IF NOT EXISTS idx_question_parent ON question(parent_question_id);

CREATE TABLE IF NOT EXISTS content_block (
  block_id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES question(question_id) ON DELETE CASCADE,
  slot TEXT NOT NULL DEFAULT 'body',
  position INTEGER NOT NULL,
  block_type TEXT NOT NULL,
  content_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_content_block_question ON content_block(question_id, slot, position);

CREATE TABLE IF NOT EXISTS question_classification (
  question_id TEXT NOT NULL REFERENCES question(question_id) ON DELETE CASCADE,
  node_id TEXT NOT NULL REFERENCES course_node(node_id) ON DELETE CASCADE,
  is_primary INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (question_id, node_id)
);
CREATE INDEX IF NOT EXISTS idx_qc_node ON question_classification(node_id);

CREATE TABLE IF NOT EXISTS question_tag (
  question_id TEXT NOT NULL REFERENCES question(question_id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tag(tag_id) ON DELETE CASCADE,
  PRIMARY KEY (question_id, tag_id)
);

CREATE TABLE IF NOT EXISTS mcq_option (
  option_id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES question(question_id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  content_json TEXT NOT NULL,
  is_correct INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS asset (
  asset_id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES question(question_id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  alt_text TEXT,
  caption TEXT,
  original_filename TEXT
);

CREATE TABLE IF NOT EXISTS practice_session (
  session_id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES course(course_id),
  filter_json TEXT NOT NULL,
  mode TEXT NOT NULL,
  created_at TEXT NOT NULL,
  config_json TEXT,
  plan_json TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  planned_count INTEGER NOT NULL DEFAULT 0,
  completed_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_session_course ON practice_session(course_id, created_at);

CREATE TABLE IF NOT EXISTS practice_attempt (
  attempt_id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES practice_session(session_id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES question(question_id),
  status TEXT NOT NULL,
  correct INTEGER,
  time_spent_sec INTEGER,
  user_notes TEXT,
  created_at TEXT NOT NULL,
  response_text TEXT,
  confidence TEXT,
  self_rating TEXT,
  hints_revealed INTEGER NOT NULL DEFAULT 0,
  scored_by TEXT,
  score_earned REAL,
  score_possible REAL
);
CREATE INDEX IF NOT EXISTS idx_attempt_question ON practice_attempt(question_id, created_at);
CREATE INDEX IF NOT EXISTS idx_attempt_created ON practice_attempt(created_at);

-- Per-question review schedule. This is a projection: it can be rebuilt from
-- practice_attempt rows, and it disappears with the question it belongs to.
CREATE TABLE IF NOT EXISTS question_review_state (
  question_id TEXT PRIMARY KEY REFERENCES question(question_id) ON DELETE CASCADE,
  next_due_at TEXT,
  interval_days REAL NOT NULL DEFAULT 0,
  last_reviewed_at TEXT,
  review_count INTEGER NOT NULL DEFAULT 0,
  lapse_count INTEGER NOT NULL DEFAULT 0,
  ladder_step INTEGER NOT NULL DEFAULT 0,
  last_rating TEXT,
  last_outcome TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_review_state_due ON question_review_state(next_due_at);

-- App-level preferences and switches, keyed by name. Holds the review policy,
-- the queue pause, and the answer-capture preference.
CREATE TABLE IF NOT EXISTS app_setting (
  setting_key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS import_job (
  import_job_id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES course(course_id),
  source_filename TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS import_question (
  import_question_id TEXT PRIMARY KEY,
  import_job_id TEXT NOT NULL REFERENCES import_job(import_job_id) ON DELETE CASCADE,
  proposed_json TEXT NOT NULL,
  confidence TEXT NOT NULL,
  resolution TEXT NOT NULL DEFAULT 'pending',
  final_question_id TEXT REFERENCES question(question_id)
);

CREATE TABLE IF NOT EXISTS generated_test (
  test_id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES course(course_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  format TEXT NOT NULL,
  target_marks REAL NOT NULL,
  achieved_marks REAL NOT NULL,
  question_count INTEGER NOT NULL,
  filter_json TEXT NOT NULL,
  question_ids_json TEXT NOT NULL,
  test_file_path TEXT NOT NULL,
  solutions_file_path TEXT NOT NULL,
  preview_file_path TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_generated_test_course ON generated_test(course_id, created_at);
`;

export const BUILTIN_QUESTION_TYPES: Array<[string, string]> = [
  ["multiple_choice", "Multiple Choice"],
  ["short_answer", "Short Answer"],
  ["extended_response", "Extended Response"],
];

/**
 * Bumped whenever SCHEMA_SQL changes shape. This is the *database* schema
 * version and is deliberately unrelated to the IndexedDB DB_VERSION used to
 * version the persisted blobs, and to the per-course `schema_version` that
 * describes the question format a course expects.
 */
export const SCHEMA_VERSION = 1;

export interface Migration {
  id: number;
  name: string;
  sql: string;
}

/**
 * Ordered, additive migrations applied to databases created by an earlier
 * build. Each one runs in its own transaction, so a failure leaves the database
 * at the last version that fully applied rather than half-upgraded.
 */
export const MIGRATIONS: Migration[] = [
  {
    id: 1,
    name: "study-loop-foundation",
    sql: `
      ALTER TABLE course ADD COLUMN is_sample INTEGER NOT NULL DEFAULT 0;

      ALTER TABLE practice_session ADD COLUMN config_json TEXT;
      ALTER TABLE practice_session ADD COLUMN plan_json TEXT;
      ALTER TABLE practice_session ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
      ALTER TABLE practice_session ADD COLUMN planned_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE practice_session ADD COLUMN completed_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE practice_session ADD COLUMN updated_at TEXT;
      CREATE INDEX IF NOT EXISTS idx_session_course ON practice_session(course_id, created_at);

      ALTER TABLE practice_attempt ADD COLUMN response_text TEXT;
      ALTER TABLE practice_attempt ADD COLUMN confidence TEXT;
      ALTER TABLE practice_attempt ADD COLUMN self_rating TEXT;
      ALTER TABLE practice_attempt ADD COLUMN hints_revealed INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE practice_attempt ADD COLUMN scored_by TEXT;
      ALTER TABLE practice_attempt ADD COLUMN score_earned REAL;
      ALTER TABLE practice_attempt ADD COLUMN score_possible REAL;
      CREATE INDEX IF NOT EXISTS idx_attempt_created ON practice_attempt(created_at);

      -- Legacy rows recorded a bare correct flag. Some of those came from an
      -- objectively marked multiple choice question and some from a mark the
      -- student typed into the quiz, so they are labelled as a manual mark
      -- rather than being upgraded to a claim of objectivity we cannot prove.
      UPDATE practice_attempt SET scored_by = 'manual_legacy' WHERE correct IS NOT NULL;

      CREATE TABLE IF NOT EXISTS question_review_state (
        question_id TEXT PRIMARY KEY REFERENCES question(question_id) ON DELETE CASCADE,
        next_due_at TEXT,
        interval_days REAL NOT NULL DEFAULT 0,
        last_reviewed_at TEXT,
        review_count INTEGER NOT NULL DEFAULT 0,
        lapse_count INTEGER NOT NULL DEFAULT 0,
        ladder_step INTEGER NOT NULL DEFAULT 0,
        last_rating TEXT,
        last_outcome TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_review_state_due ON question_review_state(next_due_at);

      CREATE TABLE IF NOT EXISTS app_setting (
        setting_key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT NOT NULL
      );
    `,
  },
];
