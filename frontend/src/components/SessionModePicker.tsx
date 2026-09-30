import { Layers, ListChecks, Shuffle } from "lucide-react";
import type { SessionMode } from "../api/types";
import { SESSION_MODE_HINT, SESSION_MODE_LABEL } from "../lib/sessionPlan";
import { cn } from "../lib/utils";

const MODE_ICON: Record<SessionMode, typeof Shuffle> = {
  focused: ListChecks,
  mixed: Shuffle,
  due_review: Layers,
};

const MODES: SessionMode[] = ["focused", "mixed", "due_review"];

/**
 * The mode picker exists because "random question" and "review what I got wrong"
 * are different jobs. The wording deliberately says what each one does rather
 * than naming an algorithm, and mixed practice is described in terms of what
 * the student will actually see.
 */
export function SessionModePicker({
  value,
  onChange,
  dueCount,
  disabled,
}: {
  value: SessionMode;
  onChange: (mode: SessionMode) => void;
  dueCount: number;
  disabled?: SessionMode[];
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="label mb-1.5">What kind of session?</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {MODES.map((mode) => {
          const Icon = MODE_ICON[mode];
          const selected = value === mode;
          const off = disabled?.includes(mode);
          return (
            <label
              key={mode}
              className={cn(
                "cursor-pointer rounded-md border p-3 transition-colors focus-within:ring-1 focus-within:ring-ring",
                selected
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/60 hover:bg-accent/40",
                off && "cursor-not-allowed opacity-50"
              )}
            >
              <input
                type="radio"
                name="session-mode"
                className="sr-only"
                checked={selected}
                disabled={off}
                onChange={() => onChange(mode)}
              />
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Icon className="size-4" />
                {SESSION_MODE_LABEL[mode]}
                {mode === "due_review" && dueCount > 0 && (
                  <span className="rounded-full bg-primary/15 px-1.5 font-mono text-[10px] text-primary">
                    {dueCount}
                  </span>
                )}
              </span>
              <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
                {off ? "Nothing due for review yet." : SESSION_MODE_HINT[mode]}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
