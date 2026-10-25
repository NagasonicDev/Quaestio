import test from "node:test";
import assert from "node:assert/strict";
import {
  TEMPLATE_CATEGORIES,
  COURSE_TEMPLATES,
  template,
  buildTemplateBundle,
  templatesByCategory,
  templateStats,
} from "../src/lib/courseTemplates.ts";

test("every shipped template uses a declared category", () => {
  for (const t of COURSE_TEMPLATES) {
    assert.ok(
      TEMPLATE_CATEGORIES.includes(t.category),
      `template "${t.id}" has undeclared category "${t.category}"`
    );
  }
});

test("template ids are unique and non-empty", () => {
  const ids = new Set();
  for (const t of COURSE_TEMPLATES) {
    assert.ok(t.id.trim().length > 0, "template id must not be empty");
    assert.ok(!ids.has(t.id), `duplicate template id "${t.id}"`);
    ids.add(t.id);
    assert.ok(t.name.trim().length > 0, `template "${t.id}" must have a name`);
    assert.ok(t.hierarchy.length > 0, `template "${t.id}" must declare hierarchy levels`);
  }
});

test("buildTemplateBundle expands nested template nodes into a flat course tree", () => {
  const t = template({
    id: "demo",
    name: "Demo Course",
    category: "HSC",
    description: "A demo",
    curriculum: "HSC",
    hierarchy: ["Module", "Topic"],
    nodes: [
      "Calculus",
      { name: "Functions", children: ["Inverse functions", "Sketching"] },
      { name: "Waves", children: ["Travel waves", { name: "Sound", children: ["Doppler effect"] }] },
    ],
  });

  const bundle = buildTemplateBundle(t);
  assert.equal(bundle.course.name, "Demo Course");
  assert.equal(bundle.course.description, "A demo");
  assert.equal(bundle.course.curriculum, "HSC");
  assert.deepEqual(
    bundle.course.hierarchy,
    [
      { level_index: 0, label: "Module", required: true },
      { level_index: 1, label: "Topic", required: false },
    ]
  );
  assert.deepEqual(bundle.course.question_types, ["multiple_choice", "short_answer", "extended_response"]);
  assert.deepEqual(bundle.course.difficulty_levels, [
    { level: 1, label: "Band 1" },
    { level: 2, label: "Band 2" },
    { level: 3, label: "Band 3" },
    { level: 4, label: "Band 4" },
    { level: 5, label: "Band 5" },
    { level: 6, label: "Band 6" },
  ]);
  assert.deepEqual(bundle.questions, []);
  assert.equal(bundle.assetBlobs.size, 0);

  const byId = new Map(bundle.course.nodes.map((n) => [n.node_id, n]));
  assert.equal(byId.size, 8, "all 8 nodes are present with unique ids");

  // Depth-first pre-order: parents always before children, which is what
  // applyCourseBundle requires when re-linking nodeMap. Display order within
  // a sibling group comes from sort_order, not array position.
  const [calc, functions, inverse, sketching, waves, travel, sound, doppler] = bundle.course.nodes;
  assert.deepEqual(
    bundle.course.nodes.map((n) => [n.name, n.level_index, n.sort_order]),
    [
      ["Calculus", 0, 0],
      ["Functions", 0, 1],
      ["Inverse functions", 1, 0],
      ["Sketching", 1, 1],
      ["Waves", 0, 2],
      ["Travel waves", 1, 0],
      ["Sound", 1, 1],
      ["Doppler effect", 2, 0],
    ]
  );
  assert.equal(calc.parent_node_id, null);
  assert.equal(inverse.parent_node_id, functions.node_id);
  assert.equal(sketching.parent_node_id, functions.node_id);
  assert.equal(travel.parent_node_id, waves.node_id);
  assert.equal(sound.parent_node_id, waves.node_id);
  assert.equal(doppler.parent_node_id, sound.node_id);
  for (const node of bundle.course.nodes) {
    assert.ok(node.node_id.startsWith("demo-"), `node id "${node.node_id}" is prefixed with the template id`);
    assert.equal(node.course_id, "demo");
  }
});

test("buildTemplateBundle derives .qb-style node codes", () => {
  const t = template({
    id: "demo-codes",
    name: "Demo Codes",
    category: "HSC",
    hierarchy: ["Year", "Module", "Topic"],
    nodes: [
      { name: "Year 11", children: [{ name: "Module A", children: ["Topic 1", "Topic 2"] }] },
      { name: "Year 12", children: ["Module B"] },
    ],
  });
  assert.deepEqual(
    buildTemplateBundle(t).course.nodes.map((n) => [n.name, n.code]),
    [
      ["Year 11", "PRE"],
      ["Module A", "PRE-M1"],
      ["Topic 1", "PRE-M1-T1"],
      ["Topic 2", "PRE-M1-T2"],
      ["Year 12", "HSC"],
      ["Module B", "HSC-M1"],
    ]
  );
});

test("every shipped template node declares an explicit, unique, well-formed code", () => {
  for (const t of COURSE_TEMPLATES) {
    const declared = new Set();
    const visit = (nodes, parentCode, level) => {
      for (const entry of nodes) {
        const node = typeof entry === "string" ? { name: entry } : entry;
        assert.equal(
          typeof node.code,
          "string",
          `template "${t.id}" node "${node.name}" must declare an explicit code`
        );
        assert.ok(!declared.has(node.code), `duplicate node code "${node.code}" in template "${t.id}"`);
        declared.add(node.code);
        if (level === 0) {
          assert.match(node.code, /^(PRE|HSC|HSC-[A-Z0-9]+|Y\d+)$/, `bad root code "${node.code}"`);
        } else {
          assert.ok(
            node.code.startsWith(`${parentCode}-`),
            `template "${t.id}" code "${node.code}" must extend its parent "${parentCode}"`
          );
          assert.match(node.code, new RegExp(`-${level === 1 ? "M" : "(?:T|D)"}\\d+$`));
        }
        if (node.children && node.children.length > 0) visit(node.children, node.code, level + 1);
      }
    };
    visit(t.nodes, "", 0);
    assert.ok(declared.size > 0, `template "${t.id}" must declare nodes`);

    // Installing must carry exactly the codes the template declares.
    const bundled = buildTemplateBundle(t).course.nodes.map((n) => n.code);
    assert.equal(new Set(bundled).size, bundled.length, `template "${t.id}" bundle has duplicate codes`);
    assert.deepEqual([...bundled].sort(), [...declared].sort());
  }
});

test("templatesByCategory returns every declared category in order, empties included", () => {
  const categories = ["HSC", "VCE", "IB"];
  const t1 = template({ id: "a", name: "A", category: "HSC", hierarchy: ["Topic"] });
  const t2 = template({ id: "b", name: "B", category: "VCE", hierarchy: ["Outcome"] });
  const groups = templatesByCategory(categories, [t1, t2]);
  assert.deepEqual(groups.map((g) => g.category), ["HSC", "VCE", "IB"]);
  assert.deepEqual(groups.map((g) => g.templates.length), [1, 1, 0]);
  assert.equal(groups[0].templates[0].id, "a");
  assert.equal(groups[1].templates[0].id, "b");
});

test("templateStats counts leaf topics and hierarchy levels", () => {
  const t = template({
    id: "demo",
    name: "Demo Course",
    category: "HSC",
    hierarchy: ["Year", "Module", "Topic"],
    nodes: [
      "Standalone module",
      { name: "Functions", children: ["Inverse functions", "Sketching"] },
      { name: "Waves", children: ["Travel waves", { name: "Sound", children: ["Doppler effect"] }] },
      { name: "Empty branch", children: [] },
    ],
  });
  // Leaves: the bare string, the two Functions children, Travel waves, Doppler, and Empty branch.
  assert.deepEqual(templateStats(t), { topics: 6, levels: 3 });

  // A template with no nodes has no topics but keeps its declared level count.
  assert.deepEqual(templateStats(template({ id: "x", name: "X", category: "HSC", hierarchy: ["Topic"] })), {
    topics: 0,
    levels: 1,
  });
});
