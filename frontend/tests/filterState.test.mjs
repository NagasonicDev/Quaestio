import test from "node:test";
import assert from "node:assert/strict";

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => { store.set(key, String(value)); },
  removeItem: (key) => { store.delete(key); },
};

const { readSessionFilters, writeSessionFilters, renameInstitutionInSessionFilters } =
  await import("../src/lib/filterState.ts");

const filters = {
  selectedNodes: ["n1", "n2"],
  typeKeys: ["multiple_choice"],
  difficulties: [3, 4],
  selectedTag: "exam",
  institutionYears: { HSC: [2020, 2021] },
  avoidRecentDays: null,
};

test("readSessionFilters returns defaults when nothing is saved", () => {
  store.clear();
  assert.deepEqual(readSessionFilters("course-a", "practice"), {
    selectedNodes: [], typeKeys: [], difficulties: [], selectedTag: "", institutionYears: {},
  });
  assert.deepEqual(readSessionFilters(null, "quiz").selectedNodes, []);
});

test("filters are remembered per course and per page", () => {
  store.clear();
  writeSessionFilters("course-a", "practice", filters);
  writeSessionFilters("course-a", "quiz", { ...filters, selectedTag: "quiz-tag" });
  writeSessionFilters("course-b", "practice", { ...filters, selectedTag: "other-course" });

  assert.deepEqual(readSessionFilters("course-a", "practice"), filters);
  assert.equal(readSessionFilters("course-a", "quiz").selectedTag, "quiz-tag");
  assert.equal(readSessionFilters("course-b", "practice").selectedTag, "other-course");
  assert.equal(readSessionFilters("course-b", "quiz").selectedTag, "");
});

test("malformed or partial saved data falls back safely", () => {
  store.clear();
  store.set("qb-session-filters", "{not json");
  assert.deepEqual(readSessionFilters("course-a", "practice").selectedNodes, []);

  store.set("qb-session-filters", JSON.stringify({ "course-a": { practice: { typeKeys: [1, "essay"], difficulties: ["3", 4] } } }));
  const saved = readSessionFilters("course-a", "practice");
  assert.deepEqual(saved.typeKeys, ["essay"]);
  assert.deepEqual(saved.difficulties, [4]);
  assert.equal(saved.selectedTag, "");
});

test("renaming an institution moves saved filters onto the new name", () => {
  store.clear();
  writeSessionFilters("course-a", "practice", filters);
  writeSessionFilters("course-a", "quiz", { ...filters, institutionYears: { HSC: [2019], NESA: [2018] } });

  renameInstitutionInSessionFilters("course-a", "HSC", "NESA");

  assert.deepEqual(readSessionFilters("course-a", "practice").institutionYears, { NESA: [2020, 2021] });
  assert.deepEqual(readSessionFilters("course-a", "quiz").institutionYears, { NESA: [2018, 2019] });
});
