import { CircleCheck, Filter, RotateCcw, Repeat } from "lucide-react";
import type { PracticePoolCounts, PracticeSessionSummary } from "../api/types";
import { Button } from "./ui/button";
import { Panel } from "./system";

/**
 * Two different dead ends, kept apart on purpose.
 *
 * "Nothing matches your filters" is a problem with the filters. "You have
 * practised all of these" is a successful session, and the copy says so instead
 * of implying the student did something wrong. Merging the two is what made the
 * old empty state read as a failure.
 */
export function SessionExhausted({
  pool,
  session,
  onRepeat,
  onResetSession,
  onBroaden,
  onResetFilters,
}: {
  pool: PracticePoolCounts;
  session: PracticeSessionSummary | null;
  onRepeat: () => void;
  onResetSession: () => void;
  onBroaden: () => void;
  onResetFilters: () => void;
}) {
  if (pool.filter_match_count === 0) {
    return (
      <Panel className="p-6 text-center">
        <h2 className="font-display text-lg font-semibold">No questions match these filters</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Nothing in this course matches everything you have selected at once. Filters
          narrow, so more of them means fewer matches — try removing one.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button variant="outline" onClick={onResetFilters}>
            <Filter />
            Clear filters
          </Button>
        </div>
      </Panel>
    );
  }

  const practised = pool.excluded_seen_count;
  const done = session ? session.planned_count : practised;
  return (
    <Panel className="p-6 text-center">
      <div className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-secondary text-primary">
        <CircleCheck className="size-5" />
      </div>
      <h2 className="font-display text-xl font-semibold">
        You have practised all {done} matching question{done === 1 ? "" : "s"}
        {session ? " in this session" : ""}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        That is {pool.filter_match_count} question{pool.filter_match_count === 1 ? "" : "s"} in
        total under these filters, and none are left unused.
        {pool.recently_excluded_count > 0 && (
          <>
            {" "}
            A further {pool.recently_excluded_count} were held back because you have
            attempted them recently.
          </>
        )}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button onClick={onRepeat}>
          <Repeat />
          Repeat these questions
        </Button>
        {session && (
          <Button variant="outline" onClick={onResetSession}>
            <RotateCcw />
            Reset this session
          </Button>
        )}
        <Button variant="outline" onClick={onBroaden}>
          <Filter />
          Broaden filters
        </Button>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Resetting the session clears which questions have been shown. Everything you
        have already reviewed, and the dates it set, stays exactly as it is.
      </p>
    </Panel>
  );
}
