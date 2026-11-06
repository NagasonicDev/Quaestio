import { HashRouter, Routes, Route, useLocation } from "react-router-dom";
import { Suspense, lazy, useEffect, useState } from "react";
import { flush, subscribeExternalChange } from "./lib/db/sqlite.ts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CourseProvider } from "./hooks/useActiveCourse.tsx";
import { ConfirmProvider } from "./components/ui/modal.tsx";
import { TourProvider, ImportTourProvider } from "./components/Tour.tsx";
import { Layout } from "./components/Layout.tsx";
import { GlossaryProvider } from "./components/GlossaryProvider.tsx";
import { Dashboard } from "./pages/Dashboard.tsx";
import { Browser } from "./pages/Browser.tsx";
import { Practice } from "./pages/Practice.tsx";
import { Quiz } from "./pages/Quiz.tsx";
import { TestGenerator } from "./pages/TestGenerator.tsx";
import { QuestionDetail } from "./pages/QuestionDetail.tsx";
import { Import } from "./pages/Import.tsx";
import { CourseSettings } from "./pages/CourseSettings.tsx";
import { Settings } from "./pages/Settings.tsx";
const AddCourse = lazy(() => import("./pages/AddCourse.tsx").then((m) => ({ default: m.AddCourse })));
const Templates = lazy(() => import("./pages/Templates.tsx").then((m) => ({ default: m.Templates })));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function RouteAnalytics() {
  const location = useLocation();
  useEffect(() => {
    void flush();
  }, [location.pathname, location.search]);
  return null;
}

export default function App() {
  const [newerData, setNewerData] = useState(false);
  useEffect(() => subscribeExternalChange(() => setNewerData(true)), []);
  return (
    <QueryClientProvider client={queryClient}>
      <ConfirmProvider>
        <CourseProvider>
          <HashRouter>
            <RouteAnalytics />
            {newerData && (
              <div
                role="alert"
                className="fixed left-0 right-0 top-0 z-50 flex items-center justify-between gap-3 border-b border-border bg-background px-4 py-2 text-sm shadow"
              >
                <span>Newer data is available from another tab. Reload to use it.</span>
                <button
                  type="button"
                  className="rounded-md border border-border px-3 py-1 text-sm font-medium"
                  onClick={() => window.location.reload()}
                >
                  Reload
                </button>
              </div>
            )}
            <Routes>
              <Route element={<TourProvider><ImportTourProvider><GlossaryProvider><Layout /></GlossaryProvider></ImportTourProvider></TourProvider>}>
                <Route index element={<Dashboard />} />
                <Route path="browse" element={<Browser />} />
                <Route path="practice" element={<Practice />} />
                <Route path="quiz" element={<Quiz />} />
                <Route path="test-generator" element={<TestGenerator />} />
                <Route path="questions/:questionId" element={<QuestionDetail />} />
                <Route path="import" element={<Import />} />
                <Route path="course-settings" element={<CourseSettings />} />
                <Route path="settings" element={<Settings />} />
                <Route path="add-course" element={<Suspense fallback={<div className="p-6 text-sm">Loading…</div>}><AddCourse /></Suspense>} />
                <Route path="templates" element={<Suspense fallback={<div className="p-6 text-sm">Loading…</div>}><Templates /></Suspense>} />
              </Route>
            </Routes>
          </HashRouter>
        </CourseProvider>
      </ConfirmProvider>
    </QueryClientProvider>
  );
}
