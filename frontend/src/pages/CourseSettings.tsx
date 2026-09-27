import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { formatQuestionType } from "../lib/questionTypes";
import { useActiveCourse } from "../hooks/useActiveCourse";
import { useCourseConfig } from "../hooks/useCourseConfig";
import { StructureEditor } from "../components/StructureEditor";
import { MathText } from "../components/MathText";
import { QuestionEditor } from "../components/QuestionEditor";
import { PageHeader, Panel, PanelHead, Meta, Pagination } from "../components/system";
import { Button } from "../components/ui/button";
import { ToggleButton } from "../components/FilterMenu";
import { Input } from "../components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import type { Question } from "../api/types";
import { Download, Plus, Pencil, Trash2, ExternalLink, X, Shapes, Gauge, School, Tags } from "lucide-react";

type Tab = "structure" | "tags" | "questions";
const PAGE_SIZE = 20;

export function CourseSettings() {
  const { courseId, setCourseId } = useActiveCourse();
  const qc = useQueryClient();
  const { data: config } = useCourseConfig(courseId);
  const [tab, setTab] = useState<Tab>("structure");
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<"course" | "questions">("course");
  const [exportTab, setExportTab] = useState<"type" | "difficulty" | "institution" | "tags">("type");
  const [exportTypes, setExportTypes] = useState<string[]>([]);
  const [exportDifficulties, setExportDifficulties] = useState<number[]>([]);
  const [exportInstitutions, setExportInstitutions] = useState<string[]>([]);
  const [exportTags, setExportTags] = useState<string[]>([]);
  const { data: sourceOptions } = useQuery({
    queryKey: ["question-source-options", courseId],
    queryFn: () => api.questionSourceOptions(courseId!),
    enabled: !!courseId && exportMenuOpen,
  });

  if (!courseId || !config) {
    return <p className="text-sm text-muted-foreground">Select a course to manage its settings.</p>;
  }

  const handleSkill = async () => {
    setActionError(null);
    try {
      await api.downloadSkill(config.course_id);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to download skill file");
    }
  };

  const handleExport = async () => {
    setActionError(null);
    try {
      const filters = {
        typeKeys: exportTypes,
        difficulties: exportDifficulties,
        institutions: exportInstitutions,
        tags: exportTags,
      };
      if (exportFormat === "questions") await api.exportQuestions(config.course_id, filters);
      else await api.exportCourse(config.course_id, filters);
      setExportMenuOpen(false);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to export course");
    }
  };

  const handleDeleteCourse = async () => {
    if (!window.confirm(`Delete “${config.name}” and all its questions, history, settings, and generated tests? This cannot be undone.`)) return;
    setActionError(null);
    setDeleting(true);
    try {
      await api.deleteCourse(config.course_id);
      qc.removeQueries({ predicate: (query) => query.queryKey.includes(config.course_id) });
      await qc.invalidateQueries({ queryKey: ["courses"] });
      setCourseId(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to delete course");
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
      {actionError && (
        <p className="mb-4 text-sm text-destructive">{actionError}</p>
      )}

      {exportMenuOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="absolute inset-0 bg-foreground/25 backdrop-blur-[2px]" onClick={() => setExportMenuOpen(false)} />
          <div className="relative flex min-h-full items-center justify-center p-4">
            <section role="dialog" aria-modal="true" aria-label="Export options" className="panel flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden">
              <header className="flex items-center justify-between border-b border-border px-5 py-4">
                <div><h2 className="font-display text-lg font-semibold">{exportFormat === "course" ? "Export course" : "Export questions"}</h2><p className="text-xs text-muted-foreground">Choose which questions to include. Empty sections include all values.</p></div>
                <Button size="icon" variant="ghost" aria-label="Close export options" onClick={() => setExportMenuOpen(false)}><X /></Button>
              </header>
              <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
                <nav aria-label="Export sections" className="shrink-0 border-b border-border p-2 sm:w-48 sm:border-b-0 sm:border-r sm:p-3">
                  <div className="flex flex-row gap-1 sm:flex-col">
                    {([
                      ["type", "Question type", Shapes],
                      ["difficulty", "Difficulty", Gauge],
                      ["institution", "Institution", School],
                      ["tags", "Tags", Tags],
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
                </div>
              </div>
              <footer className="flex justify-end gap-2 border-t border-border px-5 py-3">
                <Button variant="outline" onClick={() => { setExportTypes([]); setExportDifficulties([]); setExportInstitutions([]); setExportTags([]); }}>Reset</Button>
                <Button onClick={() => void handleExport()}><Download />{exportFormat === "course" ? "Export .qb" : "Export questions"}</Button>
              </footer>
            </section>
          </div>
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="mb-5">
          <TabsTrigger value="structure">Structure</TabsTrigger>
          <TabsTrigger value="tags">Tags</TabsTrigger>
          <TabsTrigger value="questions">Questions</TabsTrigger>
        </TabsList>
        <TabsContent value="structure" className="space-y-5">
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
  const [error, setError] = useState<string | null>(null);
  const values = draft ?? tags;

  async function save(next: string[]) {
    setSaving(true);
    setError(null);
    try {
      await api.updateCourseTags(courseId, next);
      setDraft(null);
      await qc.invalidateQueries({ queryKey: ["course", courseId] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save tag list");
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
        {error && <p className="text-sm text-destructive">{error}</p>}
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
    if (!window.confirm("Delete this question permanently? This can't be undone.")) return;
    try {
      await api.deleteQuestion(questionId);
    } catch (err) {
      window.alert(`Couldn't delete this question.\n\n${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    refresh();
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
