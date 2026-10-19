import { useMutation, useQueryClient } from "@tanstack/react-query";
import { buildTemplateBundle, type CourseTemplate } from "../lib/courseTemplates";
import { useActiveCourse } from "./useActiveCourse";
import { notify } from "../lib/notifications";

/**
 * Installs a base course template as a brand-new course (never writes into an
 * existing one) and makes it the active course.
 */
export function useInstallTemplate() {
  const qc = useQueryClient();
  const { setCourseId } = useActiveCourse();

  return useMutation({
    mutationFn: async (template: CourseTemplate) => {
      // Lazy so the bundle importer (and jszip) stays out of the main chunk.
      const { applyCourseBundle } = await import("../lib/exchange");
      const courseId = await applyCourseBundle(buildTemplateBundle(template), "new");
      await qc.invalidateQueries({ queryKey: ["courses"] });
      setCourseId(courseId);
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
