import test from "node:test";
import assert from "node:assert/strict";
import initSqlJs from "sql.js";
import { MIGRATIONS, SCHEMA_SQL, SCHEMA_VERSION } from "../src/lib/db/schema.ts";

// The database as it looked before the study-experience work, limited to the
// tables the first migration touches.
const LEGACY_SQL = `
CREATE TABLE course (
  course_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  subject TEXT,
  curriculum TEXT,
  version_year TEXT,
  schema_version INTEGER NOT NULL DEFAULT 1,
  allow_multi_classification INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE question (
  question_id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES course(course_id),
  type_key TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'approved',
  parent_question_id TEXT REFERENCES question(question_id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE practice_session (
  session_id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES course(course_id),
  filter_json TEXT NOT NULL,
  mode TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE practice_attempt (
  attempt_id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES practice_session(session_id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES question(question_id),
  status TEXT NOT NULL,
  correct INTEGER,
  time_spent_sec INTEGER,
  user_notes TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_attempt_question ON practice_attempt(question_id, created_at);
`;

function columns(db, table) {
  const result = db.exec(`PRAGMA table_info(${table})`);
  if (!result.length) return [];
  return result[0].values.map((row) => String(row[1]));
}

function one(db, sql) {
  const result = db.exec(sql);
  if (!result.length || !result[0].values.length) return null;
  return result[0].values[0][0];
}

test("the migration turns a pre-study-loop database into the current shape", async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(LEGACY_SQL);
  db.run(
    "INSERT INTO course (course_id, name, created_at, updated_at) VALUES ('course_1', 'Legacy', '2026-01-01 00:00:00', '2026-01-01 00:00:00')"
  );
  db.run(
    "INSERT INTO question (question_id, course_id, type_key, created_at, updated_at) VALUES ('ab12cd', 'course_1', 'short_answer', '2026-01-01 00:00:00', '2026-01-01 00:00:00')"
  );
  db.run(
    "INSERT INTO practice_session (session_id, course_id, filter_json, mode, created_at) VALUES ('sess_1', 'course_1', '{}', 'random', '2026-01-01 00:00:00')"
  );
  db.run(
    "INSERT INTO practice_attempt (attempt_id, session_id, question_id, status, correct, created_at) VALUES ('att_1', 'sess_1', 'ab12cd', 'completed', 1, '2026-01-01 00:00:00')"
  );
  db.run(
    "INSERT INTO practice_attempt (attempt_id, session_id, question_id, status, created_at) VALUES ('att_2', 'sess_1', 'ab12cd', 'seen', '2026-01-01 00:00:00')"
  );

  const studyLoop = MIGRATIONS.find((m) => m.id === 1);
  assert.ok(studyLoop, "migration 1 must exist");
  db.run("PRAGMA foreign_keys = ON;");
  db.run(studyLoop.sql);

  assert.deepEqual(
    columns(db, "practice_attempt"),
    [
      "attempt_id",
      "session_id",
      "question_id",
      "status",
      "correct",
      "time_spent_sec",
      "user_notes",
      "created_at",
      "response_text",
      "confidence",
      "self_rating",
      "hints_revealed",
      "scored_by",
      "score_earned",
      "score_possible",
    ],
    "existing columns keep their position and the new ones are appended"
  );
  assert.ok(columns(db, "course").includes("is_sample"));
  assert.ok(columns(db, "practice_session").includes("plan_json"));
  assert.ok(columns(db, "practice_session").includes("status"));

  const reviewColumns = columns(db, "question_review_state");
  assert.ok(reviewColumns.includes("ladder_step"));
  assert.ok(reviewColumns.includes("next_due_at"));
  assert.ok(columns(db, "app_setting").includes("setting_key"));

  assert.equal(
    one(db, "SELECT scored_by FROM practice_attempt WHERE attempt_id = 'att_1'"),
    "manual_legacy",
    "an old self-marked attempt is not silently promoted to an objective result"
  );
  assert.equal(one(db, "SELECT scored_by FROM practice_attempt WHERE attempt_id = 'att_2'"), null);
  assert.equal(one(db, "SELECT count(*) FROM practice_attempt"), 2, "no attempt is lost");
  assert.equal(one(db, "SELECT is_sample FROM course WHERE course_id = 'course_1'"), 0);
  assert.equal(one(db, "SELECT status FROM practice_session WHERE session_id = 'sess_1'"), "active");
});

test("review state is removed with its question and follows the foreign key", async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(LEGACY_SQL);
  db.run("PRAGMA foreign_keys = ON;");
  db.run(MIGRATIONS[0].sql);
  db.run(
    "INSERT INTO course (course_id, name, created_at, updated_at) VALUES ('course_1', 'Legacy', '2026-01-01 00:00:00', '2026-01-01 00:00:00')"
  );
  db.run(
    "INSERT INTO question (question_id, course_id, type_key, created_at, updated_at) VALUES ('ab12cd', 'course_1', 'short_answer', '2026-01-01 00:00:00', '2026-01-01 00:00:00')"
  );
  db.run(
    "INSERT INTO question_review_state (question_id, next_due_at, updated_at) VALUES ('ab12cd', '2026-02-01 09:00:00', '2026-01-01 00:00:00')"
  );
  assert.equal(one(db, "SELECT count(*) FROM question_review_state"), 1);
  db.run("DELETE FROM practice_attempt WHERE question_id = 'ab12cd'");
  db.run("DELETE FROM question WHERE question_id = 'ab12cd'");
  assert.equal(
    one(db, "SELECT count(*) FROM question_review_state"),
    0,
    "deleting a question must not leave its schedule behind"
  );
});

test("a migrated database matches the fresh-install schema", async () => {
  const SQL = await initSqlJs();
  const fresh = new SQL.Database();
  fresh.run(SCHEMA_SQL);
  const migrated = new SQL.Database();
  migrated.run(LEGACY_SQL);
  migrated.run(MIGRATIONS[0].sql);
  for (const table of ["course", "practice_session", "practice_attempt", "question_review_state", "app_setting"]) {
    assert.deepEqual(
      columns(migrated, table),
      columns(fresh, table),
      `${table} differs between an upgraded database and a fresh one`
    );
  }
  assert.equal(
    SCHEMA_VERSION,
    Math.max(...MIGRATIONS.map((m) => m.id)),
    "SCHEMA_VERSION must match the highest migration id"
  );
});
