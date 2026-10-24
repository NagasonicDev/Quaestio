// The tour's overlay and provider need a browser, so the parts checked here are
// the pure ones: the step list's shape and the rule that decides whether a step
// is shown where the user is standing or waits for them to navigate there.
import test from "node:test";
import assert from "node:assert/strict";
import {
  TOUR_STEPS,
  TOUR_SEEN_KEY,
  IMPORT_TOUR_STEPS,
  IMPORT_TOUR_SEEN_KEY,
  resolveTourStep,
  navTourTarget,
} from "../src/lib/tour.ts";

const ROUTES = [
  "/",
  "/practice",
  "/quiz",
  "/test-generator",
  "/browse",
  "/import",
  "/course-settings",
  "/settings",
];

test("every step has a unique id and an existing page label", () => {
  const ids = TOUR_STEPS.map((step) => step.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const step of TOUR_STEPS) {
    assert.ok(step.title.length > 0, step.id);
    assert.ok(step.body.length > 0, step.id);
    assert.ok(step.page.length > 0, step.id);
  }
});

test("a step's route is either absent or a real route", () => {
  for (const step of TOUR_STEPS) {
    if (step.path !== undefined) assert.ok(ROUTES.includes(step.path), `${step.id}: ${step.path}`);
  }
});

test("highlight targets are unique so one target cannot point at two steps", () => {
  const targets = TOUR_STEPS.map((step) => step.target).filter(Boolean);
  assert.equal(new Set(targets).size, targets.length);
});

test("hands-on steps point at the navigation link for their own page", () => {
  const handsOn = TOUR_STEPS.filter((step) => step.id.startsWith("nav-"));
  assert.ok(handsOn.length >= 3);
  for (const step of handsOn) assert.equal(step.target, navTourTarget(step.path));
});

test("the tour opens on the step matching the current page", () => {
  const index = TOUR_STEPS.findIndex((step) => step.path === "/quiz");
  const resolved = resolveTourStep(TOUR_STEPS, index, "/quiz");
  assert.equal(resolved.mode, "info");
  assert.equal(resolved.step.id, TOUR_STEPS[index].id);
});

test("the tour waits for the user to navigate when they are on another page", () => {
  const index = TOUR_STEPS.findIndex((step) => step.id === "nav-quiz");
  const resolved = resolveTourStep(TOUR_STEPS, index, "/practice");
  assert.equal(resolved.mode, "navigate");
  assert.equal(resolved.step.path, "/quiz");
});

test("a step without a route is shown wherever the user is", () => {
  const index = TOUR_STEPS.findIndex((step) => step.path === undefined);
  assert.ok(index >= 0);
  for (const path of ["/", "/settings", "/questions/q1"]) {
    assert.equal(resolveTourStep(TOUR_STEPS, index, path).mode, "info");
  }
});

test("the tour finishes after the last step", () => {
  const resolved = resolveTourStep(TOUR_STEPS, TOUR_STEPS.length, "/");
  assert.equal(resolved.mode, "done");
  assert.equal(resolved.step, null);
});

test("navigation targets are derived from routes, with the index page named overview", () => {
  assert.equal(navTourTarget("/"), "nav-overview");
  assert.equal(navTourTarget("/practice"), "nav-practice");
  assert.equal(navTourTarget("/test-generator"), "nav-test-generator");
  assert.equal(TOUR_SEEN_KEY, "tour_seen");
});

test("the import tour's steps are well-formed", () => {
  const ids = IMPORT_TOUR_STEPS.map((step) => step.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const step of IMPORT_TOUR_STEPS) {
    assert.ok(step.title.length > 0, step.id);
    assert.ok(step.body.length > 0, step.id);
    if (step.path !== undefined) assert.ok(ROUTES.includes(step.path), `${step.id}: ${step.path}`);
  }
  const targets = IMPORT_TOUR_STEPS.map((step) => step.target).filter(Boolean);
  assert.equal(new Set(targets).size, targets.length);
});

test("the import tour downloads the skill on Course Settings before uploading", () => {
  const ids = IMPORT_TOUR_STEPS.map((step) => step.id);
  assert.ok(ids.indexOf("download-skill") < ids.indexOf("import-upload"));
  const skill = IMPORT_TOUR_STEPS.find((step) => step.id === "download-skill");
  assert.equal(skill?.target, "download-skill");
  const navSkill = IMPORT_TOUR_STEPS.find((step) => step.id === "nav-skill-settings");
  assert.equal(navSkill?.target, navTourTarget("/course-settings"));
});

test("the import tour waits for the user to navigate between its pages", () => {
  const index = IMPORT_TOUR_STEPS.findIndex((step) => step.id === "nav-import");
  assert.equal(resolveTourStep(IMPORT_TOUR_STEPS, index, "/course-settings").mode, "navigate");
  const done = resolveTourStep(IMPORT_TOUR_STEPS, IMPORT_TOUR_STEPS.length, "/import");
  assert.equal(done.mode, "done");
  assert.equal(IMPORT_TOUR_SEEN_KEY, "import_tour_seen");
});
