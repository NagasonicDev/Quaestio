import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { FlaskConical, RotateCcw, Trash2 } from "lucide-react";
import { api } from "../api/client";
import { useActiveCourse } from "../hooks/useActiveCourse";
import { Button } from "./ui/button";
import { useConfirm } from "./ui/modal";

/**
 * Shown while the active course is the optional starter one. It has to be
 * impossible to mistake for the student's own work, and removing it has to be
 * obvious, so the sample flag is surfaced here with both a reset and a remove
 * that name exactly what they do.
 */
export function SampleCourseNotice({ courseId }: { courseId: string }) {
  const { data: courses } = useQuery({ queryKey: ["courses"], queryFn: api.listCourses });
  const course = courses?.find((c) => c.course_id === courseId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();
  const { setCourseId } = useActiveCourse();
  const confirm = useConfirm();

  if (!course?.is_sample) return null;

  async function startAgain() {
    setBusy(true);
    setError(null);
    try {
      await api.resetCourseProgress(courseId);
      await qc.invalidateQueries();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not clear the practice history.");
    } finally {
      setBusy(false);
    }
  }

  async function removeSample() {
    const ok = await confirm({
      title: "Remove the sample course?",
      description:
        "This deletes the sample questions and the practice history that goes with them. Your own courses and anything you imported are not touched.",
      confirmLabel: "Remove the sample course",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteCourse(courseId);
      const remaining = await api.listCourses();
      await qc.invalidateQueries({ queryKey: ["courses"] });
      setCourseId(remaining[0]?.course_id ?? null);
      if (!remaining.length) {
        await qc.invalidateQueries();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove the sample course.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel border-dashed p-5">
      <div className="flex flex-wrap items-start gap-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
          <FlaskConical className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="label">Sample course</p>
          <h2 className="mt-1 font-display text-lg font-semibold">This is a throwaway example</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Four example questions to try the practice flow on. It is a separate course, so nothing
            here mixes with your own work &mdash; practise a few, then remove it whenever you are
            ready.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" asChild>
              <Link to="/practice">Practise a question</Link>
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={startAgain}>
              <RotateCcw /> Start the sample again
            </Button>
            <Button size="sm" variant="destructive" disabled={busy} onClick={removeSample}>
              <Trash2 /> Remove the sample course
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            &ldquo;Start the sample again&rdquo; clears its practice history and review schedule but
            keeps the questions.
          </p>
          {error && (
            <p role="alert" className="mt-2 text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
