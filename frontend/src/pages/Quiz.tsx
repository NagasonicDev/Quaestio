import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Check, Clock3, RotateCcw, SkipForward } from "lucide-react";
import { api } from "../api/client";
import type { Question } from "../api/types";
import { FilterMenu } from "../components/FilterMenu";
import { QuestionSurface } from "../components/QuestionReader";
import { flattenCounts } from "../components/NodeTree";
import { InkLoader, Meta, PageHeader, Panel } from "../components/system";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { useActiveCourse } from "../hooks/useActiveCourse";
import { useCourseConfig } from "../hooks/useCourseConfig";
import { useQuestionFilterCounts } from "../hooks/useQuestionFilterCounts";
import { effectiveNodeFilterIds } from "../lib/nodeFilters";

type QuizResult = { question: Question; earned: number; possible: number; elapsed: number };
type Phase = "setup" | "loading" | "run" | "done";

export function Quiz() {
  const { courseId } = useActiveCourse();
  const { data: config } = useCourseConfig(courseId);
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());
  const [typeKeys, setTypeKeys] = useState<string[]>([]);
  const [difficulties, setDifficulties] = useState<number[]>([]);
  const [selectedTag, setSelectedTag] = useState("");
  const [institutionYears, setInstitutionYears] = useState<Record<string, number[]>>({});
  const [requestedCount, setRequestedCount] = useState(8);
  const [phase, setPhase] = useState<Phase>("setup");
  const [deck, setDeck] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [answerDraft, setAnswerDraft] = useState("");
  const [marksDraft, setMarksDraft] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState<QuizResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { data: counts } = useQuery({
    queryKey: ["question-counts", courseId],
    queryFn: () => api.questionCounts(courseId as string),
    enabled: !!courseId,
  });
  const flatCounts = useMemo(() => (counts ? flattenCounts(counts.by_node) : {}), [counts]);
  const selectedNodeIds = useMemo(
    () => effectiveNodeFilterIds(config?.nodes ?? [], selectedNodes),
    [config?.nodes, selectedNodes]
  );
  const facetCounts = useQuestionFilterCounts(courseId, config?.nodes ?? [], selectedNodes, typeKeys, difficulties);
  const { data: sourceOptions } = useQuery({
    queryKey: ["question-source-options", courseId],
    queryFn: () => api.questionSourceOptions(courseId as string),
    enabled: !!courseId,
  });
  const sourceFacetQuery = useQuery({
    queryKey: ["question-source-facet-counts", courseId, selectedNodeIds, typeKeys, difficulties, selectedTag],
    queryFn: () => api.questionSourceCounts(courseId as string, {
      node_ids: selectedNodeIds, type: typeKeys, difficulties, tag: selectedTag || undefined,
    }),
    enabled: !!courseId,
  });
  const { data: matchingQuestions } = useQuery({
    queryKey: ["quiz-matching-count", courseId, selectedNodeIds, typeKeys, difficulties, selectedTag, institutionYears],
    queryFn: () => api.listQuestions(courseId as string, {
      node_id: selectedNodeIds.length ? selectedNodeIds : undefined,
      type: typeKeys.length ? typeKeys : undefined,
      difficulty: difficulties.length ? difficulties : undefined,
      tag: selectedTag || undefined,
      source_filters: Object.entries(institutionYears).map(([institution, years]) => ({ institution, years })),
      page_size: 1,
    }),
    enabled: !!courseId,
  });
  const matchingCount = matchingQuestions?.total ?? 0;
  const current = deck[index];
  const maxMarks = Math.max(0, current?.marks ?? 0);
  const elapsed = elapsedSeconds;
  const earnedTotal = results.reduce((sum, result) => sum + result.earned, 0);
  const possibleTotal = results.reduce((sum, result) => sum + result.possible, 0);
  const totalElapsed = results.reduce((sum, result) => sum + result.elapsed, 0);
  const fullMarkCount = results.filter((result) => result.possible > 0 && result.earned >= result.possible).length;
  const noMarkCount = results.filter((result) => result.earned === 0).length;
  const partialMarkCount = results.length - fullMarkCount - noMarkCount;

  useEffect(() => {
    if (phase !== "run" || revealed || !current) return;
    const timer = window.setTimeout(() => setElapsedSeconds((value) => value + 1), 1000);
    return () => window.clearTimeout(timer);
  }, [phase, revealed, current, elapsedSeconds]);

  function resetFilters() {
    setSelectedNodes(new Set());
    setTypeKeys([]);
    setDifficulties([]);
    setSelectedTag("");
    setInstitutionYears({});
  }

  function resetQuestion() {
    setElapsedSeconds(0);
    setSelectedChoice(null);
    setAnswerDraft("");
    setMarksDraft("");
    setRevealed(false);
  }

  async function startQuiz() {
    if (!courseId || matchingCount < 1) return;
    setPhase("loading");
    setError(null);
    try {
      const picked: Question[] = [];
      const excluded: string[] = [];
      const total = Math.min(requestedCount, matchingCount);
      for (let i = 0; i < total; i++) {
        const response = await api.randomQuestion({
          course_id: courseId,
          node_id: selectedNodeIds.length ? selectedNodeIds : undefined,
          type: typeKeys.length ? typeKeys : undefined,
          difficulty: difficulties.length ? difficulties : undefined,
          tag: selectedTag || undefined,
          source_filters: Object.entries(institutionYears).map(([institution, years]) => ({ institution, years })),
          exclude_question_ids: excluded,
        });
        if (!response.question) break;
        picked.push(response.question);
        excluded.push(response.question.question_id);
      }
      setDeck(picked);
      setIndex(0);
      setResults([]);
      setElapsedSeconds(0);
      setSelectedChoice(null);
      setAnswerDraft("");
      setMarksDraft("");
      setRevealed(false);
      setPhase(picked.length ? "run" : "setup");
      if (!picked.length) setError("No questions matched those filters. Adjust them and try again.");
      for (const question of picked) {
        api.recordAttempt({ question_id: question.question_id, status: "seen" }).catch(() => {});
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not generate a quiz.");
      setPhase("setup");
    }
  }

  function submitAnswer() {
    if (!current || revealed) return;
    if (current.type_key === "multiple_choice") {
      if (!selectedChoice) return;
      const correctOptionIndex = current.mcq_options?.findIndex((option) => option.is_correct) ?? -1;
      const correctLabel = correctOptionIndex >= 0
        ? String.fromCharCode(65 + correctOptionIndex)
        : current.answer.map((block) => String(block.content.text ?? "").trim().match(/\b([A-D])\b/i)?.[1]?.toUpperCase()).find(Boolean) ?? null;
      const correct = selectedChoice === correctLabel;
      const possible = current.marks ?? 1;
      setResults((previous) => [...previous.filter((item) => item.question.question_id !== current.question_id), {
        question: current, earned: correct ? possible : 0, possible, elapsed,
      }]);
      setRevealed(true);
      api.recordAttempt({ question_id: current.question_id, status: "completed", correct, time_spent_sec: elapsed }).catch(() => {});
    } else {
      if (!answerDraft.trim()) return;
      setRevealed(true);
    }
  }

  function saveMark() {
    if (!current || !revealed || marksDraft === "") return;
    const possible = current.marks ?? 0;
    const earned = Math.max(0, Math.min(possible, Number(marksDraft) || 0));
    setResults((previous) => [...previous.filter((item) => item.question.question_id !== current.question_id), {
      question: current, earned, possible, elapsed,
    }]);
    api.recordAttempt({ question_id: current.question_id, status: "completed", correct: possible > 0 && earned >= possible, time_spent_sec: elapsed, user_notes: answerDraft }).catch(() => {});
  }

  function advance() {
    if (!current) return;
    if (!results.some((item) => item.question.question_id === current.question_id)) {
      const result = { question: current, earned: 0, possible: current.marks ?? 0, elapsed };
      setResults((previous) => [...previous, result]);
      api.recordAttempt({ question_id: current.question_id, status: "completed", correct: false, time_spent_sec: elapsed }).catch(() => {});
    }
    if (index + 1 >= deck.length) {
      setPhase("done");
      return;
    }
    setIndex((value) => value + 1);
    resetQuestion();
  }

  if (!courseId) return <p className="text-sm text-muted-foreground">Select a course to start a quiz.</p>;

  return (
    <div>
      <PageHeader
        eyebrow="Timed session"
        title="Quiz"
        description="Build a question set from your course filters, then answer each question against the clock."
        actions={
          <>
            <div className="rounded-md bg-secondary px-3 py-2 font-mono text-xs"><strong>{matchingCount}</strong> matches</div>
            <FilterMenu
              nodes={config?.nodes ?? []} counts={flatCounts} selectedNodes={selectedNodes}
              onSelectedNodesChange={setSelectedNodes} onReset={resetFilters}
              questionTypes={config?.question_types ?? []} typeCounts={facetCounts.typeCounts}
              typeKeys={typeKeys} onTypeKeysChange={setTypeKeys}
              difficultyLevels={config?.difficulty_levels ?? []} difficultyCounts={facetCounts.difficultyCounts}
              difficulties={difficulties} onDifficultiesChange={setDifficulties}
              tags={config?.tags ?? []} selectedTag={selectedTag} onSelectedTagChange={setSelectedTag}
              institutions={sourceOptions?.institutions} institutionCounts={sourceFacetQuery.data}
              institutionYears={institutionYears} onInstitutionYearsChange={setInstitutionYears}
              footerAction={{ label: phase === "run" ? "Restart quiz" : "Generate quiz", onClick: startQuiz }}
            />
          </>
        }
      />

      <Panel className="mb-5 p-4 sm:p-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block">
            <span className="label mb-2 flex items-center justify-between">Questions <span className="font-mono text-xs text-foreground">{requestedCount}</span></span>
            <input aria-label="Number of quiz questions" type="range" min={1} max={30} value={requestedCount} onChange={(event) => setRequestedCount(Number(event.target.value))} className="w-full accent-primary" />
            <span className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground"><span>1</span><span>30 questions</span></span>
          </label>
          <p className="self-center text-sm text-muted-foreground">Use the stopwatch to track your time on each question.</p>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <Meta>{matchingCount} matching · {Math.min(requestedCount, matchingCount)} will be drawn</Meta>
          <Button onClick={startQuiz} disabled={matchingCount === 0 || phase === "loading"}>{phase === "run" ? "Restart quiz" : "Generate quiz"}</Button>
        </div>
      </Panel>

      {error && <p role="alert" className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {phase === "setup" && <Panel className="p-10 text-center text-sm text-muted-foreground">Set your filters and question count, then generate a quiz.</Panel>}
      {phase === "loading" && <Panel className="grid min-h-64 place-items-center p-10"><InkLoader messages={["Drawing questions…", "Starting your stopwatch…", "Preparing your quiz…"]} /></Panel>}

      {(phase === "run" || phase === "done") && <Panel className="sticky top-[64px] z-10 mb-5 p-4 backdrop-blur">
        <div className="mb-2 flex justify-between font-mono text-[11px] text-muted-foreground"><span>{phase === "done" ? "Complete" : `Question ${index + 1} of ${deck.length}`}</span><span>{earnedTotal} / {possibleTotal} marks</span></div>
        <div className="flex gap-1" aria-label="Quiz progress">{deck.map((question, i) => {
          const result = results.find((item) => item.question.question_id === question.question_id);
          const resultColor = result
            ? result.earned === 0
              ? "bg-destructive"
              : result.earned >= result.possible && result.possible > 0
                ? "bg-success"
                : "bg-accent-foreground"
            : i === index && phase === "run" ? "bg-primary/40" : "bg-secondary";
          return <div key={question.question_id} className={`h-1.5 flex-1 rounded-full ${resultColor}`} />;
        })}</div>
      </Panel>}

      {phase === "run" && current && <QuestionSurface
        key={current.question_id}
        question={current}
        submitted={revealed}
        selectedChoice={selectedChoice}
        onSelectChoice={current.type_key === "multiple_choice" ? setSelectedChoice : undefined}
        footer={<div className="space-y-4">
          {current.type_key !== "multiple_choice" && <div>
            <label className="label mb-2 block" htmlFor="quiz-answer">Your answer</label>
            <Textarea id="quiz-answer" value={answerDraft} onChange={(event) => setAnswerDraft(event.target.value)} disabled={revealed} placeholder="Write your working and answer…" className="min-h-28 bg-surface/60" />
          </div>}
          {revealed && current.type_key !== "multiple_choice" && <div className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-surface/50 p-3">
            <label className="block w-36"><span className="label mb-1.5 block">Marks awarded</span><Input type="number" min={0} max={maxMarks || undefined} step="0.5" value={marksDraft} onChange={(event) => setMarksDraft(event.target.value)} placeholder={`0–${maxMarks}`} aria-label="Marks awarded" /></label>
            <Button size="sm" onClick={saveMark} disabled={marksDraft === ""}>Save score</Button>
            <span className="pb-2 text-xs text-muted-foreground">Compare your work with the guide above, then enter your score.</span>
          </div>}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
            <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground"><Clock3 className="size-3.5" />{revealed ? "Time taken" : "Elapsed"} {formatDuration(elapsedSeconds)}</span>
            <div className="flex gap-2">
              {!revealed && <Button variant="ghost" onClick={advance}><SkipForward />Skip</Button>}
              {!revealed && <Button onClick={submitAnswer} disabled={current.type_key === "multiple_choice" ? !selectedChoice : !answerDraft.trim()}>{current.type_key === "multiple_choice" ? <Check /> : null}{current.type_key === "multiple_choice" ? "Submit answer" : "Reveal marking guide"}</Button>}
              {revealed && <Button onClick={advance} disabled={current.type_key !== "multiple_choice" && !results.some((item) => item.question.question_id === current.question_id)}>{index + 1 >= deck.length ? "Finish quiz" : "Next question"} →</Button>}
            </div>
          </div>
        </div>}
      />}

      {phase === "done" && <Panel>
        <header className="flex flex-col justify-between gap-5 border-b border-border px-6 py-8 sm:flex-row sm:items-end sm:px-10">
          <div>
            <p className="label mb-2 text-accent-foreground">Examination summary</p>
            <h2 className="font-display text-4xl font-light leading-tight tracking-tight sm:text-5xl">Quiz complete</h2>
          </div>
          <div className="sm:text-right">
            <p className="label mb-1">Final score</p>
            <p className="font-display text-6xl font-semibold leading-none text-primary">{earnedTotal}<span className="text-2xl font-normal text-muted-foreground/60"> / {possibleTotal} marks</span></p>
          </div>
        </header>
        <div className="grid grid-cols-2 border-b border-border sm:grid-cols-4">
          <QuizStat label="Avg time / Q">{formatDuration(Math.round(totalElapsed / Math.max(results.length, 1)))}</QuizStat>
          <QuizStat label="Total duration" className="border-l border-border">{formatDuration(totalElapsed)}</QuizStat>
          <QuizStat label="Accuracy" className="border-l border-border max-sm:border-t" valueClass="text-primary">{possibleTotal ? Math.round(earnedTotal / possibleTotal * 100) : 0}%</QuizStat>
          <div className="border-l border-border px-5 py-5 max-sm:border-t sm:px-6">
            <p className="label mb-1">Marked</p>
            <p className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-sm leading-6">
              <span className="text-success">{fullMarkCount} full</span>
              {partialMarkCount > 0 && <span className="text-accent-foreground">{partialMarkCount} partial</span>}
              <span className="text-muted-foreground">{noMarkCount} no marks</span>
            </p>
          </div>
        </div>
        <ol className="divide-y divide-border">{deck.map((question, i) => {
          const result = results.find((item) => item.question.question_id === question.question_id);
          const status = result && result.possible > 0 && result.earned >= result.possible ? "full" : result?.earned ? "partial" : "no marks";
          return <li key={question.question_id} className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-start gap-3 px-5 py-4 transition-colors hover:bg-secondary/40 sm:px-6">
            <span className="pt-0.5 font-mono text-xs text-muted-foreground/70">{String(i + 1).padStart(2, "0")}</span>
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2.5">
                <span className={`rounded-sm border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${status === "full" ? "border-success/30 bg-success/10 text-success" : status === "no marks" ? "border-border bg-secondary text-muted-foreground" : "border-accent-foreground/30 bg-accent-foreground/10 text-accent-foreground"}`}>{status}</span>
                <span className="font-mono text-[10px] uppercase text-muted-foreground">{question.difficulty != null && `Difficulty ${question.difficulty} · `}{question.type_key.replaceAll("_", " ")}</span>
              </div>
              <p className="text-sm leading-snug"><Link to={`/questions/${question.question_id}`} className="font-mono text-primary underline-offset-4 hover:underline" title="Open this question">{question.question_id}</Link><span className="text-muted-foreground"> · {result?.possible ?? question.marks ?? 0} marks available</span></p>
            </div>
            <span className="pt-0.5 text-right font-mono text-[11px] text-muted-foreground">{result?.earned ?? 0} / {result?.possible ?? question.marks ?? 0} marks<br />{formatDuration(result?.elapsed ?? 0)}</span>
          </li>;
        })}</ol>
        <footer className="flex items-center justify-between gap-3 border-t border-border bg-secondary/50 px-5 py-5 sm:px-6">
          <Button variant="ghost" onClick={() => { setPhase("setup"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Adjust quiz</Button>
          <Button onClick={startQuiz}><RotateCcw />Retry quiz</Button>
        </footer>
      </Panel>}
    </div>
  );
}

function QuizStat({ label, children, className, valueClass }: { label: string; children: import("react").ReactNode; className?: string; valueClass?: string }) {
  return <div className={`px-5 py-5 sm:px-6 ${className ?? ""}`}><p className="label mb-1">{label}</p><p className={`text-xl font-medium ${valueClass ?? ""}`}>{children}</p></div>;
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
