import JSZip from "jszip";
import * as idb from "./db/indexeddb";
import { all, getFirst, run } from "./db/sqlite";
import { newId, nowUtc } from "./id";
import * as data from "./data";
import type { CourseFullConfig, CourseNode, Question } from "../api/types";

// ---------- helpers ----------

export function slugName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || name;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function flattenNodes(nodes: CourseNode[]): Array<{ node_id: string; name: string; code: string | null; level_index: number; path: string }> {
  const out: Array<{ node_id: string; name: string; code: string | null; level_index: number; path: string }> = [];
  const walk = (list: CourseNode[], path: string[]) => {
    for (const n of list) {
      const fullPath = [...path, n.name];
      out.push({
        node_id: n.node_id,
        name: n.name,
        code: n.code,
        level_index: n.level_index,
        path: fullPath.join(" > "),
      });
      walk(n.children, fullPath);
    }
  };
  walk(nodes, []);
  return out;
}

// ---------- course skill (.skill) ----------

function skillFrontmatter(config: CourseFullConfig): string {
  const name = `${slugName(config.name)}-question-import`;
  const description = `Convert source documents (exam papers, worksheets, assessments, PDFs, images of questions) into import-ready JSON for the ${config.name} question bank, with correct node ids, question types, difficulty levels and marking guides. Use this skill whenever the user uploads or pastes ${config.name} questions or an exam and wants them extracted, digitised, classified, imported into the question bank, or turned into the question-bank JSON format, even if they do not mention the skill or JSON explicitly. Only valid for the ${config.name} course.`;
  if (!description || !description.trim()) {
    throw new Error("Skill validation failed: description is required.");
  }
  if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    throw new Error(`Skill validation failed: name must be kebab-case (got '${name}').`);
  }
  return `---
name: ${name}
description: "${description.replace(/"/g, '\\"')}"
---

`;
}

export function buildSkillMarkdown(config: CourseFullConfig, instructionsMarkdown: string): string {
  let diffRange = "as configured";
  if (config.difficulty_levels.length) {
    const levels = config.difficulty_levels.map((d) => d.level);
    diffRange = `${Math.min(...levels)}\u2013${Math.max(...levels)}`;
  }
  return `${skillFrontmatter(config)}# Document-to-Question Skill — ${config.name}

This skill converts source documents (exam papers, worksheets, assessments)
into the question-bank's structured JSON import format, for **this specific
course only**. It combines the general extraction process with the exact
structure, categories, and rules ${config.name} uses — do not apply this to a
different course without downloading that course's own skill file, since
node ids, question types, and difficulty labels are course-specific and
will not resolve against another course's database.

## Process

1. Read the entire source document before extracting anything, so multi-part
   questions, shared stems, and diagrams referenced across pages are handled
   correctly rather than piecemeal.
2. Identify each individual question (or question with parts). Preserve the
   original question numbering only as source metadata — never let it drive
   the app's own display order.
3. For each question, extract in order: question text, equations (as LaTeX),
   diagrams/images, tables (as structured columns/rows, not flattened text),
   and lists. For PDF sources, use PyMuPDF when available to extract embedded
   raster images and render vector diagrams/crops to PNG. For DOCX sources,
   use python-docx to read document text and relationships, and extract
    embedded media from the DOCX package (a ZIP) under \`word/media/\`; map each
   image to its paragraph/table position using its relationship ID and nearby
   text. If a DOCX figure is a vector shape rather than embedded media, render
   the DOCX to PDF and use PyMuPDF to extract or crop it. Inspect all extracted
   images and map each to its question and part; do not attach decorative
   marks or unrelated figures. Keep a note of any figure that cannot be
   confidently matched.
   **Format mathematical notation, scientific notation, symbols, and units
   for rendering.** Use an equation block for standalone equations. For math
   inside prose, choices, table cells, or list items, wrap LaTeX in single
   dollar signs, e.g. $v = 3.0\\times10^{8}\\,\\mathrm{m/s}$. Never leave
   powers as plain 10^8 or use plain x for multiplication.
   If completing a question requires follow-up input or action from the person
   (for example, manually attaching an image that could not be extracted), add
   the exact tag \`action_required\` to that question's \`tags\` array. Do not add
   it to questions that need no follow-up. Every tag must be selected from the
   course's VALID TAGS list below. Never invent, rename, or create tags; omit a
   tag when none of the listed tags applies. Only the user can change this list.
4. Determine the question type, difficulty, marks, and classification
   (course nodes) using the course-specific section below — never guess a
   category that doesn't appear in "VALID NODES"; if uncertain, use the
   nearest matching node's parent instead of inventing one, and note the
   classification confidence honestly.
5. **Every question must end up with a marking guide** (see "Marking guides"
   below) — this is not optional, even when the source material doesn't
   include one.
6. If there are no extracted images, produce one JSON file (see "Output
   format"). If any question uses an extracted image, produce a \`.qbx\` ZIP
   bundle containing \`questions.json\` and the image files under \`assets/\`,
   as described in "Image assets and import bundle". Do not import anything
   yourself — the person uploads the JSON or \`.qbx\` file into the app.

## Image attachment checklist

Every finished response must end with an **Image attachment checklist** that
reports image extraction and any unresolved figure mapping. Successfully
packaged images do not need manual attachment.

- Track every image **by its original source question number** (the same
  number you put in each question's \`source.original_question_no\`), plus its
  part label if it's a multi-part question. Distinguish images included in
  the bundle from any image that still needs manual review or attachment.
- End the response with a checklist like this:

\`\`\`
## Image attachment checklist

- Q17 (b): circuit diagram — two long parallel wires above a rectangular loop, AC source
- Q22: force-vs-time graphs A\u2013D for the rocket's thrust
- Q34: scatter plot of V0/V vs 1/\u03bb with five data points
\`\`\`

- If all required images were extracted and packaged, list their question
numbers and filenames and say they are included in the \`.qbx\` bundle.
- If any figure could not be extracted or mapped, list its question/part and
  explain what needs review. Add \`action_required\` only to questions that
  actually need follow-up.
- If no question needs an image, write "None — every question is fully
  text/equations."

## Image assets and import bundle

The JSON-only import does not upload image bytes. Never put a local filename,
file path, data URI, or base64 payload in \`asset_path\`; the app would not be
able to resolve it. For questions with images, build a \`.qbx\` ZIP that the
question importer understands:

- \`questions.json\` has \`export_schema_version: 1\`, \`course_name\`, and a
  \`questions\` array. Each question uses the app's question export shape:
  \`question_id\`, \`course_id\`, \`type_key\`, \`difficulty\`, \`marks\`,
  \`parent_question_id\`, \`part_label\`, \`notes\`, \`review_status\`,
  \`classification_confidence\`, \`node_ids\`, \`tags\`, \`body\`, \`mcq_options\`,
  \`answer\`, \`solution\`, \`marking_criteria\`, \`assets\`, \`source\`, \`parts\`,
  \`created_at\`, and \`updated_at\`. Keep the question content and
  course-specific classifications from the JSON schema. Set unused nullable
  fields to \`null\`, unused arrays to \`[]\`, and use unique stable IDs for each
  question and asset within the bundle.
- Put each image at \`assets/<asset_id>.<ext>\` using PNG for rendered PDF
  figures. For every image, add an entry to the owning question's \`assets\`
  array with \`asset_id\` equal to the filename stem, \`file_path\` equal to the
  same ID, \`mime_type\` (\`image/png\` for PNG), pixel \`width\` and \`height\`,
  \`alt_text\`, and \`caption\` (nullable).
- The corresponding \`image\`, \`diagram\`, or \`graph\` block must use
  \`content.asset_path\` equal to that same \`asset_id\`; include a concise
  \`alt_text\` and optional \`caption\` in the block content. Store assets on the
  question or part that owns the block. Preserve block order in the question.
- Keep image blocks in the JSON question structure; do not replace figures
  with descriptions when their files are included. Include images in MCQ
  option content only when the image is specifically part of that option.
- Include the extracted PNGs in the ZIP under \`assets/\` and name the ZIP with
  the \`.qbx\` extension. The app matches asset IDs to filenames, stores the
  bytes, and rewrites IDs on import. Without images, use the ordinary
  \`schema_version: 1\` JSON format instead.

## Marking guides — required, and never an exemplar

Every question in the output must have a \`marking_criteria\` field (in
addition to \`answer\`/\`solution\` if the source provides them):

- If the source document already gives marking criteria (a rubric, a mark
  scheme, "1 mark for X, 1 mark for Y"), use it as given, reworded into the
  block format below if needed.
- **If the exam document gives no marking criteria, create them yourself**
  for every question or part, using the question wording, its marks value,
  difficulty, and course context (topic/dot point) to decide what a response
  must demonstrate to earn each mark. For example, a 3-mark short-answer
  question might earn "1 mark for
  correctly identifying X; 1 mark for the correct method; 1 mark for the
  correct final answer with appropriate units."
- **Do not write a full worked exemplar answer or model solution as the
  marking guide.** A marking guide describes what to check for and how marks
  are allocated — it is a checklist for a marker, not a sample response. If
  you also have or can produce a worked solution, put that in the separate
  \`solution\` field instead; keep \`marking_criteria\` focused on grading
  criteria only.
- Marking criteria should be given as a \`list\` content block (one item per
  criterion/mark) wherever practical, since that's the clearest format for a
  marker to check off against.
- **Every criterion item must state its mark allocation up front** — the app
  renders the marking guide as a two-column table (criteria | marks), so
  write each item as \`"<allocation> marks: <what to look for>"\` (or
  \`"<allocation> marks for <what to look for>"\`), allocating a single mark
  or a band, e.g. \`"1 mark: correctly identifies X"\`, \`"2 marks: sets up
  the correct equation"\`, or \`"1–2 marks: partial method with one slip"\`.
  A trailing parenthesised allocation (\`"... correctly (2 marks)"\`) also
  works. Avoid vague criteria with no allocation — an unmallocated line
  shows an empty marks cell in the table.
- Apply this recursively: the shared parent and every part/subpart need their
  own non-empty \`marking_criteria\` list block. If marks are awarded through
  parts, give the parent a concise allocation note and put mark-by-mark
  criteria on each leaf part; never leave the parent rubric blank.
- For every question with parts, the parent \`marks\` must equal the sum of its
  immediate parts; apply the same check to nested parts. Recheck printed marks
  against the paper and any mark scheme before resolving a mismatch. Never
  silently change a printed allocation; flag an unresolved conflict for review.

## Output format

Produce **one JSON file** (e.g. \`import.json\`) shaped like this:

\`\`\`json
{
  "schema_version": 1,
  "course_id": "${config.course_id}",
  "course_name": "${config.name}",
  "questions": [
    {
      "type_key": "short_answer",
      "difficulty": 3,
      "marks": 3,
      "node_ids": ["<a valid node_id from import-schema.json>"],
      "node_codes": ["<the matching code from import-schema.json for the node_id above>"],
      "tags": [],
      "body": [
        {"block_type": "text", "content": {"text": "..."}},
        {"block_type": "equation", "content": {"latex": "x^2 - 5x + 6 = 0", "display": true}}
      ],
      "answer": [{"block_type": "text", "content": {"text": "..."}}],
      "solution": [],
      "marking_criteria": [
        {"block_type": "list", "content": {"ordered": false, "items": [
          "1 mark: correctly extracts the coefficients",
          "1 mark: applies the quadratic formula correctly",
          "1 mark: correct final answer"
        ]}}
      ],
      "classification_confidence": "high",
      "source": {"name": "Trial Examination", "year": 2025, "original_question_no": "17"}
    }
  ]
}
\`\`\`

## Multiple-choice questions

For every question whose \`type_key\` is \`multiple_choice\`, keep the question
stem in \`body\` and put answer choices in a separate \`mcq_options\` array. Do
not put choices in a body list. Keep stem blocks in the order they appear on
the page, and keep options in their printed order (A, B, C, D). Each option
has a \`content\` array of normal content blocks and an \`is_correct\` boolean.
Use inline LaTeX for math in option text. Determine the answer by checking the
paper, any answer key/mark scheme, and solving the question yourself. Mark
exactly one option correct and set \`answer\` to its printed letter (for example,
\`C\`). A missing key in the paper does not mean the answer is unknown. Only if
the question is genuinely ambiguous or unsolvable from available material,
mark no option correct, leave \`answer\` empty, and flag it for review.
Preserve diagrams, tables, and equations in stem/option content. Emit exactly
one non-empty option object for each printed choice, in order; never combine
choices, omit choices missed by OCR, or place choices in the stem. For
table-based choices, preserve the table and keep each option to its own choice.
Use sequential labels A, B, C, D, etc.; do not truncate after D. Do not create
question parts for the choices.

Example:

\`\`\`json
{
  "type_key": "multiple_choice",
  "body": [{"block_type": "text", "content": {"text": "What is the temperature?"}}],
  "mcq_options": [
    {"content": [{"block_type": "text", "content": {"text": "$1.6\\\\times10^{12}$ K"}}], "is_correct": false},
    {"content": [{"block_type": "text", "content": {"text": "$5.2\\\\times10^{3}$ K"}}], "is_correct": true}
  ],
  "answer": [{"block_type": "text", "content": {"text": "B"}}]
}
\`\`\`

Fill in \`source.original_question_no\` for **every** question (and give each
multi-part part a \`part_label\`) — the Image attachment checklist references
questions by these same numbers, so they must match exactly what's printed
on the source paper.

See \`import-schema.json\` (packaged alongside this file) for this course's
actual valid \`node_ids\`, \`node_codes\`, \`node_names\`, \`type_key\` values,
and difficulty range (${diffRange}) — every \`node_ids\` entry in your output
must be one of the \`node_id\` values listed there, with its matching
\`node_codes\` entry (the \`code\` on the same row), and every \`type_key\`
must be one of the listed valid types.

**Always fill in both \`node_ids\` and \`node_codes\`, and include
\`course_name\`.** Course and node ids are regenerated whenever the course is
re-imported (e.g. after a reset), but node \`code\`s, the course
\`course_name\`, and the full node paths in \`node_names\` (e.g. \`Module /
Topic / Subtopic\` from \`valid_node_names\`) stay stable. Including them lets
the app re-match questions to the correct nodes even after the ids change, and
lets the file be matched to a re-created course by name. Quote the ids, codes,
names, and course name exactly as shown in \`import-schema.json\`.

Content block types available for \`body\`/\`answer\`/\`solution\`/\`marking_criteria\`:
\`text\`, \`heading\`, \`equation\` (LaTeX in \`latex\`, \`display\`),
\`image\`/\`diagram\`/\`graph\` (for extracted images, use \`asset_path\` and package
the file as described in Image assets and import bundle),
\`table\` (\`columns\`, \`rows\`), \`list\` (\`ordered\`, \`items\`), \`code\`
(\`language\`, \`code\`), \`answer_area\` (\`lines\`), \`page_break\`.

## Handling uncertainty

- Multi-part questions: emit one question object for the shared stem, with
  a \`parts\` array of \`{"part_label": "a", "marks": ..., "body": [...],
  "marking_criteria": [...]}\` objects — do not split them into unrelated
  top-level questions. A part may itself contain a \`parts\` array using the
  same object shape for nested labels (for example, question 26 has part \`c\`,
  whose parts are \`i\` and \`ii\`). Keep each level nested under its immediate
  parent: represent this as 26 → c → i/ii, not as flat labels such as \`c(i)\`.
- For multi-part \`extended_response\`, \`short_response\`, or \`short_answer\`
  questions, include an \`answer_area\` block at the end of each part's \`body\`
  so answer lines appear immediately after that part. Set \`content.lines\` to
  two lines per mark (round fractional results up, with at least one line),
  based on that part's \`marks\`; for example, a 2-mark part gets
  \`{"block_type":"answer_area","content":{"lines":4}}\`. Do not put one
  long answer area on the shared parent question. Leave answer areas off
  multiple-choice parts and parts whose source already provides a specific
  answer space.
- If a question spans multiple valid nodes, list all of them in \`node_ids\`
  (and the matching codes in \`node_codes\`) — only if the course allows
  multiple classification — see below.
- If you cannot confidently classify a question at all, still include it,
  set \`classification_confidence\` to \`"low"\`, and pick the closest available
  node rather than leaving \`node_ids\` empty.
- Before saving, audit every question and nested part against the source:
  confirm no empty text, heading, equation, list item, or MCQ choice; confirm
  all printed choices are present and ordered; confirm each MCQ has exactly
  one correct option and a matching answer letter unless explicitly flagged
  unresolved; confirm every parent and part has an allocated marking guide;
  and confirm parent/part mark totals. Parse the finished JSON and fix all
  structural errors before delivering it.

---

${instructionsMarkdown}`;
}

export async function buildSkillBlob(
  config: CourseFullConfig,
  instructionsMarkdown: string
): Promise<Blob> {
  const skillMd = buildSkillMarkdown(config, instructionsMarkdown);
  const importSchema = {
    course_id: config.course_id,
    course_name: config.name,
    schema_version: 1,
    valid_type_keys: config.question_types,
    valid_tags: config.tags,
    valid_difficulty_levels: config.difficulty_levels.map((d) => ({ level: d.level, label: d.label })),
allow_multi_classification: config.allow_multi_classification,
    valid_node_ids: flattenNodes(config.nodes),
    valid_node_codes: flattenNodes(config.nodes)
      .map((n) => n.code)
      .filter((c): c is string => !!c),
    valid_node_names: flattenNodes(config.nodes).map((n) => n.path),
    mcq_option_format: {
      content: "array of content blocks, same block format as body",
      is_correct: "boolean; mark exactly one true when the answer is known",
      order: "array order is the printed choice order; labels A, B, C... are implicit",
    },
    example_question: {
      type_key: config.question_types[0] ?? "short_answer",
      difficulty: config.difficulty_levels[0]?.level ?? null,
      marks: 3,
      node_ids: [],
      node_codes: [],
      node_names: [],
      tags: [],
      body: [
        { block_type: "text", content: { text: "Example question text." } },
        { block_type: "equation", content: { latex: "x^2 - 5x + 6 = 0", display: true } },
      ],
      answer: [{ block_type: "text", content: { text: "x = 2, x = 3" } }],
      solution: [],
      marking_criteria: [
        {
          block_type: "list",
          content: {
            ordered: false,
            items: [
              "1 mark: uses the correct formula",
              "1 mark: correct working shown",
              "1 mark: correct final answer",
            ],
          },
        },
      ],
      classification_confidence: "high",
      source: { name: "Example Source", year: 2025, original_question_no: "1" },
    },
    example_multiple_choice: {
      type_key: "multiple_choice",
      body: [{ block_type: "text", content: { text: "What is the temperature?" } }],
      mcq_options: [
        { content: [{ block_type: "text", content: { text: "$1.6\\times10^{12}$ K" } }], is_correct: false },
        { content: [{ block_type: "text", content: { text: "$5.2\\times10^{3}$ K" } }], is_correct: true },
      ],
      answer: [{ block_type: "text", content: { text: "B" } }],
    },
  };
  const zip = new JSZip();
  zip.file("SKILL.md", skillMd);
  zip.file("import-schema.json", JSON.stringify(importSchema, null, 2));
  return zip.generateAsync({ type: "blob" });
}

export async function downloadSkill(courseId: string): Promise<void> {
  const config = await data.getCourseFullConfig(courseId);
  if (!config) throw new Error("Course not found");
  const instructions = await data.getInstructions(courseId);
  const blob = await buildSkillBlob(config, instructions.instructions_markdown);
  downloadBlob(blob, `${slugName(config.name)}.skill`);
}

// ---------- course export (.qb) ----------

function mimeExtension(mime: string): string {
  switch (mime) {
    case "image/png": return "png";
    case "image/jpeg": return "jpg";
    case "image/gif": return "gif";
    case "image/webp": return "webp";
    case "image/svg+xml": return "svg";
    default: return "bin";
  }
}

export interface CourseExportFilters {
  typeKeys?: string[];
  difficulties?: number[];
  institutions?: string[];
  tags?: string[];
}

export async function exportCourse(courseId: string, filters: CourseExportFilters = {}): Promise<void> {
  const config = await data.getCourseFullConfig(courseId);
  if (!config) throw new Error("Course not found");
  const row = await data.getCourseRow(courseId);
  const allQuestions = await data.getCourseQuestions(courseId);
  const questions = allQuestions.filter((question) =>
    (!filters.typeKeys?.length || filters.typeKeys.includes(question.type_key)) &&
    (!filters.difficulties?.length || (question.difficulty != null && filters.difficulties.includes(question.difficulty))) &&
    (!filters.institutions?.length || (question.source?.institution != null && filters.institutions.includes(question.source.institution))) &&
    (!filters.tags?.length || question.tags.some((tag) => filters.tags!.includes(tag)))
  );
  const zip = new JSZip();
  zip.file(
    "course.json",
    JSON.stringify(
      {
        export_schema_version: 1,
        exported_at: new Date().toISOString(),
        course: {
          ...config,
          description: row?.description ?? null,
          subject: row?.subject ?? null,
          curriculum: row?.curriculum ?? null,
          version_year: row?.version_year ?? null,
        },
        questions,
      },
      null,
      2
    )
  );
  const seen = new Set<string>();
  const collectIds = (q: Question) => {
    for (const a of q.assets) if (!seen.has(a.asset_id)) seen.add(a.asset_id);
    for (const p of q.parts) collectIds(p);
  };
  for (const q of questions) collectIds(q);
  for (const assetId of seen) {
    const blob = await idb.getAsset(assetId);
    if (!blob) continue;
    zip.file(`assets/${assetId}.${mimeExtension(blob.type || "")}`, blob);
  }
  const zipBlob = await zip.generateAsync({ type: "blob" });
  downloadBlob(zipBlob, `${slugName(config.name)}.qb`);
}

/** Export the question records and their binary assets without course configuration. */
export async function exportQuestions(courseId: string, filters: CourseExportFilters = {}): Promise<void> {
  const config = await data.getCourseFullConfig(courseId);
  if (!config) throw new Error("Course not found");
  const allQuestions = await data.getCourseQuestions(courseId);
  const questions = allQuestions.filter((question) =>
    (!filters.typeKeys?.length || filters.typeKeys.includes(question.type_key)) &&
    (!filters.difficulties?.length || (question.difficulty != null && filters.difficulties.includes(question.difficulty))) &&
    (!filters.institutions?.length || (question.source?.institution != null && filters.institutions.includes(question.source.institution))) &&
    (!filters.tags?.length || question.tags.some((tag) => filters.tags!.includes(tag)))
  );
  const zip = new JSZip();
  zip.file("questions.json", JSON.stringify({
    export_schema_version: 1,
    course_name: config.name,
    exported_at: new Date().toISOString(),
    questions,
  }, null, 2));
  zip.file("README.txt", "Editable question export. Edit questions.json; binary files referenced by asset_id are in assets/. Keep asset IDs and filenames unchanged so image blocks continue to resolve. This package contains no course structure or settings.\n");
  const seen = new Set<string>();
  const collectIds = (q: Question) => {
    for (const a of q.assets) if (!seen.has(a.asset_id)) seen.add(a.asset_id);
    for (const p of q.parts) collectIds(p);
  };
  for (const q of questions) collectIds(q);
  for (const assetId of seen) {
    const blob = await idb.getAsset(assetId);
    if (blob) zip.file(`assets/${assetId}.${mimeExtension(blob.type || "")}`, blob);
  }
  downloadBlob(await zip.generateAsync({ type: "blob" }), `${slugName(config.name)}-questions.qbx`);
}

// ---------- course import (.qb) ----------

export interface ParsedBundle {
  course: CourseFullConfig & {
    description?: string | null;
    subject?: string | null;
    curriculum?: string | null;
    version_year?: string | null;
  };
  questions: Question[];
  assetBlobs: Map<string, Blob>;
}

export async function parseCourseBundle(file: File): Promise<ParsedBundle> {
  let archive: JSZip;
  try {
    archive = await JSZip.loadAsync(file);
  } catch {
    throw new Error("This file is not a valid .qb course bundle.");
  }
  const courseJsonFile = archive.file("course.json");
  if (!courseJsonFile) {
    throw new Error("This .qb bundle has no course.json — it may be corrupted.");
  }
  const courseJson = JSON.parse(await courseJsonFile.async("string"));
  if (courseJson.export_schema_version !== 1) {
    throw new Error(
      `Unsupported export schema version ${courseJson.export_schema_version} — this app supports version 1.`
    );
  }
  const assetBlobs = new Map<string, Blob>();
  const assetFolder = archive.folder("assets");
  if (assetFolder) {
    for (const path in assetFolder.files) {
      const entry = assetFolder.files[path];
      if (entry.dir) continue;
      const name = path.split("/").pop() ?? "";
      const assetId = name.split(".").slice(0, -1).join(".") || name;
      if (!assetBlobs.has(assetId)) assetBlobs.set(assetId, await entry.async("blob"));
    }
  }
  return { course: courseJson.course, questions: courseJson.questions ?? [], assetBlobs };
}

async function wipeCourseData(courseId: string): Promise<void> {
  const existing = await getFirst("SELECT course_id FROM course WHERE course_id = ?", [courseId]);
  if (existing) await data.deleteCourse(courseId);
}

const IMAGE_TYPES = new Set(["image", "diagram", "graph"]);

interface ImportCtx {
  courseId: string;
  nodeMap: Map<string, string>;
  questionMap: Map<string, string>;
  assetMap: Map<string, string>;
}

async function getOrCreateTag(courseId: string, name: string): Promise<string> {
  const row = await getFirst("SELECT tag_id FROM tag WHERE course_id = ? AND name = ?", [
    courseId,
    name,
  ]);
  if (row) return row.tag_id;
  const tagId = newId("tag");
  await run("INSERT INTO tag (tag_id, course_id, name) VALUES (?, ?, ?)", [tagId, courseId, name]);
  return tagId;
}

async function getAllowedTagId(courseId: string, name: string): Promise<string> {
  const row = await getFirst("SELECT tag_id FROM tag WHERE course_id = ? AND name = ?", [courseId, name]);
  if (!row) throw new Error(`Tag '${name}' is not in this course's allowed tag list.`);
  return row.tag_id;
}

async function insertSourceIfNeeded(question: Question): Promise<string | null> {
  const s = question.source;
  if (!s || !s.name) return null;
  const candidates = await all("SELECT source_id, year, institution FROM source WHERE name = ?", [
    s.name,
  ]);
  for (const c of candidates) {
    if ((c.year ?? null) === (s.year ?? null) && (c.institution ?? null) === (s.institution ?? null)) {
      return c.source_id;
    }
  }
  const sourceId = newId("src");
  await run(
    "INSERT INTO source (source_id, name, year, institution, original_question_no) VALUES (?, ?, ?, ?, ?)",
    [sourceId, s.name, s.year ?? null, s.institution ?? null, s.original_question_no ?? null]
  );
  return sourceId;
}

async function insertQuestion(
  question: Question,
  ctx: ImportCtx,
  sourceAlready: Map<string, string | null>
): Promise<string> {
  const questionId = newId("q");
  ctx.questionMap.set(question.question_id, questionId);
  const parentId = question.parent_question_id
    ? (ctx.questionMap.get(question.parent_question_id) ?? null)
    : null;
  const sourceKey = question.source ? JSON.stringify(question.source) : "";
  let sourceId = sourceKey ? (sourceAlready.get(sourceKey) ?? null) : null;
  if (sourceKey && !sourceId) {
    sourceId = await insertSourceIfNeeded(question);
    sourceAlready.set(sourceKey, sourceId);
  }
  await run(
    `INSERT INTO question (question_id, course_id, type_key, difficulty, marks, parent_question_id,
        part_label, notes, review_status, classification_confidence, source_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      questionId,
      ctx.courseId,
      question.type_key,
      question.difficulty,
      question.marks,
      parentId,
      question.part_label,
      question.notes,
      question.review_status,
      question.classification_confidence,
      sourceId,
      question.created_at,
      question.updated_at,
    ]
  );
  question.node_ids.forEach((nodeId, i) => {
    const mapped = ctx.nodeMap.get(nodeId) ?? nodeId;
    run(
      "INSERT INTO question_classification (question_id, node_id, is_primary) VALUES (?, ?, ?)",
      [questionId, mapped, i === 0 ? 1 : 0]
    );
  });
  for (const tag of question.tags ?? []) {
    const tagId = await getAllowedTagId(ctx.courseId, tag);
    await run("INSERT INTO question_tag (question_id, tag_id) VALUES (?, ?)", [questionId, tagId]);
  }
  const slotLists: Array<[string, Question["body"]]> = [
    ["body", question.body],
    ["answer", question.answer],
    ["solution", question.solution],
    ["marking_criteria", question.marking_criteria],
  ];
  for (const [slot, blocks] of slotLists) {
    for (let i = 0; i < (blocks ?? []).length; i++) {
      const b = blocks[i];
      let content = b.content;
      if (IMAGE_TYPES.has(b.block_type) && typeof content?.asset_path === "string") {
        const mapped = ctx.assetMap.get(content.asset_path);
        if (mapped) content = { ...content, asset_path: mapped };
      }
      await run(
        "INSERT INTO content_block (block_id, question_id, slot, position, block_type, content_json) VALUES (?, ?, ?, ?, ?, ?)",
        [newId("blk"), questionId, slot, i, b.block_type, JSON.stringify(content ?? {})]
      );
    }
  }
  for (const [position, option] of (question.mcq_options ?? []).entries()) {
    await run(
      "INSERT INTO mcq_option (option_id, question_id, position, content_json, is_correct) VALUES (?, ?, ?, ?, ?)",
      [newId("opt"), questionId, position, JSON.stringify(option.content ?? []), option.is_correct ? 1 : 0]
    );
  }
  for (const a of question.assets ?? []) {
    const mapped = ctx.assetMap.get(a.asset_id) ?? a.asset_id;
    await run(
      `INSERT INTO asset (asset_id, question_id, file_path, mime_type, width, height, alt_text, caption, original_filename)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [mapped, questionId, mapped, a.mime_type, a.width, a.height, a.alt_text, a.caption, null]
    );
  }
  for (const part of question.parts ?? []) {
    await insertQuestion(part, ctx, sourceAlready);
  }
  return questionId;
}

export async function applyCourseBundle(
  bundle: ParsedBundle,
  mode: "replace" | "new",
  requestedCourseId?: string
): Promise<string> {
  const src = bundle.course;
  const courseId = mode === "new" ? (requestedCourseId ?? newId("course")) : src.course_id;
  if (mode === "replace") {
    await wipeCourseData(courseId);
  }
  const ctx: ImportCtx = { courseId, nodeMap: new Map(), questionMap: new Map(), assetMap: new Map() };

  // Asset IDs are unique in both IndexedDB and the SQL asset table. Include
  // both stores: old/partial imports can leave a SQL row without a blob.
  const existingAssets = new Set([
    ...await idb.listAssetIds(),
    ...(await all<{ asset_id: string }>("SELECT asset_id FROM asset")).map((asset) => asset.asset_id),
  ]);
  const bundleAssetIds = new Set(bundle.assetBlobs.keys());
  const collectQuestionAssets = (questions: Question[]) => {
    for (const question of questions) {
      for (const asset of question.assets ?? []) bundleAssetIds.add(asset.asset_id);
      for (const slot of [question.body, question.answer, question.solution, question.marking_criteria]) {
        for (const block of slot ?? []) {
          const assetPath = block.content?.asset_path;
          if (typeof assetPath === "string" && assetPath) bundleAssetIds.add(assetPath);
        }
      }
      collectQuestionAssets(question.parts ?? []);
    }
  };
  collectQuestionAssets(bundle.questions);
  for (const assetId of bundleAssetIds) {
    ctx.assetMap.set(assetId, existingAssets.has(assetId) ? newId("asset") : assetId);
  }

  const now = nowUtc();
  await run(
    `INSERT INTO course (course_id, name, description, subject, curriculum, version_year,
        schema_version, allow_multi_classification, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      courseId,
      src.name,
      src.description ?? null,
      src.subject ?? null,
      src.curriculum ?? null,
      src.version_year ?? null,
      src.schema_version ?? 1,
      src.allow_multi_classification ? 1 : 0,
      now,
      now,
    ]
  );
  for (const level of src.hierarchy ?? []) {
    await run(
      "INSERT INTO course_level_def (course_id, level_index, label, required) VALUES (?, ?, ?, ?)",
      [courseId, level.level_index, level.label, level.required ? 1 : 0]
    );
  }
  for (const d of src.difficulty_levels ?? []) {
    await run("INSERT INTO difficulty_level (course_id, level, label) VALUES (?, ?, ?)", [
      courseId,
      d.level,
      d.label,
    ]);
  }
  const existingTypes = await all("SELECT type_key FROM question_type");
  const typeSet = new Set(existingTypes.map((r) => r.type_key));
  for (const key of src.question_types ?? []) {
    if (!typeSet.has(key)) {
      await run("INSERT INTO question_type (type_key, display_name) VALUES (?, ?)", [
        key,
        key
          .split("_")
          .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
          .join(" "),
      ]);
    }
  }
  for (const tag of src.tags ?? []) {
    await getOrCreateTag(courseId, tag);
  }
  if (!(src.tags ?? []).includes("action_required")) {
    await run("INSERT INTO tag (tag_id, course_id, name) VALUES (?, ?, ?)", [newId("tag"), courseId, "action_required"]);
  }
  // nodes, parents before children (pre-order walk)
  const fullFlat: CourseNode[] = [];
  const walkAll = (list: CourseNode[]) => {
    for (const n of list) {
      fullFlat.push(n);
      walkAll(n.children);
    }
  };
  walkAll(src.nodes ?? []);
  for (const node of fullFlat) {
    const nodeId = newId("node");
    ctx.nodeMap.set(node.node_id, nodeId);
    await run(
      `INSERT INTO course_node (node_id, course_id, parent_node_id, level_index, name, code, description, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nodeId,
        courseId,
        node.parent_node_id ? (ctx.nodeMap.get(node.parent_node_id) ?? null) : null,
        node.level_index,
        node.name,
        node.code,
        node.description,
        node.sort_order,
        now,
        now,
      ]
    );
  }

  const sourceAlready = new Map<string, string | null>();
  for (const q of bundle.questions) {
    await insertQuestion(q, ctx, sourceAlready);
  }
  for (const [assetId, blob] of bundle.assetBlobs) {
    await idb.putAsset(ctx.assetMap.get(assetId) ?? assetId, blob);
  }
  return courseId;
}

export async function importCourseFile(file: File): Promise<{ course_id: string; course_name: string }> {
  const bundle = await parseCourseBundle(file);
  const existing = await getFirst("SELECT course_id FROM course WHERE course_id = ?", [
    bundle.course.course_id,
  ]);
  let courseId: string;
  if (existing) {
    const replace = window.confirm(
      `A course with id '${bundle.course.course_id}' already exists. Replace it with the imported one, or add as a new course?`
    );
    if (replace) {
      courseId = await applyCourseBundle(bundle, "replace");
    } else {
      courseId = await importAsNewCourse(bundle);
    }
  } else {
    courseId = await importAsNewCourse(bundle);
  }
  return { course_id: courseId, course_name: bundle.course.name };
}

async function importAsNewCourse(bundle: ParsedBundle): Promise<string> {
  const courseId = newId("course");
  try {
    return await applyCourseBundle(bundle, "new", courseId);
  } catch (error) {
    // Bundle import writes in stages; remove partial rows/blobs if one stage
    // fails so retrying cannot leave another half-imported course behind.
    const partial = await getFirst("SELECT course_id FROM course WHERE course_id = ?", [courseId]);
    if (partial) await data.deleteCourse(courseId);
    throw error;
  }
}
