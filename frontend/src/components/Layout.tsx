import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useIsFetching } from "@tanstack/react-query";
import { Check, Menu, Moon, Sun, X } from "lucide-react";
import { cn } from "../lib/utils";
import { useTheme } from "../hooks/useTheme";
import { CourseSelector } from "./CourseSelector";
import { RecentQuestionsSidebar } from "./RecentQuestionsSidebar";
import { SaveFailureBanner, SaveStatusIndicator } from "./SaveStatus";
import { Button } from "./ui/button";
import { useActiveCourse } from "../hooks/useActiveCourse";
import { CourseOnboarding } from "./CourseOnboarding";
import { dismissTestGeneration, useTestGenerationTask } from "../lib/testGenerationTask";

type NavItem = { to: string; label: string; end?: boolean };

/**
 * Grouped so the nav says what the app is for rather than listing eight pages.
 * Practice leads Study because practising is the thing a student came to do;
 * everything else is a means to that.
 */
const NAV_GROUPS: Array<{ id: string; label: string; items: NavItem[] }> = [
  {
    id: "study",
    label: "Study",
    items: [
      { to: "/", label: "Overview", end: true },
      { to: "/practice", label: "Practice" },
      { to: "/quiz", label: "Quiz" },
      { to: "/test-generator", label: "Test Generator" },
    ],
  },
  {
    id: "bank",
    label: "Question bank",
    items: [
      { to: "/browse", label: "Browse" },
      { to: "/import", label: "Import" },
    ],
  },
  {
    id: "course",
    label: "Course",
    items: [
      { to: "/course-settings", label: "Course settings" },
      { to: "/settings", label: "Settings" },
    ],
  },
];

const linkBase =
  "rounded-md px-2.5 py-2 text-[13px] font-medium text-muted-foreground transition hover:bg-surface hover:text-foreground";
const linkActive = "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground";

export function Layout() {
  const { courseId } = useActiveCourse();
  const location = useLocation();
  const { theme, toggle } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuPanelRef = useRef<HTMLDivElement | null>(null);
  const isFetching = useIsFetching() > 0;
  const generationTask = useTestGenerationTask();

  // The menu is a disclosure, so focus moves into it on open, Escape closes it,
  // and focus returns to the control that opened it rather than being dropped
  // somewhere at the top of the page.
  useEffect(() => {
    if (!mobileOpen) return;
    menuPanelRef.current
      ?.querySelector<HTMLElement>("a, button, input, select, textarea")
      ?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileOpen(false);
        menuButtonRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

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

          <div className="hidden lg:block">
            <CourseSelector />
          </div>

          <nav className="ml-auto hidden items-center gap-0.5 lg:flex" aria-label="Main">
            {NAV_GROUPS.map((group) => (
              <div key={group.id} className="flex items-center gap-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) => cn(linkBase, isActive && linkActive)}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <SaveStatusIndicator />
            <Button
              variant="outline"
              size="sm"
              className="bg-surface/60"
              onClick={toggle}
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
            >
              {theme === "light" ? <Sun /> : <Moon />}
              <span className="hidden md:inline">{theme === "light" ? "Light" : "Dark"}</span>
            </Button>
            <Button
              ref={menuButtonRef}
              variant="outline"
              size="sm"
              className="lg:hidden"
              aria-expanded={mobileOpen}
              aria-controls="site-menu"
              onClick={() => setMobileOpen((o) => !o)}
            >
              {mobileOpen ? <X /> : <Menu />}
              Menu
            </Button>
          </div>
        </div>

        {mobileOpen && (
          <div id="site-menu" ref={menuPanelRef} className="border-t border-border bg-background p-3 lg:hidden">
            <div className="mb-3 border-b border-border pb-3 lg:hidden">
              <CourseSelector inMenu />
            </div>
            <nav aria-label="Main">
              <ul className="space-y-3">
                {NAV_GROUPS.map((group) => (
                  <li key={group.id}>
                    <p className="label mb-1 px-1">{group.label}</p>
                    <ul className="grid gap-1 sm:grid-cols-2">
                      {group.items.map((item) => (
                        <li key={item.to}>
                          <NavLink
                            to={item.to}
                            end={item.end}
                            onClick={() => setMobileOpen(false)}
                            className={({ isActive }) =>
                              cn(
                                "block rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-surface hover:text-foreground",
                                isActive && "bg-secondary text-foreground"
                              )
                            }
                          >
                            {item.label}
                          </NavLink>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        )}
      </header>

      <SaveFailureBanner />

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

      <div className={cn("relative z-10 mx-auto grid max-w-[1500px] gap-6 px-4 py-6 sm:px-5", courseId && "lg:grid-cols-[238px_minmax(0,1fr)]")}>
        {courseId && <RecentQuestionsSidebar variant="rail" />}
        <main className="min-w-0">
          {!courseId && location.pathname !== "/" ? <CourseOnboarding /> : <Outlet />}
          {courseId && <RecentQuestionsSidebar variant="inline" />}
        </main>
      </div>
    </div>
  );
}
