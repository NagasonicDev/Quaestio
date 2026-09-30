import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { api } from "../api/client";
import { formatQuestionType } from "../lib/questionTypes";
import { attemptRank, attemptStatusLabel } from "../lib/reviewSchedule";
import { useActiveCourse } from "../hooks/useActiveCourse";
import { cn } from "../lib/utils";
import { MathText } from "./MathText";

/**
 * Recent activity, in two shapes.
 *
 * On a wide screen it is a rail beside the page. Below that it moves under the
 * main content as a collapsed drawer, because a question list that squeezes the
 * working area is worse than one that takes a second tap to open.
 *
 * The status label is deliberately three-valued. "Seen" means the question was
 * shown, "Attempted" means an answer was committed, and "Reviewed" means it went
 * through the feedback step. Collapsing those into one word would claim effort
 * that never happened.
 */
export function RecentQuestionsSidebar({ variant }: { variant: "rail" | "inline" }) {
  const { courseId } = useActiveCourse();
  const [open, setOpen] = useState(false);

  // Refreshed by invalidation whenever something is attempted or reviewed, so
  // there is no polling timer burning time in the background.
  const { data: recent } = useQuery({
    queryKey: ["recent-questions", courseId],
    queryFn: () => api.recentQuestions(courseId as string, 12),
    enabled: !!courseId,
  });

  const body = (
    <>
      {!courseId && (
        <p className="px-1 text-xs text-muted-foreground">Select a course to see activity.</p>
      )}
      {courseId && (!recent || recent.length === 0) && (
        <p className="px-1 text-xs text-muted-foreground">
          Nothing yet &mdash; questions you practise or open will show up here.
        </p>
      )}

      <div className="space-y-1">
        {recent?.map((item) => {
          const label = attemptStatusLabel(item.status);
          const done = attemptRank(label) >= attemptRank("reviewed");
          return (
            <Link
              key={item.question_id}
              to={`/questions/${item.question_id}`}
              className="block rounded-md p-2.5 transition hover:bg-surface"
            >
              <div className="mb-1 flex items-center gap-2">
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    done ? "bg-success" : "bg-muted-foreground/40"
                  )}
                  aria-hidden="true"
                />
                <span
                  className={cn(
                    "font-mono text-[10px] uppercase",
                    done ? "text-success" : "text-muted-foreground"
                  )}
                >
                  {label}
                </span>
                <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                  {formatQuestionType(item.type_key)}
                </span>
              </div>
              <p className="line-clamp-2 text-[12px] leading-snug text-foreground">
                {item.snippet ? <MathText text={item.snippet} /> : "(no text)"}
              </p>
            </Link>
          );
        })}
      </div>
    </>
  );

  if (variant === "rail") {
    return (
      <aside className="hidden lg:block">
        <div className="sticky top-[76px] panel p-3.5">
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="label">Recent activity</h2>
            <span className="font-mono text-[10px] text-muted-foreground">{recent?.length ?? 0}</span>
          </div>
          {body}
        </div>
      </aside>
    );
  }

  return (
    <aside className="mt-8 lg:hidden">
      <div className="panel p-3.5">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 rounded px-1 py-1 text-left"
          aria-expanded={open}
          aria-controls="recent-activity-inline"
          onClick={() => setOpen((value) => !value)}
        >
          <span className="label">Recent activity</span>
          <span className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-muted-foreground">{recent?.length ?? 0}</span>
            <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
          </span>
        </button>
        {open && <div id="recent-activity-inline" className="mt-2">{body}</div>}
      </div>
    </aside>
  );
}
