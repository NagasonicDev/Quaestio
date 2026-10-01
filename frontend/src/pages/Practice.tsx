import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Play, Shuffle } from "lucide-react";
import { api } from "../api/client";
import { useActiveCourse } from "../hooks/useActiveCourse";
import { useCourseConfig } from "../hooks/useCourseConfig";
import { flattenCounts } from "../components/NodeTree";
import type { PracticeFilters, Question, SelfRating, SessionMode } from "../api/types";
import { InkLoader, PageHeader, Panel } from "../components/system";
import { FilterMenu } from "../components/FilterMenu";
import { Button } from "../components/ui/button";
import { effectiveNodeFilterIds } from "../lib/nodeFilters";
import { useQuestionFilterCounts } from "../hooks/useQuestionFilterCounts";
import { PracticeFlow } from "../components/PracticeFlow";
import type { PracticeDraft, PracticeStage } from "../components/PracticeFlow";
import { SessionModePicker } from "../components/SessionModePicker";
import { SessionExhausted } from "../components/SessionExhausted";
import { DueQueueCard, useDueQueue } from "../components/DueQueueCard";
import { describeInterval } from "../lib/reviewSchedule";
import { notify } from "../lib/notifications";

function isSessionMode(value: string | null): value is SessionMode {
  return value === "focused" || value === "mixed" || value === "due_review";
}

export function Practice() {
  const { courseId } = useActiveCourse();
  const { data: config } = useCourseConfig(courseId);
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [mode, setMode] = useState<SessionMode>(
    isSessionMode(searchParams.get("mode")) ? (searchParams.get("mode") as SessionMode) : "focused"
  );
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(() => {
    const node = searchParams.get("node_id");
    return node ? new Set([node]) : new Set();
  });
  const [typeKeys, setTypeKeys] = useState<string[]>([]);
  const [difficulties, setDifficulties] = useState<number[]>([]);
  const [selectedTag, setSelectedTag] = useState("");
  const [institutionYears, setInstitutionYears] = useState<Record<string, number[]>>({});
  const { data: sourceOptions } = useQuery({
    queryKey: ["question-source-options", courseId],
    queryFn: () => api.questionSourceOptions(courseId as string),
    enabled: !!courseId,
  });
  const [avoidRecentDays, setAvoidRecentDays] = useState<number | null>(null);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [current, setCurrent] = useState<Question | null>(null);
  const [stage, setStage] = useState<PracticeStage>("prompt");
  const [planItem, setPlanItem] = useState<{ reason_text?: string; reason_kind?: string } | null>(null);
  const [sessionNote, setSessionNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const selectedNodeIds = useMemo(
    () => effectiveNodeFilterIds(config?.nodes ?? [], selectedNodes),
    [config?.nodes, selectedNodes]
  );
  const facetCounts = useQuestionFilterCounts(
    courseId, config?.nodes ?? [], selectedNodes, typeKeys, difficulties
  );
  const sourceFacetQuery = useQuery({
    queryKey: ["question-source-facet-counts", courseId, selectedNodeIds, typeKeys, difficulties, selectedTag],
    queryFn: () => api.questionSourceCounts(courseId as string, {
      node_ids: selectedNodeIds, type: typeKeys, difficulties, tag: selectedTag || undefined,
    }),
    enabled: !!courseId,
  });

  const { data: counts } = useQuery({
    queryKey: ["question-counts", courseId],
    queryFn: () => api.questionCounts(courseId as string),
    enabled: !!courseId,
  });
  const flatCounts = useMemo(() => (counts ? flattenCounts(counts.by_node) : {}), [counts]);
  const { data: queue } = useDueQueue(courseId, 5);
  const { data: captureResponse } = useQuery({
    queryKey: ["practice-response-capture"],
    queryFn: () => api.getResponseCapture(),
  });
  const { data: timerEnabled } = useQuery({
    queryKey: ["practice-timer"],
    queryFn: () => api.getTimerEnabled(),
  });

  const filters: PracticeFilters | null = useMemo(
    () =>
      courseId
        ? {
            course_id: courseId,
            node_ids: selectedNodeIds,
            type_key: typeKeys.length === 1 ? typeKeys[0] : null,
            difficulty_min: null,
            difficulty_max: null,
            tag: selectedTag || null,
            avoid_recent_days: avoidRecentDays,
            source_filters: Object.entries(institutionYears).map(([institution, years]) => ({
              institution,
              years,
            })),
          }
        : null,
    [courseId, selectedNodeIds, typeKeys, selectedTag, avoidRecentDays, institutionYears]
  );

  const { data: session } = useQuery({
    queryKey: ["practice-session", sessionId],
    queryFn: () => api.getPracticeSession(sessionId as string),
    enabled: !!sessionId,
  });

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["practice-session", sessionId] });
    queryClient.invalidateQueries({ queryKey: ["due-queue"] });
    queryClient.invalidateQueries({ queryKey: ["study-progress"] });
    queryClient.invalidateQueries({ queryKey: ["recent-questions", courseId] });
  }, [queryClient, sessionId, courseId]);

  // Deep link from the dashboard: /practice?node_id=... narrows the topic filter.
  const linkedNodeId = searchParams.get("node_id");
  useEffect(() => {
    if (linkedNodeId) setSelectedNodes(new Set([linkedNodeId]));
  }, [linkedNodeId]);

  // Changing the filters changes what a session means, so the old session is
  // put aside rather than silently continued under new rules.
  useEffect(() => {
    setSessionId(null);
    setCurrent(null);
    setStage("prompt");
    setPlanItem(null);
  }, [mode, filters?.node_ids, filters?.type_key, filters?.tag, filters?.avoid_recent_days, filters?.difficulty_min, filters?.difficulty_max, filters?.source_filters]);

  const start = useMutation({
    mutationFn: async (options: { mode: SessionMode; size?: number | null }) => {
      if (!courseId || !filters) throw new Error("No course selected");
      return api.startPracticeSession({
        course_id: courseId,
        mode: options.mode,
        filters,
        size: options.size ?? null,
      });
    },
    onSuccess: async (summary) => {
      setSessionId(summary.session_id);
      setSessionNote(null);
      setMode(summary.mode);
      setSearchParams(summary.mode === "due_review" ? { mode: "due_review" } : {}, { replace: true });
      await loadQuestion(summary.session_id, summary.next_question_id);
    },
  });

  const loadQuestion = useCallback(
    async (id: string, questionId: string | null) => {
      if (!questionId) {
        setCurrent(null);
        return;
      }
      setLoading(true);
      try {
        const question = await api.getQuestion(questionId);
        setCurrent(question);
        setStage("prompt");
        const summary = await api.getPracticeSession(id);
        const item = summary?.plan.find((p) => p.question_id === questionId) ?? null;
        setPlanItem(item ? { reason_text: item.reason_text, reason_kind: item.reason_kind } : null);
        // The session only counts a question as offered once it has been shown.
        await api
          .recordAttempt({ session_id: id, question_id: questionId, status: "seen" })
          .catch(() => {});
        queryClient.invalidateQueries({ queryKey: ["recent-questions", courseId] });
      } catch (e) {
        notify("Could not load question", "error", e instanceof Error ? e.message : "Could not load that question.");
        setCurrent(null);
      } finally {
        setLoading(false);
      }
    },
    [courseId, queryClient]
  );

  const resetSession = useMutation({
    mutationFn: (id: string) => api.resetPracticeSession(id),
    onSuccess: async (summary) => {
      invalidate();
      if (summary) await loadQuestion(summary.session_id, summary.next_question_id);
    },
  });

  const advance = useCallback(async () => {
    if (!sessionId) return;
    const summary = await api.getPracticeSession(sessionId);
    if (!summary) {
      setCurrent(null);
      return;
    }
    if (summary.remaining_count === 0) {
      await api.setSessionStatus(sessionId, "completed");
      setCurrent(null);
      setSessionNote(
        summary.planned_count === 0
          ? "Nothing was in that session."
          : `That is all ${summary.planned_count} question${summary.planned_count === 1 ? "" : "s"} in this session done.`
      );
      invalidate();
      return;
    }
    await loadQuestion(sessionId, summary.next_question_id);
  }, [sessionId, loadQuestion, invalidate]);

  const onConfirmAttempt = useCallback(
    async (draft: PracticeDraft) => {
      if (!current || !sessionId) return;
      const mcq = current.type_key === "multiple_choice";
      const graded = mcq && Boolean(current.mcq_options?.some((o) => o.is_correct));
      await api.recordAttempt({
        session_id: sessionId,
        question_id: current.question_id,
        status: mcq ? "attempted" : "attempted",
        response_text: draft.response_text || null,
        confidence: draft.confidence,
        hints_revealed: draft.hints_revealed,
        time_spent_sec: draft.elapsed_sec,
        // Only an answer key the app trusts can produce a correctness flag.
        correct: graded ? draft.selected_choice === currentLetter(current) : null,
        scored_by: graded ? "objective" : null,
      });
      setStage(mcq ? "feedback" : "attempted");
      invalidate();
    },
    [current, sessionId, invalidate]
  );

  const onReveal = useCallback(
    async (draft: PracticeDraft) => {
      if (!current || !sessionId) return;
      await api.recordAttempt({
        session_id: sessionId,
        question_id: current.question_id,
        status: "revealed",
        response_text: draft.response_text || null,
        confidence: draft.confidence,
        hints_revealed: draft.hints_revealed,
        time_spent_sec: draft.elapsed_sec,
      });
      setStage("feedback");
      invalidate();
    },
    [current, sessionId, invalidate]
  );

  const onRate = useCallback(
    async (rating: SelfRating, draft: PracticeDraft) => {
      if (!current || !sessionId) return;
      const mcq = current.type_key === "multiple_choice";
      const graded = mcq && Boolean(current.mcq_options?.some((o) => o.is_correct));
      const { review } = await api.recordReview({
        session_id: sessionId,
        question_id: current.question_id,
        rating,
        objective_correct: graded ? draft.selected_choice === currentLetter(current) : null,
        response_text: draft.response_text || null,
        confidence: draft.confidence,
        hints_revealed: draft.hints_revealed,
        time_spent_sec: draft.elapsed_sec,
        score_earned: null,
        score_possible: current.marks ?? null,
      });
      setStage("assessed");
      setSessionNote(`Next time this comes up: ${describeInterval(review)}.`);
      invalidate();
    },
    [current, sessionId, invalidate]
  );

  function handleResetFilters() {
    setSelectedNodes(new Set());
    setTypeKeys([]);
    setDifficulties([]);
    setSelectedTag("");
    setInstitutionYears({});
    setAvoidRecentDays(null);
  }

  if (!courseId) {
    return <p className="text-sm text-muted-foreground">Select a course to start practising.</p>;
  }

  const pool = session?.pool;
  const exhausted = !!pool && pool.eligible_count === 0 && !!session && session.status === "active";
  const dueTotal = queue?.due_count ?? 0;

  return (
    <div>
      <PageHeader
        eyebrow="Practice"
        title="Practise a question"
        description="Try the question before looking at anything. Finish it by saying how it went, which is what decides when it comes back."
        actions={
          <>
            <div className="rounded-md bg-secondary px-3 py-2 font-mono text-xs">
              <strong>{pool?.filter_match_count ?? counts?.total ?? 0}</strong> match
              {pool?.filter_match_count === 1 ? "es" : ""}
            </div>
            <FilterMenu
              nodes={config?.nodes ?? []}
              counts={flatCounts}
              selectedNodes={selectedNodes}
              onSelectedNodesChange={setSelectedNodes}
              onReset={handleResetFilters}
              questionTypes={config?.question_types ?? []}
              typeCounts={facetCounts.typeCounts}
              typeKeys={typeKeys}
              onTypeKeysChange={setTypeKeys}
              difficultyLevels={config?.difficulty_levels ?? []}
              tags={config?.tags ?? []}
              selectedTag={selectedTag}
              onSelectedTagChange={setSelectedTag}
              difficultyCounts={facetCounts.difficultyCounts}
              difficulties={difficulties}
              onDifficultiesChange={setDifficulties}
              institutions={sourceOptions?.institutions}
              institutionCounts={sourceFacetQuery.data}
              institutionYears={institutionYears}
              onInstitutionYearsChange={setInstitutionYears}
              avoidRecent
              avoidRecentDays={avoidRecentDays}
              onAvoidRecentChange={setAvoidRecentDays}
              footerAction={{ label: "Start session", onClick: () => start.mutate({ mode }) }}
            />
          </>
        }
      />

      <div className="space-y-4">

        {!session && (
          <div className="space-y-4">
            <Panel className="p-5">
              <SessionModePicker
                value={mode}
                onChange={setMode}
                dueCount={dueTotal}
                disabled={dueTotal === 0 ? ["due_review"] : undefined}
              />
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {mode === "due_review"
                    ? dueTotal > 0
                      ? `${dueTotal} due, roughly ${queue?.estimated_minutes ?? 0} minutes.`
                      : "Nothing is due yet."
                    : "Questions are drawn in order and the list is kept, so a half-finished session survives a reload."}
                </p>
                <Button
                  onClick={() => start.mutate({ mode })}
                  disabled={loading || (counts?.total ?? 0) === 0 || (mode === "due_review" && dueTotal === 0)}
                >
                  <Play />
                  Start session
                </Button>
              </div>
            </Panel>
            <DueQueueCard courseId={courseId} onStart={() => start.mutate({ mode: "due_review" })} compact />
          </div>
        )}

        {session && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
              <p className="text-xs text-muted-foreground">
                {session.completed_count} of {session.planned_count} done
                {session.remaining_count > 0 && ` · ${session.remaining_count} to go`}
                {session.mode === "mixed" && pool && pool.eligible_count > 0 && (
                  <> · spread across the topics you picked</>
                )}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => resetSession.mutate(session.session_id)}
                  title="Clear which questions have been shown and start the same list again"
                >
                  Reset session
                </Button>
                <Button variant="outline" size="sm" onClick={() => {
                  setSessionId(null);
                  setCurrent(null);
                  setSessionNote(null);
                }}>
                  Change mode or filters
                </Button>
              </div>
            </div>

            {exhausted && !current && (
              <SessionExhausted
                pool={pool}
                session={session}
                onRepeat={() => resetSession.mutate(session.session_id)}
                onResetSession={() => resetSession.mutate(session.session_id)}
                onBroaden={handleResetFilters}
                onResetFilters={handleResetFilters}
              />
            )}

            {sessionNote && !current && (
              <Panel className="p-6 text-center">
                <div className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-secondary text-primary">
                  <Shuffle className="size-5" />
                </div>
                <h2 className="font-display text-xl font-semibold">{sessionNote}</h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                  {session.completed_count > 0
                    ? "The next due dates are already set. Come back when they land, or start another session now."
                    : "Nothing has been reviewed yet, so nothing has been scheduled."}
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <Button onClick={() => resetSession.mutate(session.session_id)}>
                    <Shuffle />
                    Do them again
                  </Button>
                  <Button variant="outline" onClick={() => {
                    setSessionId(null);
                    setCurrent(null);
                    setSessionNote(null);
                  }}>
                    Change mode or filters
                  </Button>
                </div>
                {session.completed_count > 0 && queue && queue.due_count > 0 && (
                  <p className="mt-4 text-xs text-muted-foreground">
                    {queue.due_count} question{queue.due_count === 1 ? " is" : "s are"} due
                    for review now.
                  </p>
                )}
              </Panel>
            )}

            {current && (
              <>
                {planItem?.reason_text && (
                  <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                    Why you are seeing this: {planItem.reason_text}
                  </p>
                )}
                {loading ? (
                  <Panel className="grid min-h-80 place-items-center p-8">
                    <InkLoader messages={["Dipping the pen…", "Consulting the ledger…", "Ruling the margin…"]} />
                  </Panel>
                ) : (
                  <PracticeFlow
                    key={current.question_id}
                    question={current}
                    stage={stage}
                    captureResponse={captureResponse !== "off"}
                    timerEnabled={timerEnabled === true}
                    onNext={advance}
                    nextLabel="Next question"
                    footerNote={sessionNote ?? undefined}
                    callbacks={{
                      onConfirmAttempt,
                      onReveal,
                      onRate,
                    }}
                  />
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** The letter the answer key points at, for a question with stored mcq options. */
function currentLetter(question: Question): string | null {
  const index = question.mcq_options?.findIndex((option) => option.is_correct) ?? -1;
  return index >= 0 ? String.fromCharCode(65 + index) : null;
}
