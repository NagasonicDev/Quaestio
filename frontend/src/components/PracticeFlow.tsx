import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Check, Eye, Lightbulb, NotebookPen, Timer } from "lucide-react";
import type { Confidence, ContentBlock, Question, SelfRating } from "../api/types";
import { BlockList, MarkingGuideTable, QuestionReader } from "./QuestionReader";
import { Meta, Panel } from "./system";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { ConfidencePicker, SelfAssessment } from "./SelfAssessment";
import { formatQuestionType } from "../lib/questionTypes";

/**
 * The guided flow, in the order retrieval practice says it should happen in:
 * see the question, commit to an answer, then look. Each stage is a separate
 * step so a student cannot read the marking guide before they have tried, and
 * so the app can record honestly which of those steps actually happened.
 */
export type PracticeStage = "prompt" | "attempted" | "feedback" | "assessed";

export interface PracticeDraft {
  response_text: string;
  selected_choice: string | null;
  confidence: Confidence | null;
  hints_revealed: number;
  elapsed_sec: number | null;
}

export interface PracticeFlowCallbacks {
  onConfirmAttempt: (draft: PracticeDraft) => void | Promise<void>;
  onReveal: (draft: PracticeDraft) => void | Promise<void>;
  onRate: (rating: SelfRating, draft: PracticeDraft) => void | Promise<void>;
}

function useElapsedSeconds(enabled: boolean, running: boolean): number | null {
  const [seconds, setSeconds] = useState<number | null>(null);
  const startedAt = useRef<number | null>(null);
  useEffect(() => {
    if (!enabled) {
      setSeconds(null);
      startedAt.current = null;
      return;
    }
    if (!running) return;
    startedAt.current = Date.now();
    setSeconds(0);
    const handle = window.setInterval(() => {
      if (startedAt.current == null) return;
      setSeconds(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 1000);
    return () => window.clearInterval(handle);
  }, [enabled, running]);
  return seconds;
}

function formatElapsed(seconds: number | null): string | null {
  if (seconds == null) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
}

/**
 * Hints are authored content when the question has them and a deliberately
 * answer-free nudge when it does not. Either way they are kept apart from the
 * answer and the worked solution, and they are handed over one at a time so
 * asking for help stays the student's decision.
 */
function buildHintSteps(question: Question): ContentBlock[][] {
  const authored = question.hint ?? [];
  if (authored.length) {
    return authored.map((block) => [block]);
  }
  const steps: ContentBlock[][] = [];
  if (question.marks != null && question.marks > 1) {
    steps.push([
      {
        block_id: "hint-marks",
        slot: "hint",
        position: 0,
        block_type: "text",
        content: {
          text: `This is worth ${question.marks} marks, so a complete answer usually needs several distinct points rather than one line.`,
        },
      },
    ]);
  }
  steps.push([
    {
      block_id: "hint-stem",
      slot: "hint",
      position: 0,
      block_type: "text",
      content: {
        text: `Re-read the command in the question. Every word that tells you what to *do* — calculate, explain, compare, draw, discuss — is part of the answer, and so is any condition or unit given with the data.`,
      },
    },
  ]);
  steps.push([
    {
      block_id: "hint-check",
      slot: "hint",
      position: 0,
      block_type: "text",
      content: {
        text: "Before you reveal anything, check your answer actually answers what was asked, and that you have shown the working rather than only the final result.",
      },
    },
  ]);
  return steps;
}

function RevealSection({
  n,
  title,
  note,
  open,
  onOpen,
  children,
}: {
  n: string;
  title: string;
  note?: string;
  open: boolean;
  onOpen: () => void;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-border px-5 py-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="font-mono text-[11px] text-accent-foreground">{n}</span>
          <h3 className="font-display font-semibold">{title}</h3>
          {note && <span className="text-xs text-muted-foreground">{note}</span>}
        </div>
        {!open && (
          <Button variant="outline" size="sm" onClick={onOpen}>
            <Eye />
            Show
          </Button>
        )}
      </div>
      {open && (
        <div className="mt-3 text-sm leading-6 text-muted-foreground">{children}</div>
      )}
    </section>
  );
}

export function PracticeFlow({
  question,
  stage,
  captureResponse,
  timerEnabled,
  nextLabel,
  nextDisabled,
  onNext,
  footerNote,
  callbacks,
}: {
  question: Question;
  stage: PracticeStage;
  /** False when the student has turned response capture off in settings. */
  captureResponse: boolean;
  timerEnabled: boolean;
  nextLabel?: string;
  nextDisabled?: boolean;
  onNext?: () => void;
  footerNote?: string;
  callbacks: PracticeFlowCallbacks;
}) {
  const [response, setResponse] = useState("");
  const [scratch, setScratch] = useState("");
  const [scratchpad, setScratchpad] = useState(false);
  const [hintsShown, setHintsShown] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [revealed, setRevealed] = useState({ guide: false, answer: false, solution: false });
  const [busy, setBusy] = useState(false);

  const questionId = question.question_id;
  useEffect(() => {
    setResponse("");
    setScratch("");
    setScratchpad(false);
    setHintsShown(0);
    setSelectedChoice(null);
    setConfidence(null);
    setRevealed({ guide: false, answer: false, solution: false });
  }, [questionId]);

  const elapsed = useElapsedSeconds(timerEnabled, stage !== "assessed");
  const hints = useMemo(() => buildHintSteps(question), [question]);
  const isMcq = question.type_key === "multiple_choice";
  const hasParts = question.parts.length > 0;
  const correctChoice = useMemo(() => {
    const index = question.mcq_options?.findIndex((option) => option.is_correct) ?? -1;
    if (index >= 0) return String.fromCharCode(65 + index);
    return question.answer
      .map((b) => String(b.content.text ?? "").trim().match(/\b([A-D])\b/i)?.[1]?.toUpperCase())
      .find(Boolean) ?? null;
  }, [question]);
  const graded = isMcq && correctChoice != null;
  const objectiveCorrect = graded ? selectedChoice === correctChoice : null;
  const elapsedLabel = formatElapsed(elapsed);

  const draft = (): PracticeDraft => ({
    response_text: response.trim(),
    selected_choice: selectedChoice,
    confidence,
    hints_revealed: hintsShown,
    elapsed_sec: timerEnabled ? elapsed : null,
  });

  const run = async (action: () => void | Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  const showHint = () => {
    if (hintsShown >= hints.length) return;
    setHintsShown((n) => n + 1);
  };

  const canAttempt = !isMcq || selectedChoice != null;

  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
        <Meta>{formatQuestionType(question.type_key)}</Meta>
        {question.difficulty != null && <Meta>Difficulty {question.difficulty}</Meta>}
        {question.marks != null && <Meta>{question.marks} marks</Meta>}
      </div>

      <article className="question-paper p-5 sm:p-7">
        {question.source?.original_question_no && (
          <p className="mb-4 font-mono text-xs text-muted-foreground">
            Question {question.source.original_question_no}
          </p>
        )}
        <QuestionReader
          question={question}
          selectedChoice={selectedChoice}
          onSelectChoice={
            isMcq && stage === "prompt" ? setSelectedChoice : undefined
          }
          submitted={stage !== "prompt"}
        />
        {hasParts && stage === "prompt" && (
          <p className="mt-4 text-xs text-muted-foreground">
            This question has {question.parts.length} part
            {question.parts.length === 1 ? "" : "s"}. Answer each part in turn.
          </p>
        )}
      </article>

      {stage === "prompt" && (
        <div className="border-t border-border px-5 py-5 sm:px-6">
          {!isMcq && (
            <div className="space-y-3">
              {captureResponse && (
                <div>
                  <label htmlFor={`response-${questionId}`} className="label mb-1.5 block">
                    Your answer
                  </label>
                  <Textarea
                    id={`response-${questionId}`}
                    value={response}
                    onChange={(e) => setResponse(e.target.value)}
                    rows={6}
                    placeholder="Write your answer here. It is kept on this device only, and you can turn that off in settings."
                  />
                </div>
              )}
              <div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setScratchpad((v) => !v)}
                  aria-expanded={scratchpad}
                >
                  <NotebookPen />
                  {scratchpad ? "Hide scratchpad" : "Scratchpad"}
                </Button>
                {scratchpad && (
                  <Textarea
                    aria-label="Scratchpad"
                    className="mt-2"
                    rows={3}
                    value={scratch}
                    onChange={(e) => setScratch(e.target.value)}
                    placeholder="Rough working. Kept in this tab only: never saved and never sent anywhere."
                  />
                )}
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={showHint}
              disabled={hintsShown >= hints.length}
            >
              <Lightbulb />
              {hintsShown >= hints.length
                ? "No more hints"
                : hintsShown === 0
                  ? "Show a hint"
                  : `Another hint (${hintsShown}/${hints.length})`}
            </Button>
            {elapsedLabel && (
              <span className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground">
                <Timer className="size-3.5" />
                {elapsedLabel}
              </span>
            )}
          </div>

          {hintsShown > 0 && (
            <div className="mt-3 space-y-2">
              {hints.slice(0, hintsShown).map((step, i) => (
                <div key={i} className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                  <Meta className="mb-1 block">Hint {i + 1}</Meta>
                  <BlockList blocks={step} />
                </div>
              ))}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {isMcq
                ? "Pick an answer, then confirm your attempt."
                : "Try the question first — the marking guide and answer stay hidden until you do."}
            </p>
            <Button
              disabled={!canAttempt || busy}
              onClick={() => run(() => callbacks.onConfirmAttempt(draft()))}
            >
              <Check />
              {isMcq ? "Check my answer" : "I've attempted this"}
            </Button>
          </div>
        </div>
      )}

      {stage === "attempted" && (
        <div className="border-t border-border px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              Attempt recorded.
              {isMcq && graded
                ? objectiveCorrect
                  ? " The app marked that as correct."
                  : " The app marked that as incorrect."
                : " No correctness has been recorded — nothing here has marked it for you."}
            </p>
            <Button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  // The marking guide is offered on its own, before the answer.
                  setRevealed({ guide: true, answer: false, solution: false });
                  await callbacks.onReveal(draft());
                })
              }
            >
              <Eye />
              Show the marking guide
            </Button>
          </div>
        </div>
      )}

      {stage !== "prompt" && (
        <div className="border-t border-border">
          {question.marking_criteria.length > 0 && (
            <RevealSection
              n="01"
              title="Marking guide"
              note="What each mark is for"
              open={revealed.guide}
              onOpen={() => {
                setRevealed((r) => ({ ...r, guide: true }));
                if (stage === "attempted") run(() => callbacks.onReveal(draft()));
              }}
            >
              <MarkingGuideTable blocks={question.marking_criteria} />
            </RevealSection>
          )}

          {question.answer.length > 0 && (
            <RevealSection
              n="02"
              title="Answer"
              open={revealed.answer}
              onOpen={() => setRevealed((r) => ({ ...r, answer: true }))}
            >
              <BlockList blocks={question.answer} />
              {isMcq && graded && selectedChoice === correctChoice && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Correct, marked by the app from the stored answer key.
                </p>
              )}
            </RevealSection>
          )}

          {question.solution.length > 0 && (
            <RevealSection
              n="03"
              title="Worked solution"
              open={revealed.solution}
              onOpen={() => setRevealed((r) => ({ ...r, solution: true }))}
            >
              <BlockList blocks={question.solution} />
            </RevealSection>
          )}

          {question.marking_criteria.length === 0 &&
            question.answer.length === 0 &&
            question.solution.length === 0 && (
              <p className="border-t border-border px-5 py-4 text-sm italic text-muted-foreground sm:px-6">
                No marking guide, answer, or solution is recorded for this question yet.
              </p>
            )}

          {question.parts
            .filter(
              (part) =>
                part.marking_criteria.length > 0 ||
                part.answer.length > 0 ||
                part.solution.length > 0
            )
            .map((part) => (
              <section key={part.question_id} className="border-t border-border px-5 py-5 sm:px-6">
                <h3 className="font-display font-semibold">
                  Part {part.part_label}
                  {part.marks != null && (
                    <span className="ml-2 font-sans text-sm font-normal text-muted-foreground">
                      [{part.marks} marks]
                    </span>
                  )}
                </h3>
                <div className="mt-3 space-y-4">
                  {part.marking_criteria.length > 0 && (
                    <div>
                      <h4 className="font-display font-semibold">Marking guide</h4>
                      <div className="mt-1.5">
                        <MarkingGuideTable blocks={part.marking_criteria} />
                      </div>
                    </div>
                  )}
                  {part.answer.length > 0 && (
                    <div>
                      <h4 className="font-display font-semibold">Answer</h4>
                      <div className="mt-1.5">
                        <BlockList blocks={part.answer} />
                      </div>
                    </div>
                  )}
                  {part.solution.length > 0 && (
                    <div>
                      <h4 className="font-display font-semibold">Worked solution</h4>
                      <div className="mt-1.5">
                        <BlockList blocks={part.solution} />
                      </div>
                    </div>
                  )}
                </div>
              </section>
            ))}

          {stage === "feedback" && (
            <div className="space-y-5 border-t border-border px-5 py-5 sm:px-6">
              <ConfidencePicker
                value={confidence}
                onChange={setConfidence}
                note={
                  graded
                    ? "This is recorded separately from whether the answer was right."
                    : undefined
                }
              />
              <SelfAssessment
                value={null}
                onChange={(rating) => run(() => callbacks.onRate(rating, draft()))}
                disabled={busy}
              />
            </div>
          )}
        </div>
      )}

      {stage === "assessed" && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-4 sm:px-6">
          <p className="text-xs text-muted-foreground">
            {footerNote ?? "Saved. This question will come back based on what you chose."}
          </p>
          {onNext && (
            <Button onClick={onNext} disabled={nextDisabled || busy}>
              {nextLabel ?? "Next question"}
            </Button>
          )}
        </div>
      )}

      {stage !== "assessed" && onNext && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3 sm:px-6">
          <span className="text-xs text-muted-foreground">
            You can come back to this one later.
          </span>
          <Button variant="outline" size="sm" onClick={onNext} disabled={nextDisabled || busy}>
            {nextLabel ?? "Skip for now"}
          </Button>
        </div>
      )}
    </Panel>
  );
}
