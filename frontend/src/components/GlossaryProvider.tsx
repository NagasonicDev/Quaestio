import { createContext, useContext, type ReactNode } from "react";
import { useActiveCourse } from "../hooks/useActiveCourse.tsx";
import { useCourseConfig } from "../hooks/useCourseConfig.ts";
import type { GlossaryTerm } from "../api/types.ts";

const GlossaryContext = createContext<GlossaryTerm[]>([]);

export function GlossaryProvider({ children }: { children: ReactNode }) {
  const { courseId } = useActiveCourse();
  const { data: config } = useCourseConfig(courseId);
  const terms = config?.glossary ?? [];
  return <GlossaryContext.Provider value={terms}>{children}</GlossaryContext.Provider>;
}

export function useGlossaryTerms(): GlossaryTerm[] {
  return useContext(GlossaryContext);
}