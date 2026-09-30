import { useId } from "react";
import { cn } from "../lib/utils";
import type { Confidence, SelfRating } from "../api/types";
import { SELF_RATING_HINT, SELF_RATING_LABEL, SELF_RATINGS } from "../lib/reviewSchedule";

const CONFIDENCE_OPTIONS: Array<{ value: Confidence; label: string }> = [
  { value: "low", label: "Guessing" },
  { value: "medium", label: "Fairly sure" },
  { value: "high", label: "Sure" },
];

/**
 * How sure the student felt, collected separately from whether the answer was
 * right. Keeping the two apart is the whole point: a wrong answer the student
 * was sure of is useful information, and a right answer they guessed is not
 * evidence of anything.
 */
export function ConfidencePicker({
  value,
  onChange,
  note,
}: {
  value: Confidence | null;
  onChange: (value: Confidence) => void;
  note?: string;
}) {
  const name = useId();
  return (
    <fieldset className="min-w-0">
      <legend className="label mb-1.5">How sure were you?</legend>
      {note && <p className="mb-2 text-xs text-muted-foreground">{note}</p>}
      <div className="flex flex-wrap gap-2">
        {CONFIDENCE_OPTIONS.map((option) => {
          const checked = value === option.value;
          return (
            <label
              key={option.value}
              className={cn(
                "cursor-pointer rounded-md border px-3 py-1.5 text-sm transition-colors focus-within:ring-1 focus-within:ring-ring",
                checked ? "border-primary bg-primary/10" : "border-border hover:border-primary/60"
              )}
            >
              <input
                type="radio"
                name={name}
                className="sr-only"
                checked={checked}
                onChange={() => onChange(option.value)}
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * The self-assessment that finishes a review. "Not sure" sits alongside the
 * four ratings rather than replacing them: a student who cannot tell whether
 * they got it is giving real information, and a scale without that option makes
 * them guess. No option here claims the answer was right or wrong.
 */
export function SelfAssessment({
  value,
  onChange,
  disabled,
}: {
  value: SelfRating | null;
  onChange: (value: SelfRating) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="min-w-0" disabled={disabled}>
      <legend className="label mb-1">How did that go?</legend>
      <p className="mb-2 text-xs text-muted-foreground">
        This decides when the question comes back. It is not a score.
      </p>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {SELF_RATINGS.map((rating) => {
          const checked = value === rating;
          return (
            <label
              key={rating}
              className={cn(
                "cursor-pointer rounded-md border p-2.5 transition-colors focus-within:ring-1 focus-within:ring-ring",
                checked
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/60 hover:bg-accent/40"
              )}
            >
              <input
                type="radio"
                name="self-rating"
                className="sr-only"
                checked={checked}
                onChange={() => onChange(rating)}
              />
              <span className="block text-sm font-medium">{SELF_RATING_LABEL[rating]}</span>
              <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">
                {SELF_RATING_HINT[rating]}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
