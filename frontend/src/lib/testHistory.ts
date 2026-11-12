import type { SavedTestSettings } from "../api/types.ts";

export interface GeneratedTestIdRow {
  question_ids_json?: unknown;
}

/**
 * The generator form saved with a test (`generated_test.filter_json`), for
 * "copy settings from a past test". Returns null when the row predates this or
 * cannot be read, so the UI can hide the option instead of loading nonsense.
 */
export function savedTestSettings(raw: string | null | undefined): SavedTestSettings | null {
  if (typeof raw !== "string" || !raw) return null;
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.sections)) return null;
  const sections = parsed.sections.filter(
    (section: unknown): section is Record<string, unknown> => !!section && typeof section === "object"
  );
  if (!sections.length) return null;
  return {
    title: typeof parsed.title === "string" ? parsed.title : undefined,
    format: parsed.format === "pdf" ? "pdf" : "docx",
    ordering: typeof parsed.ordering === "string" ? parsed.ordering : undefined,
    excludeRecentTests: Number.isFinite(parsed.excludeRecentTests) ? Number(parsed.excludeRecentTests) : 0,
    keepQuestionIds: Array.isArray(parsed.keepQuestionIds)
      ? parsed.keepQuestionIds.filter((id: unknown): id is string => typeof id === "string")
      : [],
    sections: sections as SavedTestSettings["sections"],
  };
}

/**
 * Question ids from a `generated_test.question_ids_json` string. Corrupted or
 * hand-edited rows yield an empty list (and a user-facing error downstream)
 * rather than a raw SyntaxError from JSON.parse.
 */
export function parseQuestionIdList(raw: string | null | undefined): string[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Question ids used by the most recent `window` generated tests, for the
 * "exclude questions used in the last N tests" control. Malformed rows and
 * rows without ids are skipped rather than thrown, so one bad test cannot
 * block generation.
 */
export function recentlyUsedQuestionIds(
  rows: readonly GeneratedTestIdRow[],
  window: number
): Set<string> {
  const used = new Set<string>();
  for (const row of rows.slice(0, Math.max(0, window))) {
    if (typeof row.question_ids_json !== "string") continue;
    try {
      const ids = JSON.parse(row.question_ids_json);
      if (Array.isArray(ids)) for (const id of ids) if (typeof id === "string") used.add(id);
    } catch {
      // A single unreadable row must not stop the rest of the window.
    }
  }
  return used;
}
