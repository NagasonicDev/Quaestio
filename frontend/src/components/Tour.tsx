import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSetting, setSetting } from "../lib/data";
import { flush } from "../lib/db/sqlite";
import { useActiveCourse } from "../hooks/useActiveCourse";
import {
  IMPORT_TOUR_SEEN_KEY,
  IMPORT_TOUR_STEPS,
  TOUR_STEPS,
  TOUR_SEEN_KEY,
  navTourTarget,
  resolveTourStep,
  type TourStep,
} from "../lib/tour";
import { Button } from "./ui/button";

interface TourContextValue {
  /** Restart the walkthrough from the first step. */
  start: () => void;
}

const TourContext = createContext<TourContextValue | undefined>(undefined);

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within TourProvider");
  return ctx;
}

/**
 * Owns whether the walkthrough is running. It opens by itself the first time a
 * course is active and the seen flag is unset, and can be restarted from
 * Settings. The overlay deliberately does not trap focus or block the page:
 * the hands-on steps need the user to click real controls underneath it.
 */
export function TourProvider({ children }: { children: ReactNode }) {
  const { courseId } = useActiveCourse();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const seenQuery = useQuery({
    queryKey: ["setting", TOUR_SEEN_KEY],
    queryFn: () => getSetting(TOUR_SEEN_KEY),
  });
  const [override, setOverride] = useState<boolean | null>(null);
  const [index, setIndex] = useState(0);
  const [runId, setRunId] = useState(0);

  const active =
    override ?? (courseId !== null && seenQuery.isSuccess && seenQuery.data === null);

  const finish = useCallback(async () => {
    setOverride(false);
    setIndex(0);
    try {
      await setSetting(TOUR_SEEN_KEY, "1");
      // The DB write is debounced; flush so a reload right after Finish
      // cannot resurrect the tour.
      await flush();
      await qc.invalidateQueries({ queryKey: ["setting", TOUR_SEEN_KEY] });
    } catch {
      // The tour stays closed for this visit even if the flag cannot be saved.
    }
  }, [qc]);

  const start = useCallback(() => {
    setIndex(0);
    setRunId((id) => id + 1);
    setOverride(true);
    navigate("/");
  }, [navigate]);

  const value = useMemo(() => ({ start }), [start]);

  return (
    <TourContext.Provider value={value}>
      {children}
      {active && (
        <TourOverlay
          key={runId}
          steps={TOUR_STEPS}
          index={index}
          onNext={() => setIndex((i) => i + 1)}
          onExit={() => void finish()}
        />
      )}
    </TourContext.Provider>
  );
}

interface ImportTourContextValue {
  /** Restart the import walkthrough from the first step. */
  start: () => void;
}

const ImportTourContext = createContext<ImportTourContextValue | undefined>(undefined);

export function useImportTour() {
  const ctx = useContext(ImportTourContext);
  if (!ctx) throw new Error("useImportTour must be used within ImportTourProvider");
  return ctx;
}

/**
 * Same machinery as TourProvider, for the import walkthrough: it opens by
 * itself on the first visit to the Import page once the main tour is out of
 * the way (so two overlays never stack), and Settings can restart it.
 */
export function ImportTourProvider({ children }: { children: ReactNode }) {
  const { courseId } = useActiveCourse();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const tourSeenQuery = useQuery({
    queryKey: ["setting", TOUR_SEEN_KEY],
    queryFn: () => getSetting(TOUR_SEEN_KEY),
  });
  const seenQuery = useQuery({
    queryKey: ["setting", IMPORT_TOUR_SEEN_KEY],
    queryFn: () => getSetting(IMPORT_TOUR_SEEN_KEY),
  });
  const [override, setOverride] = useState<boolean | null>(null);
  const [index, setIndex] = useState(0);
  const [runId, setRunId] = useState(0);

  const active =
    override ??
    (courseId !== null &&
      pathname === "/import" &&
      tourSeenQuery.isSuccess &&
      tourSeenQuery.data === "1" &&
      seenQuery.isSuccess &&
      seenQuery.data === null);

  const finish = useCallback(async () => {
    setOverride(false);
    setIndex(0);
    try {
      await setSetting(IMPORT_TOUR_SEEN_KEY, "1");
      // Same debounced-write flush as the main tour, so a reload right after
      // Finish cannot resurrect the overlay.
      await flush();
      await qc.invalidateQueries({ queryKey: ["setting", IMPORT_TOUR_SEEN_KEY] });
    } catch {
      // The tour stays closed for this visit even if the flag cannot be saved.
    }
  }, [qc]);

  const start = useCallback(() => {
    setIndex(0);
    setRunId((id) => id + 1);
    setOverride(true);
    navigate("/import");
  }, [navigate]);

  const value = useMemo(() => ({ start }), [start]);

  return (
    <ImportTourContext.Provider value={value}>
      {children}
      {active && (
        <TourOverlay
          key={runId}
          steps={IMPORT_TOUR_STEPS}
          index={index}
          onNext={() => setIndex((i) => i + 1)}
          onExit={() => void finish()}
        />
      )}
    </ImportTourContext.Provider>
  );
}

const PANEL_WIDTH = 340;
const GAP = 14;
const PANEL_HEIGHT_ESTIMATE = 210;

function TourOverlay({
  steps,
  index,
  onNext,
  onExit,
}: {
  steps: TourStep[];
  index: number;
  onNext: () => void;
  onExit: () => void;
}) {
  const { pathname } = useLocation();
  const resolved = useMemo(
    () => resolveTourStep(steps, index, pathname),
    [steps, index, pathname]
  );
  const step = resolved.step;
  // Hands-on steps point at the navigation link for their destination, which
  // is what the user actually has to click; page targets are hidden on the
  // other pages.
  const target =
    step && resolved.mode === "navigate" ? navTourTarget(step.path) : step?.target;
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [placement, setPlacement] = useState<{ above: boolean; height: number }>({
    above: false,
    height: PANEL_HEIGHT_ESTIMATE,
  });
  const panelRef = useRef<HTMLDivElement | null>(null);
  const lastRectKey = useRef<string>("");

  useEffect(() => {
    if (resolved.mode === "done") onExit();
  }, [resolved.mode, onExit]);

  // The target may not exist yet (page still loading) or may move as data
  // arrives, so the highlight is re-measured on DOM changes, scroll and resize.
  useEffect(() => {
    if (!target) {
      lastRectKey.current = "";
      setRect(null);
      return;
    }
    let frame = 0;
    const measure = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
      const next = el?.getBoundingClientRect() ?? null;
      const visible = next && next.width > 0 && next.height > 0 ? next : null;
      const key = visible
        ? `${Math.round(visible.top)}:${Math.round(visible.left)}:${Math.round(visible.width)}:${Math.round(visible.height)}`
        : "";
      if (key === lastRectKey.current) return;
      lastRectKey.current = key;
      setRect(visible);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [target, pathname]);

  // Bring a highlighted element that is off-screen into view, once per step.
  // Nav links live in the sticky header, so they are never scrolled to.
  useEffect(() => {
    if (!target || target.startsWith("nav-")) return;
    const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
    if (!el) return;
    const box = el.getBoundingClientRect();
    if (box.top < 80 || box.bottom > window.innerHeight - 80) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [target]);

  // Place the card with its real measured height so it can never sit clipped
  // above the fold: below the target by default, above it when that side has
  // more room.
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const height = el.offsetHeight;
    if (!rect) {
      setPlacement((prev) =>
        prev.above === false && prev.height === height ? prev : { above: false, height }
      );
      return;
    }
    const spaceBelow = window.innerHeight - rect.bottom - GAP - 12;
    const spaceAbove = rect.top - GAP - 12;
    const above = spaceBelow < height && spaceAbove >= spaceBelow;
    setPlacement((prev) =>
      prev.above === above && prev.height === height ? prev : { above, height }
    );
  }, [rect, target]);

  useEffect(() => {
    panelRef.current?.focus();
  }, [step?.id]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onExit();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onExit]);

  if (!step) return null;

  const navigateMode = resolved.mode === "navigate";
  const panelStyle = panelStyleFor(rect, placement);
  const isLast = index === steps.length - 1;

  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-[95]" aria-hidden="true">
        {rect ? (
          <div
            className="absolute rounded-lg transition-all duration-200"
            style={{
              left: rect.left - 6,
              top: rect.top - 6,
              width: rect.width + 12,
              height: rect.height + 12,
              boxShadow:
                "0 0 0 2px #4ade80, 0 0 0 9999px rgba(2, 6, 23, 0.55)",
            }}
          />
        ) : (
          <div className="absolute inset-0 bg-slate-950/55" />
        )}
      </div>

      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-label={`Tour step ${index + 1} of ${steps.length}: ${step.title}`}
        className="fixed z-[96] rounded-xl border border-border bg-card p-4 shadow-2xl outline-none"
        style={panelStyle}
      >
        <p className="label">
          Step {index + 1} of {steps.length}
        </p>
        <h2 className="mt-1 font-display text-base font-semibold">{step.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
        {navigateMode && (
          <p className="mt-3 rounded-md bg-secondary px-2.5 py-2 text-xs font-medium text-foreground">
            {rect
              ? `Click “${step.page}” in the navigation above to continue.`
              : `Open “${step.page}” from the Menu button at the top to continue.`}
          </p>
        )}
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={onExit}>
            Skip tour
          </Button>
          {!navigateMode && (
            <Button size="sm" onClick={onNext}>
              {isLast ? "Finish" : "Next"}
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

function panelStyleFor(
  rect: DOMRect | null,
  placement: { above: boolean; height: number }
): CSSProperties {
  const base: CSSProperties = {
    width: PANEL_WIDTH,
    maxWidth: "calc(100vw - 24px)",
    // On very short screens the card scrolls rather than overflowing.
    maxHeight: "calc(100vh - 24px)",
    overflowY: "auto",
  };
  // With no target on screen (small screens, links behind the Menu) the card
  // sits along the bottom so it cannot cover the menu it points at.
  if (!rect || typeof window === "undefined") {
    return { ...base, left: "50%", transform: "translateX(-50%)", bottom: 12 };
  }
  const left = Math.min(
    Math.max(rect.left + rect.width / 2 - PANEL_WIDTH / 2, 12),
    Math.max(12, window.innerWidth - PANEL_WIDTH - 12)
  );
  if (placement.above && rect.top - GAP - placement.height >= 12) {
    return { ...base, left, top: rect.top - GAP - placement.height };
  }
  const belowTop = Math.min(rect.bottom + GAP, window.innerHeight - placement.height - 12);
  return { ...base, left, top: Math.max(12, belowTop) };
}
