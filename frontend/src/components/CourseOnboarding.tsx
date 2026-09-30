import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  Check,
  FileUp,
  FlaskConical,
  Layers3,
  NotebookPen,
  Plus,
  Shuffle,
  Sparkles,
} from "lucide-react";
import { api } from "../api/client";
import { useActiveCourse } from "../hooks/useActiveCourse";
import { CreateCourseForm } from "./CreateCourseForm";
import { Button } from "./ui/button";
import { useConfirm } from "./ui/modal";

type Step = "sample" | "import" | "create" | null;

/**
 * First-run on-ramp. Four ways in, in the order most people actually need
 * them: try the app on throwaway content, bring your own questions, set up a
 * course, or (not yet) turn study material into draft questions. The fourth is
 * shown disabled rather than hidden, because it is a real part of the product
 * and students will ask about it.
 */
export function CourseOnboarding() {
  const [step, setStep] = useState<Step>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { setCourseId } = useActiveCourse();
  const confirm = useConfirm();

  async function adopt(courseId: string, to: string) {
    setCourseId(courseId);
    await qc.invalidateQueries({ queryKey: ["courses"] });
    await qc.invalidateQueries({ queryKey: ["course", courseId] });
    navigate(to);
  }

  async function addSampleCourse() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.ensureSampleCourse();
      setNotice(
        result.created
          ? "Sample course added. Remove it from the course list whenever you like \u2014 it is separate from everything else."
          : "You already had the sample course, so nothing was duplicated."
      );
      await adopt(result.course_id, "/practice");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the sample course.");
    } finally {
      setBusy(false);
    }
  }

  async function importBundle(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    const imported: string[] = [];
    const failures: string[] = [];
    try {
      for (const file of Array.from(files)) {
        try {
          const result = await api.importCourseFile(file, async (info) => {
            const replace = await confirm({
              title: "This course already exists here",
              description: `\u201c${info.course_name}\u201d has the same course id as a course on this device. Replacing it deletes the existing questions, practice history and review schedule first. Choose \u201cAdd as new course\u201d to keep both.`,
              confirmLabel: "Replace the existing course",
              cancelLabel: "Add as a new course",
              destructive: true,
            });
            return replace ? "replace" : "new";
          });
          imported.push(result.course_id);
        } catch (e) {
          failures.push(`${file.name}: ${e instanceof Error ? e.message : "could not be imported"}`);
        }
      }
      if (imported.length) {
        const last = imported[imported.length - 1];
        setNotice(
          `Imported ${imported.length} course${imported.length === 1 ? "" : "s"}. Review the questions, then start a practice session.`
        );
        await adopt(last, "/");
      }
      if (failures.length) setError(failures.join("\n"));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const options: Array<{
    id: Step;
    icon: typeof FlaskConical;
    title: string;
    text: string;
    detail?: string;
    cta: string;
    disabled?: boolean;
    onClick?: () => void;
  }> = [
    {
      id: "sample",
      icon: FlaskConical,
      title: "Try a sample course",
      text: "Four example questions to practise on, so you can try the flow before your own questions are ready.",
      detail: "Disposable: it is a separate course you can remove in one click, and it never mixes with your own work.",
      cta: "Add the sample course",
      onClick: addSampleCourse,
    },
    {
      id: "import",
      icon: FileUp,
      title: "Bring in questions",
      text: "Open a .qb course bundle exported from Quaestio, questions and images included.",
      detail: "If you have loose question files (JSON) rather than a .qb bundle, create a course first and import them there.",
      cta: "Choose a .qb file",
      onClick: () => fileRef.current?.click(),
    },
    {
      id: "create",
      icon: Plus,
      title: "Create a course",
      text: "Name your subject and its levels, then add or import questions.",
      detail: "Two or three questions is enough to start practising \u2014 you do not need a full bank.",
      cta: "Set up a course",
      onClick: () => setStep("create"),
    },
    {
      id: null,
      icon: NotebookPen,
      title: "Start from study material",
      text: "Turn notes or a worked example into draft questions, each one linked to the passage it came from.",
      detail: "Not built yet. When it arrives nothing leaves this device, drafts need your approval before they enter the bank, and you will be told what happens to the material you paste in.",
      cta: "Not available yet",
      disabled: true,
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-7 pb-10 pt-2 sm:pt-8">
      <section className="relative overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
        <div className="absolute -right-24 -top-28 size-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-0 right-[20%] h-40 w-40 rounded-full bg-accent/40 blur-3xl" />
        <div className="relative grid gap-8 p-7 sm:p-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:p-12">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <Sparkles className="size-3.5 text-accent-foreground" /> Your question workspace
            </div>
            <h1 className="max-w-xl font-display text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
              Make room for <span className="text-primary">better questions.</span>
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground">
              Pick a starting point. Everything stays on this device, and you can export a backup
              whenever you want one.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button onClick={addSampleCourse} disabled={busy} className="h-11 px-5">
                <FlaskConical /> Try the sample course <ArrowRight className="ml-1" />
              </Button>
              <Button variant="outline" size="lg" onClick={() => setStep("create")} disabled={busy}>
                Set up my own course
              </Button>
            </div>
          </div>
          <div className="relative mx-auto w-full max-w-sm">
            <div className="absolute -inset-4 rounded-[2rem] bg-primary/5 blur-xl" />
            <div className="relative rotate-1 rounded-2xl border border-border bg-background/90 p-5 shadow-xl shadow-foreground/5 backdrop-blur">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div>
                  <p className="label">A fresh start</p>
                  <p className="mt-1 font-display text-lg font-semibold">Your study space</p>
                </div>
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Layers3 className="size-5" />
                </div>
              </div>
              <div className="space-y-3 py-5">
                {[
                  ["01", "Get some questions in", "Sample, import, or your own"],
                  ["02", "Practise one properly", "Attempt it, then check yourself"],
                  ["03", "Come back to it later", "The queue decides when"],
                ].map(([n, title, note], index) => (
                  <div key={n} className="flex items-center gap-3 rounded-xl bg-surface/70 p-3">
                    <span
                      className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                        index === 0 ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {index === 0 ? <Check className="size-4" /> : n}
                    </span>
                    <div>
                      <p className="text-sm font-medium">{title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
                <span className="size-1.5 rounded-full bg-success" /> Local to this device
              </div>
            </div>
          </div>
        </div>
      </section>

      {error && (
        <p role="alert" className="panel px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="panel px-4 py-3 text-sm">
          {notice}
        </p>
      )}

      {step === "create" ? (
        <section className="panel mx-auto max-w-2xl p-5 sm:p-7">
          <div className="mb-5">
            <p className="label">Let&rsquo;s get started</p>
            <h2 className="mt-1 font-display text-2xl font-semibold">Create your course</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              You can change the structure and add topics at any time.
            </p>
          </div>
          <CreateCourseForm onDone={() => setStep(null)} />
        </section>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {options.map(
              ({ id, icon: Icon, title, text, detail, cta, disabled, onClick }) => (
                <div
                  key={title}
                  className={`panel flex flex-col gap-3 p-5 ${disabled ? "opacity-75" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                      <Icon className="size-4" />
                    </span>
                    <div>
                      <h2 className="text-sm font-semibold">{title}</h2>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p>
                    </div>
                  </div>
                  {detail && <p className="text-xs leading-5 text-muted-foreground">{detail}</p>}
                  <div className="mt-auto pt-1">
                    <Button
                      variant={id === "sample" ? "default" : "outline"}
                      size="sm"
                      disabled={disabled || busy}
                      onClick={onClick}
                    >
                      {cta}
                    </Button>
                  </div>
                </div>
              )
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".qb"
            multiple
            className="hidden"
            onChange={(e) => importBundle(e.target.files)}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { icon: Layers3, title: "Keep things organised", text: "Group questions by course, topic, and learning goal." },
              { icon: BookOpen, title: "Build your question bank", text: "Bring existing questions in or create new ones." },
              { icon: Shuffle, title: "Learn actively", text: "Practise one question properly, then let the queue bring it back." },
            ].map(({ icon: Icon, title, text }) => (
              <div key={title} className="panel flex gap-3.5 p-4 sm:p-5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                  <Icon className="size-4" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold">{title}</h2>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
