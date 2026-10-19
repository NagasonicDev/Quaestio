import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, ChevronDown, Layers, Plus, Search } from "lucide-react";
import { PageHeader } from "../components/system";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { cn } from "../lib/utils";
import { templateStats, templatesByCategory } from "../lib/courseTemplates";
import { useInstallTemplate } from "../hooks/useInstallTemplate";

/** Cards shown per category before "View all" expands the group. */
const PREVIEW_COUNT = 3;

/**
 * Browsable catalog of base course templates, grouped by category. Adding one
 * creates a brand-new course from the template; templates themselves are
 * source-defined (see lib/courseTemplates.ts) and not editable in the app.
 */
export function Templates() {
  const navigate = useNavigate();
  const install = useInstallTemplate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());

  // Filter within each category so results stay grouped by category.
  const q = query.trim().toLowerCase();
  const groups = templatesByCategory()
    .map(({ category, templates }) => ({
      category,
      templates: q
        ? templates.filter(
            (t) => t.name.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q)
          )
        : templates,
    }))
    .filter((g) => g.templates.length > 0);

  const toggle = (category: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });

  return (
    <div className="space-y-9">
      <PageHeader
        eyebrow="Course templates"
        title="Start from a template"
        description="Ready-made course banks you can add straight to your library. Each one installs as a new course you can then shape freely."
      />
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search templates"
          aria-label="Search templates"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {groups.length === 0 && (
        <p className="text-sm text-muted-foreground">No templates match “{query.trim()}”.</p>
      )}
      {groups.map(({ category, templates }) => {
        if (templates.length === 0) return null;
        const isOpen = open.has(category);
        // While searching, show every match; otherwise preview the first few.
        const shown = isOpen || q ? templates : templates.slice(0, PREVIEW_COUNT);
        const hasMore = templates.length > PREVIEW_COUNT;

        return (
          <section key={category} className="space-y-5">
            <div className="flex items-end justify-between gap-4 border-b border-border pb-2.5">
              <div className="flex items-baseline gap-3">
                <h2 className="font-display text-xl font-semibold tracking-tight">{category}</h2>
                <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  {templates.length} {templates.length === 1 ? "bank" : "banks"}
                </span>
              </div>
              {hasMore && (
                <button
                  type="button"
                  onClick={() => toggle(category)}
                  aria-expanded={isOpen}
                  className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {isOpen ? "Show less" : "View all"}
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", isOpen && "rotate-180")} />
                </button>
              )}
            </div>

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((t) => {
                const { topics, levels } = templateStats(t);
                return (
                  <article key={t.id} className="panel flex flex-col gap-4 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
                        <BookOpen className="h-5 w-5" />
                      </div>
                      <span className="label rounded-full border border-border px-2.5 py-1">{t.category}</span>
                    </div>
                    <div className="min-w-0 space-y-1.5">
                      <h3 className="font-display text-lg font-semibold leading-snug">{t.name}</h3>
                      {t.description && (
                        <p className="text-[13px] leading-relaxed text-muted-foreground">{t.description}</p>
                      )}
                    </div>
                    <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-4">
                      <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                        <Layers className="h-3.5 w-3.5" />
                        {topics} topics · {levels} levels
                      </span>
                      <Button
                        size="sm"
                        disabled={install.isPending}
                        className="shrink-0 gap-1.5"
                        onClick={() => install.mutate(t, { onSuccess: () => navigate("/") })}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
