import type { Question } from "../api/types";

/** Flatten nested question parts into a single labelled list, e.g. "(a)" or "(a) (i)". */
export function flattenQuestionParts(parts: Question[], prefix = ""): Array<{ part: Question; label: string }> {
  return parts.flatMap((part) => {
    const label = [prefix, part.part_label ? `(${part.part_label})` : "Part"].filter(Boolean).join(" ");
    return [{ part, label }, ...flattenQuestionParts(part.parts, label)];
  });
}
