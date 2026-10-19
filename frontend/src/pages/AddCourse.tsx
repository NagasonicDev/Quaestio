import { Link, useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { PageHeader, Panel, PanelHead } from "../components/system";
import { CreateCourseForm } from "../components/CreateCourseForm";
import { Button } from "../components/ui/button";
import { templatesByCategory, type CourseTemplate } from "../lib/courseTemplates";
import { useInstallTemplate } from "../hooks/useInstallTemplate";

/**
 * Full-page "add course" destination: start blank, or begin from a base
 * course template. Replaces the old popover form in the header.
 */
export function AddCourse() {
  const navigate = useNavigate();
  const install = useInstallTemplate();
  const groups = templatesByCategory().filter((g) => g.templates.length > 0);

  function handleAdd(t: CourseTemplate) {
    install.mutate(t, { onSuccess: () => navigate("/") });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Course"
        title="Add course"
        description="Start from scratch, or begin from a template."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link to="/templates">Browse templates</Link>
          </Button>
        }
      />
      <Panel>
        <PanelHead title="Start blank" />
        <div className="p-5">
          <CreateCourseForm onDone={() => navigate("/")} />
        </div>
      </Panel>
      {groups.map(({ category, templates }) => (
        <Panel key={category}>
          <PanelHead title={category} note="Templates" />
          <ul className="divide-y">
            {templates.map((t) => (
              <li key={t.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium">{t.name}</p>
                  {t.description && <p className="text-sm text-muted-foreground">{t.description}</p>}
                </div>
                <Button size="sm" disabled={install.isPending} onClick={() => handleAdd(t)}>
                  <Plus />
                  Add
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
      ))}
    </div>
  );
}
