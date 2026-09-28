import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useIsFetching } from "@tanstack/react-query";
import { Check, Menu, Moon, Sun, X } from "lucide-react";
import { cn } from "../lib/utils";
import { useTheme } from "../hooks/useTheme";
import { CourseSelector } from "./CourseSelector";
import { RecentQuestionsSidebar } from "./RecentQuestionsSidebar";
import { Button } from "./ui/button";
import { useActiveCourse } from "../hooks/useActiveCourse";
import { CourseOnboarding } from "./CourseOnboarding";
import { dismissTestGeneration, useTestGenerationTask } from "../lib/testGenerationTask";

const NAV = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/browse", label: "Question Bank" },
  { to: "/practice", label: "Practice" },
  { to: "/test-generator", label: "Test Generator" },
  { to: "/import", label: "Import" },
  { to: "/course-settings", label: "Course Settings" },
  { to: "/settings", label: "Settings" },
];

const linkBase =
  "rounded-md px-2.5 py-2 text-[13px] font-medium text-muted-foreground transition hover:bg-surface hover:text-foreground";
const linkActive = "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground";

export function Layout() {
  const { courseId } = useActiveCourse();
  const location = useLocation();
  const { theme, toggle } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isFetching = useIsFetching() > 0;
  const generationTask = useTestGenerationTask();
  const generationProgress = generationTask
    ? generationTask.phase === "paper"
      ? 22 + (generationTask.questionCount ? generationTask.completedQuestions / generationTask.questionCount : 0) * 56
      : generationTask.phase === "preview"
        ? 78 + (generationTask.questionCount ? generationTask.completedQuestions / generationTask.questionCount : 0) * 17
        : ({ selecting: 4, hydrating: 12, saving: 96 }[generationTask.phase] ?? 4)
    : 0;

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <div className="ledger-wash" />

      <div className="global-loading-track" aria-hidden="true">
        {isFetching && <div className="global-loading-bar" />}
      </div>

      <header className="sticky top-0 z-40 border-b border-border bg-background/85 shadow-sm shadow-foreground/[0.02] backdrop-blur-xl">
        <div className="mx-auto grid h-14 max-w-[1500px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 sm:flex sm:px-5">
          <Link
            to="/"
            className="font-display shrink-0 text-xl font-semibold"
            onClick={() => setMobileOpen(false)}
          >
            Quaestio<span className="text-accent-foreground">.</span>
          </Link>

          <div className="hidden xl:block">
            <CourseSelector />
          </div>

          <nav className="ml-auto hidden items-center gap-0.5 xl:flex">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => cn(linkBase, isActive && linkActive)}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="bg-surface/60"
              onClick={toggle}
              aria-label="Toggle theme"
            >
              {theme === "light" ? <Sun /> : <Moon />}
              <span className="hidden md:inline">{theme === "light" ? "Light" : "Dark"}</span>
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="xl:hidden"
              aria-label="Toggle menu"
              onClick={() => setMobileOpen((o) => !o)}
            >
              {mobileOpen ? <X /> : <Menu />}
            </Button>
          </div>
        </div>

        {mobileOpen && (
          <nav className="grid border-t border-border bg-background p-3 sm:grid-cols-3 xl:hidden">
            <div className="col-span-full border-b border-border pb-3 xl:hidden">
              <CourseSelector inMenu />
            </div>
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-surface hover:text-foreground",
                    isActive && "bg-secondary text-foreground"
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      {generationTask && (
        <div className="sticky top-14 z-30 border-b border-border bg-surface/95 px-4 py-2.5 shadow-sm backdrop-blur sm:px-5" role="status" aria-live="polite">
          <div className="mx-auto flex max-w-[1500px] items-center gap-3">
            <div className="min-w-0 flex-1">
              <Link to="/test-generator" className="flex items-center gap-2 text-sm font-medium hover:underline">
                {generationTask.status === "running" ? (
                  <><span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent-foreground" />Generating your test…</>
                ) : generationTask.status === "complete" ? (
                  <><Check className="h-4 w-4 shrink-0 text-green-600" />Your test is ready</>
                ) : (
                  <><span className="h-2 w-2 shrink-0 rounded-full bg-destructive" />Test generation failed</>
                )}
              </Link>
              <p className="truncate text-xs text-muted-foreground">
                {generationTask.status === "running"
                  ? `${generationTask.phase === "paper" ? "Building paper" : generationTask.phase === "preview" ? "Preparing preview" : generationTask.phase === "saving" ? "Saving files" : generationTask.phase === "hydrating" ? "Loading questions" : "Selecting questions"}${generationTask.questionCount ? ` · ${generationTask.completedQuestions}/${generationTask.questionCount} questions` : ""}`
                  : generationTask.status === "complete"
                    ? `${generationTask.result?.title ?? "Generated test"} · Open Test Generator to download or preview`
                    : generationTask.error ?? "Open Test Generator for details"}
              </p>
            </div>
            {generationTask.status === "running" && (
              <div className="hidden w-40 sm:block">
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-accent-foreground transition-[width]" style={{ width: `${generationProgress}%` }} />
                </div>
              </div>
            )}
            {generationTask.status !== "running" && (
              <Button variant="ghost" size="icon" aria-label="Dismiss test generation notice" onClick={dismissTestGeneration}>
                <X />
              </Button>
            )}
          </div>
        </div>
      )}

      <div className={cn("relative z-10 mx-auto grid max-w-[1500px] gap-6 px-4 py-6 sm:px-5", courseId && "md:grid-cols-[238px_minmax(0,1fr)]")}>
        {courseId && <RecentQuestionsSidebar />}
        <main className="min-w-0">
          {!courseId && location.pathname !== "/" ? <CourseOnboarding /> : <Outlet />}
        </main>
      </div>
    </div>
  );
}
