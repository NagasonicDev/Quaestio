import { useMutation, useQueryClient } from "@tanstack/react-query";
import { buildTemplateBundle, type CourseTemplate } from "../lib/courseTemplates.ts";
import { useActiveCourse } from "./useActiveCourse.tsx";
import { notify } from "../lib/notifications.ts";
import { api } from "../api/client.ts";
import { parseQuestionBundleBlob } from "../lib/questionBundle.ts";
import { deleteUnclaimedAssetBlobs } from "../lib/assets.ts";

const EXAM_YEARS = [2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];

/**
 * Installs a base course template as a brand-new course (never writes into an
 * existing one) and makes it the active course. The 2020-25 HSC exam bundles
 * shipped in public/templates/hsc/<template>/ are pulled in as questions, if present.
 */
export function useInstallTemplate() {
  const qc = useQueryClient();
  const { setCourseId } = useActiveCourse();

  return useMutation({
    mutationFn: async (template: CourseTemplate) => {
      // Lazy so the bundle importer (and jszip) stays out of the main chunk.
      const { applyCourseBundle } = await import("../lib/exchange.ts");
      const courseId = await applyCourseBundle(buildTemplateBundle(template), "new");
      await qc.invalidateQueries({ queryKey: ["courses"] });
      setCourseId(courseId);

      const base = import.meta.env.BASE_URL ?? "/";
      for (const year of EXAM_YEARS) {
        const url = `${base}templates/hsc/${template.id}/${year}-hsc-${template.id}.qbx`;
        let res: Response;
        try {
          res = await fetch(url);
        } catch {
          continue;
        }
        if (!res.ok) continue;
        let parsed: Awaited<ReturnType<typeof parseQuestionBundleBlob>> | null = null;
        try {
          parsed = await parseQuestionBundleBlob(await res.blob());
          await api.importJson(courseId, parsed);
        } catch {
          // Bundles may be absent or unusable for some template/year pairs; drop
          // any image blobs staged before a failed import so they do not leak.
          if (parsed?.assetIds.length) await deleteUnclaimedAssetBlobs(parsed.assetIds);
        }
      }
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