import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Copy, Eraser, Highlighter, PenLine, Plus, Redo2, Trash2, Undo2 } from "lucide-react";
import { api } from "../../api/client";
import type { DrawingNotebook as DrawingNotebookData, DrawingPage, DrawingTool } from "../../lib/drawingNotebook";
import { cn } from "../../lib/utils";
import { SaveStatusIndicator } from "../SaveStatus";
import { DrawingCanvas } from "./DrawingCanvas";
import { createDrawingHistory, type DrawingHistory } from "./drawingHistory";

interface DrawingNotebookProps {
  questionId: string;
  className?: string;
}

const TOOLS: Array<{ value: DrawingTool; label: string; Icon: typeof PenLine }> = [
  { value: "pen", label: "Pen", Icon: PenLine },
  { value: "highlighter", label: "Highlighter", Icon: Highlighter },
  { value: "stroke-eraser", label: "Stroke eraser", Icon: Eraser },
  { value: "pixel-eraser", label: "Partial eraser", Icon: Eraser },
];

function pageCopy(page: DrawingPage, updates: Partial<DrawingPage> = {}): DrawingPage {
  return { ...page, ...updates, strokes: updates.strokes ?? page.strokes.map((stroke) => ({ ...stroke, points: [...stroke.points] })) };
}

export function DrawingNotebook({ questionId, className }: DrawingNotebookProps) {
  const [notebook, setNotebook] = useState<DrawingNotebookData | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [tool, setTool] = useState<DrawingTool>("pen");
  const [error, setError] = useState<string | null>(null);
  const notebookRef = useRef<DrawingNotebookData | null>(null);
  const histories = useRef(new Map<string, DrawingHistory<DrawingPage>>());
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const saveNow = async (page: DrawingPage) => {
    const timer = saveTimers.current.get(page.page_id);
    if (timer) {
      clearTimeout(timer);
      saveTimers.current.delete(page.page_id);
    }
    try {
      await api.saveDrawingPage(questionId, page);
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
    setNotebook(null);
    setSelectedPageId(null);
    histories.current.clear();
    void api.getDrawingNotebook(questionId).then((next) => {
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
      for (const page of notebookRef.current?.pages ?? []) void api.saveDrawingPage(questionId, page);
    };
  }, [questionId]);

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
    if (!notebook) return;
    const page: DrawingPage = {
      page_id: crypto.randomUUID(), question_id: questionId, position: notebook.pages.length,
      title: `Page ${notebook.pages.length + 1}`, background: "plain", strokes: [],
    };
    histories.current.set(page.page_id, createDrawingHistory(pageCopy(page)));
    updateNotebook((current) => ({ ...current, pages: [...current.pages, page] }));
    setSelectedPageId(page.page_id);
    void saveNow(page);
  };

  const renamePage = () => {
    if (!selectedPage) return;
    const title = window.prompt("Page name", selectedPage.title)?.trim();
    if (title) changePage({ ...selectedPage, title });
  };

  const duplicatePage = () => {
    if (!notebook || !selectedPage) return;
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
    void api.reorderDrawingPages(questionId, positioned.map((page) => page.page_id)).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not reorder pages."));
  };

  const deletePage = () => {
    if (!notebook || !selectedPage || notebook.pages.length === 1 || !window.confirm(`Delete ${selectedPage.title}?`)) return;
    const pages = notebook.pages.filter((page) => page.page_id !== selectedPage.page_id).map((page, position) => ({ ...page, position }));
    histories.current.delete(selectedPage.page_id);
    updateNotebook((current) => ({ ...current, pages }));
    setSelectedPageId(pages[Math.max(0, notebook.pages.indexOf(selectedPage) - 1)]?.page_id ?? null);
    void api.deleteDrawingPage(questionId, selectedPage.page_id).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not delete page."));
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

  if (!notebook) return <div className={cn("rounded-md border border-border p-4 text-sm text-muted-foreground", className)}>{error ?? "Loading drawing notebook…"}</div>;
  const history = selectedPage ? histories.current.get(selectedPage.page_id) : undefined;

  return (
    <section className={cn("space-y-3 rounded-lg border border-border bg-card p-3 sm:p-4", className)} aria-label="Question drawing notebook">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-semibold">Working</h2><p className="text-sm text-muted-foreground">Private notes saved on this device.</p></div>
        <SaveStatusIndicator />
      </div>
      {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Drawing tools">
        {TOOLS.map(({ value, label, Icon }) => <button key={value} type="button" title={label} aria-pressed={tool === value} onClick={() => setTool(value)} className={cn("inline-flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm", tool === value ? "border-primary bg-primary text-primary-foreground" : "border-input bg-surface")}>{<Icon className="size-4" />}{label}</button>)}
        <button type="button" aria-label="Undo" disabled={!history?.canUndo()} onClick={undo} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-input disabled:opacity-50"><Undo2 /></button>
        <button type="button" aria-label="Redo" disabled={!history?.canRedo()} onClick={redo} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-input disabled:opacity-50"><Redo2 /></button>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 p-2">
        <select aria-label="Drawing page" value={selectedPage?.page_id ?? ""} onChange={(event) => { if (selectedPage) void saveNow(selectedPage); setSelectedPageId(event.target.value); }} className="min-h-11 rounded-md border border-input bg-surface px-3 text-sm">
          {notebook.pages.map((page) => <option key={page.page_id} value={page.page_id}>{page.title}</option>)}
        </select>
        <button type="button" className="min-h-11 rounded-md border border-input px-3 text-sm" onClick={addPage}><Plus /> Add</button>
        <button type="button" className="min-h-11 rounded-md border border-input px-3 text-sm" onClick={renamePage}>Rename</button>
        <button type="button" className="min-h-11 rounded-md border border-input px-3 text-sm" onClick={duplicatePage}><Copy /> Duplicate</button>
        <button type="button" aria-label="Move page earlier" className="min-h-11 min-w-11 rounded-md border border-input" onClick={() => movePage(-1)}><ChevronLeft /></button>
        <button type="button" aria-label="Move page later" className="min-h-11 min-w-11 rounded-md border border-input" onClick={() => movePage(1)}><ChevronRight /></button>
        <button type="button" disabled={notebook.pages.length === 1} className="min-h-11 rounded-md border border-destructive/40 px-3 text-sm text-destructive disabled:opacity-50" onClick={deletePage}><Trash2 /> Delete</button>
      </div>
      {selectedPage && <>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex min-h-11 items-center gap-2 text-sm">Background <select value={selectedPage.background} onChange={(event) => changePage({ ...selectedPage, background: event.target.value as DrawingPage["background"] })} className="h-9 rounded-md border border-input bg-surface px-2"><option value="plain">Plain</option><option value="ruled">Ruled</option><option value="grid">Grid</option><option value="dotted">Dotted</option></select></label>
          <button type="button" className="min-h-11 rounded-md border border-destructive/40 px-3 text-sm text-destructive" onClick={() => { if (selectedPage.strokes.length && window.confirm("Clear all drawings on this page?")) changePage({ ...selectedPage, strokes: [] }); }}>Clear page</button>
        </div>
        <DrawingCanvas page={selectedPage} tool={tool} onChange={changePage} />
      </>}
    </section>
  );
}
