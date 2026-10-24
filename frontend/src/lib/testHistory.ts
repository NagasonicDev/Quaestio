export interface GeneratedTestIdRow {
  question_ids_json?: unknown;
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
