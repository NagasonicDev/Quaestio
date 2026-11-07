import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CourseTemplate } from "../lib/courseTemplates.ts";
import { useActiveCourse } from "./useActiveCourse.tsx";
import { notify } from "../lib/notifications.ts";

/**
 * Installs a base course template as a brand-new course (never writes into an
 * existing one) and makes it the active course. Each template ships as one
 * `.qb` (built by `scripts/build-template-bundles.mjs`) carrying the course
 * structure and all of its questions, so install is a single fetch and one
 * atomic apply: an interrupted install leaves no partial course behind.
 */
export function useInstallTemplate() {
  const qc = useQueryClient();
  const { setCourseId } = useActiveCourse();

  return useMutation({
    mutationFn: async (template: CourseTemplate) => {
      // Lazy so the bundle importer (and jszip) stays out of the main chunk.
      const { parseCourseBundle, applyCourseBundle } = await import("../lib/exchange.ts");
      const base = import.meta.env.BASE_URL ?? "/";
      const res = await fetch(`${base}templates/hsc/${template.id}/${template.id}.qb`);
      if (!res.ok) throw new Error("This template's course file is unavailable.");
      const bundle = await parseCourseBundle(new File([await res.blob()], `${template.id}.qb`));
      const courseId = await applyCourseBundle(bundle, "new");
      await qc.invalidateQueries({ queryKey: ["courses"] });
      setCourseId(courseId);
      await qc.invalidateQueries({ queryKey: ["questions", courseId] });
      await qc.invalidateQueries({ queryKey: ["question-counts", courseId] });
      return courseId;
    },
    onSuccess: (_courseId, template) => notify(`Course "${template.name}" added`, "success"),
    onError: (err) =>
      notify(
        "Could not add template",
        "error",
        err instanceof Error ? err.message : "Failed to install the course template."
      ),
  });
}
