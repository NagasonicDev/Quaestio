import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { StimulusWithContent } from "../api/types";
import { BlockList } from "./QuestionReader";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusableWithin(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement
  );
}

export interface StimulusSideMenuProps {
  open: boolean;
  onClose: () => void;
  stimulus: StimulusWithContent | null;
  className?: string;
  title?: string | null;
}

export function StimulusSideMenu({
  open,
  onClose,
  stimulus,
  className,
  title,
}: StimulusSideMenuProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const generatedId = useId();
  const titleId = `${generatedId}-title`;

  const latest = useRef({ onClose });
  useEffect(() => {
    latest.current = { onClose };
  });

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusTimer = window.setTimeout(() => {
      const items = focusableWithin(panelRef.current);
      const target = items[0] ?? panelRef.current;
      target?.focus();
    }, 0);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        latest.current.onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusableWithin(panelRef.current);
      const panel = panelRef.current;
      if (items.length === 0) {
        event.preventDefault();
        panel?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const inside = panel != null && active != null && panel.contains(active);
      if (!event.shiftKey && (active === last || !inside)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && (active === first || !inside)) {
        event.preventDefault();
        last.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [open]);

  if (!open || !stimulus) return null;

  const headerTitle = title ?? stimulus.title ?? "Stimulus";

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-foreground/25 backdrop-blur-[2px] animate-in fade-in-0"
        aria-hidden
        onClick={onClose}
      />
      <div className="relative flex h-full justify-end">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className={cn(
            "panel flex h-full w-full max-w-lg flex-col overflow-hidden rounded-none border-0 border-l border-border shadow-lg animate-in slide-in-from-right duration-200",
            className
          )}
        >
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="font-display text-lg font-semibold">
                {headerTitle}
              </h2>
              {stimulus.title && title !== stimulus.title && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {stimulus.stimulus_id.slice(0, 8)}
                </p>
              )}
            </div>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Close stimulus"
              onClick={onClose}
              className="shrink-0"
            >
              <X />
            </Button>
          </header>
          <div className="flex-1 overflow-y-auto p-5">
            <BlockList blocks={stimulus.blocks} />
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
