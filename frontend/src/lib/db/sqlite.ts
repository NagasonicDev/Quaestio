import initSqlJs from "sql.js";
import type { Database } from "sql.js";
import { SCHEMA_SQL, BUILTIN_QUESTION_TYPES } from "./schema";
import * as idb from "./indexeddb";
import { isValidQuestionId, newQuestionId } from "../id";

let db: Database | null = null;
let ready: Promise<Database> | null = null;

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
    markDirty();
  }
  db.run("PRAGMA foreign_keys = ON;");
  repairQuestionIds();
  // Keep the standard follow-up tag available in every existing course.
  db.run(`INSERT OR IGNORE INTO tag (tag_id, course_id, name)
          SELECT 'tag_action_' || course_id, course_id, 'action_required' FROM course`);
  if (db.getRowsModified() > 0) markDirty();
  return db;
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

export function markDirty(): void {
  dirty = true;
  if (persistTimer !== null) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    void flush();
  }, 500);
}

export async function flush(): Promise<void> {
  if (persistTimer !== null) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (!dirty || !db) return;
  dirty = false;
  const bytes = db.export();
  const persist = idb.persistDb(bytes);
  pendingPersist = persist;
  try {
    await persist;
  } finally {
    if (pendingPersist === persist) pendingPersist = null;
  }
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
