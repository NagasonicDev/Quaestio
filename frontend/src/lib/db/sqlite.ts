import initSqlJs from "sql.js";
import type { Database } from "sql.js";
import { SCHEMA_SQL, BUILTIN_QUESTION_TYPES, MIGRATIONS, SCHEMA_VERSION } from "./schema";
import * as idb from "./indexeddb";
import { isValidQuestionId, newQuestionId, nowUtc } from "../id";
import {
  reportCleared,
  reportSaved,
  reportSaving,
  reportSaveFailure,
  setPersistenceRetry,
} from "./persistenceStatus";

let db: Database | null = null;
let ready: Promise<Database> | null = null;

const APP_SETTING_DDL = `CREATE TABLE IF NOT EXISTS app_setting (
  setting_key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL
)`;

async function initDb(): Promise<Database> {
  const SQL = await initSqlJs({ locateFile: () => `${import.meta.env.BASE_URL}sql-wasm.wasm` });
  const bytes = await idb.loadPersistedDb();
  if (bytes && bytes.byteLength > 0) {
    db = new SQL.Database(bytes);
  } else {
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    for (const [key, label] of BUILTIN_QUESTION_TYPES) {
      db.run("INSERT OR IGNORE INTO question_type (type_key, display_name) VALUES (?, ?)", [key, label]);
    }
    writeSchemaVersion(SCHEMA_VERSION);
    markDirty();
  }
  db.run("PRAGMA foreign_keys = ON;");
  applyMigrations();
  repairQuestionIds();
  // Keep the standard follow-up tag available in every existing course.
  db.run(`INSERT OR IGNORE INTO tag (tag_id, course_id, name)
          SELECT 'tag_action_' || course_id, course_id, 'action_required' FROM course`);
  if (db.getRowsModified() > 0) markDirty();
  return db;
}

// ---------- schema migrations ----------

function readSchemaVersion(): number {
  const stmt = db!.prepare("SELECT value FROM app_setting WHERE setting_key = 'schema_version'");
  try {
    if (stmt.step()) {
      const parsed = Number(stmt.get()[0]);
      return Number.isFinite(parsed) ? parsed : 0;
    }
  } finally {
    stmt.free();
  }
  return 0;
}

function writeSchemaVersion(version: number): void {
  db!.run(
    "INSERT OR REPLACE INTO app_setting (setting_key, value, updated_at) VALUES ('schema_version', ?, datetime('now'))",
    [String(version)]
  );
}

/**
 * Bring an existing database up to SCHEMA_VERSION. Safe to call on every
 * start: it is a no-op once the recorded version matches, so a database
 * created by this build never replays a migration against columns it already
 * has.
 */
function applyMigrations(): void {
  if (!db) return;
  db.run(APP_SETTING_DDL);
  const current = readSchemaVersion();
  if (current >= SCHEMA_VERSION) return;
  const pending = MIGRATIONS.filter((m) => m.id > current);
  for (const migration of pending) {
    db!.run("BEGIN;");
    try {
      db!.exec(migration.sql);
      writeSchemaVersion(migration.id);
      db!.run("COMMIT;");
    } catch (error) {
      try {
        db!.run("ROLLBACK;");
      } catch {
        /* ignore */
      }
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Database upgrade ${migration.id} (${migration.name}) failed: ${reason}`);
    }
  }
  if (pending.length) markDirty();
}

/** The recorded database schema version, for the settings screen and exports. */
export function schemaVersion(): number {
  return db ? readSchemaVersion() : 0;
}

function repairQuestionIds(): void {
  if (!db) return;
  const rows = db.exec("SELECT question_id FROM question");
  const ids = (rows[0]?.values ?? []).map(([id]) => String(id));
  const used = new Set(ids.filter(isValidQuestionId));
  const replacements = new Map<string, string>();
  for (const oldId of ids) {
    if (isValidQuestionId(oldId)) continue;
    let nextId: string;
    do nextId = newQuestionId(); while (used.has(nextId));
    used.add(nextId);
    replacements.set(oldId, nextId);
  }
  if (!replacements.size) return;

  const references = [
    ["question", "parent_question_id"],
    ["content_block", "question_id"],
    ["question_classification", "question_id"],
    ["question_tag", "question_id"],
    ["mcq_option", "question_id"],
    ["asset", "question_id"],
    ["practice_attempt", "question_id"],
    ["import_question", "final_question_id"],
  ] as const;
  db.run("PRAGMA foreign_keys = OFF;");
  db.run("BEGIN;");
  try {
    for (const [oldId, newId] of replacements) {
      const oldParam = `'${oldId.replace(/'/g, "''")}'`;
      const newParam = `'${newId}'`;
      for (const [table, column] of references) {
        db!.run(`UPDATE ${table} SET ${column} = ${newParam} WHERE ${column} = ${oldParam}`);
      }
      db!.run(`UPDATE question SET question_id = ${newParam} WHERE question_id = ${oldParam}`);
    }
    const tests = db.exec("SELECT test_id, question_ids_json FROM generated_test");
    for (const [testId, rawIds] of (tests[0]?.values ?? [])) {
      try {
        const questionIds = JSON.parse(String(rawIds)) as string[];
        const updated = questionIds.map((id) => replacements.get(id) ?? id);
        if (updated.some((id, i) => id !== questionIds[i])) {
          const stmt = db.prepare("UPDATE generated_test SET question_ids_json = ? WHERE test_id = ?");
          stmt.run([JSON.stringify(updated), String(testId)]);
          stmt.free();
        }
      } catch { /* leave malformed legacy metadata untouched */ }
    }
    db.run("COMMIT;");
    markDirty();
  } catch (error) {
    db.run("ROLLBACK;");
    throw error;
  } finally {
    db.run("PRAGMA foreign_keys = ON;");
  }
}

export function getDb(): Promise<Database> {
  if (!ready) {
    ready = initDb().catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

// ---------- Persistence (debounced export to IndexedDB) ----------

let dirty = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPersist: Promise<void> | null = null;
let lastFlushError: unknown = null;

setPersistenceRetry(() => {
  lastFlushError = null;
  void flush().catch(() => {});
});

export function markDirty(): void {
  dirty = true;
  reportSaving();
  if (persistTimer !== null) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    void flush().catch(() => {});
  }, 500);
}

export async function flush(): Promise<void> {
  if (persistTimer !== null) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (!dirty || !db) return;
  dirty = false;
  lastFlushError = null;
  reportSaving();
  const bytes = db.export();
  const persist = idb.persistDb(bytes);
  pendingPersist = persist;
  try {
    await persist;
    reportSaved(nowUtc());
  } catch (error) {
    // Keep the image marked dirty so a retry re-exports it rather than
    // reporting a save that never happened.
    dirty = true;
    lastFlushError = error;
    reportSaveFailure(error);
    throw error;
  } finally {
    if (pendingPersist === persist) pendingPersist = null;
  }
}

/** The most recent write failure, for callers that want to explain it inline. */
export function persistenceError(): unknown {
  return lastFlushError;
}

/**
 * Write pending changes at a point where the page may be about to go away.
 * `beforeunload` cannot await, so this is a best-effort nudge alongside the
 * debounced writes rather than the only safety net.
 */
export function flushOnHide(): void {
  if (!dirty) return;
  void flush().catch(() => {});
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushOnHide();
  });
  window.addEventListener("pagehide", flushOnHide);
}

/** Clear persisted data and reset the in-memory database so stale data cannot return. */
export async function clearAllData(): Promise<void> {
  if (persistTimer !== null) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  await pendingPersist;
  await idb.clearAllData();
  db?.close();
  db = null;
  ready = null;
  dirty = false;
  lastFlushError = null;
  reportCleared();
}

// ---------- Query helpers ----------

// Run a set of statements atomically (open transaction, rollback on error).
export async function transaction(fn: (db: Database) => void): Promise<void> {
  const database = await getDb();
  database.run("BEGIN;");
  try {
    fn(database);
    database.run("COMMIT;");
    markDirty();
  } catch (e) {
    try {
      database.run("ROLLBACK;");
    } catch {
      /* ignore */
    }
    throw e;
  }
}

export async function all<T = Record<string, any>>(sql: string, params: any[] = []): Promise<T[]> {
  const database = await getDb();
  const stmt = database.prepare(sql);
  try {
    stmt.bind(params);
    const rows: T[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject() as T);
    return rows;
  } finally {
    stmt.free();
  }
}

export async function getFirst<T = Record<string, any>>(sql: string, params: any[] = []): Promise<T | null> {
  const rows = await all<T>(sql, params);
  return rows.length ? rows[0] : null;
}

export async function run(sql: string, params: any[] = []): Promise<void> {
  const database = await getDb();
  const stmt = database.prepare(sql);
  try {
    stmt.bind(params);
    while (stmt.step()) {
      /* execute all statements */
    }
    markDirty();
  } finally {
    stmt.free();
  }
}

// execute several independent statements within one transaction (skip statements that fail)
export async function runMany(statements: Array<[string, any[]]>): Promise<void> {
  await transaction((database) => {
    for (const [sql, params] of statements) {
      const stmt = database.prepare(sql);
      try {
        stmt.bind(params);
        while (stmt.step()) {
          /* execute */
        }
      } finally {
        stmt.free();
      }
    }
  });
}
