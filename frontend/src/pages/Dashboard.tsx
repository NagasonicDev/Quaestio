import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BookOpen, Shuffle } from "lucide-react";
import { api } from "../api/client";
import { useActiveCourse } from "../hooks/useActiveCourse";
import { useCourseConfig } from "../hooks/useCourseConfig";
import { PageHeader, Panel, PanelHead, Stat, MiniRows, Bars } from "../components/system";
import { Button } from "../components/ui/button";
import { NodeTree, flattenCounts } from "../components/NodeTree";
import { CourseOnboarding } from "../components/CourseOnboarding";
import { StudyOverview } from "../components/StudyOverview";
import { DueQueueCard } from "../components/DueQueueCard";
import { SetupProgress } from "../components/SetupProgress";
import { SampleCourseNotice } from "../components/SampleCourseNotice";

export function Dashboard() {
  const { courseId } = useActiveCourse();
  const { data: config } = useCourseConfig(courseId);

  const { data: counts } = useQuery({
    queryKey: ["question-counts", courseId, null, null, null],
    queryFn: () => api.questionCounts(courseId as string, {}),
    enabled: !!courseId,
  });
  const flatCounts = useMemo(() => (counts ? flattenCounts(counts.by_node) : {}), [counts]);

  const difficultyBars = useMemo(() => {
    const byDiff = counts?.by_difficulty ?? {};
    const levels = config?.difficulty_levels ?? [];
    const values = levels.map((l) => byDiff[String(l.level)] ?? 0);
    const total = values.reduce((sum, n) => sum + n, 0) || 1;
    return levels.map(
      (l, i) =>
        ["Level " + l.level, Math.round((values[i] / total) * 10000) / 100] as [string, number]
    );
  }, [config, counts]);

  if (!courseId) {
    return <CourseOnboarding />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Course overview"
        title={config?.name}
        description="Where the course stands, and what is worth doing next."
        actions={<Actions />}
      />

      {counts && counts.total === 0 && (
        <div className="mb-6 space-y-3">
          <Panel className="p-5">
            <h2 className="font-display text-lg font-semibold">This course has no questions yet</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Practice needs questions to draw from. Bring in a question file, or write one by
              hand &mdash; either works, and you do not need a large bank to get value from it.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild>
                <Link to="/import">Add questions →</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/browse">Browse the bank →</Link>
              </Button>
            </div>
          </Panel>
          <SetupProgress courseId={courseId} />
        </div>
      )}

      <div className="mb-6">
        <SampleCourseNotice courseId={courseId} />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat title="Total questions">
          <p className="font-display text-4xl font-semibold">{counts?.total ?? "…"}</p>
          <p className="mt-1 font-mono text-[11px] text-success">{config?.name}</p>
        </Stat>
        <Stat title="By type">
          <MiniRows
            rows={Object.entries(counts?.by_type ?? {}).map(([k, v]) => [k.replace(/_/g, " "), String(v)])}
          />
        </Stat>
        <Stat title="By difficulty">
          <Bars bars={difficultyBars} />
        </Stat>
        <Stat title="Quick actions">
          <div className="mt-3 grid gap-2">
            <Button asChild size="sm">
              <Link to="/practice">Start a session →</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/browse">Browse the bank →</Link>
            </Button>
          </div>
        </Stat>
      </div>

      {(counts?.total ?? 0) > 0 && (
        <div className="mb-6">
          <DueQueueCard courseId={courseId} />
        </div>
      )}

      <div className="mb-6">
        <StudyOverview courseId={courseId} />
      </div>

      <Panel>
        <PanelHead
          title="Topic structure"
          note={`${config?.hierarchy[0]?.label ?? "Topics"} · question count`}
          action={
            <Button size="sm" variant="outline" asChild>
              <Link to="/course-settings">Edit structure</Link>
            </Button>
          }
        />
        <div className="p-5">
          {config && <NodeTree checks={false} nodes={config.nodes} counts={flatCounts} />}
          {config?.nodes.length === 0 && (
            <p className="text-sm text-muted-foreground">This course has no categories yet.</p>
          )}
        </div>
      </Panel>
    </div>
  );
}

function Actions() {
  return (
    <>
      <Button variant="outline" asChild>
        <Link to="/browse">
          <BookOpen />
          Question Bank
        </Link>
      </Button>
      <Button asChild>
        <Link to="/practice">
          <Shuffle />
          Start Practice
        </Link>
      </Button>
    </>
  );
}
