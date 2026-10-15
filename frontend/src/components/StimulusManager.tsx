import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { api } from "../api/client";
import type { Stimulus, StimulusWithContent } from "../api/types";
import { Panel, PanelHead } from "./system";
import { Button } from "./ui/button";
import { Modal, useConfirm } from "./ui/modal";
import { notify } from "../lib/notifications";
import { StimulusEditor } from "./StimulusEditor";

interface StimulusManagerProps {
  courseId: string;
  onSelect?: (stimulus: Stimulus) => void;
}

export function StimulusManager({ courseId, onSelect }: StimulusManagerProps) {
  const confirm = useConfirm();
  const [stimuli, setStimuli] = useState<Stimulus[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<StimulusWithContent | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const list = await api.listStimuliForCourse(courseId);
      setStimuli(list);
    } catch (err) {
      notify("Could not load stimuli", "error", err instanceof Error ? err.message : "Failed to load stimuli.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [courseId]);

  function openCreate() {
    setEditing(null);
    setShowModal(true);
  }

  async function openEdit(stimulus: Stimulus) {
    try {
      setSaving(true);
      const full = await api.getStimulus(stimulus.stimulus_id);
      setEditing(full);
      setShowModal(true);
    } catch (err) {
      notify("Could not load stimulus", "error", err instanceof Error ? err.message : "Failed to load stimulus.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSave(data: { title: string | null; body: any[] }) {
    setSaving(true);
    try {
      if (editing) {
        await api.updateStimulus(editing.stimulus_id, {
          title: data.title,
          body: data.body,
        });
        notify("Stimulus updated", "success");
      } else {
        await api.createStimulus({
          course_id: courseId,
          title: data.title,
          body: data.body,
        });
        notify("Stimulus created", "success");
      }
      setShowModal(false);
      setEditing(null);
      await load();
    } catch (err) {
      notify("Could not save stimulus", "error", err instanceof Error ? err.message : "Failed to save stimulus.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(stimulus: Stimulus) {
    const ok = await confirm({
      title: "Delete this stimulus?",
      description: "This stimulus will be removed and unlinked from any questions. This can't be undone.",
      confirmLabel: "Delete stimulus",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.deleteStimulus(stimulus.stimulus_id);
      notify("Stimulus deleted", "success");
      await load();
    } catch (err) {
      notify("Could not delete stimulus", "error", err instanceof Error ? err.message : "Failed to delete stimulus.");
    }
  }

  return (
    <Panel>
      <PanelHead
        title="Stimuli"
        action={
          <Button type="button" size="sm" onClick={openCreate}>
            <Plus /> New stimulus
          </Button>
        }
      />
      <div className="p-4">
        {loading && <p className="text-sm text-muted-foreground">Loading stimuli…</p>}
        {!loading && stimuli.length === 0 && (
          <p className="text-sm text-muted-foreground">No stimuli yet. Create one to attach to questions.</p>
        )}
        {!loading && stimuli.length > 0 && (
          <div className="space-y-2">
            {stimuli.map((stimulus) => (
              <div
                key={stimulus.stimulus_id}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {stimulus.title || `Stimulus ${stimulus.stimulus_id.slice(0, 8)}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(stimulus.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-1">
                  {onSelect && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => onSelect(stimulus)}
                    >
                      Select
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    title="Edit stimulus"
                    onClick={() => openEdit(stimulus)}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    title="Delete stimulus"
                    onClick={() => handleDelete(stimulus)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <Modal
          open
          onClose={() => {
            setShowModal(false);
            setEditing(null);
          }}
          label={editing ? "Edit stimulus" : "New stimulus"}
          className="max-w-4xl"
          header={editing ? "Edit stimulus" : "New stimulus"}
        >
          <StimulusEditor
            existing={editing}
            onSave={handleSave}
            onCancel={() => {
              setShowModal(false);
              setEditing(null);
            }}
            saving={saving}
          />
        </Modal>
      )}
    </Panel>
  );
}
