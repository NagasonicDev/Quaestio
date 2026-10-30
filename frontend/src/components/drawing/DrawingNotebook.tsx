import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Check, CircleDashed, Copy, Eraser, Expand, Highlighter, Minimize2, NotebookPen, PenLine, Plus, Redo2, Settings2, Trash2, Undo2, X } from "lucide-react";
import { api } from "../../api/client";
import { MAX_DRAWING_NOTEBOOK_PAGES } from "../../lib/drawingNotebook";
import type { DrawingNotebook as DrawingNotebookData, DrawingPage, DrawingTool } from "../../lib/drawingNotebook";
import { cn } from "../../lib/utils";
import { useTheme } from "../../hooks/useTheme";
import { SaveStatusIndicator } from "../SaveStatus";
import { useConfirm } from "../ui/modal";
import { DrawingCanvas } from "./DrawingCanvas";
import { createDrawingHistory, type DrawingHistory } from "./drawingHistory";

interface DrawingNotebookProps {
  questionId: string;
  attemptId?: string;
  className?: string;
  /** Latest in-memory notebook, so marking does not race the 500ms save. */
  onChange?: (notebook: DrawingNotebookData) => void;
}

const TOOLS: Array<{ value: DrawingTool; label: string; Icon: typeof PenLine }> = [
  { value: "pen", label: "Pen", Icon: PenLine },
  { value: "highlighter", label: "Highlighter", Icon: Highlighter },
  { value: "stroke-eraser", label: "Eraser", Icon: Eraser },
];
const BLACK = "#000000";
const WHITE = "#ffffff";
const PALETTE = [
  { value: BLACK, label: "Black" }, { value: WHITE, label: "White" },
  { value: "#2563eb", label: "Blue" }, { value: "#16a34a", label: "Green" },
  { value: "#dc2626", label: "Red" }, { value: "#9333ea", label: "Purple" },
  { value: "#ea580c", label: "Orange" }, { value: "#0891b2", label: "Teal" },
];

function pageCopy(page: DrawingPage, updates: Partial<DrawingPage> = {}): DrawingPage {
  return { ...page, ...updates, strokes: updates.strokes ?? page.strokes.map((stroke) => ({ ...stroke, points: [...stroke.points] })) };
}

export function DrawingNotebook({ questionId, attemptId, className, onChange }: DrawingNotebookProps) {
  const { theme } = useTheme();
  const confirm = useConfirm();
  const defaultColour = theme === "dark" ? WHITE : BLACK;
  const [notebook, setNotebook] = useState<DrawingNotebookData | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [tool, setTool] = useState<DrawingTool>("pen");
  const [eraserMode, setEraserMode] = useState<"stroke-eraser" | "pixel-eraser">("stroke-eraser");
  const [toolSettingsOpen, setToolSettingsOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [colour, setColour] = useState(defaultColour);
  const [width, setWidth] = useState(4);
  const [error, setError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [renamingTitle, setRenamingTitle] = useState(false);
  const [pageTitleDraft, setPageTitleDraft] = useState("");
  const notebookRef = useRef<DrawingNotebookData | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const pageMenuRef = useRef<HTMLDetailsElement>(null);
  const toolPopupRef = useRef<HTMLDivElement>(null);
  const histories = useRef(new Map<string, DrawingHistory<DrawingPage>>());
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const onChangeRef = useRef(onChange);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { if (notebook) onChangeRef.current?.(notebook); }, [notebook]);

  useEffect(() => {
    const previousDefault = theme === "dark" ? BLACK : WHITE;
    setColour((current) => current === previousDefault ? defaultColour : current);
  }, [defaultColour, theme]);

  const saveNow = async (page: DrawingPage) => {
    const timer = saveTimers.current.get(page.page_id);
    if (timer) {
      clearTimeout(timer);
      saveTimers.current.delete(page.page_id);
    }
    try {
      await api.saveDrawingPage(questionId, page, attemptId);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this page.");
    }
  };

  const queueSave = (page: DrawingPage) => {
    const existing = saveTimers.current.get(page.page_id);
    if (existing) clearTimeout(existing);
    saveTimers.current.set(page.page_id, setTimeout(() => { void saveNow(page); }, 500));
  };

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setNotebook(null);
    notebookRef.current = null;
    setSelectedPageId(null);
    setRenamingTitle(false);
    histories.current.clear();
    const load = api.getDrawingNotebook(questionId, attemptId);
    void load.then((next) => {
      if (cancelled) return;
      notebookRef.current = next;
      setNotebook(next);
      setSelectedPageId(next.pages[0]?.page_id ?? null);
      next.pages.forEach((page) => histories.current.set(page.page_id, createDrawingHistory(pageCopy(page))));
    }).catch((cause) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load the drawing notebook.");
    });
    return () => {
      cancelled = true;
      for (const timer of saveTimers.current.values()) clearTimeout(timer);
      saveTimers.current.clear();
      for (const page of notebookRef.current?.pages ?? []) void api.saveDrawingPage(questionId, page, attemptId);
    };
  }, [questionId, attemptId, loadAttempt]);

  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [expanded]);

  useEffect(() => {
    if (!toolSettingsOpen) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (toolPopupRef.current?.contains(target) || target.closest("[data-tool-trigger]")) return;
      setToolSettingsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, [toolSettingsOpen]);

  const updateNotebook = (updater: (current: DrawingNotebookData) => DrawingNotebookData) => {
    setNotebook((current) => {
      if (!current) return current;
      const next = updater(current);
      notebookRef.current = next;
      return next;
    });
  };

  const selectedPage = notebook?.pages.find((page) => page.page_id === selectedPageId) ?? notebook?.pages[0] ?? null;

  const changePage = (page: DrawingPage, record = true) => {
    if (record) (histories.current.get(page.page_id) ?? createDrawingHistory(pageCopy(page))).record(pageCopy(page));
    updateNotebook((current) => ({ ...current, pages: current.pages.map((candidate) => candidate.page_id === page.page_id ? page : candidate) }));
    queueSave(page);
  };

  const addPage = () => {
    if (!notebook || notebook.pages.length >= MAX_DRAWING_NOTEBOOK_PAGES) return;
    const page: DrawingPage = {
      page_id: crypto.randomUUID(), question_id: questionId, position: notebook.pages.length,
      title: `Page ${notebook.pages.length + 1}`, background: "ruled", strokes: [],
    };
    histories.current.set(page.page_id, createDrawingHistory(pageCopy(page)));
    updateNotebook((current) => ({ ...current, pages: [...current.pages, page] }));
    setSelectedPageId(page.page_id);
    void saveNow(page);
  };

  const renamePage = () => {
    if (!selectedPage) return;
    setPageTitleDraft(selectedPage.title);
    setRenamingTitle(true);
    if (pageMenuRef.current) pageMenuRef.current.open = false;
  };

  const savePageTitle = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = pageTitleDraft.trim();
    if (title && selectedPage) changePage({ ...selectedPage, title });
    setRenamingTitle(false);
  };

  const duplicatePage = () => {
    if (!notebook || !selectedPage || notebook.pages.length >= MAX_DRAWING_NOTEBOOK_PAGES) return;
    const page = pageCopy(selectedPage, { page_id: crypto.randomUUID(), position: notebook.pages.length, title: `${selectedPage.title} copy` });
    histories.current.set(page.page_id, createDrawingHistory(pageCopy(page)));
    updateNotebook((current) => ({ ...current, pages: [...current.pages, page] }));
    setSelectedPageId(page.page_id);
    void saveNow(page);
  };

  const movePage = (direction: -1 | 1) => {
    if (!notebook || !selectedPage) return;
    const index = notebook.pages.findIndex((page) => page.page_id === selectedPage.page_id);
    const target = index + direction;
    if (target < 0 || target >= notebook.pages.length) return;
    const pages = [...notebook.pages];
    [pages[index], pages[target]] = [pages[target], pages[index]];
    const positioned = pages.map((page, position) => ({ ...page, position }));
    updateNotebook((current) => ({ ...current, pages: positioned }));
    void api.reorderDrawingPages(questionId, positioned.map((page) => page.page_id), attemptId).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not reorder pages."));
  };

  const selectPage = (index: number) => {
    if (!notebook) return;
    const target = notebook.pages[index];
    if (!target || target.page_id === selectedPage?.page_id) return;
    if (selectedPage) void saveNow(selectedPage);
    setSelectedPageId(target.page_id);
  };

  const deletePage = async () => {
    if (!notebook || !selectedPage || notebook.pages.length === 1) return;
    const ok = await confirm({
      title: "Delete page",
      description: `Delete ${selectedPage.title}? This cannot be undone.`,
      confirmLabel: "Delete page",
      destructive: true,
    });
    if (!ok) return;
    const pages = notebook.pages.filter((page) => page.page_id !== selectedPage.page_id).map((page, position) => ({ ...page, position }));
    histories.current.delete(selectedPage.page_id);
    updateNotebook((current) => ({ ...current, pages }));
    setSelectedPageId(pages[Math.max(0, notebook.pages.indexOf(selectedPage) - 1)]?.page_id ?? null);
    void api.deleteDrawingPage(questionId, selectedPage.page_id, attemptId).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not delete page."));
  };

  const clearPage = async () => {
    if (!selectedPage?.strokes.length) return;
    const ok = await confirm({
      title: "Clear page",
      description: "Clear all drawings on this page?",
      confirmLabel: "Clear page",
      destructive: true,
    });
    if (ok) changePage({ ...selectedPage, strokes: [] });
  };

  const undo = () => {
    if (!selectedPage) return;
    const page = histories.current.get(selectedPage.page_id)?.undo();
    if (page) changePage(page, false);
  };

  const redo = () => {
    if (!selectedPage) return;
    const page = histories.current.get(selectedPage.page_id)?.redo();
    if (page) changePage(page, false);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = document.activeElement as HTMLElement | null;
      if (!expanded && target && !sectionRef.current?.contains(target)) return;
      const isEditing = target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "");
      if (event.key === "Escape") {
        if (toolSettingsOpen) setToolSettingsOpen(false);
        if (expanded) setExpanded(false);
        return;
      }
      if (isEditing || !(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (key === "y") {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [expanded, redo, toolSettingsOpen, undo]);

  if (!notebook) return <div className={cn("flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card/70 p-5 text-sm text-muted-foreground shadow-sm", className)}><span role={error ? "alert" : "status"}>{error ?? "Loading drawing notebook…"}</span>{error && <button type="button" onClick={() => { setError(null); setLoadAttempt((attempt) => attempt + 1); }} className="min-h-10 rounded-lg border border-border bg-background px-3 font-medium text-foreground hover:bg-muted">Try again</button>}</div>;
  const history = selectedPage ? histories.current.get(selectedPage.page_id) : undefined;
  const eraserSelected = tool === "stroke-eraser" || tool === "pixel-eraser";

  return (
    <section ref={sectionRef} className={cn("space-y-4 rounded-2xl border border-border/80 bg-card/75 p-3 shadow-sm shadow-foreground/[0.035] sm:p-5", expanded && "fixed inset-2 z-[70] flex flex-col overflow-y-auto bg-card p-3 shadow-2xl sm:inset-4 sm:p-5", className)} aria-label="Question drawing notebook">
      <header className="flex items-center justify-between gap-3 px-1">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><NotebookPen className="size-5" /></span>
          <div className="min-w-0"><p className="label text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Notebook</p><h2 className="truncate text-base font-semibold">Working notebook</h2><p className="truncate text-xs text-muted-foreground">{attemptId ? "Saved with this attempt on this device" : "Shared across this question · saved on this device"}</p></div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <SaveStatusIndicator />
          <button type="button" aria-label={expanded ? "Exit expanded notebook" : "Expand notebook"} title={expanded ? "Exit expanded view" : "Expand notebook"} onClick={() => setExpanded((value) => !value)} className="inline-flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{expanded ? <Minimize2 className="size-[18px]" /> : <Expand className="size-[18px]" />}</button>
        </div>
      </header>
      {error && <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <div className="space-y-2 rounded-xl border border-border/70 bg-muted/35 p-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border/70 bg-background/70 p-1" role="toolbar" aria-label="Drawing tools">
          {TOOLS.map(({ value, label, Icon }) => {
            const selected = value === "stroke-eraser" ? eraserSelected : tool === value;
            const toolModeLabel = eraserMode === "pixel-eraser" ? "P" : "S";
            const activeTool = value === "stroke-eraser" ? eraserMode : value;
            return <div key={value} className="relative">
              <button type="button" data-tool-trigger aria-haspopup="dialog" aria-expanded={selected && toolSettingsOpen} title={`${label} · click for settings`} aria-label={`${label} settings`} aria-pressed={selected} onClick={() => {
                if (selected) setToolSettingsOpen((open) => !open);
                else { setTool(activeTool); setToolSettingsOpen(true); }
              }} className={cn("relative inline-flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-all", selected ? "border-primary/35 bg-primary text-primary-foreground shadow-sm shadow-primary/15" : "border-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground")}><Icon className="size-[17px]" /><span>{label}</span>{selected && (value === "stroke-eraser" ? <span title={eraserMode === "pixel-eraser" ? "Partial eraser" : "Whole-stroke eraser"} className="inline-flex size-4 items-center justify-center rounded-full border border-current/30 text-[9px] font-bold leading-none">{toolModeLabel}</span> : <span className="size-2.5 rounded-full border border-background" style={{ backgroundColor: colour }} />)}</button>
              {selected && toolSettingsOpen && <div ref={toolPopupRef} role="dialog" aria-label={`${label} settings`} onPointerDown={(event) => event.stopPropagation()} className={cn("absolute top-[calc(100%+0.5rem)] z-50 w-[min(320px,calc(100vw-2rem))] rounded-2xl border border-border bg-popover p-4 text-popover-foreground shadow-2xl shadow-black/20", value === "stroke-eraser" ? "right-0" : "left-0")}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5"><span className="inline-flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="size-[18px]" /></span><div><h3 className="text-sm font-semibold">{label} settings</h3><p className="text-xs text-muted-foreground">{value === "stroke-eraser" ? "Choose how to erase" : "Choose your ink"}</p></div></div>
                  <button type="button" aria-label={`Close ${label.toLowerCase()} settings`} onClick={() => setToolSettingsOpen(false)} className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-4" /></button>
                </div>
                {value === "stroke-eraser" ? <div className="mb-4 grid grid-cols-2 gap-2">
                  <button type="button" aria-pressed={eraserMode === "stroke-eraser"} onClick={() => { setEraserMode("stroke-eraser"); setTool("stroke-eraser"); }} className={cn("relative flex min-h-[76px] flex-col items-start justify-between rounded-xl border p-3 text-left transition-colors", eraserMode === "stroke-eraser" ? "border-primary bg-primary/10 ring-1 ring-primary/25" : "border-border bg-background/60 hover:bg-muted")}>
                    {eraserMode === "stroke-eraser" && <Check className="absolute right-2 top-2 size-4 text-primary" />}<Eraser className="size-5 text-primary" /><span><span className="block text-xs font-semibold">Whole stroke</span><span className="block text-[11px] text-muted-foreground">Remove a full line</span></span>
                  </button>
                  <button type="button" aria-pressed={eraserMode === "pixel-eraser"} onClick={() => { setEraserMode("pixel-eraser"); setTool("pixel-eraser"); }} className={cn("relative flex min-h-[76px] flex-col items-start justify-between rounded-xl border p-3 text-left transition-colors", eraserMode === "pixel-eraser" ? "border-primary bg-primary/10 ring-1 ring-primary/25" : "border-border bg-background/60 hover:bg-muted")}>
                    {eraserMode === "pixel-eraser" && <Check className="absolute right-2 top-2 size-4 text-primary" />}<CircleDashed className="size-5 text-primary" /><span><span className="block text-xs font-semibold">Partial</span><span className="block text-[11px] text-muted-foreground">Erase under the tip</span></span>
                  </button>
                </div> : <div className="mb-4">
                  <div className="mb-2 flex items-center justify-between"><span className="text-xs font-semibold">Color</span><span className="text-xs text-muted-foreground">{PALETTE.find((swatch) => swatch.value === colour)?.label ?? "Custom"}</span></div>
                  <div className="grid grid-cols-4 gap-2" aria-label="Choose a color">{PALETTE.map((swatch) => <button key={swatch.value} type="button" aria-label={swatch.label} title={swatch.label} aria-pressed={colour === swatch.value} onClick={() => setColour(swatch.value)} className={cn("group relative flex h-11 items-center gap-2 rounded-lg border px-2 text-left transition-all", colour === swatch.value ? "border-primary bg-primary/10 ring-1 ring-primary/25" : "border-border bg-background/50 hover:border-primary/40 hover:bg-muted")}><span className="size-4 shrink-0 rounded-full border border-foreground/15 shadow-sm" style={{ backgroundColor: swatch.value }} /><span className="truncate text-[11px] font-medium">{swatch.label}</span>{colour === swatch.value && <Check className="absolute right-1 top-1 size-3 text-primary" />}</button>)}</div>
                </div>}
                <div className="border-t border-border pt-3">
                  <div className="mb-2 flex items-center justify-between"><span className="text-xs font-semibold">{value === "stroke-eraser" ? "Eraser size" : "Thickness"}</span><span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">{width}px</span></div>
                  <input aria-label={value === "stroke-eraser" ? "Eraser size" : `${label} thickness`} type="range" min="1" max="18" value={width} onChange={(event) => setWidth(Number(event.target.value))} className="w-full accent-primary" />
                  <div className="mt-3 flex h-7 items-center justify-center rounded-lg bg-muted/60"><span className="block w-20 rounded-full" style={{ height: `${Math.min(12, Math.max(2, width))}px`, backgroundColor: value === "stroke-eraser" ? "var(--muted-foreground)" : colour, opacity: value === "highlighter" ? 0.42 : 1 }} /></div>
                </div>
              </div>}
            </div>;
          })}
          <span className="mx-1 h-7 border-l border-border/80" />
          <button type="button" aria-label="Undo" title="Undo (Ctrl/⌘+Z)" disabled={!history?.canUndo()} onClick={undo} className="inline-flex size-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-35"><Undo2 className="size-[18px]" /></button>
          <button type="button" aria-label="Redo" title="Redo (Ctrl/⌘+Shift+Z)" disabled={!history?.canRedo()} onClick={redo} className="inline-flex size-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-35"><Redo2 className="size-[18px]" /></button>
          <button type="button" aria-label="Clear page" title="Clear page" className="inline-flex size-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive" onClick={() => void clearPage()}><Trash2 className="size-[18px]" /></button>
        </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-2">
          <div className="mx-auto flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-border/70 bg-background/70 p-1" role="group" aria-label={`Notebook pages, ${notebook.pages.length} of ${MAX_DRAWING_NOTEBOOK_PAGES}`}>
            {notebook.pages.map((page, index) => {
              const isSelected = page.page_id === selectedPage?.page_id;
              return <button key={page.page_id} type="button" aria-label={`Page ${index + 1}${isSelected ? ", current page" : ""}`} aria-pressed={isSelected} title={page.title} onClick={() => selectPage(index)} className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-sm border text-sm font-medium tabular-nums transition-colors", isSelected ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border bg-background text-foreground hover:border-primary/50 hover:bg-muted")}>
                {index + 1}
              </button>;
            })}
            {notebook.pages.length < MAX_DRAWING_NOTEBOOK_PAGES && <button type="button" aria-label={`Add page ${notebook.pages.length + 1}`} title={`Add page ${notebook.pages.length + 1}`} onClick={() => addPage()} className="inline-flex size-8 shrink-0 items-center justify-center rounded-sm border border-dashed border-primary/50 bg-primary/5 text-primary transition-colors hover:bg-primary/10"><Plus className="size-4" /></button>}
          </div>
          <p className="w-full text-center text-xs text-muted-foreground">{tool === "pen" ? "Write or sketch on the page." : tool === "highlighter" ? "Highlight a key line or phrase." : "Choose an eraser mode to correct your work."}</p>
        </div>
      </div>
      {selectedPage && <>
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          {renamingTitle ? <form className="flex min-w-0 flex-1 items-center gap-2" onSubmit={savePageTitle}><label className="sr-only" htmlFor="drawing-page-title">Page name</label><input id="drawing-page-title" autoFocus maxLength={80} value={pageTitleDraft} onChange={(event) => setPageTitleDraft(event.target.value)} className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm" /><button type="submit" aria-label="Save page name" disabled={!pageTitleDraft.trim()} className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50"><Check className="size-4" /></button><button type="button" aria-label="Cancel rename" onClick={() => setRenamingTitle(false)} className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted"><X className="size-4" /></button></form> : <div className="min-w-0"><h3 className="truncate text-sm font-semibold">{selectedPage.title}</h3><p className="text-xs text-muted-foreground">Page {notebook.pages.indexOf(selectedPage) + 1} of {notebook.pages.length}</p></div>}
          <label className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">Paper <select aria-label="Paper style" value={selectedPage.background} onChange={(event) => changePage({ ...selectedPage, background: event.target.value as DrawingPage["background"] })} className="h-11 rounded-lg border border-input bg-surface px-3 text-sm text-foreground"><option value="plain">Plain</option><option value="ruled">Ruled</option><option value="grid">Grid</option><option value="dotted">Dotted</option></select></label>
          <details ref={pageMenuRef} className="relative">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg border border-border/70 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><Settings2 className="size-4" /><span>Page options</span></summary>
            <div className="absolute right-0 top-10 z-20 min-w-52 space-y-1 rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-xl">
              <button type="button" className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-muted" onClick={renamePage}>Rename page</button>
              <button type="button" disabled={notebook.pages.length >= MAX_DRAWING_NOTEBOOK_PAGES} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-muted disabled:opacity-40" onClick={duplicatePage}><Copy className="size-4" /> Duplicate page</button>
              <button type="button" disabled={notebook.pages.indexOf(selectedPage) === 0} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-muted disabled:opacity-40" onClick={() => movePage(-1)}>Move page earlier</button>
              <button type="button" disabled={notebook.pages.indexOf(selectedPage) === notebook.pages.length - 1} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-muted disabled:opacity-40" onClick={() => movePage(1)}>Move page later</button>
              <button type="button" disabled={notebook.pages.length === 1} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm text-destructive hover:bg-muted disabled:opacity-40" onClick={deletePage}><Trash2 className="size-4" /> Delete page</button>
            </div>
          </details>
        </div>
        <div className={cn("rounded-xl border border-border/70 bg-muted/25 p-2 shadow-inner sm:p-3", expanded && "flex-1")}>
          <DrawingCanvas page={selectedPage} tool={tool} colour={colour} width={width} expanded={expanded} onChange={changePage} />
        </div>
      </>}
    </section>
  );
}
