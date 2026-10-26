import { useEffect, useMemo, useRef, useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, BookOpen, Download, Eye, FileText, Plus, Printer, Trash2 } from "lucide-react";
import { api, type GeneratedTestMeta } from "../api/client";
import { useActiveCourse } from "../hooks/useActiveCourse";
import { useCourseConfig } from "../hooks/useCourseConfig";
import { flattenCounts } from "../components/NodeTree";
import { Field, InkLoader, LoadingState, Meta, MiniRows, PageHeader, Panel, PanelHead } from "../components/system";
import { FilterMenu } from "../components/FilterMenu";
import { Button } from "../components/ui/button";
import { useConfirm } from "../components/ui/modal";
import { downloadTestFile, ensureTestFileUrl } from "../lib/tests";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { effectiveNodeFilterIds } from "../lib/nodeFilters";
import { beginTestGeneration, updateTestGeneration, useTestGenerationTask } from "../lib/testGenerationTask";
import type { QuestionCountsResponse } from "../api/types";
import { notify, startOperationNotification } from "../lib/notifications";

// ---- Section marks configuration (edit these) ----------------------------
const MIN_MARKS = 5; // lowest marks target allowed for a section
const MAX_MARKS = 200; // highest marks target allowed for a section
const DEFAULT_MARKS = 20; // starting marks target for new sections
const MARKS_SLIDER_STEP = 4; // slider increment (typed values can be any whole number)
// ---------------------------------------------------------------------------

function clampMarks(value: number) {
  return Math.min(MAX_MARKS, Math.max(MIN_MARKS, Math.round(value)));
}

function SectionMarksInput({ value, label, onChange }: { value: number; label: string; onChange: (marks: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  // Keep the text box in sync when the slider (or anything else) changes the value.
  useEffect(() => setDraft(String(value)), [value]);

  function handleChange(raw: string) {
    if (!/^\d*$/.test(raw)) return;
    setDraft(raw);
    const n = Number(raw);
    if (raw !== "" && n >= MIN_MARKS && n <= MAX_MARKS) onChange(n);
  }
  function commit() {
    if (draft === "") {
      setDraft(String(value));
      return;
    }
    const clamped = clampMarks(Number(draft));
    setDraft(String(clamped));
    onChange(clamped);
  }

  return (
    <Input
      aria-label={label}
      className="h-8 w-20 text-right font-mono"
      inputMode="numeric"
      value={draft}
      onChange={(e) => handleChange(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function testRuntimeKey(format: "docx" | "pdf") {
  return `quaestio:test-generation-seconds-per-question:${format}`;
}

function readTestRuntimeEstimate(format: "docx" | "pdf"): number | null {
  try {
    const value = Number(window.localStorage.getItem(testRuntimeKey(format)));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

interface SectionDraft {
  id: number;
  name: string;
  nodeIds: Set<string>;
  typeKeys: string[];
  difficulties: number[];
  institutionYears: Record<string, number[]>;
  marks: number;
}

export function TestGenerator() {
  const { courseId } = useActiveCourse();
  const { data: config } = useCourseConfig(courseId);
  const qc = useQueryClient();
  const confirm = useConfirm();
  const backgroundTask = useTestGenerationTask();
  const taskRunning = backgroundTask?.status === "running";
  const nextId = useRef(2);

  const [sections, setSections] = useState<SectionDraft[]>([
    { id: 1, name: "", nodeIds: new Set(), typeKeys: [], difficulties: [], institutionYears: {}, marks: DEFAULT_MARKS },
  ]);
  const [format, setFormat] = useState<"docx" | "pdf">("docx");
  const [ordering, setOrdering] = useState("random");
  const [title, setTitle] = useState("");
  const [excludeRecentTests, setExcludeRecentTests] = useState(0);
  const [keepQuestionIds, setKeepQuestionIds] = useState("");

  const [generating, setGenerating] = useState(false);
  const blockingGeneration = generating || (taskRunning && backgroundTask?.courseId === courseId);
  const [generationPhase, setGenerationPhase] = useState<"selecting" | "hydrating" | "paper" | "preview" | "saving">("selecting");
  const [completedQuestions, setCompletedQuestions] = useState(0);
  const [generationQuestionCount, setGenerationQuestionCount] = useState(0);
  const [result, setResult] = useState<GeneratedTestMeta | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  useEffect(() => {
    if (backgroundTask?.courseId !== courseId) return;
    if (backgroundTask.status === "complete" && backgroundTask.result) setResult(backgroundTask.result);
  }, [backgroundTask, courseId]);
  const phaseProgress = { selecting: 4, hydrating: 12, paper: 22, preview: 78, saving: 96 }[generationPhase];
  const generationProgress = generationPhase === "paper"
    ? 22 + (generationQuestionCount ? completedQuestions / generationQuestionCount : 0) * 56
    : generationPhase === "preview"
      ? 78 + (generationQuestionCount ? completedQuestions / generationQuestionCount : 0) * 17
      : phaseProgress;
  const activeGenerationPhase = taskRunning && backgroundTask?.courseId === courseId
    ? backgroundTask.phase
    : generationPhase;
  const activeGenerationProgress = taskRunning && backgroundTask?.courseId === courseId
    ? backgroundTask.phase === "paper"
      ? 22 + (backgroundTask.questionCount ? backgroundTask.completedQuestions / backgroundTask.questionCount : 0) * 56
      : backgroundTask.phase === "preview"
        ? 78 + (backgroundTask.questionCount ? backgroundTask.completedQuestions / backgroundTask.questionCount : 0) * 17
        : ({ selecting: 4, hydrating: 12, saving: 96 }[backgroundTask.phase] ?? 4)
    : generationProgress;
  const activeGenerationMessages = {
    selecting: [
      "Finding the closest mark combination…",
      "Checking question marks against your target…",
      "Comparing possible question combinations…",
      "Choosing the best match for your requested marks…",
    ],
    hydrating: [
      "Loading the selected questions…",
      "Gathering question text and diagrams…",
      "Collecting answer choices and mark details…",
      "Preparing the selected questions for your paper…",
    ],
    paper: [
      `Building the ${format.toUpperCase()} paper…`,
      "Laying out questions and answer spaces…",
      "Formatting headings, marks, and page breaks…",
      "Rendering the paper pages…",
    ],
    preview: [
      "Preparing the in-app PDF preview…",
      "Opening the generated paper preview…",
      "Finishing the preview document…",
    ],
    saving: [
      "Saving the generated paper…",
      "Saving the paper and preview to your question bank…",
      "Finishing up and saving your test…",
    ],
  }[activeGenerationPhase];

  const { data: counts } = useQuery({
    queryKey: ["question-counts", courseId],
    queryFn: () => api.questionCounts(courseId as string),
    enabled: !!courseId,
  });
  const flatCounts = useMemo(() => (counts ? flattenCounts(counts.by_node) : {}), [counts]);
  const { data: sourceOptions } = useQuery({ queryKey: ["question-source-options", courseId], queryFn: () => api.questionSourceOptions(courseId as string), enabled: !!courseId });

  const estimateSections = useMemo(() => sections.map((s) => ({
    node_ids: s.nodeIds.size ? effectiveNodeFilterIds(config?.nodes ?? [], s.nodeIds).sort() : undefined,
    type_keys: s.typeKeys.length ? [...s.typeKeys].sort() : undefined,
    difficulties: s.difficulties.length ? [...s.difficulties].sort((a, b) => a - b) : undefined,
    source_filters: Object.entries(s.institutionYears).map(([institution, years]) => ({ institution, years })),
    marks: s.marks,
  })), [sections, config?.nodes]);
  const { data: availability, isLoading: loadingAvailability } = useQuery({
    queryKey: ["test-availability", courseId, estimateSections],
    queryFn: () => api.estimateTestSections(courseId as string, estimateSections),
    enabled: !!courseId,
  });
  const sectionFacetQueries = useQueries({
    queries: sections.flatMap((section) => {
      const nodeIds = effectiveNodeFilterIds(config?.nodes ?? [], section.nodeIds).sort();
      const types = [...section.typeKeys].sort();
      const difficulties = [...section.difficulties].sort((a, b) => a - b);
      return [
        {
          queryKey: ["test-type-facet-counts", courseId, nodeIds, difficulties],
          queryFn: () => api.questionCounts(courseId as string, { node_ids: nodeIds, difficulties }),
          enabled: !!courseId,
        },
        {
          queryKey: ["test-difficulty-facet-counts", courseId, nodeIds, types],
          queryFn: () => api.questionCounts(courseId as string, {
            node_ids: nodeIds,
            type: types.length ? types : undefined,
          }),
          enabled: !!courseId,
        },
        {
          queryKey: ["test-source-facet-counts", courseId, nodeIds, types, difficulties],
          queryFn: () => api.questionSourceCounts(courseId as string, {
            node_ids: nodeIds, type: types, difficulties,
          }),
          enabled: !!courseId,
        },
      ];
    }),
  });

  const { data: pastTests, isLoading: loadingPastTests, refetch: refetchPastTests } = useQuery({
    queryKey: ["tests", courseId],
    queryFn: () => api.listTests(courseId as string),
    enabled: !!courseId,
  });

  const summary = useMemo(() => {
    return {
      marksRequested: sections.reduce((sum, s) => sum + s.marks, 0),
      availableQuestions: availability?.reduce((sum, s) => sum + s.question_count, 0) ?? 0,
      availableMarks: availability?.reduce((sum, s) => sum + s.available_marks, 0) ?? 0,
    };
  }, [sections, availability]);

  const allSectionsValid = sections.length > 0 && sections.every((s) => s.marks >= MIN_MARKS && s.marks <= MAX_MARKS);

  useEffect(() => {
    if (!result) {
      setPreviewUrl(null);
      return;
    }
    let cancelled = false;
    void ensureTestFileUrl(result.test_id, "preview").then((url) => {
      if (!cancelled) setPreviewUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [result?.test_id]);

  async function handleDownload(test: GeneratedTestMeta) {
    setDownloading(`${test.test_id}:test`);
    try {
      await downloadTestFile(test.test_id, "test", test.format as "docx" | "pdf", test.title);
      notify("Test downloaded", "success", test.title);
    } catch (e) {
      notify("Could not download test", "error", e instanceof Error ? e.message : "Download failed.");
    } finally {
      setDownloading(null);
    }
  }

  function markSolutionsAvailable(testId: string) {
    setResult((r) => (r && r.test_id === testId ? { ...r, solutions_available: true } : r));
    qc.setQueryData<GeneratedTestMeta[]>(["tests", courseId], (prev) =>
      prev?.map((t) => (t.test_id === testId ? { ...t, solutions_available: true } : t))
    );
  }

  async function handleSolutions(test: GeneratedTestMeta) {
    setDownloading(`${test.test_id}:solutions`);
    // Only show a progress bar when there is generation work to report.
    const task = test.solutions_available ? null : startOperationNotification("Generating solutions…");
    try {
      if (!test.solutions_available) {
        await api.generateTestSolutions(test.test_id, (completed, total) => {
          task?.progress(total ? (completed / total) * 100 : 0);
        });
        markSolutionsAvailable(test.test_id);
      }
      await downloadTestFile(test.test_id, "solutions", test.format as "docx" | "pdf", test.title);
      if (task) task.succeed("Solutions ready", test.title);
      else notify("Solutions ready", "success", test.title);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Download failed.";
      if (task) task.fail("Could not create solutions", message);
      else notify("Could not download solutions", "error", message);
    } finally {
      setDownloading(null);
    }
  }

  const sectionRows = useMemo(() => {
    if (result?.section_results && result.section_results.length > 0) {
      return [
        ...result.section_results.map(
          (sec) => [sec.name, `${sec.question_count} · ${sec.marks}`] as [string, string]
        ),
        ["Total", `${result.question_count} · ${result.achieved_marks}`],
      ] as Array<[string, string]>;
    }
    return [
      ["Questions", String(result?.question_count ?? 0)],
      ["Marks", String(result?.achieved_marks ?? 0)],
    ] as Array<[string, string]>;
  }, [result]);
  const markMismatches = useMemo(
    () => result?.section_results?.filter(
      (section) => section.marks_requested != null && Math.abs(section.marks - section.marks_requested) > 0.009
    ) ?? [],
    [result]
  );

  function updateSection(id: number, patch: Partial<SectionDraft>) {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function addSection() {
    setSections((prev) => [
      ...prev,
      { id: nextId.current++, name: "", nodeIds: new Set(), typeKeys: [], difficulties: [], institutionYears: {}, marks: DEFAULT_MARKS },
    ]);
  }
  function removeSection(id: number) {
    setSections((prev) => (prev.length > 1 ? prev.filter((s) => s.id !== id) : prev));
  }
  function moveSection(id: number, dir: -1 | 1) {
    setSections((prev) => {
      const i = prev.findIndex((s) => s.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function handleGenerate() {
    if (!courseId || taskRunning) return;
    setGenerating(true);
    const start = Date.now();
    setGenerationPhase("selecting");
    setCompletedQuestions(0);
    setGenerationQuestionCount(0);
    const estimatedQuestionCount = sections.reduce((sum, section, index) => {
      const available = availability?.[index];
      const averageMarks = available && available.question_count > 0
        ? available.available_marks / available.question_count
        : 0;
      return sum + (averageMarks > 0 ? section.marks / averageMarks : 0);
    }, 0);
    const perQuestion = format === "pdf" ? 5 : 4;
    const learnedSecondsPerQuestion = readTestRuntimeEstimate(format);
    const initialEstimate = Math.max(20, Math.round(learnedSecondsPerQuestion
      ? estimatedQuestionCount * learnedSecondsPerQuestion
      : 15 + estimatedQuestionCount * perQuestion));
    beginTestGeneration({
      courseId,
      status: "running",
      phase: "selecting",
      startedAt: start,
      questionCount: 0,
      completedQuestions: 0,
      estimatedSeconds: initialEstimate,
    });
    setResult(null);
    try {
      const meta = await api.generateTest(courseId, {
        title: title.trim() || undefined,
        format,
        ordering,
        shuffle: ordering !== "sequential",
        excludeRecentTests,
        keepQuestionIds: keepQuestionIds.split(/[,\\s]+/).map((s) => s.trim()).filter(Boolean),
        sections: sections.map((s) => ({
          name: s.name.trim() || undefined,
          node_ids: s.nodeIds.size ? effectiveNodeFilterIds(config?.nodes ?? [], s.nodeIds) : undefined,
          type_keys: s.typeKeys.length ? s.typeKeys : undefined,
          difficulties: s.difficulties.length ? s.difficulties : undefined,
          source_filters: Object.entries(s.institutionYears).map(([institution, years]) => ({ institution, years })),
          marks: s.marks,
        })),
        onProgress: (progress) => {
          updateTestGeneration({
            phase: progress.phase,
            ...(progress.questionCount != null ? { questionCount: progress.questionCount } : {}),
            ...(progress.completedQuestions != null ? { completedQuestions: progress.completedQuestions } : {}),
          });
          setGenerationPhase(progress.phase);
          if (progress.questionCount != null) setGenerationQuestionCount(progress.questionCount);
          if (progress.completedQuestions != null) setCompletedQuestions(progress.completedQuestions);
          if (progress.questionCount != null && progress.phase !== "selecting") {
            // DOCX generation also builds a PDF preview.
            const perQuestion = format === "pdf" ? 5 : 4;
            const estimate = Math.max(20, Math.round(learnedSecondsPerQuestion
              ? progress.questionCount * learnedSecondsPerQuestion
              : 15 + progress.questionCount * perQuestion));
            updateTestGeneration({ estimatedSeconds: estimate });
          }
        },
      });
      // Adapt future estimates to the actual cost of exports on this device.
      // Selection now has a strict small budget; this mainly learns document
      // rendering/storage cost for the chosen output format.
      const observedSecondsPerQuestion = Math.max(1, (Date.now() - start) / 1000 / Math.max(1, meta.question_count));
      try {
        const previous = readTestRuntimeEstimate(format);
        const updated = previous == null
          ? observedSecondsPerQuestion
          : previous * 0.5 + observedSecondsPerQuestion * 0.5;
        window.localStorage.setItem(testRuntimeKey(format), String(updated));
      } catch {
        // Private browsing or storage restrictions should not interrupt exports.
      }
      setResult(meta);
      updateTestGeneration({ status: "complete", result: meta });
      notify("Test generated", "success", `${meta.question_count} questions · ${meta.achieved_marks} marks`);
      refetchPastTests();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to generate test";
      notify("Could not generate test", "error", message);
      updateTestGeneration({ status: "failed", error: message });
    } finally {
      setGenerating(false);
    }
  }

  async function handleDeleteTest(testId: string) {
    const ok = await confirm({
      title: "Delete this generated test?",
      description: "The test and any files generated from it are removed. This can't be undone.",
      confirmLabel: "Delete test",
      destructive: true,
    });
    if (!ok) return;
    await api.deleteTest(testId);
    if (result?.test_id === testId) setResult(null);
    qc.invalidateQueries({ queryKey: ["tests", courseId] });
  }

  if (!courseId) {
    return <p className="text-sm text-muted-foreground">Select a course to generate a test.</p>;
  }

  return (
    <div className="relative isolate">
      <PageHeader
        eyebrow="Assessment design"
        title="Test Generator"
        description="Build a print-ready paper section by section. Set a marks target and tailored topic, type and difficulty filters for each section."
      />

      <div className="min-w-0 space-y-5">
        <Panel>
          <PanelHead title="1 · Paper details" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Optional test title">
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={`${config?.name ?? "Course"} — Practice Test`}
                />
              </Field>
              <p className="self-center text-sm text-muted-foreground">Each section has its own topic, type and difficulty filters.</p>
            </div>
          </Panel>

          <div data-tour="testgen-sections">
          <Panel>
            <PanelHead
              title="2 · Build sections"
              note="Set the marks target and filters independently for each section."
              action={
                <Button size="sm" onClick={addSection}>
                  <Plus />
                  Add section
                </Button>
              }
            />
            <div className="space-y-3 p-5">
              {sections.map((sec, index) => (
                <div key={sec.id} className="rounded-lg border border-border bg-surface/50 p-4">
                  <div className="grid items-end gap-3 sm:grid-cols-[28px_minmax(140px,1fr)_auto]">
                    <span className="self-center font-mono text-xs text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <Field label="Name">
                      <Input
                        value={sec.name}
                        onChange={(e) => updateSection(sec.id, { name: e.target.value })}
                        placeholder="Section I (optional)"
                      />
                    </Field>
                    <div className="w-80 max-w-full">
                      <Field label="Section marks">
                        <div className="mt-2 flex items-center gap-3">
                          <input aria-label={`Section ${index + 1} marks slider`} className="h-2 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary" type="range" min={MIN_MARKS} max={MAX_MARKS} step={MARKS_SLIDER_STEP} value={sec.marks} onChange={(e) => updateSection(sec.id, { marks: Number(e.target.value) })} />
                          <SectionMarksInput label={`Section ${index + 1} marks`} value={sec.marks} onChange={(marks) => updateSection(sec.id, { marks })} />
                        </div>
                        <div className="mt-1 flex justify-between pr-[92px] font-mono text-[10px] text-muted-foreground"><span>{MIN_MARKS}</span><span>{MAX_MARKS} marks</span></div>
                      </Field>
                    </div>
                    <div className="flex items-center gap-1 pb-0.5">
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={index === 0}
                        onClick={() => moveSection(sec.id, -1)}
                        title="Move up"
                      >
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={index === sections.length - 1}
                        onClick={() => moveSection(sec.id, 1)}
                        title="Move down"
                      >
                        <ArrowDown className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={sections.length === 1}
                        onClick={() => removeSection(sec.id)}
                        title="Remove section"
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-4 border-t border-border pt-4">
                    <p className="label mb-2">Section filters</p>
                    <FilterMenu
                      inline
                      nodes={config?.nodes ?? []} counts={flatCounts} selectedNodes={sec.nodeIds}
                      onSelectedNodesChange={(nodeIds) => updateSection(sec.id, { nodeIds })}
                      onReset={() => updateSection(sec.id, { nodeIds: new Set(), typeKeys: [], difficulties: [], institutionYears: {} })}
                      questionTypes={config?.question_types ?? []} typeCounts={(sectionFacetQueries[index * 3]?.data as QuestionCountsResponse | undefined)?.by_type}
                      typeKeys={sec.typeKeys} onTypeKeysChange={(typeKeys) => updateSection(sec.id, { typeKeys })}
                      difficultyLevels={config?.difficulty_levels ?? []} difficultyCounts={(sectionFacetQueries[index * 3 + 1]?.data as QuestionCountsResponse | undefined)?.by_difficulty}
                      difficulties={sec.difficulties} onDifficultiesChange={(difficulties) => updateSection(sec.id, { difficulties })}
                      institutions={sourceOptions?.institutions} institutionCounts={sectionFacetQueries[index * 3 + 2]?.data as Record<string, { total: number; years: Record<string, number> }> | undefined} institutionYears={sec.institutionYears} onInstitutionYearsChange={(institutionYears) => updateSection(sec.id, { institutionYears })}
                    />
                    <span className="ml-2 text-xs text-muted-foreground">{sec.nodeIds.size || "All"} topics · {sec.typeKeys.length || "All"} types · {sec.difficulties.length || "All"} difficulties</span>
                    <p className="mt-2 text-sm font-medium" aria-live="polite">
                      Available: {loadingAvailability || !availability ? "Updating…" : `${availability[index]?.question_count ?? 0} questions · ${availability[index]?.available_marks ?? 0} marks`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
          </div>

          <Panel>
            <PanelHead title="3 · Output options" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Output format">
                <Select value={format} onValueChange={(v) => setFormat(v as "docx" | "pdf")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="docx">Word document (.docx)</SelectItem>
                    <SelectItem value="pdf">PDF document</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Usage history">
                <Select value={String(excludeRecentTests)} onValueChange={(v) => setExcludeRecentTests(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Off</SelectItem>
                    <SelectItem value="1">Last 1 test</SelectItem>
                    <SelectItem value="2">Last 2 tests</SelectItem>
                    <SelectItem value="3">Last 3 tests</SelectItem>
                    <SelectItem value="5">Last 5 tests</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Keep question ids">
                <Input value={keepQuestionIds} onChange={(e) => setKeepQuestionIds(e.target.value)} placeholder="q1, q2" />
              </Field>
      <Field label="Question ordering">
                <Select value={ordering} onValueChange={setOrdering}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="random">Random selection</SelectItem>
                    <SelectItem value="sequential">Sequential (oldest first)</SelectItem>
                    <SelectItem value="difficulty">By difficulty (easiest first)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4" data-tour="testgen-generate">
              <Meta>
                {sections.length} section{sections.length === 1 ? "" : "s"} ·{" "}
                {summary.marksRequested} marks requested · {loadingAvailability || !availability ? "Updating availability…" : `${summary.availableQuestions} available questions · ${summary.availableMarks} available marks`}
              </Meta>
              <Button disabled={generating || taskRunning || !allSectionsValid} onClick={handleGenerate}>
                <Printer />
                {generating || taskRunning ? "Generating…" : "Generate paper"}
              </Button>
            </div>
          </Panel>

          {result && (
            <Panel>
              <PanelHead
                title="Generated paper"
                note={`${result.question_count} questions · ${result.achieved_marks} marks`}
                action={
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" disabled={!!downloading} onClick={() => handleSolutions(result)}>
                      <BookOpen />
                      {downloading === `${result.test_id}:solutions` ? "Preparing…" : "Solutions"}
                    </Button>
                    <Button size="sm" variant="outline" disabled={!!downloading} onClick={() => handleDownload(result)}>
                      <Download />
                      {downloading === `${result.test_id}:test` ? "Downloading…" : "Download paper"}
                    </Button>
                  </div>
                }
              />
              {markMismatches.length > 0 && (
                <div className="mx-5 mt-4 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm" role="status">
                  {markMismatches.map((section, index) => (
                    <p key={`${section.name}-${index}`}>
                      {`${section.name}: the requested ${section.marks_requested} marks weren’t achievable exactly; the closest available total was ${section.marks} marks.`}
                    </p>
                  ))}
                </div>
              )}
              <div className="grid gap-4 p-5 xl:grid-cols-[220px_1fr]">
                <div>
                  <p className="label">Actual selection</p>
                  <div className="mt-2">
                    <MiniRows rows={sectionRows} />
                  </div>
                </div>
                <div className="paper-preview">
                  <div className="border-b-2 border-foreground pb-3 text-center">
                    <p className="font-display text-lg font-semibold">{result.title}</p>
                    <p className="font-mono text-[9px] uppercase">
                      {result.question_count} questions · {result.achieved_marks} marks
                    </p>
                  </div>
                  <div className="mt-4 text-xs leading-5">
                    <p>A preview of the generated test paper appears below.</p>
                    {previewUrl ? (
                      <iframe
                        src={previewUrl}
                        title="Test preview"
                        className="mt-3 w-full rounded-md border border-border"
                        style={{ height: "60vh" }}
                      />
                    ) : (
                      <div className="mt-3 rounded-md border border-border bg-background/40 p-6">
                        <LoadingState label="Loading preview…" />
                        <p className="mt-2 text-center text-xs text-muted-foreground">
                          If it stays blank, use Download paper — the PDF may no longer be stored in this browser.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Panel>
          )}

          <Panel>
              <PanelHead title="Past tests" note="Previously generated papers" />
            {loadingPastTests ? (
              <div className="px-5 py-8"><LoadingState label="Loading past tests…" /></div>
            ) : !pastTests || pastTests.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted-foreground">
                No tests generated yet for this course.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {pastTests.map((t) => (
                  <div key={t.test_id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{t.title}</p>
                      <Meta>
                        {formatDate(t.created_at)} · {t.question_count} questions · {t.achieved_marks} marks ·{" "}
                        {t.format.toUpperCase()}
                      </Meta>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" title="Preview" onClick={() => setResult(t)}>
                        <Eye />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Paper"
                        disabled={!!downloading}
                        onClick={() => handleDownload(t)}
                      >
                        <FileText />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Solutions"
                        disabled={!!downloading}
                        onClick={() => handleSolutions(t)}
                      >
                        <BookOpen />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Delete"
                        onClick={() => handleDeleteTest(t.test_id)}
                      >
                        <Trash2 className="text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
        {blockingGeneration && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 px-5 py-10 backdrop-blur-sm"
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            <InkLoader
              intervalMs={4000}
              progress={activeGenerationProgress}
              markClassName="text-[2.8rem]"
              messages={activeGenerationMessages}
            />
          </div>
        )}
    </div>
  );
}
