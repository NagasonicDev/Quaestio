import { useEffect, useState, useSyncExternalStore } from "react";
import { AlertTriangle, Check, CloudOff, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import {
  canRetry,
  persistenceSnapshot,
  retryPersistence,
  subscribePersistence,
  type SaveState,
} from "../lib/db/persistenceStatus";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";

/**
 * A single honest line about local storage: what is happening right now, and
 * what to do if it is not working.
 *
 * There is deliberately no cloud icon and no word like "synced". Everything is
 * stored in this browser on this device, and the only way it survives is an
 * export the student keeps.
 */
export function SaveStatusIndicator() {
  const snapshot = useSyncExternalStore(
    subscribePersistence,
    persistenceSnapshot,
    persistenceSnapshot
  ) as SaveState;

  if (snapshot.status === "idle") return null;

  if (snapshot.status === "error") {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2"
      >
        <CloudOff className="size-4 shrink-0 text-destructive" aria-hidden="true" />
        <span className="text-xs text-destructive">{snapshot.message}</span>
        {canRetry() && (
          <Button size="sm" variant="outline" onClick={retryPersistence}>
            <RefreshCw />
            Try again
          </Button>
        )}
        <Button size="sm" variant="ghost" asChild>
          <Link to="/settings">Settings</Link>
        </Button>
      </div>
    );
  }

  return (
    <p
      aria-live="polite"
      className={cn(
        "font-mono text-[10px] uppercase tracking-wider",
        snapshot.status === "saving" ? "text-muted-foreground" : "text-success"
      )}
    >
      {snapshot.status === "saving" ? (
        "Saving…"
      ) : (
        <span className="inline-flex items-center gap-1">
          <Check className="size-3" aria-hidden="true" />
          Saved on this device
        </span>
      )}
    </p>
  );
}

/**
 * A dismissible banner for a failed write. Separate from the header indicator
 * because a failed save is not a status, it is something the student has to act
 * on before the work is gone.
 */
export function SaveFailureBanner() {
  const snapshot = useSyncExternalStore(
    subscribePersistence,
    persistenceSnapshot,
    persistenceSnapshot
  ) as SaveState;
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);

  const failureKey = snapshot.status === "error" ? snapshot.message : null;
  useEffect(() => {
    setDismissedFor(null);
  }, [failureKey]);

  if (!failureKey || dismissedFor === failureKey) return null;

  return (
    <div
      role="alert"
      className="border-b border-destructive/30 bg-destructive/10 px-4 py-3 sm:px-5"
    >
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-3 gap-y-2">
        <AlertTriangle className="size-4 shrink-0 text-destructive" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm text-destructive">
          {snapshot.message} Your latest changes are still in this tab, but they are not on this
          device yet.
        </p>
        {canRetry() && (
          <Button size="sm" variant="outline" onClick={retryPersistence}>
            <RefreshCw />
            Try saving again
          </Button>
        )}
        <Button size="sm" variant="outline" asChild>
          <Link to="/settings">Export a backup</Link>
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setDismissedFor(failureKey)}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}
