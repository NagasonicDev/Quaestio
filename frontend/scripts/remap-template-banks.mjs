/**
 * Copy a current template bank's questions onto an older template's node
 * structure, keeping question content verbatim. Only node links change.
 *
 * Prerequisites: the source `<id>.qb` and target `<id>.qb` both exist in
 * `public/templates/hsc/<id>/`. The target's course.json keeps its course,
 * nodes, difficulty and tag definitions; its questions are replaced by the
 * source questions, remapped onto the target nodes.
 *
 * Mapping: exact (case-insensitive) name match level-by-level, then best
 * name-similarity match per level. Biology's Diseases module splits by
 * keyword into the two 2017 disease modules; Biodiversity maps to the 2017
 * Y11 Ecosystem Dynamics module. Questions under no acceptable match stay
 * unclassified (empty node_ids) but are still shipped.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatesDir = path.resolve(__dirname, "..", "public", "templates", "hsc");
const EXPORT_SCHEMA_VERSION = 4;

const PAIRS = [
  ["biology", "biology-2017"],
  ["chemistry", "chemistry-2017"],
  ["ancient-history", "ancient-history-2017"],
];

function norm(value) {
  return String(value ?? "").toLocaleLowerCase().trim().replace(/\s+/g, " ");
}

function nameKey(value) {
  return norm(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "");
}

function similarity(left, right) {
  const a = nameKey(left);
  const b = nameKey(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) / Math.max(a.length, b.length);
  const bigrams = (v) => new Set(Array.from({ length: Math.max(0, v.length - 1) }, (_, i) => v.slice(i, i + 2)));
  const ab = bigrams(a);
  const bb = bigrams(b);
  const inter = [...ab].filter((g) => bb.has(g)).length;
  const bigramScore = (2 * inter) / Math.max(1, ab.size + bb.size);
  const aw = new Set(norm(left).split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  const bw = new Set(norm(right).split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  const wi = [...aw].filter((w) => bw.has(w)).length;
  const wordScore = wi / Math.max(1, new Set([...aw, ...bw]).size);
  return Math.max(bigramScore, wordScore);
}

function validateQuestion(q, label = "") {
  const problems = [];
  const id = String(q.question_id ?? "").trim();
  const tag = label || (id ? `Question '${id}': ` : "Question: ");
  const marks = q.marks;
  if (marks !== null && marks !== undefined && (!Number.isInteger(marks) || marks <= 0 || marks > 1000)) {
    problems.push(`${tag}marks must be a positive integer up to 1000 (got ${marks}).`);
  }
  if (q.type_key === "multiple_choice") {
    const correct = Array.isArray(q.mcq_options) ? q.mcq_options.filter((o) => o?.is_correct).length : 0;
    if (correct !== 1) problems.push(`${tag}multiple-choice question must have exactly one correct option (found ${correct}).`);
  }
  for (const part of Array.isArray(q.parts) ? q.parts : []) problems.push(...validateQuestion(part, tag));
  return problems;
}

function buildChildren(nodes) {
  const childrenOf = new Map();
  for (const n of nodes) {
    const list = childrenOf.get(n.parent_node_id) ?? [];
    list.push(n);
    childrenOf.set(n.parent_node_id, list);
  }
  return childrenOf;
}

/** Full path (names) for every node, via parent links. */
function pathsOf(nodes) {
  const byId = new Map(nodes.map((n) => [n.node_id, n]));
  const pathOf = (node) => {
    const chain = [node];
    let cur = node;
    while (cur.parent_node_id && byId.has(cur.parent_node_id)) {
      cur = byId.get(cur.parent_node_id);
      chain.unshift(cur);
    }
    return chain;
  };
  return { byId, pathOf };
}

function questionTexts(q) {
  const texts = [];
  const push = (blocks) => {
    for (const b of blocks ?? []) {
      if (typeof b?.content?.text === "string") texts.push(b.content.text);
    }
  };
  push(q.body);
  push(q.answer);
  push(q.solution);
  return texts.join("\n").toLocaleLowerCase();
}

const NON_INFECTIOUS = /non-?infectious|homeostas|diabet|cancer|tumour|tumor|alzheimer|dementia|arthrit|asthma|allerg|heart disease|cardiovascular|physiological (response|adapt)|thermoregul|osmoregul|negative feedback/;

function mapQuestion(sourceId, targetId, q, src, dst) {
  // Resolve source path names for this question.
  let names = null;
  if (Array.isArray(q.node_names) && q.node_names.length && typeof q.node_names[0] === "string") {
    names = q.node_names[0].split(" / ");
  } else if (Array.isArray(q.node_ids) && q.node_ids.length) {
    const node = src.byId.get(q.node_ids[0]);
    if (node) names = src.pathOf(node).map((n) => n.name);
  }
  if (!names) return [];

  // Biology overrides (current Year12 modules -> 2017 Year12/Y11 modules).
  if (sourceId === "biology" && names.length >= 2 && norm(names[0]) === "year 12") {
    const mod = norm(names[1]);
    const value = questionTexts(q);
    if (mod === "diseases") {
      const dstModule = NON_INFECTIOUS.test(value) ? "HSC-M5" : "HSC-M4";
      const topic = names[2] ? norm(names[2]) : "";
      // Try to keep the topic inside the chosen 2017 module.
      const inModule = dst.nodes.filter((n) => n.code?.startsWith(`${dstModule}-T`));
      let best = null;
      let bestScore = 0;
      for (const n of inModule) {
        const s = similarity(topic, n.name);
        if (s > bestScore) { bestScore = s; best = n; }
      }
      if (best && bestScore >= 0.3) return [best.node_id];
      const modNode = dst.nodes.find((n) => n.code === dstModule);
      return modNode ? [modNode.node_id] : [];
    }
    if (mod === "biodiversity") {
      const modNode = dst.nodes.find((n) => n.code === "PRE-M5");
      if (!modNode) return [];
      const topic = names[2] ? norm(names[2]) : "";
      const inModule = dst.nodes.filter((n) => n.code?.startsWith("PRE-M5-T"));
      let best = null;
      let bestScore = 0;
      for (const n of inModule) {
        const s = similarity(topic, n.name);
        if (s > bestScore) { bestScore = s; best = n; }
      }
      return [best && bestScore >= 0.25 ? best.node_id : modNode.node_id];
    }
    if (mod === "biotechnology") {
      const modNode = dst.nodes.find((n) => n.code === "HSC-M3");
      if (!modNode) return [];
      const topic = names[2] ? norm(names[2]) : "";
      const inModule = dst.nodes.filter((n) => n.code?.startsWith("HSC-M3-T"));
      let best = null;
      let bestScore = 0;
      for (const n of inModule) {
        const s = similarity(topic, n.name);
        if (s > bestScore) { bestScore = s; best = n; }
      }
      return [best && bestScore >= 0.25 ? best.node_id : modNode.node_id];
    }
  }

  // Generic walk: match each segment against the 2017 tree level by level.
  let candidates = dst.childrenOf.get(null) ?? [];
  let current = null;
  for (const segment of names) {
    if (!candidates.length) break;
    const exact = candidates.find((c) => norm(c.name) === norm(segment));
    if (exact) {
      current = exact;
    } else {
      let best = null;
      let bestScore = 0;
      for (const c of candidates) {
        const s = similarity(segment, c.name);
        if (s > bestScore) { bestScore = s; best = c; }
      }
      if (!best || bestScore < 0.3) return current && bestScore < 0.3 && current.level_index >= 1 ? [current.node_id] : (current ? [current.node_id] : []);
      current = best;
    }
    candidates = dst.childrenOf.get(current.node_id) ?? [];
  }
  return current ? [current.node_id] : [];
}

async function buildOne(sourceId, targetId) {
  const srcDir = path.join(templatesDir, sourceId);
  const dstDir = path.join(templatesDir, targetId);
  const srcZip = await JSZip.loadAsync(fs.readFileSync(path.join(srcDir, `${sourceId}.qb`)));
  const dstZip = await JSZip.loadAsync(fs.readFileSync(path.join(dstDir, `${targetId}.qb`)));
  const srcJson = JSON.parse(await srcZip.file("course.json").async("string"));
  const dstJson = JSON.parse(await dstZip.file("course.json").async("string"));

  const src = { nodes: srcJson.course.nodes, ...pathsOf(srcJson.course.nodes), childrenOf: buildChildren(srcJson.course.nodes) };
  const dst = { nodes: dstJson.course.nodes, ...pathsOf(dstJson.course.nodes), childrenOf: buildChildren(dstJson.course.nodes) };
  const dstById = dst.byId;

  const assetBlobs = new Map();
  for (const entryPath of Object.keys(srcZip.files)) {
    if (!entryPath.startsWith("assets/")) continue;
    const entry = srcZip.files[entryPath];
    if (entry.dir) continue;
    const filename = entryPath.split("/").pop();
    const ext = filename.includes(".") ? filename.split(".").pop() : "bin";
    assetBlobs.set(filename.replace(/\.[^.]*$/, ""), { bytes: await entry.async("nodebuffer"), ext });
  }
  // Deterministic question ids: prefix with target id.
  const idPrefix = `${targetId}-`;
  const fixId = (id) => (String(id).startsWith(idPrefix) ? id : `${idPrefix}${id}`);

  const questions = [];
  const oldToNew = new Map();
  let unclassified = 0;
  let total = 0;

  const process = (q, parentId = null, parentMapped = null) => {
    total += 1;
    let mapped = mapQuestion(sourceId, targetId, q, src, dst);
    if (!mapped.length && parentMapped?.length) mapped = parentMapped;
    if (!mapped.length) unclassified += 1;
    const copy = JSON.parse(JSON.stringify(q));
    copy.question_id = fixId(copy.question_id);
    copy.parent_question_id = parentId;
    copy.course_id = dstJson.course.course_id;
    copy.node_ids = mapped;
    copy.node_codes = mapped.map((id) => dstById.get(id)?.code).filter(Boolean);
    copy.node_names = mapped.map((id) => {
      const chain = dst.pathOf(dstById.get(id));
      return chain.map((n) => n.name).join(" / ");
    });
    delete copy.node_ids_via;
    oldToNew.set(q.question_id, copy.question_id);
    const problems = validateQuestion(copy);
    if (problems.length) throw new Error(`${targetId} ${problems[0]}`);
    copy.parts = [];
    const parts = Array.isArray(q.parts) ? q.parts : [];
    for (const part of parts) process(part, copy.question_id, mapped);
    questions.push(copy);
  };
  // Preserve order: parents first (parts are nested, so flat list order is
  // parents before parts as exported).
  const walkTop = (list) => {
    for (const q of list) {
      const copyStart = questions.length;
      process(q);
      void copyStart;
    }
  };
  walkTop(srcJson.questions ?? []);

  // Attach parts to their parents by id links (already nested above, but keep
  // flat shape consistent with export: top list holds full trees).
  // process() pushes parts as flat entries too; rebuild proper nesting:
  const byNewId = new Map(questions.map((q) => [q.question_id, q]));
  const roots = [];
  const ordered = [];
  for (const q of questions) {
    if (!q.parent_question_id) roots.push(q);
    ordered.push(q);
  }
  const childrenOf = new Map();
  for (const q of questions) {
    if (q.parent_question_id) {
      const list = childrenOf.get(q.parent_question_id) ?? [];
      list.push(q);
      childrenOf.set(q.parent_question_id, list);
    }
  }
  const buildTree = (q) => ({ ...q, parts: (childrenOf.get(q.question_id) ?? []).map(buildTree) });
  const treeQuestions = roots.map(buildTree);

  // Tags must be allowed by the target course.
  const tagSet = new Set(dstJson.course.tags ?? []);
  const addedTags = [];
  const collectTags = (q) => {
    for (const t of q.tags ?? []) {
      if (!tagSet.has(t)) { tagSet.add(t); addedTags.push(t); }
    }
    for (const p of q.parts ?? []) collectTags(p);
  };
  treeQuestions.forEach(collectTags);
  if (addedTags.length) dstJson.course.tags = [...(dstJson.course.tags ?? []), ...addedTags];

  // Stimuli travel with the questions.
  const stimuli = Array.isArray(srcJson.stimuli) ? srcJson.stimuli : [];
  const questionStimuli = Array.isArray(srcJson.question_stimuli) ? srcJson.question_stimuli : [];
  const remappedStimuli = questionStimuli.filter((l) => oldToNew.has(l.question_id));

  const courseJson = {
    export_schema_version: EXPORT_SCHEMA_VERSION,
    exported_at: new Date().toISOString(),
    includes: {
      course_structure: true,
      questions: true,
      images: assetBlobs.size > 0,
      learning_data: false,
      typed_answers: false,
      generated_files: false,
      stimuli: stimuli.length > 0,
      question_stimuli: remappedStimuli.length > 0,
      drawing_notebooks: false,
    },
    course: dstJson.course,
    questions: treeQuestions,
    learning: null,
    stimuli,
    question_stimuli: remappedStimuli.map((l) => ({ question_id: oldToNew.get(l.question_id), stimulus_id: l.stimulus_id })),
    drawing_notebooks: [],
  };

  const zip = new JSZip();
  zip.file("course.json", JSON.stringify(courseJson), { compression: "DEFLATE", compressionOptions: { level: 6 } });
  for (const [assetId, { bytes, ext }] of assetBlobs) {
    zip.file(`assets/${assetId}.${ext}`, bytes, { compression: "DEFLATE", compressionOptions: { level: 6 } });
  }
  zip.file("README.txt", `${dstJson.course.name} — Quaestio course bundle\n\nContents:\n- course.json: course structure, difficulty and tag definitions, and the questions listed in it.\n- assets/: images and diagrams referenced by the questions (${assetBlobs.size} file(s)).\n- learning: not included.\n- Generated test files are not included; regenerate them from the questions.\n\nInstalls as a new course; replaces nothing.\n`);
  const outPath = path.join(dstDir, `${targetId}.qb`);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  fs.writeFileSync(`${outPath}.tmp`, buffer);
  fs.renameSync(`${outPath}.tmp`, outPath);
  return { id: targetId, from: sourceId, top: treeQuestions.length, total, unclassified, addedTags, bytes: buffer.length };
}

const results = [];
for (const [src, dst] of PAIRS) {
  const r = await buildOne(src, dst);
  results.push(r);
  console.log(`${r.id}: ${r.total} questions (${r.top} top-level) from ${r.from} | ${r.unclassified} unclassified | +tags [${r.addedTags.join(", ")}] | ${(r.bytes / 1024).toFixed(0)} KiB`);
}
