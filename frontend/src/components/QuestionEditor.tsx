import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react";
import { api } from "../api/client";
import { formatQuestionType } from "../lib/questionTypes";
import { ToggleButton } from "./FilterMenu";
import { BlockEditor, blocksToPayload, emptyBlock, type EditableBlock } from "./BlockEditor";
import type { CourseFullConfig, ContentBlock, CourseNode, Question, Stimulus } from "../api/types";
import { Field, Panel, PanelHead } from "./system";
import { Button } from "./ui/button";
import { notify, startOperationNotification } from "../lib/notifications";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Switch } from "./ui/switch";
import { Checkbox } from "./ui/checkbox";
import { Modal, useConfirm } from "./ui/modal";
import { StimulusManager } from "./StimulusManager";

interface EditableOption {
  blocks: EditableBlock[];
  isCorrect: boolean;
}

interface EditablePart {
  questionId?: string;
  label: string;
  marks: string;
  body: EditableBlock[];
  hint: EditableBlock[];
  answer: EditableBlock[];
  solution: EditableBlock[];
  markingCriteria: EditableBlock[];
  parts: EditablePart[];
}

function toEditablePart(part: Question): EditablePart {
  return {
    questionId: part.question_id, label: part.part_label ?? "", marks: part.marks?.toString() ?? "",
    body: toEditable(part.body), hint: toEditable(part.hint), answer: toEditable(part.answer),
    solution: toEditable(part.solution), markingCriteria: toEditable(part.marking_criteria),
    parts: part.parts.map(toEditablePart),
  };
}

function newPart(label: string): EditablePart {
  return { label, marks: "", body: [emptyBlock("text")], hint: [], answer: [], solution: [], markingCriteria: [], parts: [] };
}

function partToPayload(part: EditablePart, typeKey: string): Record<string, unknown> {
  return {
    question_id: part.questionId, type_key: typeKey, part_label: part.label, marks: part.marks ? Number(part.marks) : null,
    body: blocksToPayload(part.body), hint: blocksToPayload(part.hint), answer: blocksToPayload(part.answer),
    solution: blocksToPayload(part.solution), marking_criteria: blocksToPayload(part.markingCriteria),
    parts: part.parts.map((child) => partToPayload(child, typeKey)),
  };
}

function updatePartTree(items: EditablePart[], path: number[], update: (part: EditablePart) => EditablePart): EditablePart[] {
  const [index, ...rest] = path;
  return items.map((part, i) => i !== index ? part : rest.length
    ? { ...part, parts: updatePartTree(part.parts, rest, update) }
    : update(part));
}

function PartEditor({ parts, path = [], setParts, markChanged }: {
  parts: EditablePart[]; path?: number[]; setParts: React.Dispatch<React.SetStateAction<EditablePart[]>>; markChanged: () => void;
}) {
  const update = (index: number, change: (part: EditablePart) => EditablePart) => {
    markChanged(); setParts((current) => updatePartTree(current, [...path, index], change));
  };
  return <div className="space-y-4">
    {parts.map((part, index) => <div key={part.questionId ?? [...path, index].join("-")} className="space-y-4 rounded-md border border-border p-4">
      <div className="flex items-end gap-3">
        <Field label="Part label"><Input value={part.label} onChange={(e) => update(index, (p) => ({ ...p, label: e.target.value }))} placeholder={path.length ? "i" : "a"} /></Field>
        <Field label="Marks"><Input type="number" step="0.5" value={part.marks} onChange={(e) => update(index, (p) => ({ ...p, marks: e.target.value }))} /></Field>
        <Button type="button" variant="outline" size="sm" onClick={() => { markChanged(); setParts((current) => updatePartTree(current, [...path, index], (p) => ({ ...p, parts: [...p.parts, newPart(["i", "ii", "iii", "iv", "v"][p.parts.length] ?? String(p.parts.length + 1))] }))); }}><Plus /> Add sub-part</Button>
        <Button type="button" variant="ghost" size="icon" aria-label={`Remove part ${part.label || index + 1}`} onClick={() => { markChanged(); setParts((current) => { if (!path.length) return current.filter((_, i) => i !== index); return updatePartTree(current, path, (p) => ({ ...p, parts: p.parts.filter((_, i) => i !== index) })); }); }}><Trash2 /></Button>
      </div>
      <BlockEditor label={`Part ${part.label || index + 1} question`} blocks={part.body} onChange={(body) => update(index, (p) => ({ ...p, body }))} />
      <BlockEditor label={`Part ${part.label || index + 1} hint (optional)`} blocks={part.hint} onChange={(hint) => update(index, (p) => ({ ...p, hint }))} note="Shown during practice one step at a time, before the marking guide. Keep it answer-free." />
      <BlockEditor label={`Part ${part.label || index + 1} answer`} blocks={part.answer} onChange={(answer) => update(index, (p) => ({ ...p, answer }))} />
      <BlockEditor label={`Part ${part.label || index + 1} solution`} blocks={part.solution} onChange={(solution) => update(index, (p) => ({ ...p, solution }))} />
      <BlockEditor label={`Part ${part.label || index + 1} marking criteria`} blocks={part.markingCriteria} onChange={(markingCriteria) => update(index, (p) => ({ ...p, markingCriteria }))} />
      <PartEditor parts={part.parts} path={[...path, index]} setParts={setParts} markChanged={markChanged} />
    </div>)}
    {parts.length === 0 && path.length > 0 && <Button type="button" variant="outline" size="sm" onClick={() => { markChanged(); setParts((current) => updatePartTree(current, path, (p) => ({ ...p, parts: [...p.parts, newPart("i")] }))); }}><Plus /> Add sub-part</Button>}
  </div>;
}

function toEditable(blocks: ContentBlock[]): EditableBlock[] {
  return blocks
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((b) => ({ tempId: b.block_id, block_type: b.block_type, content: b.content }));
}

function descendantIds(node: CourseNode): string[] {
  return node.children.flatMap((child) => [child.node_id, ...descendantIds(child)]);
}

function renderClassification(nodes: CourseNode[], selected: Set<string>, onToggle: (id: string) => void) {
  return nodes.map((node) => {
    const selectedBelow = node.children.some((child) =>
      selected.has(child.node_id) || descendantIds(child).some((id) => selected.has(id))
    );
    const checked = selected.has(node.node_id);
    return (
      <div key={node.node_id} className="space-y-2">
        <ToggleButton enabled={checked} onClick={() => onToggle(node.node_id)}>
          {node.code && <span className="mr-1 font-mono text-[11px] text-muted-foreground">{node.code}</span>}
          <span className="whitespace-normal break-words">{node.name}</span>
        </ToggleButton>
        {node.children.length > 0 && (checked || selectedBelow) && (
          <div className="ml-3 space-y-2 border-l border-border pl-3 sm:ml-5 sm:pl-4">
            {renderClassification(node.children, selected, onToggle)}
          </div>
        )}
      </div>
    );
  });
}

function blockHasContent(block: EditableBlock): boolean {
  const c = block.content ?? {};
  switch (block.block_type) {
    case "text":
    case "heading":
      return String(c.text ?? "").trim().length > 0;
    case "equation":
      return String(c.latex ?? "").trim().length > 0;
    case "code":
      return String(c.code ?? "").trim().length > 0;
    case "image":
    case "diagram":
    case "graph":
      return Boolean(c.asset_path);
    case "table":
      return (Array.isArray(c.columns) && (c.columns as unknown[]).some((x) => String(x ?? "").trim().length > 0))
        || (Array.isArray(c.rows) && (c.rows as unknown[]).some((r) => Array.isArray(r) && (r as unknown[]).some((x) => String(x ?? "").trim().length > 0)));
    case "list":
      return Array.isArray(c.items) && (c.items as unknown[]).some((x) => String(x ?? "").trim().length > 0);
    case "function":
      return String(c.expression ?? "").trim().length > 0;
    case "answer_area":
    case "page_break":
      return true;
    default:
      return true;
  }
}

interface QuestionEditorProps {
  config: CourseFullConfig;
  existing?: Question;      // omit for "create new"
  onSaved: () => void;
  onCancel: () => void;
}

export function QuestionEditor({ config, existing, onSaved, onCancel }: QuestionEditorProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const confirm = useConfirm();
  const [typeKey, setTypeKey] = useState(existing?.type_key ?? config.question_types[0] ?? "short_answer");
  const [difficulty, setDifficulty] = useState<number | null>(existing?.difficulty ?? null);
  const [marks, setMarks] = useState<string>(existing?.marks?.toString() ?? "");
  const [nodeIds, setNodeIds] = useState<Set<string>>(new Set(existing?.node_ids ?? []));
  const [tags, setTags] = useState<string[]>(existing?.tags ?? []);
  const [sourceName, setSourceName] = useState(existing?.source?.name ?? "");
  const [sourceYear, setSourceYear] = useState(existing?.source?.year?.toString() ?? "");
  const [sourceInstitution, setSourceInstitution] = useState(existing?.source?.institution ?? "");
  const [sourceOriginalNo, setSourceOriginalNo] = useState(existing?.source?.original_question_no ?? "");
  const [reviewStatus, setReviewStatus] = useState(existing?.review_status ?? "approved");
  const [linkedStimuli, setLinkedStimuli] = useState<Stimulus[]>([]);
  const [initialLinkedIds, setInitialLinkedIds] = useState<Set<string>>(new Set());
  const [stimulusList, setStimulusList] = useState<Stimulus[]>([]);
  const [showStimulusModal, setShowStimulusModal] = useState(false);
  const [linking, setLinking] = useState(false);

  const [body, setBody] = useState<EditableBlock[]>(
    existing ? toEditable(existing.body) : [emptyBlock("text")]
  );
  const [answer, setAnswer] = useState<EditableBlock[]>(existing ? toEditable(existing.answer) : []);
  const [hint, setHint] = useState<EditableBlock[]>(existing ? toEditable(existing.hint) : []);
  const [solution, setSolution] = useState<EditableBlock[]>(existing ? toEditable(existing.solution) : []);
  const [markingCriteria, setMarkingCriteria] = useState<EditableBlock[]>(
    existing ? toEditable(existing.marking_criteria) : []
  );
  const [options, setOptions] = useState<EditableOption[]>(existing?.mcq_options?.map((option) => ({
    blocks: option.content.map((block, i) => ({ tempId: `option-${option.position}-${i}`, block_type: block.block_type, content: block.content })),
    isCorrect: option.is_correct,
  })) ?? (typeKey === "multiple_choice" ? [
    { blocks: [emptyBlock("text")], isCorrect: false },
    { blocks: [emptyBlock("text")], isCorrect: false },
  ] : []));
  const [parts, setParts] = useState<EditablePart[]>(existing?.parts.map(toEditablePart) ?? []);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [errors, setErrors] = useState<{ body?: string; marks?: string; mcq?: string }>({});
  const [showLeavePrompt, setShowLeavePrompt] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const pendingNavigation = useRef<(() => void) | null>(null);

  useEffect(() => {
    async function loadStimulusData() {
      try {
        const list = await api.listStimuliForCourse(config.course_id);
        setStimulusList(list);
        if (existing?.question_id) {
          const linked = await api.getStimuliForQuestion(existing.question_id);
          setLinkedStimuli(linked);
          setInitialLinkedIds(new Set(linked.map((s) => s.stimulus_id)));
        } else {
          setInitialLinkedIds(new Set());
        }
      } catch (err) {
        notify("Could not load stimuli", "error", err instanceof Error ? err.message : "Failed to load stimuli.");
      }
    }
    loadStimulusData();
  }, [config.course_id, existing?.question_id]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const onDocumentClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest<HTMLAnchorElement>("a[href^='#/']");
      if (!link || link.target === "_blank") return;
      const nextPath = link.getAttribute("href")?.slice(1).split(/[?#]/, 1)[0];
      if (!nextPath || nextPath === location.pathname) return;
      event.preventDefault();
      event.stopPropagation();
      pendingNavigation.current = () => navigate(nextPath);
      setShowLeavePrompt(true);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onDocumentClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onDocumentClick, true);
    };
  }, [hasUnsavedChanges, location.pathname, navigate]);

  function requestLeave(action: () => void) {
    if (!hasUnsavedChanges) {
      action();
      return;
    }
    pendingNavigation.current = action;
    setShowLeavePrompt(true);
  }

  function toggleNode(nodeId: string) {
    setHasUnsavedChanges(true);
    setNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
        const dropDescendants = (nodes: CourseNode[]): void => {
          for (const node of nodes) {
            if (node.node_id === nodeId) {
              descendantIds(node).forEach((id) => next.delete(id));
              return;
            }
            dropDescendants(node.children);
          }
        };
        dropDescendants(config.nodes);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const nextErrors: { body?: string; marks?: string; mcq?: string } = {};
    if (!body.some(blockHasContent)) {
      nextErrors.body = "Add at least one non-empty body block.";
    }
    if (marks.trim()) {
      const marksNumber = Number(marks);
      if (!Number.isFinite(marksNumber) || marksNumber < 0) {
        nextErrors.marks = "Marks must be a finite non-negative number.";
      }
    }
    const hasInvalidPartMarks = (items: EditablePart[]): boolean =>
      items.some((part) => {
        const value = part.marks.trim();
        if (value && (!Number.isFinite(Number(value)) || Number(value) < 0)) return true;
        return hasInvalidPartMarks(part.parts);
      });
    if (!nextErrors.marks && hasInvalidPartMarks(parts)) {
      nextErrors.marks = "Marks must be a finite non-negative number.";
    }
    if (typeKey === "multiple_choice") {
      if (options.length < 2) {
        nextErrors.mcq = "Multiple choice questions need at least 2 choices.";
      } else {
        const correctCount = options.filter((option) => option.isCorrect).length;
        if (correctCount !== 1) {
          nextErrors.mcq = "Select exactly one correct choice.";
        }
      }
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      notify("Please fix the highlighted fields.", "error");
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        type_key: typeKey,
        difficulty: difficulty,
        marks: marks ? Number(marks) : null,
        node_ids: Array.from(nodeIds),
        tag_names: tags,
        body: blocksToPayload(body),
        hint: blocksToPayload(hint),
        answer: blocksToPayload(answer),
        solution: blocksToPayload(solution),
        marking_criteria: blocksToPayload(markingCriteria),
        mcq_options: typeKey === "multiple_choice" ? options.map((option) => ({
          content: blocksToPayload(option.blocks),
          is_correct: option.isCorrect,
        })) : [],
        parts: parts.map((part) => partToPayload(part, typeKey)),
        review_status: reviewStatus,
        source_name: sourceName.trim() || null,
        source_year: sourceYear ? Number(sourceYear) : null,
        source_institution: sourceInstitution.trim() || null,
        source_original_question_no: sourceOriginalNo.trim() || null,
      };

      let questionId: string | undefined = existing?.question_id;
      if (existing) {
        await api.updateQuestion(existing.question_id, payload);
      } else {
        const created = await api.createQuestion({
          ...payload,
          course_id: config.course_id,
        });
        questionId = created.question_id;
      }
      if (questionId) {
        const finalIds = new Set(linkedStimuli.map((s) => s.stimulus_id));
        for (const id of initialLinkedIds) {
          if (!finalIds.has(id)) {
            await api.unlinkStimulusFromQuestion(id, questionId);
          }
        }
        for (const id of finalIds) {
          if (!initialLinkedIds.has(id)) {
            await api.linkStimulusToQuestion(id, questionId);
          }
        }
        setInitialLinkedIds(new Set(finalIds));
      }
      const leave = pendingNavigation.current;
      pendingNavigation.current = null;
      if (leave) leave();
      else onSaved();
    } catch (err) {
      notify("Could not save question", "error", err instanceof Error ? err.message : "Failed to save question.");
      if (pendingNavigation.current) setShowLeavePrompt(true);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!existing) return;
    const ok = await confirm({
      title: "Delete this question?",
      description:
        "The question, its images, and any practice history and review schedule for it are permanently deleted. This can't be undone.",
      confirmLabel: "Delete question",
      destructive: true,
    });
    if (!ok) return;
    setDeleting(true);
    const task = startOperationNotification("Deleting question…");
    try {
      await api.deleteQuestion(existing.question_id);
      task.succeed("Question deleted");
      setHasUnsavedChanges(false);
      onSaved();
    } catch (err) {
      task.fail("Could not delete question", err instanceof Error ? err.message : "Failed to delete question.");
    } finally {
      setDeleting(false);
    }
  }

  function toggleLinkedStimulus(stimulus: Stimulus) {
    setLinkedStimuli((prev) => {
      const has = prev.some((s) => s.stimulus_id === stimulus.stimulus_id);
      if (has) return prev.filter((s) => s.stimulus_id !== stimulus.stimulus_id);
      return [...prev, stimulus];
    });
    setHasUnsavedChanges(true);
  }

  async function handleLinkStimulus(stimulus: Stimulus) {
    if (!existing?.question_id) return;
    setLinking(true);
    try {
      await api.linkStimulusToQuestion(stimulus.stimulus_id, existing.question_id);
      setLinkedStimuli((prev) => [...prev, stimulus]);
      setStimulusList((prev) => {
        if (prev.some((s) => s.stimulus_id === stimulus.stimulus_id)) return prev;
        return [...prev, stimulus];
      });
      notify("Stimulus linked", "success");
    } catch (err) {
      notify("Could not link stimulus", "error", err instanceof Error ? err.message : "Failed to link stimulus.");
    } finally {
      setLinking(false);
    }
  }

  async function handleUnlinkStimulus(stimulus: Stimulus) {
    if (!existing?.question_id) {
      setLinkedStimuli((prev) => prev.filter((s) => s.stimulus_id !== stimulus.stimulus_id));
      return;
    }
    try {
      await api.unlinkStimulusFromQuestion(stimulus.stimulus_id, existing.question_id);
      setLinkedStimuli((prev) => prev.filter((s) => s.stimulus_id !== stimulus.stimulus_id));
      notify("Stimulus unlinked", "success");
    } catch (err) {
      notify("Could not unlink stimulus", "error", err instanceof Error ? err.message : "Failed to unlink stimulus.");
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} onChange={() => setHasUnsavedChanges(true)} onClick={(event) => {
      const button = (event.target as HTMLElement).closest("button");
      if (button && button.type !== "submit" && !button.closest("[data-dismiss-editor]") && !button.closest("[data-editor-save]") ) {
        setHasUnsavedChanges(true);
      }
    }}>
      <div className="space-y-5">
        <div className="mb-1 flex items-center gap-3">
          <Button type="button" size="icon" variant="outline" data-dismiss-editor onClick={() => requestLeave(onCancel)}>
            <ArrowLeft />
          </Button>
          <div>
            <p className="label">Question editor</p>
            <h2 className="font-display text-2xl font-semibold">{existing ? "Edit question" : "New question"}</h2>
          </div>
        </div>

        <Panel>
          <div className="p-5">
            <Field label={`Classification — ${config.name} · ${config.hierarchy.map((l) => l.label).join(" / ")}`}>
              <div className="mt-2 max-h-[32rem] overflow-y-auto rounded-md border border-border p-3 sm:p-4">
                <div className="space-y-2">{renderClassification(config.nodes, nodeIds, toggleNode)}</div>
              </div>
              {config.nodes.length === 0 && (
                <p className="mt-2 text-xs italic text-muted-foreground">
                  No categories yet — add some under the Structure tab first.
                </p>
              )}
            </Field>
          </div>
        </Panel>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-5">
            <Panel>
              <div className="grid gap-4 p-5 sm:grid-cols-3">
                <Field label="Type">
                  <Select value={typeKey} onValueChange={setTypeKey}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {config.question_types.map((t) => (
                        <SelectItem key={t} value={t}>
                          {formatQuestionType(t)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Difficulty">
                  <Select
                    value={difficulty === null ? "none" : String(difficulty)}
                    onValueChange={(v) => setDifficulty(v === "none" ? null : Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Any</SelectItem>
                      {config.difficulty_levels.map((d) => (
                        <SelectItem key={d.level} value={String(d.level)}>
                          {d.level} — {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Marks">
                  <Input type="number" step="0.5" value={marks} onChange={(e) => { setMarks(e.target.value); setErrors((prev) => ({ ...prev, marks: undefined })); }} />
                  {errors.marks && <p role="alert" className="mt-1 text-sm text-destructive">{errors.marks}</p>}
                </Field>
              </div>
            </Panel>

            <BlockEditor label="Question body" blocks={body} onChange={(next) => { setBody(next); setErrors((prev) => ({ ...prev, body: undefined })); }} />
            {errors.body && <p role="alert" className="text-sm text-destructive">{errors.body}</p>}
            <BlockEditor
              label="Hint (optional)"
              blocks={hint}
              onChange={setHint}
              note="Shown during practice one step at a time, before the marking guide. Keep it answer-free."
            />
            <BlockEditor label="Answer" blocks={answer} onChange={setAnswer} />
            <BlockEditor label="Solution / working" blocks={solution} onChange={setSolution} />
            <BlockEditor label="Marking criteria" blocks={markingCriteria} onChange={setMarkingCriteria} />
            {typeKey === "multiple_choice" && (
              <Panel>
                <PanelHead title="Answer choices" action={<Button type="button" variant="outline" size="sm" onClick={() => setOptions((items) => [...items, { blocks: [emptyBlock("text")], isCorrect: false }])}><Plus /> Add choice</Button>} />
                {errors.mcq && <p role="alert" className="px-5 pt-4 text-sm text-destructive">{errors.mcq}</p>}
                <div className="space-y-4 p-5">
                  {options.map((option, index) => (
                    <div key={index} className="rounded-md border border-border p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Checkbox checked={option.isCorrect} onCheckedChange={(checked) => setOptions((items) => items.map((item, i) => ({ ...item, isCorrect: i === index ? checked === true : false })))} aria-label={`Mark choice ${String.fromCharCode(65 + index)} as correct`} />
                          <span className="text-sm font-medium">Choice {String.fromCharCode(65 + index)} {option.isCorrect ? "· Correct answer" : ""}</span>
                        </div>
                        <Button type="button" variant="ghost" size="icon" aria-label={`Remove choice ${String.fromCharCode(65 + index)}`} onClick={() => setOptions((items) => items.filter((_, i) => i !== index))}><Trash2 /></Button>
                      </div>
                      <BlockEditor label={`Choice ${String.fromCharCode(65 + index)} content`} blocks={option.blocks} onChange={(blocks) => setOptions((items) => items.map((item, i) => i === index ? { ...item, blocks } : item))} />
                    </div>
                  ))}
                  {options.length === 0 && <p className="text-sm text-muted-foreground">Add answer choices for this multiple choice question.</p>}
                </div>
              </Panel>
            )}
            <Panel>
                <PanelHead title="Question parts" action={<Button type="button" variant="outline" size="sm" onClick={() => { setHasUnsavedChanges(true); setParts((items) => [...items, newPart(String.fromCharCode(97 + items.length))]); }}><Plus /> Add part</Button>} />
              <div className="space-y-5 p-5">
                <PartEditor parts={parts} setParts={setParts} markChanged={() => setHasUnsavedChanges(true)} />
                {parts.length === 0 && <p className="text-sm text-muted-foreground">Add parts to create a multi-part question.</p>}
              </div>
            </Panel>
          </div>

          <div className="space-y-5">
            <Panel>
              <PanelHead title="Tags" />
              <div className="p-5">
                <Field label="Allowed tags">
                  <div className="flex flex-wrap gap-2">
                    {config.tags.map((tag) => {
                      const enabled = tags.includes(tag);
                      return <ToggleButton key={tag} enabled={enabled} onClick={() => {
                        setTags((current) => enabled ? current.filter((item) => item !== tag) : [...current, tag]);
                        setHasUnsavedChanges(true);
                      }}>{tag}</ToggleButton>;
                    })}
                    {config.tags.length === 0 && <p className="text-sm text-muted-foreground">Add tags in Course Settings first.</p>}
                  </div>
                </Field>
              </div>
            </Panel>

            {
              <Panel>
                <PanelHead title="Source metadata" />
                <div className="space-y-4 p-5">
                  <Field label="Source name">
                    <Input value={sourceName} onChange={(e) => setSourceName(e.target.value)} placeholder="Trial Examination" />
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Year">
                      <Input type="number" value={sourceYear} onChange={(e) => setSourceYear(e.target.value)} />
                    </Field>
                    <Field label="Original Q#">
                      <Input value={sourceOriginalNo} onChange={(e) => setSourceOriginalNo(e.target.value)} />
                    </Field>
                  </div>
                  <Field label="Institution (optional)">
                    <Input value={sourceInstitution} onChange={(e) => setSourceInstitution(e.target.value)} />
                  </Field>
                </div>
              </Panel>
            }

            <Panel>
              <PanelHead
                title="Stimulus"
                action={
                  <Button type="button" size="sm" variant="outline" onClick={() => setShowStimulusModal(true)}>
                    <Plus /> Manage stimuli
                  </Button>
                }
              />
              <div className="p-5">
                <Field label="Link existing stimulus">
                  <Select
                    onValueChange={(val) => {
                      const s = stimulusList.find((x) => x.stimulus_id === val);
                      if (s) {
                        toggleLinkedStimulus(s);
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={stimulusList.length === 0 ? "No stimuli available" : "Select stimulus to link"} />
                    </SelectTrigger>
                    <SelectContent>
                      {stimulusList
                        .filter((s) => !linkedStimuli.some((l) => l.stimulus_id === s.stimulus_id))
                        .map((s) => (
                          <SelectItem key={s.stimulus_id} value={s.stimulus_id}>
                            {s.title || s.stimulus_id.slice(0, 8)}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </Field>
                {linkedStimuli.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {linkedStimuli.map((s) => (
                      <div key={s.stimulus_id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                        <span className="text-sm truncate">{s.title || s.stimulus_id.slice(0, 8)}</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => handleUnlinkStimulus(s)}
                          disabled={linking}
                        >
                          <Trash2 /> Unlink
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                {linkedStimuli.length === 0 && (
                  <p className="mt-3 text-sm text-muted-foreground">No stimulus linked. Link one or manage stimuli.</p>
                )}
              </div>
            </Panel>

            <Panel>
              <div className="flex items-center justify-between p-5">
                <div>
                  <p className="font-medium">Approved</p>
                  <p className="mt-1 text-sm text-muted-foreground">Ready for practice and tests</p>
                </div>
                <Switch
                  checked={reviewStatus === "approved"}
                  onCheckedChange={(v) => setReviewStatus(v ? "approved" : "pending_review")}
                />
              </div>
              {existing && (
                <div className="border-t border-border p-5">
                  <Button type="button" variant="destructive" disabled={deleting || saving} onClick={handleDelete}>
                    <Trash2 /> {deleting ? "Deleting…" : "Delete question"}
                  </Button>
                </div>
              )}
            </Panel>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" data-dismiss-editor onClick={() => requestLeave(onCancel)}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || deleting}>
            {saving ? "Saving…" : existing ? "Save changes" : "Create question"}
          </Button>
        </div>
      </div>
      {hasUnsavedChanges && (
        <div role="status" className="fixed bottom-4 right-4 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-4 rounded-lg border border-warning/40 bg-surface p-3 shadow-lg sm:bottom-6 sm:right-6">
          <p className="text-sm font-medium">You have unsaved changes</p>
          <Button type="button" size="sm" data-editor-save disabled={saving || deleting} onClick={() => formRef.current?.requestSubmit()}>
            <Save />{saving ? "Saving…" : "Save now"}
          </Button>
        </div>
      )}
      {showStimulusModal && (
        <Modal
          open
          onClose={() => setShowStimulusModal(false)}
          label="Manage stimuli"
          className="max-w-5xl"
          header="Manage stimuli"
        >
          <StimulusManager
            courseId={config.course_id}
            onSelect={(s) => {
              toggleLinkedStimulus(s);
              if (existing?.question_id) {
                handleLinkStimulus(s);
              }
            }}
          />
        </Modal>
      )}

      {showLeavePrompt && (
        <Modal
          open
          role="alertdialog"
          onClose={() => {
            pendingNavigation.current = null;
            setShowLeavePrompt(false);
          }}
          label="Unsaved changes"
          className="max-w-md"
          header="Unsaved changes"
          description="Would you like to save your changes before leaving?"
          footer={
            <>
              <Button variant="ghost" onClick={() => { pendingNavigation.current = null; setShowLeavePrompt(false); }}>Cancel</Button>
              <Button variant="outline" onClick={() => {
                const leave = pendingNavigation.current;
                pendingNavigation.current = null;
                setHasUnsavedChanges(false);
                setShowLeavePrompt(false);
                leave?.();
              }}>Discard changes</Button>
              <Button className="ml-auto" disabled={saving || deleting} onClick={() => { setShowLeavePrompt(false); formRef.current?.requestSubmit(); }}>Save and leave</Button>
            </>
          }
        />
      )}
    </form>
  );
}
