/**
 * Where the local database currently stands, in words a student can act on.
 *
 * Everything in this app lives on this device: the SQLite image is held in
 * memory and the whole image is written back to IndexedDB. That write can fail
 * for reasons the student can act on — a full disk, private browsing, a
 * browser that refuses storage — and when it does, the honest thing is to say
 * so rather than to keep claiming the work is saved.
 *
 * Kept as a plain external store rather than React state so the persistence
 * layer can report on itself without importing the database module back.
 */

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface SaveState {
  status: SaveStatus;
  /** Set when status is "error"; already phrased for display. */
  message: string | null;
  /** UTC SQL datetime of the last successful write, or null. */
  lastSavedAt: string | null;
  /** True when a failed write left unsaved work in memory. */
  hasUnsavedChanges: boolean;
}

const listeners = new Set<() => void>();

let state: SaveState = {
  status: "idle",
  message: null,
  lastSavedAt: null,
  hasUnsavedChanges: false,
};

function emit(next: SaveState): void {
  state = next;
  for (const listener of listeners) listener();
}

export function subscribePersistence(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function persistenceSnapshot(): SaveState {
  return state;
}

/** Work is queued and has not reached storage yet. */
export function reportSaving(): void {
  if (state.status === "saving" && state.hasUnsavedChanges) return;
  emit({ ...state, status: "saving", message: null, hasUnsavedChanges: true });
}

export function reportSaved(at: string): void {
  emit({ status: "saved", message: null, lastSavedAt: at, hasUnsavedChanges: false });
}

export function reportSaveFailure(error: unknown): void {
  emit({
    ...state,
    status: "error",
    message: describeFailure(error),
    hasUnsavedChanges: true,
  });
}

/** Back to square one after the student clears or replaces everything. */
export function reportCleared(): void {
  emit({ status: "idle", message: null, lastSavedAt: null, hasUnsavedChanges: false });
}

function describeFailure(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  const raw = error instanceof Error ? error.message : String(error ?? "");
  if (name === "QuotaExceededError" || /quota/i.test(raw)) {
    return "This device is out of storage space. Export a backup from Settings, then free up space.";
  }
  if (name === "SecurityError" || /permission|denied|not allowed/i.test(raw)) {
    return "This browser is not allowing local storage. Check private browsing settings.";
  }
  return raw ? `Could not save to this device: ${raw}` : "Could not save to this device.";
}

/** Retry the last failed write. Wired up by the persistence layer. */
let retryAction: (() => void) | null = null;

export function setPersistenceRetry(action: (() => void) | null): void {
  retryAction = action;
}

export function canRetry(): boolean {
  return retryAction !== null && state.status === "error";
}

export function retryPersistence(): void {
  retryAction?.();
}
