import { useState, useEffect } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Eye, Pencil } from "lucide-react";
import { api } from "../api/client";
import { formatQuestionType } from "../lib/questionTypes";
import { LoadingState, PageHeader, Panel } from "../components/system";
import { QuestionSurface } from "../components/QuestionReader";
import { Button } from "../components/ui/button";
import { QuestionEditor } from "../components/QuestionEditor";
import { DrawingNotebook } from "../components/drawing/DrawingNotebook";
import { useCourseConfig } from "../hooks/useCourseConfig";
import type { Question } from "../api/types";

export function QuestionDetail() {
  const { questionId } = useParams<{ questionId: string }>();
  const [searchParams] = useSearchParams();
  const [showAnswer, setShowAnswer] = useState(() => searchParams.get("revealed") === "1");
  const [isEditing, setIsEditing] = useState(false);
  const queryClient = useQueryClient();

  const { data: question, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["question", questionId],
    queryFn: () => api.getQuestion(questionId as string),
    enabled: !!questionId,
  });

  const { data: attempts } = useQuery({
    queryKey: ["question-attempts", questionId],
    queryFn: () => api.questionAttempts(questionId as string, 20),
    enabled: !!questionId,
  });
  useEffect(() => {
    const status = attempts?.[0]?.status;
    if (status === "revealed" || status === "reviewed") {
      setShowAnswer(true);
    }
  }, [attempts]);
  if (isLoading) return <div className="panel grid min-h-64 place-items-center p-8" role="status"><LoadingState /></div>;
  if (isError) {
    const notFound = /not found/i.test(error instanceof Error ? error.message : String(error ?? ""));
    if (notFound) return <div className="panel grid min-h-64 place-items-center p-8"><p className="text-sm text-muted-foreground">Question not found.</p></div>;
    return (
      <div className="panel grid min-h-64 place-items-center gap-3 p-8 text-center" role="alert">
        <p className="font-display text-lg font-semibold">Couldn't load question</p>
        <p className="text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "The question didn't load."}
        </p>
        <Button variant="outline" onClick={() => void refetch()}>Retry</Button>
      </div>
    );
  }
  if (!question) return <div className="panel grid min-h-64 place-items-center p-8"><p className="text-sm text-muted-foreground">Question not found.</p></div>;

  if (isEditing) {
    return <QuestionEditView question={question} onCancel={() => setIsEditing(false)} onSaved={() => {
      queryClient.invalidateQueries({ queryKey: ["question", questionId] });
      queryClient.invalidateQueries({ queryKey: ["questions", question.course_id] });
      setIsEditing(false);
    }} />;
  }

  const sourceParts = question.source
    ? [
        question.source.institution,
        question.source.name,
        question.source.year?.toString(),
        question.source.original_question_no,
      ].filter(Boolean)
    : [];
  const source = sourceParts.join(" · ");

  return (
    <div>
      <PageHeader
        eyebrow="Question detail"
        title={`Question ${questionId}`}
        description="Complete question, source record and reviewed solution."
        actions={
          <>
            <Button variant="outline" onClick={() => setIsEditing(true)}>
              <Pencil />
              Edit question
            </Button>
            <Button variant="outline" asChild>
              <Link to="/browse">
                <ArrowLeft />
                Back to browser
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_260px]">
        <QuestionSurface
          question={question}
          submitted={showAnswer}
          afterQuestion={<div className="px-5 sm:px-6"><DrawingNotebook questionId={question.question_id} /></div>}
          footer={
            question.answer.length > 0 || question.solution.length > 0 || question.marking_criteria.length > 0 ||
            question.parts.some(function hasPartContent(part) {
              return part.answer.length > 0 || part.solution.length > 0 || part.marking_criteria.length > 0 || part.parts.some(hasPartContent);
            }) ? (
              <Button variant="outline" className="w-full" onClick={() => setShowAnswer((s) => !s)}>
                <Eye />
                {showAnswer ? "Hide answer" : "Show answer"}
              </Button>
            ) : undefined
          }
        />

        <Panel className="h-fit p-5 xl:sticky xl:top-[76px]">
          {question.review_status !== "approved" && (
            <div className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Pending review — not yet approved for practice.
            </div>
          )}
          <h2 className="font-display text-lg font-semibold">Metadata</h2>
          <dl className="mt-4 space-y-4">
            <div>
              <dt className="label">Type</dt>
              <dd className="mt-1 text-sm">{formatQuestionType(question.type_key)}</dd>
            </div>
            {question.difficulty != null && (
              <div>
                <dt className="label">Difficulty</dt>
                <dd className="mt-1 text-sm">{question.difficulty}</dd>
              </div>
            )}
            {question.marks != null && (
              <div>
                <dt className="label">Marks</dt>
                <dd className="mt-1 text-sm">{question.marks}</dd>
              </div>
            )}
            {question.tags.length > 0 && (
              <div>
                <dt className="label">Tags</dt>
                <dd className="mt-1 text-sm">{question.tags.join(", ")}</dd>
              </div>
            )}
            {question.review_status && (
              <div>
                <dt className="label">Review status</dt>
                <dd
                  className={
                    question.review_status !== "approved"
                      ? "mt-1 text-sm text-destructive"
                      : "mt-1 text-sm"
                  }
                >
                  {question.review_status !== "approved" ? "Pending review" : "Approved"}
                </dd>
              </div>
            )}
            {source && (
              <div>
                <dt className="label">Source</dt>
                <dd className="mt-1 text-sm">{source}</dd>
              </div>
            )}
          </dl>
        </Panel>
      </div>
    </div>
  );
}

function QuestionEditView({ question, onCancel, onSaved }: {
  question: Question;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { data: config, isLoading } = useCourseConfig(question.course_id);

  if (isLoading || !config) {
    return <div className="panel grid min-h-64 place-items-center p-8"><LoadingState label="Loading course settings…" /></div>;
  }

  return <QuestionEditor config={config} existing={question} onCancel={onCancel} onSaved={onSaved} />;
}
