import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, CirclePlus, Plus, Trash2 } from "lucide-react";
import { api } from "../api/client";
import type { CourseFullConfig, CourseNode, LevelDef } from "../api/types";
import { Panel, PanelHead } from "./system";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useConfirm } from "./ui/modal";
import { notify } from "../lib/notifications";

interface StructureEditorProps {
  config: CourseFullConfig;
}

export function StructureEditor({ config }: StructureEditorProps) {
  const qc = useQueryClient();
  const [newLevelLabel, setNewLevelLabel] = useState("");
  const [rootDraft, setRootDraft] = useState("");
  const [addingRoot, setAddingRoot] = useState(false);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["course", config.course_id] });
    qc.invalidateQueries({ queryKey: ["question-counts", config.course_id] });
  }

  async function addLevel() {
    if (!newLevelLabel.trim()) return;
    const nextIndex = config.hierarchy.length;
    await api.addLevel(config.course_id, { level_index: nextIndex, label: newLevelLabel.trim(), required: false });
    setNewLevelLabel("");
    refresh();
  }

  async function addRootNode() {
    if (!rootDraft.trim()) return;
    await api.createNode(config.course_id, { level_index: 0, name: rootDraft.trim() });
    setRootDraft("");
    setAddingRoot(false);
    refresh();
  }

  return (
    <div className="space-y-5">
      <Panel>
        <PanelHead
          title="Hierarchy levels"
          note="The ordered labels used by the course tree, top to bottom."
          action={
            <div className="flex items-center gap-1.5">
              <Input
                value={newLevelLabel}
                onChange={(e) => setNewLevelLabel(e.target.value)}
                placeholder={`Level ${config.hierarchy.length + 1} name`}
                className="h-8 w-44"
              />
              <Button size="sm" onClick={addLevel} disabled={!newLevelLabel.trim()}>
                <Plus />
                Add level
              </Button>
            </div>
          }
        />
        <div className="divide-y divide-border p-2">
          {config.hierarchy.map((lv) => (
            <LevelRow key={lv.level_index} courseId={config.course_id} level={lv} onChanged={refresh} />
          ))}
        </div>
      </Panel>

      <DifficultyLevelsPanel config={config} onChanged={refresh} />

      <Panel>
        <PanelHead
          title={config.hierarchy[0]?.label ?? "Categories"}
          note="Rename nodes, set short codes, or add children at the next level."
          action={
            addingRoot ? (
              <div className="flex items-center gap-1.5">
                <Input
                  value={rootDraft}
                  onChange={(event) => setRootDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void addRootNode();
                  }}
                  placeholder={`New ${config.hierarchy[0]?.label ?? "category"} name`}
                  className="h-8 w-44"
                  autoFocus
                />
                <Button size="sm" onClick={() => void addRootNode()} disabled={!rootDraft.trim()}>
                  <Plus />
                  Add
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setAddingRoot(false); setRootDraft(""); }}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button size="sm" onClick={() => setAddingRoot(true)}>
                <Plus />
                Add {config.hierarchy[0]?.label ?? "category"}
              </Button>
            )
          }
        />
        <div className="p-5">
          {config.nodes.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">
              No categories yet. Add your first {config.hierarchy[0]?.label?.toLowerCase() ?? "category"} above.
            </p>
          ) : (
            config.nodes.map((node) => (
              <NodeEditRow
                key={node.node_id}
                node={node}
                siblings={config.nodes}
                hierarchy={config.hierarchy}
                courseId={config.course_id}
                onChanged={refresh}
              />
            ))
          )}
        </div>
      </Panel>
    </div>
  );
}

function LevelRow({
  courseId, level, onChanged,
}: { courseId: string; level: LevelDef; onChanged: () => void }) {
  const confirm = useConfirm();
  const [label, setLabel] = useState(level.label);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (label === level.label || !label.trim()) return;
    setSaving(true);
    try {
      await api.updateLevel(courseId, level.level_index, { ...level, label: label.trim() });
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: `Delete the “${level.label}” level?`,
      description:
        "This only works if no categories use the level yet. Categories below it must be moved or deleted first.",
      confirmLabel: "Delete level",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.deleteLevel(courseId, level.level_index);
      onChanged();
    } catch (err) {
      notify("Could not delete level", "error", err instanceof Error && err.message.includes("400")
        ? "This level still has categories. Delete or move those first."
        : err instanceof Error ? err.message : "Failed to delete level.");
    }
  }

  return (
    <div className="grid grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2">
      <span className="font-mono text-xs text-muted-foreground">{String(level.level_index + 1).padStart(2, "0")}</span>
      <Input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={save}
        disabled={saving}
        className="h-8"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={remove}
        className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
        title="Delete level"
      >
        <Trash2 />
      </Button>
    </div>
  );
}

function DifficultyLevelsPanel({ config, onChanged }: { config: CourseFullConfig; onChanged: () => void }) {
  const [newLabel, setNewLabel] = useState("");
  const levels = [...(config.difficulty_levels ?? [])].sort((a, b) => a.level - b.level);
  const used = new Set(levels.map((d) => d.level));
  let nextLevel = 1;
  while (used.has(nextLevel) && nextLevel <= 10) nextLevel += 1;
  const canAdd = levels.length < 10 && nextLevel <= 10;

  async function add() {
    if (!newLabel.trim() || !canAdd) return;
    try {
      await api.addDifficultyLevel(config.course_id, { level: nextLevel, label: newLabel.trim() });
      setNewLabel("");
      onChanged();
    } catch (err) {
      notify("Could not add difficulty level", "error", err instanceof Error ? err.message : "Failed to add difficulty level.");
    }
  }

  return (
    <Panel>
      <PanelHead
        title="Difficulty bands"
        note="The difficulty bands assignable to questions (2–10 bands)."
        action={
          <div className="flex items-center gap-1.5">
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder={canAdd ? `Band ${nextLevel}` : "Maximum 10 bands"}
              className="h-8 w-44"
              disabled={!canAdd}
            />
            <Button size="sm" onClick={() => void add()} disabled={!newLabel.trim() || !canAdd}>
              <Plus />
              Add band
            </Button>
          </div>
        }
      />
      <div className="divide-y divide-border p-2">
        {levels.map((d) => (
          <DifficultyLevelRow
            key={d.level}
            courseId={config.course_id}
            level={d}
            onChanged={onChanged}
            canDelete={levels.length > 2}
          />
        ))}
        {levels.length === 0 && (
          <p className="px-3 py-2 text-sm italic text-muted-foreground">No difficulty bands defined.</p>
        )}
      </div>
    </Panel>
  );
}

function DifficultyLevelRow({
  courseId, level, onChanged, canDelete,
}: { courseId: string; level: { level: number; label: string }; onChanged: () => void; canDelete: boolean }) {
  const confirm = useConfirm();
  const [label, setLabel] = useState(level.label);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (label === level.label || !label.trim()) return;
    setSaving(true);
    try {
      await api.updateDifficultyLevel(courseId, level.level, { level: level.level, label: label.trim() });
      onChanged();
    } catch (err) {
      notify("Could not save difficulty level", "error", err instanceof Error ? err.message : "Failed to save difficulty level.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: `Delete difficulty band ${level.level} — “${level.label}”?`,
      description: "This only works if no questions use the level.",
      confirmLabel: "Delete band",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.deleteDifficultyLevel(courseId, level.level);
      onChanged();
    } catch (err) {
      notify("Could not delete difficulty level", "error", err instanceof Error ? err.message : "Failed to delete difficulty level.");
    }
  }

  return (
    <div className="grid grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2">
      <span className="font-mono text-xs text-muted-foreground">{level.level}</span>
      <Input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => void save()}
        disabled={saving}
        className="h-8"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => void remove()}
        disabled={!canDelete || saving}
        className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
        title="Delete level"
      >
        <Trash2 />
      </Button>
    </div>
  );
}

function NodeEditRow({
  node, siblings, hierarchy, courseId, onChanged, depth = 0,
}: {
  node: CourseNode; siblings: CourseNode[]; hierarchy: LevelDef[]; courseId: string;
  onChanged: () => void; depth?: number;
}) {
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(node.name);
  const [code, setCode] = useState(node.code ?? "");
  const [childDraft, setChildDraft] = useState("");
  const [addingChild, setAddingChild] = useState(false);
  const nextLevel = hierarchy[node.level_index + 1];
  const index = siblings.findIndex((s) => s.node_id === node.node_id);

  async function save() {
    await api.updateNode(courseId, node.node_id, { name, code: code || null });
    setEditing(false);
    onChanged();
  }

  async function remove() {
    const childCount = node.children.length;
    const ok = await confirm({
      title: `Delete “${node.name}”?`,
      description:
        childCount > 0
          ? `It has ${childCount} sub-${hierarchy[node.level_index + 1]?.label.toLowerCase() ?? "item"}(s), which are removed too. Questions keep their other classifications and are never deleted.`
          : "Questions classified here keep their other classifications and are never deleted.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    await api.deleteNode(courseId, node.node_id);
    onChanged();
  }

  async function addChild() {
    if (!nextLevel || !childDraft.trim()) return;
    await api.createNode(courseId, { level_index: nextLevel.level_index, parent_node_id: node.node_id, name: childDraft.trim() });
    setChildDraft("");
    setAddingChild(false);
    onChanged();
  }

  async function move(dir: -1 | 1) {
    const target = siblings[index + dir];
    if (!target) return;
    await Promise.all([
      api.updateNode(courseId, node.node_id, { sort_order: target.sort_order }),
      api.updateNode(courseId, target.node_id, { sort_order: node.sort_order }),
    ]);
    onChanged();
  }

  return (
    <div className={`mb-3 rounded-lg border border-border ${depth > 0 ? "bg-surface/40 p-2.5" : "p-3"}`}>
      <div className="grid grid-cols-[minmax(0,1fr)_110px_auto] items-center gap-2">
        {editing ? (
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
            }}
            className="h-8"
            autoFocus
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="justify-self-start min-w-0 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface"
          >
            {node.name}
          </button>
        )}

        {editing ? (
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
            }}
            placeholder="code"
            className="h-8"
          />
        ) : (
          <span className="truncate font-mono text-[11px] text-muted-foreground">{node.code}</span>
        )}

        <div className="flex gap-1">
          {editing ? (
            <>
              <Button size="sm" onClick={save}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={index === 0}
                onClick={() => move(-1)}
                className="h-8 w-8"
                title="Move up"
              >
                <ArrowUp />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={index === siblings.length - 1}
                onClick={() => move(1)}
                className="h-8 w-8"
                title="Move down"
              >
                <ArrowDown />
              </Button>
              {nextLevel && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setAddingChild(true)}
                  className="h-8 w-8"
                  title={`+ ${nextLevel.label}`}
                >
                  <CirclePlus />
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={remove}
                className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                title="Delete node"
              >
                <Trash2 />
              </Button>
            </>
          )}
        </div>
      </div>
      {node.children.length > 0 && (
        <div className="ml-5 mt-2 space-y-2 border-l border-border pl-3">
          {node.children.map((child) => (
            <NodeEditRow
              key={child.node_id}
              node={child}
              siblings={node.children}
              hierarchy={hierarchy}
              courseId={courseId}
              onChanged={onChanged}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
      {addingChild && nextLevel && (
        <div className="mt-2 flex items-center gap-1.5">
          <Input
            value={childDraft}
            onChange={(event) => setChildDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void addChild();
            }}
            placeholder={`New ${nextLevel.label} name`}
            className="h-8 flex-1"
            autoFocus
          />
          <Button size="sm" onClick={() => void addChild()} disabled={!childDraft.trim()}>
            Add
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setAddingChild(false); setChildDraft(""); }}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
