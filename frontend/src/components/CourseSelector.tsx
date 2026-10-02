import { useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Check, ChevronDown, Plus, Upload } from "lucide-react";
import { api } from "../api/client";
import { useActiveCourse } from "../hooks/useActiveCourse";
import { CreateCourseForm } from "./CreateCourseForm";
import { Button } from "./ui/button";
import { useConfirm } from "./ui/modal";
import { cn } from "../lib/utils";
import { notify, startOperationNotification } from "../lib/notifications";

export function CourseSelector({ inMenu = false }: { inMenu?: boolean }) {
  const { courseId, setCourseId } = useActiveCourse();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [importing, setImporting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const createFormRef = useRef<HTMLDivElement>(null);
  const listboxId = `course-listbox-${useId()}`;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const { data: courses } = useQuery({ queryKey: ["courses"], queryFn: api.listCourses });
  const active = courses?.find((c) => c.course_id === courseId);
  const list = courses ?? [];
  const activeOptionId = open && !creating && list.length > 0 ? `${listboxId}-option-${activeIndex}` : undefined;

  function switchCourse(nextCourseId: string) {
    if (nextCourseId === courseId) return;
    setCourseId(nextCourseId);
    navigate("/");
  }

  useEffect(() => {
    if (!courseId && courses && courses.length > 0) setCourseId(courses[0].course_id);
  }, [courses, courseId, setCourseId]);

  // Pointer clicks outside dismiss; focus leaving the popup dismisses too, so
  // tabbing away never leaves an orphaned popup behind.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onFocusOut(e: FocusEvent) {
      const next = e.relatedTarget as Node | null;
      if (ref.current && (!next || !ref.current.contains(next))) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, [open]);

  // The create form takes focus when it opens; the course list keeps focus on
  // the trigger and moves a virtual cursor with aria-activedescendant instead.
  useEffect(() => {
    if (!open || !creating) return;
    const first = createFormRef.current?.querySelector<HTMLElement>(
      "input, button, select, textarea, [tabindex]:not([tabindex='-1'])"
    );
    first?.focus();
  }, [open, creating]);

  function startCreate() {
    setCreating(true);
    setOpen(true);
  }

  function openMenu() {
    const current = list.findIndex((c) => c.course_id === courseId);
    setActiveIndex(current >= 0 ? current : 0);
    setCreating(false);
    setOpen(true);
  }

  function closeMenu() {
    setOpen(false);
    setCreating(false);
    triggerRef.current?.focus();
  }

  /** Single place that decides what the arrow/enter keys mean. Focus never
   * leaves the trigger while the list is open, so the cursor is virtual. */
  function handleTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (!open || creating) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const current = list.findIndex((c) => c.course_id === courseId);
        setActiveIndex(event.key === "ArrowDown" ? Math.max(0, current) : Math.max(0, current));
        setCreating(false);
        setOpen(true);
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (list.length > 0) setActiveIndex((index) => (index + 1) % list.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (list.length > 0) setActiveIndex((index) => (index - 1 + list.length) % list.length);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(Math.max(0, list.length - 1));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const course = list[activeIndex];
      if (course) switchCourse(course.course_id);
      setOpen(false);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
    }
  }

  async function handleImportFiles(files: FileList | null) {
    if (!files?.length) return;
    const selected = Array.from(files);
    setImporting(true);
    const imported: Array<{ course_id: string; course_name: string }> = [];
    const failures: string[] = [];
    try {
      for (const file of selected) {
        const importTask = startOperationNotification("Importing course…", file.name);
        try {
          const course = await api.importCourseFile(file, async (info) => {
              const replace = await confirm({
                title: "This course already exists here",
                description: `“${info.course_name}” has the same course id as a course on this device. Replacing it deletes the existing questions, practice history and review schedule first. Choose “Add as new course” to keep both.`,
                confirmLabel: "Replace the existing course",
                cancelLabel: "Add as a new course",
                destructive: true,
              });
              return replace ? "replace" : "new";
            }, importTask.progress);
          imported.push(course);
          importTask.succeed("Course imported", course.course_name);
        } catch (e) {
          const message = e instanceof Error ? e.message : "Failed to import course";
          failures.push(`${file.name}: ${message}`);
          importTask.fail("Course import failed", `${file.name}: ${message}`);
        }
      }
      if (imported.length) {
        await qc.invalidateQueries({ queryKey: ["courses"] });
        for (const course of imported) await qc.invalidateQueries({ queryKey: ["course", course.course_id] });
        switchCourse(imported[imported.length - 1].course_id);
        notify("Courses imported", "success", imported.map((course) => course.course_name).join(", "));
        setOpen(false);
      }
      if (failures.length) notify("Some course imports failed", "error", failures.join("\n"));
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div
      className={cn(
        "relative min-w-0 items-center gap-1.5",
        inMenu
          ? "flex flex-wrap"
          : "hidden border-l border-border pl-4 lg:flex"
      )}
      ref={ref}
    >
      <Button
        ref={triggerRef}
        variant="outline"
        className="max-w-58 justify-between bg-surface/70"
        onClick={() => {
          if (open) {
            setOpen(false);
            setCreating(false);
          } else {
            openMenu();
          }
        }}
        onKeyDown={handleTriggerKeyDown}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open && !creating}
        aria-controls={listboxId}
        aria-activedescendant={activeOptionId}
        aria-autocomplete="none"
        aria-label="Course"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="size-2 shrink-0 rounded-full bg-primary" />
          <span className="truncate">{active?.name ?? "Select course"}</span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </Button>

      <Button variant="ghost" size="sm" onClick={startCreate}>
        <Plus />
        New course
      </Button>

      <Button
        variant="ghost"
        size="sm"
        disabled={importing}
        onClick={() => fileInputRef.current?.click()}
        title="Import a course from a .qb bundle exported on another device"
      >
        <Upload />
        {importing ? "Importing…" : "Import course"}
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".qb"
        multiple
        className="hidden"
        onChange={(e) => {
          handleImportFiles(e.target.files);
        }}
      />

      {open && !creating && (
        <div
          className="absolute left-4 top-11 z-50 w-64 rounded-lg border border-border bg-popover p-1 shadow-xl"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              closeMenu();
            }
          }}
        >
          <div id={listboxId} role="listbox" aria-label="Courses" className="py-0.5">
            {list.map((c, index) => {
              const isActive = c.course_id === courseId;
              return (
                <button
                  key={c.course_id}
                  type="button"
                  id={`${listboxId}-option-${index}`}
                  role="option"
                  aria-selected={isActive}
                  onClick={() => {
                    switchCourse(c.course_id);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition",
                    index === activeIndex ? "bg-accent" : "hover:bg-accent/60",
                    isActive && "text-accent-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      isActive ? "bg-primary" : "bg-muted-foreground/40"
                    )}
                  />
                  <span className="truncate">
                    {c.name}
                    {c.is_sample ? <span className="ml-1.5 text-xs text-muted-foreground">sample</span> : null}
                  </span>
                  {isActive && <Check className="ml-auto size-4 shrink-0" />}
                </button>
              );
            })}
            {list.length === 0 && (
              <p className="px-2.5 py-2 text-sm text-muted-foreground">No courses yet</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              fileInputRef.current?.click();
            }}
            className="flex w-full items-center gap-2 rounded-md border-t border-border px-2.5 py-2 text-left text-sm font-medium text-accent-foreground transition hover:bg-accent"
          >
            <Upload className="size-4" />
            Import course
          </button>
          <button
            type="button"
            onClick={startCreate}
            className="flex w-full items-center gap-2 rounded-md border-t border-border px-2.5 py-2 text-left text-sm font-medium text-accent-foreground transition hover:bg-accent"
          >
            <Plus className="size-4" />
            New course
          </button>
        </div>
      )}

      {open && creating && (
        <div
          ref={createFormRef}
          className="absolute left-4 top-11 z-50 w-72 rounded-lg border border-border bg-popover p-3 shadow-xl"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              closeMenu();
            }
          }}
        >
          <CreateCourseForm
            onDone={() => {
              navigate("/");
              setCreating(false);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
