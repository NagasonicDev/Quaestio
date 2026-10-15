import { useState, type FormEvent } from "react";
import { BlockEditor, blocksToPayload, type EditableBlock } from "./BlockEditor";
import type { StimulusWithContent } from "../api/types";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Panel, PanelHead } from "./system";

function toEditable(blocks: StimulusWithContent["blocks"] | null | undefined): EditableBlock[] {
  if (!blocks || blocks.length === 0) return [];
  return blocks
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((b) => ({ tempId: b.block_id, block_type: b.block_type, content: b.content }));
}

export interface StimulusEditorProps {
  existing?: StimulusWithContent | null;
  onSave: (data: { title: string | null; body: ReturnType<typeof blocksToPayload> }) => Promise<void> | void;
  onCancel: () => void;
  saving?: boolean;
}

export function StimulusEditor({ existing, onSave, onCancel, saving = false }: StimulusEditorProps) {
  const [title, setTitle] = useState<string>(existing?.title ?? "");
  const [blocks, setBlocks] = useState<EditableBlock[]>(() =>
    toEditable(existing?.blocks)
  );

  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting || saving) return;
    setSubmitting(true);
    try {
      await onSave({
        title: title.trim() || null,
        body: blocksToPayload(blocks),
      });
    } finally {
      setSubmitting(false);
    }
  }

  const isSaving = submitting || saving;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Panel>
        <PanelHead title={existing ? "Edit stimulus" : "New stimulus"} />
        <div className="space-y-4 p-4">
          <div className="space-y-1.5">
            <label className="label">Title (optional)</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Stimulus 1: Circuit diagram"
            />
          </div>
        </div>
      </Panel>

      <BlockEditor
        label="Stimulus content"
        blocks={blocks}
        onChange={setBlocks}
        note="Add text, figures, equations, tables, etc. for this stimulus."
      />

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSaving}>
          {isSaving ? "Saving…" : existing ? "Save changes" : "Create stimulus"}
        </Button>
      </div>
    </form>
  );
}
