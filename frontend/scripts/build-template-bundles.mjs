/**
 * Merge each template's per-year `.qbx` files in `public/templates/hsc/<id>/`
 * into a single shipped `<id>.qb` (course structure from
 * `buildTemplateBundle` + all questions + deduped assets), so the template
 * installer fetches and applies one file in one transaction.
 *
 * Prerequisites: run `copy-hsc-bundles` first to stage the latest `.qbx` from
 * the private `imports/` folder. Run this to regenerate the shipped banks:
 *
 *   npm run build-template-bundles
 *
 * `.qbx` files are deleted once merged. Re-running with no `.qbx` present
 * skips up-to-date templates (pass `--force` to rebuild anyway).
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

import {
  COURSE_TEMPLATES,
  buildTemplateBundle,
} from "../src/lib/courseTemplates.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatesDir = path.resolve(__dirname, "..", "public", "templates", "hsc");
const force = process.argv.includes("--force");

// Must stay in sync with COURSE_EXPORT_SCHEMA_VERSION in src/lib/exchange.ts.
const EXPORT_SCHEMA_VERSION = 4;
const MAX_BUNDLE_QUESTIONS = 5000;
const MAX_PART_DEPTH = 8;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

// Mirrors data.validateQuestionForImport (marks + MCQ answer key), which
// parseCourseBundle enforces at install time.
function validateQuestion(q, label = "") {
  const problems = [];
  const id = String(q.question_id ?? "").trim();
  const tag = label || (id ? `Question '${id}': ` : "Question: ");
  const marks = q.marks;
  if (marks !== null && marks !== undefined && (!Number.isInteger(marks) || marks <= 0 || marks > 1000)) {
    problems.push(`${tag}marks must be a positive integer up to 1000 (got ${marks}).`);
  }
  if (q.type_key === "multiple_choice") {
    const correct = Array.isArray(q.mcq_options)
      ? q.mcq_options.filter((o) => o?.is_correct).length
      : 0;
    if (correct !== 1) {
      problems.push(`${tag}multiple-choice question must have exactly one correct option (found ${correct}).`);
    }
  }
  for (const part of Array.isArray(q.parts) ? q.parts : []) {
    problems.push(...validateQuestion(part, tag));
  }
  return problems;
}

const SLOTS = ["body", "hint", "answer", "solution", "marking_criteria"];

function rewriteAssetRefs(q, idMap) {
  for (const slot of SLOTS) {
    for (const block of q[slot] ?? []) {
      const old = block?.content?.asset_path;
      if (typeof old === "string" && idMap.has(old)) {
        block.content = { ...block.content, asset_path: idMap.get(old) };
      }
    }
  }
  for (const option of q.mcq_options ?? []) {
    for (const block of option.content ?? []) {
      const old = block?.content?.asset_path;
      if (typeof old === "string" && idMap.has(old)) {
        block.content = { ...block.content, asset_path: idMap.get(old) };
      }
    }
  }
  for (const asset of q.assets ?? []) {
    const mapped = idMap.get(String(asset.asset_id));
    if (mapped) {
      asset.asset_id = mapped;
      asset.file_path = mapped;
    }
  }
  for (const part of q.parts ?? []) rewriteAssetRefs(part, idMap);
}

function rewriteStimulusRefs(stimulus, idMap) {
  for (const block of stimulus.blocks ?? []) {
    const old = block?.content?.asset_path;
    if (typeof old === "string" && idMap.has(old)) {
      block.content = { ...block.content, asset_path: idMap.get(old) };
    }
  }
}

// Resolve a question's node refs (codes, then full paths, then legacy ids)
// to fresh template node ids; parts inherit the parent type key.
function remapQuestion(q, maps, parentType = null) {
  const pick = (refs) => {
    const out = [];
    for (const ref of refs ?? []) {
      const target = maps.code.get(String(ref)) ?? maps.path.get(String(ref)) ?? maps.id.get(String(ref));
      if (target && !out.includes(target)) out.push(target);
    }
    return out;
  };
  // Path-suffix match: the question's full path may omit the year root or
  // the template gained one since the question was classified. Longest
  // trailing match wins, and only when it is unique.
  const suffixResolve = (ref) => {
    const segs = String(ref).split(" / ");
    for (let len = segs.length; len >= 1; len -= 1) {
      const tail = segs.slice(-len).map((s) => s.trim().toLowerCase()).join(" ");
      let hit = null;
      let seen = 0;
      for (const entry of maps.paths) {
        if (entry.length < len) continue;
        if (entry.slice(-len).join(" ") === tail) {
          seen += 1;
          hit = entry[0];
          if (seen > 1) break;
        }
      }
      if (seen === 1) return hit;
      if (seen > 1) return null;
    }
    return null;
  };
  const suffixPick = (refs) => {
    const out = [];
    for (const ref of refs ?? []) {
      const target = suffixResolve(ref);
      if (target && !out.includes(target)) out.push(target);
    }
    return out;
  };
  let ids = pick(q.node_codes);
  if (!ids.length) ids = pick(q.node_names);
  if (!ids.length) ids = suffixPick(q.node_names);
  if (!ids.length) ids = pick(q.node_ids);
  q.node_ids = ids;
  if (!q.type_key && parentType) q.type_key = parentType;
  const type = q.type_key ?? parentType;
  for (const part of q.parts ?? []) remapQuestion(part, maps, type);
}

function buildMaps(nodes) {
  const maps = { code: new Map(), path: new Map(), id: new Map(), paths: [] };
  const walk = (list, prefix) => {
    for (const n of list) {
      maps.id.set(n.node_id, n.node_id);
      if (n.code) maps.code.set(String(n.code), n.node_id);
      const full = prefix ? `${prefix} / ${n.name}` : n.name;
      maps.path.set(full, n.node_id);
      maps.paths.push([n.node_id, ...full.split(" / ").map((s) => s.trim().toLowerCase())]);
      walk(n.children ?? [], full);
    }
  };
  walk(nodes, "");
  return maps;
}

function countNested(q, depth = 0) {
  let total = 1;
  for (const part of q.parts ?? []) total += countNested(part, depth + 1);
  return total;
}

async function buildOne(template) {
  const bundle = buildTemplateBundle(template);
  const dir = path.join(templatesDir, template.id);
  const outPath = path.join(dir, `${template.id}.qb`);
  const qbxFiles = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith(".qbx")).sort()
    : [];

  if (!qbxFiles.length && fs.existsSync(outPath) && !force) {
    return { id: template.id, skipped: true };
  }

  const maps = buildMaps(bundle.course.nodes);
  const questions = [];
  const stimuli = [];
  const questionStimuli = [];
  const seenStimulusIds = new Set();
  // assetId bytes appear once per distinct content; identical image names
  // in different years with different bytes are renamed, not overwritten.
  const hashToId = new Map();
  const usedAssetIds = new Set();
  const assetBlobs = new Map(); // newId -> { bytes, ext }
  let nestedCount = 0;
  let unclassified = 0;
  const addedTags = [];

  for (const file of qbxFiles) {
    const zip = await JSZip.loadAsync(fs.readFileSync(path.join(dir, file)));
    const payload = JSON.parse(await zip.file("questions.json").async("string"));
    const yearHint = file.slice(0, 4);

    const idMap = new Map();
    for (const entryPath of Object.keys(zip.files)) {
      if (!entryPath.startsWith("assets/")) continue;
      const entry = zip.files[entryPath];
      if (entry.dir) continue;
      const filename = entryPath.split("/").pop();
      const oldId = filename.replace(/\.[^.]*$/, "");
      const ext = filename.includes(".") ? filename.split(".").pop() : "bin";
      const bytes = await entry.async("nodebuffer");
      const hash = sha256(bytes);
      let target;
      if (hashToId.has(hash)) {
        target = hashToId.get(hash);
      } else if (!usedAssetIds.has(oldId)) {
        target = oldId;
      } else {
        target = `${oldId}-${hash.slice(0, 8)}`;
      }
      hashToId.set(hash, target);
      usedAssetIds.add(target);
      if (!assetBlobs.has(target)) assetBlobs.set(target, { bytes, ext });
      idMap.set(oldId, target);
    }

    for (const q of payload.questions ?? []) {
      rewriteAssetRefs(q, idMap);
      remapQuestion(q, maps);
      if (!q.node_ids?.length) unclassified += 1;
      nestedCount += countNested(q);
      if (nestedCount > MAX_BUNDLE_QUESTIONS) {
        throw new Error(`${template.id}: too many questions (over ${MAX_BUNDLE_QUESTIONS})`);
      }
      const problems = validateQuestion(q);
      if (problems.length) throw new Error(`${template.id} ${file}: ${problems[0]}`);
      questions.push(q);
    }

    for (const stimulus of payload.stimuli ?? []) {
      rewriteStimulusRefs(stimulus, idMap);
      if (seenStimulusIds.has(stimulus.stimulus_id)) {
        stimulus.stimulus_id = `${stimulus.stimulus_id}-${yearHint}`;
      }
      seenStimulusIds.add(stimulus.stimulus_id);
      stimuli.push(stimulus);
    }
    for (const link of payload.question_stimuli ?? []) {
      questionStimuli.push(link);
    }
  }

  // Question tags must be in the course tag list or applyCourseBundle
  // rejects them; collect everything referenced so the bank imports cleanly.
  const tagSet = new Set(bundle.course.tags);
  const collectTags = (q) => {
    for (const tag of q.tags ?? []) {
      if (!tagSet.has(tag)) {
        tagSet.add(tag);
        addedTags.push(tag);
      }
    }
    for (const part of q.parts ?? []) collectTags(part);
  };
  questions.forEach(collectTags);
  bundle.course.tags = [...bundle.course.tags, ...addedTags];

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
      question_stimuli: questionStimuli.length > 0,
      drawing_notebooks: false,
    },
    course: bundle.course,
    questions,
    learning: null,
    stimuli,
    question_stimuli: questionStimuli,
    drawing_notebooks: [],
  };

  const zip = new JSZip();
  zip.file("course.json", JSON.stringify(courseJson), {
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  for (const [assetId, { bytes, ext }] of assetBlobs) {
    zip.file(`assets/${assetId}.${ext}`, bytes, {
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
  }
  zip.file(
    "README.txt",
    [
      `${bundle.course.name} — Quaestio course bundle`,
      "",
      "Contents:",
      "- course.json: course structure, difficulty and tag definitions, and the questions listed in it.",
      assetBlobs.size
        ? `- assets/: images and diagrams referenced by the questions (${assetBlobs.size} file(s)).`
        : null,
      "- learning: not included.",
      "- Generated test files are not included; regenerate them from the questions.",
      "",
      "Installs as a new course; replaces nothing.",
    ]
      .filter((line) => line !== null)
      .join("\n") + "\n"
  );

  fs.mkdirSync(dir, { recursive: true });
  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  // Write via a temp name so an interrupted run cannot tear the shipped file.
  fs.writeFileSync(`${outPath}.tmp`, buffer);
  fs.renameSync(`${outPath}.tmp`, outPath);
  for (const file of qbxFiles) fs.unlinkSync(path.join(dir, file));

  return {
    id: template.id,
    merged: qbxFiles.length,
    top: questions.length,
    nested: nestedCount,
    assets: assetBlobs.size,
    unclassified,
    addedTags,
    bytes: buffer.length,
  };
}

const results = [];
for (const template of COURSE_TEMPLATES) {
  const r = await buildOne(template);
  results.push(r);
  console.log(
    r.skipped
      ? `${r.id}: skipped (already built)`
      : `${r.id}: ${r.merged} .qbx -> 1 .qb | ${r.top} questions (${r.nested} nested) | ${r.assets} assets | ${r.unclassified} unclassified | ${r.bytes} bytes`
  );
}

const totals = results.reduce(
  (acc, r) => {
    if (r.skipped) return acc;
    acc.banks += 1;
    acc.top += r.top;
    acc.nested += r.nested;
    acc.assets += r.assets;
    acc.bytes += r.bytes;
    return acc;
  },
  { banks: 0, top: 0, nested: 0, assets: 0, bytes: 0 }
);
console.log(
  `Done: ${totals.banks} banks, ${totals.top} questions, ${totals.assets} assets, ${(totals.bytes / 1048576).toFixed(1)} MiB shipped`
);
