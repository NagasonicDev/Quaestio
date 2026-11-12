/**
 * Per-course practice/quiz filter selections, so leaving the page (or
 * switching course and coming back) restores the same filters.
 * Browse keeps its own state in `qb-browser-state` because it also stores
 * search, sort and page.
 */
export type FilterSection = "practice" | "quiz";

export interface SessionFilters {
  selectedNodes: string[];
  typeKeys: string[];
  difficulties: number[];
  selectedTag: string;
  institutionYears: Record<string, number[]>;
  avoidRecentDays?: number | null;
}

const STORAGE_KEY = "qb-session-filters";

type FilterStore = Record<string, Partial<Record<FilterSection, unknown>>>;

function readStore(): FilterStore {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as FilterStore) : {};
  } catch {
    return {};
  }
}

function writeStore(store: FilterStore) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Filters are a convenience; the pages still work when storage is unavailable.
  }
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function numbers(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === "number") : [];
}

export function readSessionFilters(courseId: string | null, section: FilterSection): SessionFilters {
  const defaults: SessionFilters = { selectedNodes: [], typeKeys: [], difficulties: [], selectedTag: "", institutionYears: {} };
  if (!courseId) return defaults;
  const value = readStore()[courseId]?.[section];
  if (!value || typeof value !== "object") return defaults;
  const saved = value as Partial<SessionFilters>;
  const institutionYears =
    saved.institutionYears && typeof saved.institutionYears === "object" && !Array.isArray(saved.institutionYears)
      ? saved.institutionYears
      : {};
  return {
    selectedNodes: strings(saved.selectedNodes),
    typeKeys: strings(saved.typeKeys),
    difficulties: numbers(saved.difficulties),
    selectedTag: typeof saved.selectedTag === "string" ? saved.selectedTag : "",
    institutionYears,
    avoidRecentDays:
      typeof saved.avoidRecentDays === "number" ? saved.avoidRecentDays : saved.avoidRecentDays === null ? null : undefined,
  };
}

export function writeSessionFilters(courseId: string | null, section: FilterSection, filters: SessionFilters) {
  if (!courseId) return;
  const store = readStore();
  store[courseId] = { ...store[courseId], [section]: filters };
  writeStore(store);
}

/**
 * Renaming an institution moves saved filters onto the new name, otherwise a
 * restored filter would quietly match nothing.
 */
export function renameInstitutionInSessionFilters(courseId: string | null, from: string, to: string) {
  if (!courseId || from === to) return;
  const store = readStore();
  const course = store[courseId];
  if (!course) return;
  let changed = false;
  for (const section of ["practice", "quiz"] as const) {
    const saved = course[section];
    if (!saved || typeof saved !== "object") continue;
    const years = (saved as Partial<SessionFilters>).institutionYears;
    if (!years || typeof years !== "object" || !(from in years)) continue;
    const oldYears = numbers(years[from]);
    const existing = years[to];
    years[to] = existing ? [...new Set([...numbers(existing), ...oldYears])] : oldYears;
    delete years[from];
    changed = true;
  }
  if (changed) writeStore(store);
}
