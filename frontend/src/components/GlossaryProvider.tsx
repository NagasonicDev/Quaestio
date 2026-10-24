import { createContext, useContext, type ReactNode } from "react";
import { useActiveCourse } from "../hooks/useActiveCourse";
import { useCourseConfig } from "../hooks/useCourseConfig";
import type { GlossaryTerm } from "../api/types";

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