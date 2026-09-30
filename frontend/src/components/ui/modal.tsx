import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./button";
import { cn } from "../../lib/utils";

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

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name for the dialog. */
  label: string;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
  header?: ReactNode;
  footer?: ReactNode;
  /** Rendered in the header, before the close button. */
  headerNote?: ReactNode;
  /** Element that should receive focus on open. Defaults to the first focusable child. */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  onCloseDisabled?: boolean;
  role?: "dialog" | "alertdialog";
}

/**
 * Accessible modal: Escape closes, Tab is trapped inside, focus moves in on
 * open and is restored to whatever was focused before, and the backdrop is
 * clickable. Every overlay in the app should use this rather than a plain
 * `window.confirm`, so keyboard and screen-reader users get the same behaviour.
 */
export function Modal({
  open,
  onClose,
  label,
  description,
  children,
  className,
  header,
  footer,
  headerNote,
  initialFocusRef,
  onCloseDisabled = false,
  role = "dialog",
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const generatedId = useId();
  const titleId = `${generatedId}-title`;
  const descriptionId = description ? `${generatedId}-description` : undefined;

  // Callbacks are read through a ref so focus handling only re-runs on open/close.
  const latest = useRef({ onClose, initialFocusRef, onCloseDisabled });

  useEffect(() => {
    latest.current = { onClose, initialFocusRef, onCloseDisabled };
  });

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusTimer = window.setTimeout(() => {
      const target =
        latest.current.initialFocusRef?.current ?? focusableWithin(panelRef.current)[0] ?? panelRef.current;
      target?.focus();
    }, 0);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!latest.current.onCloseDisabled) latest.current.onClose();        return;
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
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus();
    };
  }, [open, onCloseDisabled]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div
        className="absolute inset-0 bg-foreground/25 backdrop-blur-[2px] animate-in fade-in-0"
        aria-hidden
        onClick={onCloseDisabled ? undefined : onClose}
      />
      <div className="relative flex min-h-full items-center justify-center p-4">
        <div
          ref={panelRef}
          role={role}
          aria-modal="true"
          aria-label={header ? undefined : label}
          aria-labelledby={header ? titleId : undefined}
          aria-describedby={descriptionId}
          tabIndex={-1}
          className={cn(
            "panel flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200",
            className
          )}
        >
          {header && (
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4">
              <div className="min-w-0">
                <h2 id={titleId} className="font-display text-lg font-semibold">
                  {header}
                </h2>
                {headerNote && <p className="mt-0.5 text-xs text-muted-foreground">{headerNote}</p>}
              </div>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Close ${label.toLowerCase()}`}
                disabled={onCloseDisabled}
                onClick={onClose}
                className="shrink-0"
              >
                <X />
              </Button>
            </header>
          )}
          {description && <span id={descriptionId} className="sr-only">{description}</span>}
          {children}
          {footer && <div className="flex shrink-0 gap-2 border-t border-border px-5 py-3">{footer}</div>}
        </div>
      </div>
    </div>,
    document.body
  );
}

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface PendingConfirm {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
}

/** Renders one dialog at a time from `useConfirm()` calls anywhere below it. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback<ConfirmFn>(
    (options) => new Promise<boolean>((resolve) => setPending({ options, resolve })),
    []
  );

  const settle = useCallback(
    (value: boolean) => {
      setPending((current) => {
        current?.resolve(value);
        return null;
      });
    },
    []
  );

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <Modal
          open
          onClose={() => settle(false)}
          label={pending.options.title}
          className="max-w-md"
          header={pending.options.title}
          footer={
            <>
              <Button variant="outline" onClick={() => settle(false)}>
                {pending.options.cancelLabel ?? "Cancel"}
              </Button>
              <Button
                variant={pending.options.destructive ? "destructive" : "default"}
                onClick={() => settle(true)}
              >
                {pending.options.confirmLabel ?? "Confirm"}
              </Button>
            </>
          }
        >
          {pending.options.description && (
            <div className="px-5 py-4 text-sm text-muted-foreground">
              {pending.options.description}
            </div>
          )}
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm must be used inside a <ConfirmProvider>");
  return confirm;
}
