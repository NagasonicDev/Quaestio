import { useState, type FormEvent } from "react";
import { BlockEditor, blocksToPayload, type EditableBlock } from "./BlockEditor.tsx";
import type { StimulusWithContent } from "../api/types.ts";
import { Button } from "./ui/button.tsx";
import { Checkbox } from "./ui/checkbox.tsx";
import { Input } from "./ui/input.tsx";
import { Panel, PanelHead } from "./system.tsx";

function toEditable(blocks: StimulusWithContent["blocks"] | null | undefined): EditableBlock[] {
  if (!blocks || blocks.length === 0) return [];
  return blocks
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((b) => ({ tempId: b.block_id, block_type: b.block_type, content: b.content }));
}

export interface StimulusEditorProps {
  existing?: StimulusWithContent | null;
  onSave: (data: { title: string | null; attach_all: boolean; body: ReturnType<typeof blocksToPayload> }) => Promise<void> | void;
  onCancel: () => void;
  saving?: boolean;
}

export function StimulusEditor({ existing, onSave, onCancel, saving = false }: StimulusEditorProps) {
  const [title, setTitle] = useState<string>(existing?.title ?? "");
  const [attachAll, setAttachAll] = useState<boolean>(existing?.attach_all ?? false);
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
        attach_all: attachAll,
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
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={attachAll} onCheckedChange={(v) => setAttachAll(v === true)} />
            <span>
              Attach to every question in this course
              <span className="block text-xs text-muted-foreground">
                Includes questions created later. Useful for formula sheets and data sheets.
              </span>
            </span>
          </label>
        </div>
      </Panel>

      <BlockEditor
        label="Stimulus content"
        blocks={blocks}
        onChange={setBlocks}
        note="Add text, figures, equations, tables, or attach a PDF."
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
