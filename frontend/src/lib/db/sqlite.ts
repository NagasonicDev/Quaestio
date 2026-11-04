import * as sqlJsModule from "sql.js";
import type { Database } from "sql.js";

// sql.js ships a UMD build whose export shape depends on the bundler; pick the
// factory without relying on Vite optimizing sql.js.
const initSqlJs = ((sqlJsModule as any).default ??
  (sqlJsModule as any).Module ??
  (sqlJsModule as any)) as (typeof import("sql.js"))["default"];
import { SCHEMA_SQL, BUILTIN_QUESTION_TYPES, MIGRATIONS, SCHEMA_VERSION } from "./schema.ts";
import * as idb from "./indexeddb.ts";
import { isValidQuestionId, newQuestionId, nowUtc } from "../id.ts";
import {
  reportCleared,
  reportSaved,
  reportSaving,
  reportSaveFailure,
  setPersistenceRetry,
} from "./persistenceStatus.ts";

let db: Database | null = null;
let ready: Promise<Database> | null = null;

const APP_SETTING_DDL = `CREATE TABLE IF NOT EXISTS app_setting (
  setting_key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL
)`;

async function initDb(): Promise<Database> {
  let locateFile: () => string;
  if (typeof window !== "undefined") {
    const baseUrl = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
    locateFile = () => `${baseUrl}sql-wasm.wasm`;
  } else {
    locateFile = () => new URL("../../../node_modules/sql.js/dist/sql-wasm.wasm", import.meta.url).href;
  }
  const SQL = await initSqlJs({ locateFile });
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
      // Version 7 could be stamped by fresh installs whose base schema was
      // missing this column. Repair both those databases and correctly
      // migrated version-7 databases safely.
      if (migration.id === 8) {
        const columns = db!.exec("PRAGMA table_info(question_drawing_page)")[0]?.values ?? [];
        if (!columns.some((row) => String(row[1]) === "attempt_id")) {
          db!.run("ALTER TABLE question_drawing_page ADD COLUMN attempt_id TEXT;");
        }
      }
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
    ["question_review_state", "question_id"],
    ["question_drawing_page", "question_id"],
    ["practice_attempt", "question_id"],
    ["import_question", "final_question_id"],
  ] as const
  db.run("PRAGMA foreign_keys = OFF;");
  db.run("BEGIN;");
  try {
    for (const [oldId, newId] of replacements) {
      for (const [table, column] of references) {
        const stmt = db!.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`);
        try {
          stmt.run([newId, oldId]);
        } finally {
          stmt.free();
        }
      }
      const qStmt = db!.prepare(`UPDATE question SET question_id = ? WHERE question_id = ?`);
      try {
        qStmt.run([newId, oldId]);
      } finally {
        qStmt.free();
      }
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

// Cross-tab sync: broadcast a successful persist and reload when another tab
// has written (only if this tab has no unsaved changes of its own).
let syncChannel: BroadcastChannel | null = null;
let heavyTaskCount = 0;

export function beginHeavyTask(): void {
  heavyTaskCount += 1;
}
export function endHeavyTask(): void {
  heavyTaskCount = Math.max(0, heavyTaskCount - 1);
}
export function isHeavyTaskActive(): boolean {
  return heavyTaskCount > 0;
}
if (typeof window !== "undefined" && typeof BroadcastChannel !== "undefined") {
  try {
    syncChannel = new BroadcastChannel("quaestio-db-sync");
    syncChannel.onmessage = (event: MessageEvent) => {
       const data = (event as { data?: unknown } | null)?.data;
       if (!data || (data as { type?: unknown }).type !== "quaestio-persisted") return;
       // If this tab has unsaved (or in-flight) work, or is running a long-lived
       // task (import/generation/export), or is mid-session on a practice/quiz
       // route, keep it; surface newer data instead of clobbering the page.
       const loc = (typeof window !== "undefined" ? window.location : null);
       const protectedRoute = !!loc && /practice|quiz/i.test(String(loc.pathname || "") + String(loc.hash || ""));
       if (dirty || pendingPersist !== null || heavyTaskCount > 0 || protectedRoute) {
         try {
           window.dispatchEvent(new CustomEvent("quaestio-newer-data-available"));
         } catch {
           /* ignore */
         }
         return;
       }
      try {
        window.location.reload();
      } catch {
        /* ignore */
      }
    };
  } catch {
    syncChannel = null;
  }
}

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
  // Wait for an in-flight write so two saves cannot finish in the wrong order.
  if (pendingPersist !== null) {
    try {
      await pendingPersist;
    } catch {
      /* retry will use the latest export below */
    }
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
    if (syncChannel) {
      try {
        syncChannel.postMessage({ type: "quaestio-persisted" });
      } catch {
        /* ignore */
      }
    }
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
  void flush().catch(() => {});
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", (event) => {
    if (isDirty()) {
      try {
        void flush().catch(() => {});
      } catch {
        /* best-effort nudge */
      }
      event.preventDefault();
      event.returnValue = "Unsaved changes may be lost.";
    }
  });
}

export function flushPending(): Promise<void> {
  return flush();
}

export function isDirty(): boolean {
  return dirty;
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
  try {
    const assetsMod = await import("../assets.ts");
    assetsMod.clearAssetUrlCache?.();
  } catch { /* ignore */ }
  try {
    const testsMod = await import("../tests.ts");
    testsMod.clearTestUrlCache?.();
  } catch { /* ignore */ }
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
let transactionDepth = 0;

export async function transaction(fn: (db: Database) => any): Promise<void> {
  const database = await getDb();
  if (transactionDepth > 0) {
    await fn(database);
    return;
  }
  transactionDepth++;
  database.run("BEGIN;");
  try {
    await fn(database);
    database.run("COMMIT;");
    markDirty();
  } catch (e) {
    try {
      database.run("ROLLBACK;");
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    transactionDepth--;
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
    if (db && db.getRowsModified() > 0) markDirty();
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
