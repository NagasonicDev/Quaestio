import { HashRouter, Routes, Route, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Analytics } from "@vercel/analytics/react";
import { CourseProvider } from "./hooks/useActiveCourse";
import { ConfirmProvider } from "./components/ui/modal";
import { TourProvider, ImportTourProvider } from "./components/Tour";
import { Layout } from "./components/Layout";
import { GlossaryProvider } from "./components/GlossaryProvider";
import { Dashboard } from "./pages/Dashboard";
import { Browser } from "./pages/Browser";
import { Practice } from "./pages/Practice";
import { Quiz } from "./pages/Quiz";
import { TestGenerator } from "./pages/TestGenerator";
import { QuestionDetail } from "./pages/QuestionDetail";
import { Import } from "./pages/Import";
import { CourseSettings } from "./pages/CourseSettings";
import { Settings } from "./pages/Settings";
import { AddCourse } from "./pages/AddCourse";
import { Templates } from "./pages/Templates";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function RouteAnalytics() {
  const location = useLocation();
  const path = `${location.pathname}${location.search}`;

  return <Analytics route={location.pathname} path={path} />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfirmProvider>
        <CourseProvider>
          <HashRouter>
            <RouteAnalytics />
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
                <Route path="add-course" element={<AddCourse />} />
                <Route path="templates" element={<Templates />} />
              </Route>
            </Routes>
          </HashRouter>
        </CourseProvider>
      </ConfirmProvider>
    </QueryClientProvider>
  );
}
