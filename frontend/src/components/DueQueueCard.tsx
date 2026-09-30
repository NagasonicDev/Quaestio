import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BellOff, Clock, Info, Play, RotateCcw } from "lucide-react";
import { api } from "../api/client";
import type { DueQueue } from "../api/types";
import { formatQuestionType } from "../lib/questionTypes";
import { Button } from "./ui/button";
import { Meta, Panel } from "./system";

/** "Roughly N minutes" — an effort estimate, never a prediction of a result. */
function sessionSizeNote(queue: DueQueue): string {
  if (queue.due_count === 0) return "";
  if (queue.due_count <= queue.items.length) {
    return `about ${queue.estimated_minutes} minute${queue.estimated_minutes === 1 ? "" : "s"}`;
  }
  const shown = queue.items.length;
  return `${shown} of ${queue.due_count} in this sitting, about ${queue.estimated_minutes} minute${queue.estimated_minutes === 1 ? "" : "s"}`;
}

function useDueQueue(courseId: string | null, limit = 5) {
  return useQuery({
    queryKey: ["due-queue", courseId, limit],
    queryFn: () => api.dueQueue(courseId as string, limit),
    enabled: !!courseId,
  });
}

/**
 * The review queue, in the two places a student actually needs it: the
 * dashboard, to know whether anything is waiting, and the practice page, to
 * start it. Every item says why it is appearing, because a question that turns
 * up with no explanation is indistinguishable from a bug.
 */
export function DueQueueCard({
  courseId,
  onStart,
  compact,
}: {
  courseId: string | null;
  onStart?: () => void;
  compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const [showWhy, setShowWhy] = useState(false);
  const { data: queue, isLoading } = useDueQueue(courseId, compact ? 3 : 5);

  const pause = useMutation({
    mutationFn: () => api.setQueuePause(null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["due-queue"] }),
  });

  if (isLoading || !queue) return null;

  if (queue.due_count === 0) {
    return (
      <Panel className="p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">Review queue</h2>
          <Link className="text-xs text-primary underline-offset-4 hover:underline" to="/practice?mode=focused">
            Practise something instead
          </Link>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {queue.paused
            ? "The queue is paused. Resume it when you want these questions to come back."
            : "Nothing is due for review. Questions appear here after you finish one, based on how your answer went."}
        </p>
        {queue.paused && (
          <Button className="mt-3" variant="outline" size="sm" onClick={() => pause.mutate()}>
            <RotateCcw />
            Resume the queue
          </Button>
        )}
      </Panel>
    );
  }

  return (
    <Panel className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">
          {queue.due_count} question{queue.due_count === 1 ? "" : "s"} due for review
        </h2>
        <span className="inline-flex items-center gap-1 font-mono text-[11px] uppercase text-muted-foreground">
          <Clock className="size-3.5" />
          {sessionSizeNote(queue)}
        </span>
      </div>
      {queue.paused && (
        <p className="mt-2 rounded-md bg-secondary px-3 py-2 text-sm">
          Paused until {queue.paused_until?.slice(0, 10)}. Nothing is lost — the dates stay
          as they are.{" "}
          <button className="underline underline-offset-4" onClick={() => pause.mutate()}>
            Resume now
          </button>
        </p>
      )}

      <ul className="mt-3 space-y-2">
        {queue.items.map((item) => (
          <li key={item.question_id} className="rounded-md border border-border px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <Meta>{formatQuestionType(item.type_key)}</Meta>
              <span className="min-w-0 flex-1 truncate text-sm">{item.snippet}</span>
            </div>
            {(showWhy || compact) && (
              <p className="mt-1 text-xs text-muted-foreground">{item.reason_text}</p>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {onStart ? (
          <Button onClick={onStart}>
            <Play />
            Start reviewing
          </Button>
        ) : (
          <Link
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
            to="/practice?mode=due_review"
          >
            <Play />
            Start reviewing
          </Link>
        )}
        <Button variant="ghost" size="sm" onClick={() => setShowWhy((v) => !v)} aria-expanded={showWhy}>
          <Info />
          {showWhy ? "Hide" : "Why these?"}
        </Button>
        {!queue.paused && (
          <Button
            variant="ghost"
            size="sm"
            title="Pause the queue for a week. Nothing you have reviewed is lost."
            onClick={() =>
              api
                .setQueuePause(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 19).replace("T", " "))
                .then(() => queryClient.invalidateQueries({ queryKey: ["due-queue"] }))
            }
          >
            <BellOff />
            Pause a week
          </Button>
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        A question is only reviewed once you have finished it, so nothing moves in the
        schedule until you say how it went.
      </p>
    </Panel>
  );
}

export { useDueQueue };
