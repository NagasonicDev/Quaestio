import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Check, Circle } from "lucide-react";
import { api } from "../api/client";
import { useActiveCourse } from "../hooks/useActiveCourse";
import { useCourseConfig } from "../hooks/useCourseConfig";
import { Button } from "./ui/button";
import { Panel } from "./system";

type Step = {
  key: string;
  title: string;
  detail: string;
  done: boolean;
  /** Shown while this is the first step still outstanding. */
  action?: { label: string; to: string };
};

/**
 * Setup progress for a brand new course. Deliberately short, and deliberately
 * forgiving: the copy never implies a large bank is required, because one
 * question is a legitimate place to start and the app should not make a student
 * feel short of content before they have seen any.
 */
export function SetupProgress({ courseId }: { courseId?: string | null }) {
  const { courseId: activeCourseId } = useActiveCourse();
  const id = courseId ?? activeCourseId;
  const { data: config } = useCourseConfig(id);
  const { data: counts } = useQuery({
    queryKey: ["question-counts", id],
    queryFn: () => api.questionCounts(id as string),
    enabled: !!id,
  });
  const { data: progress } = useQuery({
    queryKey: ["study-progress", id],
    queryFn: () => api.studyProgress(id as string),
    enabled: !!id,
  });

  const total = counts?.total ?? 0;
  const hasTopics = (config?.nodes.length ?? 0) > 0;
  const hasPractised = (progress?.ever_seen ?? 0) > 0;

  const steps: Step[] = [
    {
      key: "questions",
      title: "Add questions",
      detail:
        total === 0
          ? "Import a question file, or write a question yourself. One or two is enough to start."
          : `${total} question${total === 1 ? "" : "s"} in the bank.`,
      done: total > 0,
      action: { label: "Import questions", to: "/import" },
    },
    {
      key: "topics",
      title: "Name your topics",
      detail: hasTopics
        ? "Topics are what practice filters and progress summaries are built from."
        : "Add a few topics so you can practise one thing at a time.",
      done: hasTopics,
      action: { label: "Edit topics", to: "/course-settings" },
    },
    {
      key: "practise",
      title: "Practise a question",
      detail: hasPractised
        ? "You have started. Review dates are set as you go."
        : "Answer one question and it joins your review schedule.",
      done: hasPractised,
      action: { label: "Open practice", to: "/practice" },
    },
  ];

  const nextStep = steps.find((step) => !step.done);

  return (
    <Panel className="p-5">
      <h2 className="font-display text-lg font-semibold">Set up this course</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Three steps, in the order that tends to work. Stop after any of them &mdash; nothing
        here is locked until the next one.
      </p>
      <ol className="mt-4 space-y-2.5">
        {steps.map((step) => {
          const isNext = nextStep?.key === step.key;
          return (
            <li
              key={step.key}
              className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2.5 ${
                isNext ? "border-accent-foreground/40 bg-accent-foreground/5" : "border-border"
              }`}
            >
              {step.done ? (
                <Check className="size-4 shrink-0 text-success" aria-hidden="true" />
              ) : (
                <Circle className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              )}
              <span className="min-w-0 flex-1">
                <span className={`text-sm ${step.done ? "text-muted-foreground line-through" : "font-medium"}`}>
                  {step.title}
                </span>
                <span className="block text-xs text-muted-foreground">{step.detail}</span>
              </span>
              {isNext && step.action && (
                <Button asChild size="sm" variant="outline" className="shrink-0">
                  <Link to={step.action.to}>{step.action.label}</Link>
                </Button>
              )}
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
