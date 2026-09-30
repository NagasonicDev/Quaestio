import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRight, Eye, History, ListPlus, Repeat } from "lucide-react";
import { api } from "../api/client";
import type { DifficultyCue, StudyProgress, TopicProgress } from "../api/types";
import { formatQuestionType } from "../lib/questionTypes";
import { MIN_EVIDENCE, STANDING_LABEL, describeRecency } from "../lib/studyProgress";
import { SELF_RATING_LABEL, isSelfRating } from "../lib/reviewSchedule";
import { Button } from "./ui/button";
import { LoadingState, Meta, Panel, PanelHead, Stat } from "./system";

/**
 * The study half of the dashboard: what has been reviewed, what is due, where
 * the practice has been thin, and exactly one thing to do next.
 *
 * Two rules run through this whole view. Nothing is called "mastered" or "weak",
 * because a handful of attempts cannot support either claim. And anything the
 * app infers shows its working: sample sizes are printed, self-marked answers
 * are labelled as self-marked, and topics with too little evidence say so
 * instead of showing a verdict.
 */
export function StudyOverview({ courseId }: { courseId: string }) {
  const { data: progress, isLoading } = useQuery({
    queryKey: ["study-progress", courseId],
    queryFn: () => api.studyProgress(courseId),
  });

  if (isLoading || !progress) return <LoadingState label="Gathering your study history…" />;
  if (progress.total_questions === 0) return null;

  return (
    <div className="space-y-4">
      <NextActionCard progress={progress} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat title="Due for review">
          <p className="font-display text-4xl font-semibold">{progress.due_now}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {progress.due_now === 0
              ? "nothing waiting"
              : progress.queue_paused_until
                ? `queue paused until ${progress.queue_paused_until.slice(0, 10)}`
                : "ready when you are"}
          </p>
        </Stat>
        <Stat title="Reviewed this week">
          <p className="font-display text-4xl font-semibold">{progress.reviewed_last_7_days}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {progress.reviewed} of {progress.total_questions} questions reviewed in total
          </p>
        </Stat>
        <Stat title="Attempted">
          <p className="font-display text-4xl font-semibold">{progress.attempted}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {progress.ever_seen} opened at least once
          </p>
        </Stat>
        <Stat title="How answers were marked">
          <p className="font-display text-2xl font-semibold leading-tight">{progress.marking_mix_note}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Only the app-marked ones can be checked automatically.
          </p>
        </Stat>
      </div>

      <TopicActivity topics={progress.topics} />
      <RepeatedDifficulty cues={progress.repeated_difficulty} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The one recommendation                                             */
/* ------------------------------------------------------------------ */

function NextActionCard({ progress }: { progress: StudyProgress }) {
  const action = progress.next_action;
  const to =
    action.kind === "add_questions"
      ? "/import"
      : action.kind === "due_review"
        ? "/practice?mode=due_review"
        : action.kind === "practise_topic"
          ? `/practice?node_id=${action.node_id}`
          : "/practice?mode=mixed";

  return (
    <Panel className="border-l-[3px] border-l-accent-foreground p-5">
      <p className="label mb-1.5">Recommended next step</p>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-semibold leading-tight">{action.title}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{action.detail}</p>
        </div>
        <Button asChild className="shrink-0">
          <Link to={to}>
            {action.kind === "due_review" ? <Repeat /> : action.kind === "add_questions" ? <ListPlus /> : <ArrowRight />}
            Start
          </Link>
        </Button>
      </div>
      <p className="mt-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        One suggestion at a time. The other options stay on the practice page.
      </p>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Topic coverage                                                      */
/* ------------------------------------------------------------------ */

function TopicActivity({ topics }: { topics: TopicProgress[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = useMemo(
    () => (showAll ? topics : topics.slice(0, 8)),
    [topics, showAll]
  );

  if (topics.length === 0) return null;

  return (
    <Panel>
      <PanelHead
        title="Practice coverage by topic"
        note={`Attempts and recency per topic. A standing is only shown once a topic has at least ${MIN_EVIDENCE} reviews.`}
        action={
          topics.length > 8 ? (
            <Button size="sm" variant="ghost" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
              <Eye />
              {showAll ? "Show fewer" : `Show all ${topics.length}`}
            </Button>
          ) : undefined
        }
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th scope="col" className="label px-5 py-2 font-normal">Topic</th>
              <th scope="col" className="label px-3 py-2 text-right font-normal">Questions</th>
              <th scope="col" className="label px-3 py-2 text-right font-normal">Attempted</th>
              <th scope="col" className="label px-3 py-2 text-right font-normal">Reviewed</th>
              <th scope="col" className="label px-3 py-2 text-right font-normal">Due now</th>
              <th scope="col" className="label px-3 py-2 font-normal">Last review</th>
              <th scope="col" className="label px-5 py-2 font-normal">Standing</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((topic) => (
              <tr key={topic.node_id} className="border-b border-border/60 last:border-0">
                <th scope="row" className="px-5 py-2.5 text-left font-normal">
                  <Link
                    to={`/practice?node_id=${topic.node_id}`}
                    className="underline-offset-4 hover:underline"
                    title={`Practise ${topic.name}`}
                    style={{ paddingLeft: `${topic.level_index * 14}px` }}
                  >
                    {topic.name}
                  </Link>
                </th>
                <td className="px-3 py-2.5 text-right font-mono text-xs">{topic.subtree_questions}</td>
                <td className="px-3 py-2.5 text-right font-mono text-xs">
                  {topic.seen === 0 ? <span className="text-muted-foreground">—</span> : `${topic.attempted} of ${topic.questions}`}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-xs">
                  {topic.reviewed === 0 ? <span className="text-muted-foreground">—</span> : topic.reviewed}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-xs">
                  {topic.subtree_due_now > 0 ? <span className="text-accent-foreground">{topic.subtree_due_now}</span> : "—"}
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">{describeRecency(topic.days_since_review)}</td>
                <td className="px-5 py-2.5 text-xs">
                  {topic.standing ? (
                    <span className={topic.standing === "needs_another_review" ? "text-accent-foreground" : "text-muted-foreground"}>
                      {STANDING_LABEL[topic.standing]}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">{topic.evidence_note}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
        &ldquo;Needs another review&rdquo; means a third or more of this topic&rsquo;s questions are due again,
        or most reviews there ended with a self-rated &ldquo;again&rdquo; or &ldquo;hard&rdquo;. It is a prompt
        to look again, not a judgement about ability. Anything below {MIN_EVIDENCE} reviews shows its
        evidence instead of a standing.
      </p>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Repeated difficulty                                                 */
/* ------------------------------------------------------------------ */

function RepeatedDifficulty({ cues }: { cues: DifficultyCue[] }) {
  if (cues.length === 0) return null;
  return (
    <Panel>
      <PanelHead
        title="Marked difficult more than once"
        note="These came back hard or again at least twice. Open one to see the attempts behind that."
      />
      <ul className="divide-y divide-border">
        {cues.map((cue) => (
          <li key={cue.question_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
            <span className="min-w-0 flex-1 truncate text-sm">{cue.snippet}</span>
            <Meta>{formatQuestionType(cue.type_key)}</Meta>
            <Meta>
              {cue.hard_or_again} hard or again · {cue.lapses} again
              {isSelfRating(cue.last_rating) ? ` · last rated ${SELF_RATING_LABEL[cue.last_rating]}` : ""}
            </Meta>
            <Link
              to={`/questions/${cue.question_id}`}
              className="inline-flex items-center gap-1 font-mono text-[11px] uppercase text-primary underline-offset-4 hover:underline"
            >
              <History className="size-3.5" />
              attempts
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
