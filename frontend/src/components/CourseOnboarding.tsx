import { useState } from "react";
import { ArrowRight, BookOpen, Check, Layers3, Plus, Shuffle, Sparkles } from "lucide-react";
import { CreateCourseForm } from "./CreateCourseForm";
import { Button } from "./ui/button";

export function CourseOnboarding() {
  const [showCreateForm, setShowCreateForm] = useState(false);

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
              Welcome to Quaestio. Create a course to organise your question bank, build practice sessions, and put together polished tests.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button onClick={() => setShowCreateForm(true)} className="h-11 px-5">
                <Plus /> Create your first course <ArrowRight className="ml-1" />
              </Button>
              <span className="text-xs text-muted-foreground">Usually takes less than a minute</span>
            </div>
          </div>
          <div className="relative mx-auto w-full max-w-sm">
            <div className="absolute -inset-4 rounded-[2rem] bg-primary/5 blur-xl" />
            <div className="relative rotate-1 rounded-2xl border border-border bg-background/90 p-5 shadow-xl shadow-foreground/5 backdrop-blur">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div><p className="label">A fresh start</p><p className="mt-1 font-display text-lg font-semibold">Your study space</p></div>
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Layers3 className="size-5" /></div>
              </div>
              <div className="space-y-3 py-5">
                {[
                  ["01", "Create a course", "Name your subject and topics"],
                  ["02", "Add questions", "Import or write your own"],
                  ["03", "Study your way", "Practice or build a test"],
                ].map(([n, title, note], index) => (
                  <div key={n} className="flex items-center gap-3 rounded-xl bg-surface/70 p-3">
                    <span className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${index === 0 ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                      {index === 0 ? <Check className="size-4" /> : n}
                    </span>
                    <div><p className="text-sm font-medium">{title}</p><p className="mt-0.5 text-xs text-muted-foreground">{note}</p></div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 border-t border-border pt-4 text-xs text-muted-foreground"><span className="size-1.5 rounded-full bg-success" /> Ready when you are</div>
            </div>
          </div>
        </div>
      </section>

      {showCreateForm ? (
        <section className="panel mx-auto max-w-2xl p-5 sm:p-7">
          <div className="mb-5"><p className="label">Let’s get started</p><h2 className="mt-1 font-display text-2xl font-semibold">Create your first course</h2><p className="mt-1 text-sm text-muted-foreground">You can change the structure and add topics any time.</p></div>
          <CreateCourseForm onDone={() => setShowCreateForm(false)} />
        </section>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { icon: Layers3, title: "Keep things organised", text: "Group questions by course, topic, and learning goal." },
            { icon: BookOpen, title: "Build your question bank", text: "Bring existing questions in or create new ones." },
            { icon: Shuffle, title: "Learn actively", text: "Practice at your pace or generate a test when you’re ready." },
          ].map(({ icon: Icon, title, text }) => <div key={title} className="panel flex gap-3.5 p-4 sm:p-5"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary"><Icon className="size-4" /></span><div><h2 className="text-sm font-semibold">{title}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p></div></div>)}
        </div>
      )}
    </div>
  );
}
