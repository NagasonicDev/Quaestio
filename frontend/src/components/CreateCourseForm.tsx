import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useActiveCourse } from "../hooks/useActiveCourse";
import { Field } from "./system";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { notify } from "../lib/notifications";

/**
 * Quick-create form: name + a comma-separated list of hierarchy level
 * labels (e.g. "Topic, Subtopic, Dot Point"). This covers the "define a
 * course structure" requirement well enough to get productive immediately;
 * the full drag-and-drop course editor with add/rename/reorder/nest is a
 * later build stage.
 */
export function CreateCourseForm({ onDone }: { onDone: () => void }) {
  const { setCourseId } = useActiveCourse();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [levelsInput, setLevelsInput] = useState("Topic, Subtopic, Dot Point");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const hierarchy = levelsInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((label, i) => ({ level_index: i, label, required: i === 0 }));

      const course = await api.createCourse({ name: name.trim(), hierarchy });
      qc.invalidateQueries({ queryKey: ["courses"] });
      setCourseId(course.course_id);
      onDone();
      notify("Course created", "success");
    } catch (err) {
      notify("Could not create course", "error", err instanceof Error ? err.message : "Failed to create course.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="label">New course</p>
      <Field label="Course name">
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Mathematics Extension 1"
        />
      </Field>
      <Field label="Hierarchy levels">
        <Input
          value={levelsInput}
          onChange={(e) => setLevelsInput(e.target.value)}
          placeholder="Module, Outcome, Learning Objective"
        />
      </Field>
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={submitting || !name.trim()}>
          {submitting ? "Creating…" : "Create"}
        </Button>
      </div>
    </form>
  );
}
