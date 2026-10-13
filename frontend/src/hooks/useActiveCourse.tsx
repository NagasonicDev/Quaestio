import { createContext, useContext, useState, type ReactNode } from "react";

interface CourseContextValue {
  courseId: string | null;
  setCourseId: (id: string | null) => void;
}

const CourseContext = createContext<CourseContextValue | undefined>(undefined);

function readActiveCourse(): string | null {
  try {
    return localStorage.getItem("qb-active-course");
  } catch {
    return null;
  }
}

export function CourseProvider({ children }: { children: ReactNode }) {
  const [courseId, setCourseIdState] = useState<string | null>(readActiveCourse);

  const setCourseId = (id: string | null) => {
    setCourseIdState(id);
    try {
      if (id) localStorage.setItem("qb-active-course", id);
      else localStorage.removeItem("qb-active-course");
    } catch {
      // Storage can be blocked; the in-memory selection still applies.
    }
  };

  return (
    <CourseContext.Provider value={{ courseId, setCourseId }}>
      {children}
    </CourseContext.Provider>
  );
}

export function useActiveCourse() {
  const ctx = useContext(CourseContext);
  if (!ctx) throw new Error("useActiveCourse must be used within CourseProvider");
  return ctx;
}
