import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { formatQuestionType } from "../lib/questionTypes";
import { useActiveCourse } from "../hooks/useActiveCourse";
import { useCourseConfig } from "../hooks/useCourseConfig";
import { notify, startOperationNotification } from "../lib/notifications";
import { StructureEditor } from "../components/StructureEditor";
import { MathText } from "../components/MathText";
import { QuestionEditor } from "../components/QuestionEditor";
import { PageHeader, Panel, PanelHead, Meta, Pagination } from "../components/system";
import { Button } from "../components/ui/button";
import { ToggleButton } from "../components/FilterMenu";
import { Modal, useConfirm } from "../components/ui/modal";
import { Input } from "../components/ui/input";
import { Switch } from "../components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import type { Question } from "../api/types";
import { Download, Plus, Pencil, Trash2, ExternalLink, ListChecks, Shapes, Gauge, School, Tags } from "lucide-react";

type Tab = "structure" | "tags" | "questions";
type ExportTab = "type" | "difficulty" | "institution" | "tags" | "scope";
const PAGE_SIZE = 20;

export function CourseSettings() {
  const { courseId, setCourseId } = useActiveCourse();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data: config } = useCourseConfig(courseId);
  const [tab, setTab] = useState<Tab>("structure");
  const [deleting, setDeleting] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [deleteQuestionsOpen, setDeleteQuestionsOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [exportFormat, setExportFormat] = useState<"course" | "questions">("course");
  const [exportTab, setExportTab] = useState<ExportTab>("type");
  const [exportTypes, setExportTypes] = useState<string[]>([]);
  const [exportDifficulties, setExportDifficulties] = useState<number[]>([]);
  const [exportInstitutions, setExportInstitutions] = useState<string[]>([]);
  const [exportTags, setExportTags] = useState<string[]>([]);
  const [exportLearning, setExportLearning] = useState(true);
  const [exportResponses, setExportResponses] = useState(false);
  const { data: sourceOptions } = useQuery({
    queryKey: ["question-source-options", courseId],
    queryFn: () => api.questionSourceOptions(courseId!),
    enabled: !!courseId && (exportMenuOpen || deleteQuestionsOpen),
  });

  if (!courseId || !config) {
    return <p className="text-sm text-muted-foreground">Select a course to manage its settings.</p>;
  }

  const handleSkill = async () => {
    try {
      await api.downloadSkill(config.course_id);
      notify("Skill file downloaded", "success");
    } catch (e) {
      notify("Could not download skill file", "error", e instanceof Error ? e.message : "Failed to download skill file");
    }
  };

  const handleExport = async () => {
    const exportTask = startOperationNotification(exportFormat === "course" ? "Exporting course…" : "Exporting questions…");
    setExportMenuOpen(false);
    try {
      const filters = {
        typeKeys: exportTypes,
        difficulties: exportDifficulties,
        institutions: exportInstitutions,
        tags: exportTags,
      };
      if (exportFormat === "questions") await api.exportQuestions(config.course_id, filters, exportTask.progress);
      else
        await api.exportCourse(config.course_id, filters, {
          includeLearningData: exportLearning,
          includeResponseText: exportResponses,
        }, exportTask.progress);
      exportTask.succeed(exportFormat === "course" ? "Course export ready" : "Question export ready");
    } catch (e) {
      exportTask.fail("Export failed", e instanceof Error ? e.message : "Failed to create the export file.");
    }
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      const sourceFilters = exportInstitutions.flatMap((institution) => {
        const option = sourceOptions?.institutions.find((item) => item.name === institution);
        return option ? [{ institution, years: option.years }] : [];
      });
      const selectedTags = exportTags;
      const tagsToQuery = selectedTags.length ? selectedTags : [undefined];
      const ids = new Set<string>();
      for (const tag of tagsToQuery) {
        const first = await api.listQuestions(config.course_id, {
          type: exportTypes.length ? exportTypes : undefined,
          difficulty: exportDifficulties.length ? exportDifficulties : undefined,
          source_filters: exportInstitutions.length ? sourceFilters : undefined,
          tag,
          page: 1,
          page_size: 500,
        });
        first.items.forEach((item) => ids.add(item.question_id));
        for (let page = 2; page <= Math.ceil(first.total / first.page_size); page++) {
          const next = await api.listQuestions(config.course_id, {
            type: exportTypes.length ? exportTypes : undefined,
            difficulty: exportDifficulties.length ? exportDifficulties : undefined,
            source_filters: exportInstitutions.length ? sourceFilters : undefined,
            tag,
            page,
            page_size: first.page_size,
          });
          next.items.forEach((item) => ids.add(item.question_id));
        }
      }
      if (!ids.size) {
        setDeleteQuestionsOpen(false);
        return;
      }
      const ok = await confirm({
        title: "Delete these questions?",
        description: `This permanently deletes ${ids.size} matching question${ids.size === 1 ? "" : "s"}, including any practice history and review schedule for them. It can't be undone.`,
        confirmLabel: `Delete ${ids.size} question${ids.size === 1 ? "" : "s"}`,
        destructive: true,
      });
      if (!ok) return;
      for (const id of ids) await api.deleteQuestion(id);
      setDeleteQuestionsOpen(false);
      qc.invalidateQueries({ queryKey: ["questions", config.course_id] });
      qc.invalidateQueries({ queryKey: ["question-counts", config.course_id] });
      notify("Questions deleted", "success", `${ids.size} question${ids.size === 1 ? "" : "s"} deleted.`);
    } catch (e) {
      notify("Could not delete questions", "error", e instanceof Error ? e.message : "Failed to delete questions.");
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleDeleteCourse = async () => {
    const ok = await confirm({
      title: "Delete this course?",
      description: `“${config.name}” and all of its questions, images, practice history, review schedule, settings and generated tests will be permanently deleted. This cannot be undone. Export a backup first if you may want any of it later.`,
      confirmLabel: "Delete course",
      destructive: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await api.deleteCourse(config.course_id);
      qc.removeQueries({ predicate: (query) => query.queryKey.includes(config.course_id) });
      await qc.invalidateQueries({ queryKey: ["courses"] });
      setCourseId(null);
      notify("Course deleted", "success");
    } catch (e) {
      notify("Could not delete course", "error", e instanceof Error ? e.message : "Failed to delete course.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Course management"
        title={config.name}
        description="Manage this course's structure and its questions directly."
        actions={
          <>
            <Button variant="outline" onClick={() => { setExportFormat("course"); setExportMenuOpen(true); }} title="Choose which questions to include in the .qb export.">
              <Download />
              Export course
            </Button>
            <Button variant="outline" onClick={() => { setExportFormat("questions"); setExportMenuOpen(true); }} title="Choose which questions to include in the editable question export.">
              <Download />
              Export questions
            </Button>
            <Button variant="destructive" onClick={() => setDeleteQuestionsOpen(true)} title="Choose which questions to delete.">
              <Trash2 />
              Delete questions
            </Button>
            <Button
              variant="outline"
              onClick={handleSkill}
              title="Download a .skill file: general document-to-question instructions plus this course's specific structure and marking-guide rules, for use with an AI assistant to convert source exams into an importable JSON file."
            >
              <ExternalLink />
              Download skill file
            </Button>
            <Button variant="destructive" onClick={() => void handleDeleteCourse()} disabled={deleting} title="Permanently delete this course and its data.">
              <Trash2 />
              {deleting ? "Deleting…" : "Delete course"}
            </Button>
          </>
        }
      />
      <Modal
        open={exportMenuOpen}
        onClose={() => setExportMenuOpen(false)}
        label="Export options"
        header={exportFormat === "course" ? "Export course" : "Export questions"}
        headerNote="Choose which questions to include. Empty sections include all values."
        footer={
          <>
            <Button variant="outline" onClick={() => { setExportTypes([]); setExportDifficulties([]); setExportInstitutions([]); setExportTags([]); }}>Reset</Button>
            <Button className="ml-auto" onClick={() => void handleExport()}><Download />{exportFormat === "course" ? "Export .qb" : "Export questions"}</Button>
          </>
        }
      >
        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <nav aria-label="Export sections" className="shrink-0 border-b border-border p-2 sm:w-48 sm:border-b-0 sm:border-r sm:p-3">
            <div className="flex flex-row gap-1 sm:flex-col">
              {([
                ["type", "Question type", Shapes],
                ["difficulty", "Difficulty", Gauge],
                ["institution", "Institution", School],
                ["tags", "Tags", Tags],
                ["scope", "What's included", ListChecks],
              ] as const).map(([key, label, Icon]) => (
                <button key={key} type="button" onClick={() => setExportTab(key)} aria-current={exportTab === key ? "page" : undefined} className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm font-medium transition ${exportTab === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-surface hover:text-foreground"}`}>
                  <Icon className="size-4 shrink-0" aria-hidden /><span className="min-w-0 flex-1">{label}</span>
                </button>
              ))}
            </div>
          </nav>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {exportTab === "type" && <ExportOptionGroup title="Question type" values={config.question_types} selected={exportTypes} onChange={setExportTypes} />}
            {exportTab === "difficulty" && <ExportOptionGroup title="Difficulty" values={config.difficulty_levels.map((d) => d.level)} selected={exportDifficulties} onChange={setExportDifficulties} labels={Object.fromEntries(config.difficulty_levels.map((d) => [d.level, d.label]))} />}
            {exportTab === "institution" && <ExportOptionGroup title="Institution" values={(sourceOptions?.institutions ?? []).map((i) => i.name)} selected={exportInstitutions} onChange={setExportInstitutions} emptyLabel={sourceOptions ? "No institutions found." : "Loading institutions…"} />}
            {exportTab === "tags" && <ExportOptionGroup title="Tags" values={config.tags} selected={exportTags} onChange={setExportTags} />}
            {exportTab === "scope" && <ExportScope includeLearning={exportLearning} onIncludeLearningChange={setExportLearning} includeResponses={exportResponses} onIncludeResponsesChange={setExportResponses} />}
          </div>
        </div>
      </Modal>

      <Modal
        open={deleteQuestionsOpen}
        onClose={() => setDeleteQuestionsOpen(false)}
        onCloseDisabled={bulkDeleting}
        label="Delete question options"
        header="Delete questions"
        headerNote="Choose matching questions to delete. Empty sections include all values."
        footer={
          <>
            <Button variant="outline" disabled={bulkDeleting} onClick={() => { setExportTypes([]); setExportDifficulties([]); setExportInstitutions([]); setExportTags([]); }}>Reset</Button>
            <div className="ml-auto flex gap-2"><Button variant="outline" disabled={bulkDeleting} onClick={() => setDeleteQuestionsOpen(false)}>Cancel</Button><Button variant="destructive" disabled={bulkDeleting || (exportInstitutions.length > 0 && !sourceOptions)} onClick={() => void handleBulkDelete()}><Trash2 />{bulkDeleting ? "Deleting…" : "Delete matching questions"}</Button></div>
          </>
        }
      >
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <ExportOptionGroup title="Question type" values={config.question_types} selected={exportTypes} onChange={setExportTypes} />
          <ExportOptionGroup title="Difficulty" values={config.difficulty_levels.map((d) => d.level)} selected={exportDifficulties} onChange={setExportDifficulties} labels={Object.fromEntries(config.difficulty_levels.map((d) => [d.level, d.label]))} />
          <ExportOptionGroup title="Institution" values={(sourceOptions?.institutions ?? []).map((i) => i.name)} selected={exportInstitutions} onChange={setExportInstitutions} emptyLabel={sourceOptions ? "No institutions found." : "Loading institutions…"} />
          <ExportOptionGroup title="Tags" values={config.tags} selected={exportTags} onChange={setExportTags} />
        </div>
      </Modal>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="mb-5">
          <TabsTrigger value="structure">Structure</TabsTrigger>
          <TabsTrigger value="tags">Tags</TabsTrigger>
          <TabsTrigger value="questions">Questions</TabsTrigger>
        </TabsList>
        <TabsContent value="structure" className="space-y-5">
          <CourseNameSettings key={config.course_id} courseId={config.course_id} name={config.name} />
          <StructureEditor config={config} />
        </TabsContent>
        <TabsContent value="tags">
          <CourseTagSettings courseId={config.course_id} tags={config.tags} />
        </TabsContent>
        <TabsContent value="questions">
          <QuestionManager config={config} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ExportScope({
  includeLearning,
  onIncludeLearningChange,
  includeResponses,
  onIncludeResponsesChange,
}: {
  includeLearning: boolean;
  onIncludeLearningChange: (value: boolean) => void;
  includeResponses: boolean;
  onIncludeResponsesChange: (value: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="label mb-1">Always included in a .qb export</p>
      <ul className="space-y-1.5 text-sm text-muted-foreground">
        <li>• Course structure, hierarchy levels, difficulty levels and allowed tags</li>
        <li>• Every question matching your filters, with answers, marking guides and hints</li>
        <li>• Images and diagrams used by those questions</li>
      </ul>
      <p className="label mb-1">Not included</p>
      <ul className="space-y-1.5 text-sm text-muted-foreground">
        <li>• Generated tests and their files — regenerate them from the questions</li>
        <li>• Your review intervals and queue settings, which are preferences on this device</li>
      </ul>
      <div className="space-y-3 border-t border-border pt-4">
        <label className="flex items-start gap-2.5">
          <Switch checked={includeLearning} onCheckedChange={onIncludeLearningChange} />
          <span className="min-w-0">
            <span className="block text-sm font-medium">Include practice history</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              The review schedule for each question and every practice attempt: when it was
              seen, whether you attempted or reviewed it, how you rated it, and how long it took.
              Without this, an imported course starts with an empty schedule.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2.5">
          <Switch
            checked={includeResponses}
            disabled={!includeLearning}
            onCheckedChange={onIncludeResponsesChange}
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium">Include answers you typed</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {includeLearning
                ? "The free-text responses you wrote while practising. Leave this off to share a backup without your written work."
                : "Available once practice history is included."}
            </span>
          </span>
        </label>
      </div>
    </div>
  );
}

function CourseNameSettings({ courseId, name }: { courseId: string; name: string }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState(name);
  const [saving, setSaving] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim() || draft.trim() === name) return;
    setSaving(true);
    try {
      await api.updateCourseName(courseId, draft);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["course", courseId] }),
        qc.invalidateQueries({ queryKey: ["courses"] }),
      ]);
      notify("Course renamed", "success");
    } catch (e) {
      notify("Could not rename course", "error", e instanceof Error ? e.message : "Couldn't rename course.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel>
      <PanelHead title="Course name" note="Rename this course wherever it appears in Quaestio." />
      <form onSubmit={(event) => void save(event)} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <Input aria-label="Course name" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={200} />
        </div>
        <Button type="submit" disabled={saving || !draft.trim() || draft.trim() === name}>
          {saving ? "Saving…" : "Save name"}
        </Button>
      </form>
    </Panel>
  );
}

function ExportOptionGroup<T extends string | number>({ title, values, selected, onChange, labels, emptyLabel }: {
  title: string; values: T[]; selected: T[]; onChange: (values: T[]) => void; labels?: Record<string, string>; emptyLabel?: string;
}) {
  const toggle = (value: T) => onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  return <div><p className="label mb-2">{title}</p>{values.length === 0 ? <p className="text-sm text-muted-foreground">{emptyLabel ?? `No ${title.toLowerCase()} values defined.`}</p> : <div className="space-y-1.5">{values.map((value) => <ToggleButton key={value} enabled={selected.includes(value)} onClick={() => toggle(value)}>{labels?.[String(value)] ?? String(value)}</ToggleButton>)}</div>}</div>;
}

function CourseTagSettings({ courseId, tags }: { courseId: string; tags: string[] }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<string[] | null>(null);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const values = draft ?? tags;

  async function save(next: string[]) {
    setSaving(true);
    try {
      await api.updateCourseTags(courseId, next);
      setDraft(null);
      await qc.invalidateQueries({ queryKey: ["course", courseId] });
      notify("Tags updated", "success");
    } catch (e) {
      notify("Could not save tags", "error", e instanceof Error ? e.message : "Couldn't save tag list.");
    } finally {
      setSaving(false);
    }
  }

  function add() {
    const name = input.trim();
    if (name && !values.includes(name)) setDraft([...values, name]);
    setInput("");
  }

  return (
    <Panel>
      <PanelHead title="Allowed tags" note="Only tags in this list can be assigned to course questions." />
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap gap-2">
          {values.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-2 rounded-md bg-muted px-3 py-1.5 text-sm">
              {tag}
              {tag !== "action_required" && <button type="button" aria-label={`Remove ${tag}`} className="text-muted-foreground hover:text-foreground" onClick={() => setDraft(values.filter((item) => item !== tag))}>×</button>}
            </span>
          ))}
        </div>
        <form className="flex max-w-lg gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Add an allowed tag" aria-label="New allowed tag" />
          <Button type="submit" variant="outline">Add</Button>
        </form>
        <div className="flex items-center gap-2">
          <Button disabled={saving || draft === null} onClick={() => void save(values)}>{saving ? "Saving…" : "Save tag list"}</Button>
          {draft !== null && <Button variant="ghost" disabled={saving} onClick={() => setDraft(null)}>Discard</Button>}
        </div>
      </div>
    </Panel>
  );
}

function QuestionManager({ config }: { config: NonNullable<ReturnType<typeof useCourseConfig>["data"]> }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [page, setPage] = useState(1);
  const [editorMode, setEditorMode] = useState<"closed" | "create" | "edit">("closed");
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);

  const { data: results, isLoading } = useQuery({
    queryKey: ["questions", config.course_id, "manage", page],
    queryFn: () => api.listQuestions(config.course_id, { page, page_size: PAGE_SIZE, sort: "created_desc" }),
  });

  function refresh() {
    qc.invalidateQueries({ queryKey: ["questions", config.course_id] });
    qc.invalidateQueries({ queryKey: ["question-counts", config.course_id] });
  }

  async function openEdit(questionId: string) {
    const q = await api.getQuestion(questionId);
    setEditingQuestion(q);
    setEditorMode("edit");
  }

  async function handleDelete(questionId: string) {
    const ok = await confirm({
      title: "Delete this question?",
      description:
        "The question, its images, and any practice history and review schedule for it will be permanently deleted. This can't be undone.",
      confirmLabel: "Delete question",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.deleteQuestion(questionId);
    } catch (err) {
      notify("Could not delete question", "error", err instanceof Error ? err.message : String(err));
      return;
    }
    refresh();
    notify("Question deleted", "success");
  }

  function closeEditor() {
    setEditorMode("closed");
    setEditingQuestion(null);
  }

  if (editorMode !== "closed") {
    return (
      <div>
        <QuestionEditor
          config={config}
          existing={editingQuestion ?? undefined}
          onSaved={() => { refresh(); closeEditor(); }}
          onCancel={closeEditor}
        />
      </div>
    );
  }

  const totalPages = results ? Math.max(1, Math.ceil(results.total / PAGE_SIZE)) : 1;

  return (
    <Panel>
      <PanelHead
        title="Course questions"
        note={isLoading ? "Loading…" : `${results?.total ?? 0} questions`}
        action={
          <Button size="sm" onClick={() => setEditorMode("create")}>
            <Plus />
            Add question
          </Button>
        }
      />
      <div className="divide-y divide-border">
        {results?.items.map((item) => (
          <div key={item.question_id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-4">
            <div className="min-w-0">
              <p className="truncate font-serif"><MathText text={item.snippet} /></p>
              {(item.type_key || item.difficulty != null || item.marks != null) && (
                <Meta>
                  {[
                    formatQuestionType(item.type_key),
                    item.difficulty != null && `Difficulty ${item.difficulty}`,
                    item.marks != null && `${item.marks} marks`,
                  ].filter(Boolean).join(" · ")}
                </Meta>
              )}
            </div>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" onClick={() => openEdit(item.question_id)}>
                <Pencil />
              </Button>
              <Button size="icon" variant="ghost" className="text-destructive" onClick={() => handleDelete(item.question_id)}>
                <Trash2 />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {results && results.items.length === 0 && !isLoading && (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">No questions yet — add the first one above.</p>
      )}

      <div className="border-t border-border p-4">
        <Pagination page={page} totalPages={totalPages} onPrev={() => setPage((p) => p - 1)} onNext={() => setPage((p) => p + 1)} />
      </div>
    </Panel>
  );
}
