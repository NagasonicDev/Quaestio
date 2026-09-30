import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BellOff, Clock, Download, HardDrive, RotateCcw } from "lucide-react";
import { api } from "../api/client";
import type { ReviewPolicy } from "../api/types";
import { DEFAULT_REVIEW_POLICY, formatSqlUtc, normalizePolicy } from "../lib/reviewSchedule";
import { Panel, PanelHead } from "./system";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Switch } from "./ui/switch";

const PAUSE_OPTIONS = [
  { label: "a day", days: 1 },
  { label: "a week", days: 7 },
  { label: "a month", days: 30 },
];

/**
 * The knobs behind the learning loop, in one place: the intervals, the queue
 * snooze, and what the app is allowed to keep about a practice attempt. The
 * intervals are deliberately editable — a schedule the student cannot see or
 * change is a schedule they have to take on trust.
 */
export function StudySettings({ courseId }: { courseId: string | null }) {
  return (
    <div className="space-y-5">
      <ReviewIntervals />
      <QueuePause courseId={courseId} />
      <CaptureSettings />
      <LocalData />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Intervals                                                           */
/* ------------------------------------------------------------------ */

function ReviewIntervals() {
  const queryClient = useQueryClient();
  const { data: stored } = useQuery({ queryKey: ["review-policy"], queryFn: api.getReviewPolicy });
  const [ladder, setLadder] = useState<number[] | null>(null);
  const [againMinutes, setAgainMinutes] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!stored) return;
    setLadder([...stored.ladder.slice(1)]);
    setAgainMinutes(stored.againMinutes);
  }, [stored]);

  const save = useMutation({
    mutationFn: (policy: ReviewPolicy) => api.setReviewPolicy(policy),
    onSuccess: async () => {
      setSaved(true);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["review-policy"] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Could not save the intervals."),
  });

  if (!stored || !ladder || againMinutes == null) {
    return (
      <Panel>
        <PanelHead title="Review intervals" />
        <p className="px-5 py-4 text-sm text-muted-foreground">Loading the current intervals…</p>
      </Panel>
    );
  }

  const submit = () =>
    save.mutate(normalizePolicy({ ladder: [0, ...ladder], againMinutes }));

  return (
    <Panel>
      <PanelHead
        title="Review intervals"
        note="How long the app waits before a question comes back. Each step is the wait after one more successful review."
      />
      <div className="space-y-4 p-5">
        <div>
          <p className="label">Interval ladder (days)</p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            {ladder.map((days, index) => (
              <div key={index} className="flex flex-col items-center gap-1">
                <span className="font-mono text-[10px] text-muted-foreground">#{index + 1}</span>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  aria-label={`Days between reviews at step ${index + 1}`}
                  className="w-20 text-center"
                  value={days}
                  onChange={(e) => {
                    setSaved(false);
                    setLadder((prev) =>
                      (prev ?? []).map((value, i) => (i === index ? Number(e.target.value) : value))
                    );
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="max-w-xs">
          <label className="label" htmlFor="again-minutes">
            Minutes before an &ldquo;again&rdquo; comes back
          </label>
          <Input
            id="again-minutes"
            type="number"
            min={1}
            step={1}
            className="mt-2 w-32"
            value={againMinutes}
            onChange={(e) => {
              setSaved(false);
              setAgainMinutes(Number(e.target.value));
            }}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          &ldquo;Got it&rdquo; moves a question one step along the ladder, &ldquo;Easy&rdquo; moves it two, and
          &ldquo;Hard&rdquo; or &ldquo;Not sure&rdquo; keeps it where it is. &ldquo;Again&rdquo; restarts the ladder and
          brings the question back in the minutes set above. Changes apply from the next review
          onwards; dates already scheduled are left alone.
        </p>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {saved && !error && (
          <p role="status" className="text-sm text-success">
            Saved on this device.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={submit} disabled={save.isPending}>
            Save intervals
          </Button>
          <Button
            variant="outline"
            disabled={save.isPending}
            onClick={() => {
              setLadder([...DEFAULT_REVIEW_POLICY.ladder.slice(1)]);
              setAgainMinutes(DEFAULT_REVIEW_POLICY.againMinutes);
              setSaved(false);
            }}
          >
            <RotateCcw /> Restore the default ladder
          </Button>
        </div>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Queue pause                                                         */
/* ------------------------------------------------------------------ */

function QueuePause({ courseId }: { courseId: string | null }) {
  const queryClient = useQueryClient();
  const { data: queue } = useQuery({
    queryKey: ["due-queue", courseId, 5],
    queryFn: () => api.dueQueue(courseId as string, 5),
    enabled: !!courseId,
  });

  const write = useMutation({
    mutationFn: (pausedUntil: string | null) => api.setQueuePause(pausedUntil),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["due-queue"] });
      await queryClient.invalidateQueries({ queryKey: ["study-progress"] });
    },
  });

  return (
    <Panel>
      <PanelHead
        title="Review queue"
        note="Snoozing hides the queue from the dashboard. It does not move any dates and it does not forget anything."
      />
      <div className="space-y-3 p-5">
        {queue?.paused ? (
          <>
            <p className="text-sm">
              Paused until <span className="font-mono">{queue.paused_until?.slice(0, 10)}</span>.{" "}
              {queue.due_count > 0
                ? `${queue.due_count} question${queue.due_count === 1 ? " is" : "s are"} due and waiting.`
                : "Nothing is due yet."}
            </p>
            <Button size="sm" variant="outline" onClick={() => write.mutate(null)}>
              <RotateCcw /> Resume the queue
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              The queue is running. Pausing it for a while is fine if you are busy — the review dates
              stay exactly as they are and the questions pick up where they left off.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <BellOff className="size-3.5" /> Pause for
              </span>
              {PAUSE_OPTIONS.map((option) => (
                <Button
                  key={option.days}
                  size="sm"
                  variant="outline"
                  disabled={write.isPending}
                  onClick={() => write.mutate(formatSqlUtc(Date.now() + option.days * 86400000))}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* What practice keeps                                                 */
/* ------------------------------------------------------------------ */

function CaptureSettings() {
  const queryClient = useQueryClient();
  const { data: capture } = useQuery({
    queryKey: ["practice-response-capture"],
    queryFn: api.getResponseCapture,
  });
  const { data: timer } = useQuery({ queryKey: ["practice-timer"], queryFn: api.getTimerEnabled });

  const write = useMutation({
    mutationFn: async (value: { capture?: "on" | "off"; timer?: boolean }) => {
      if (value.capture) await api.setResponseCapture(value.capture);
      if (value.timer != null) await api.setTimerEnabled(value.timer);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["practice-response-capture"] });
      await queryClient.invalidateQueries({ queryKey: ["practice-timer"] });
    },
  });

  return (
    <Panel>
      <PanelHead
        title="During practice"
        note="What the app is allowed to keep about an attempt. Both of these stay on this device."
      />
      <div className="divide-y divide-border">
        <div className="flex items-start justify-between gap-4 p-5">
          <div>
            <p className="font-medium">Keep the answers I type</p>
            <p className="mt-1 text-sm text-muted-foreground">
              When this is on, the text you type for a free-response question is stored with that
              attempt so you can read it back. Turn it off to keep only that you attempted the
              question. Typed answers are left out of exports unless you ask for them.
            </p>
          </div>
          <Switch
            checked={capture !== "off"}
            disabled={write.isPending}
            onCheckedChange={(checked) => write.mutate({ capture: checked ? "on" : "off" })}
            aria-label="Keep the answers I type"
          />
        </div>
        <div className="flex items-start justify-between gap-4 p-5">
          <div>
            <p className="flex items-center gap-1.5 font-medium">
              <Clock className="size-4" /> Show a timer while I answer
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Off by default. The timer only records how long you spent, and speed is never treated as
              evidence that you know something — nothing about your result changes with it.
            </p>
          </div>
          <Switch
            checked={timer === true}
            disabled={write.isPending}
            onCheckedChange={(checked) => write.mutate({ timer: checked })}
            aria-label="Show a timer while I answer"
          />
        </div>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Local data and backups                                              */
/* ------------------------------------------------------------------ */

function LocalData() {
  return (
    <Panel>
      <PanelHead
        title="Your data on this device"
        note="Quaestio has no account and no server. Everything below is stored by this browser, on this device only."
      />
      <div className="space-y-3 p-5 text-sm text-muted-foreground">
        <p className="flex items-start gap-2">
          <HardDrive className="mt-0.5 size-4 shrink-0" />
          <span>
            The header shows <span className="text-foreground">Saving…</span> or{" "}
            <span className="text-foreground">Saved on this device</span> as changes are written. If a
            save fails — usually because the browser is out of space or is blocking storage in private
            browsing — the banner tells you and offers a retry.
          </span>
        </p>
        <p className="flex items-start gap-2">
          <Download className="mt-0.5 size-4 shrink-0" />
          <span>
            That is the only copy. There is no automatic backup, and clearing this browser&rsquo;s site
            data deletes it. Export a{" "}
            <Link className="text-primary underline-offset-4 hover:underline" to="/course-settings">
              course backup
            </Link>{" "}
            from the course page whenever you want one; the questions-only export is smaller but leaves
            your review schedule behind.
          </span>
        </p>
      </div>
    </Panel>
  );
}
