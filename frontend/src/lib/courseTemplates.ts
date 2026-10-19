import type { ParsedBundle } from "./exchange";
import type { CourseNode, LevelDef } from "../api/types";

/**
 * Base course templates that ship with the site.
 *
 * Adding one is one line: copy a `template({ ... })` entry in
 * `COURSE_TEMPLATES` below (and a category in `TEMPLATE_CATEGORIES` if you
 * need a new one). Only people who control these source files can change
 * templates — the app deliberately offers no in-app editing.
 *
 * Installing a template creates a brand-new course (via the same bundle path
 * the .qb importer uses); it never writes into an existing course.
 */

/** One line per category, shown as groups on the Templates pages. */
export const TEMPLATE_CATEGORIES = ["HSC"] as const;

/** Nested node input: a bare string is a leaf; an object may nest children. */
export type TemplateNode =
  | string
  | { name: string; description?: string; code?: string; children?: TemplateNode[] };

export interface TemplateSpec {
  id: string;
  name: string;
  /** Must match an entry in TEMPLATE_CATEGORIES. */
  category: string;
  description?: string;
  subject?: string;
  curriculum?: string;
  version_year?: string;
  /** Level labels, outermost first, e.g. ["Module", "Topic"]. */
  hierarchy: string[];
  /** Allowed tags for this course's questions: the question types and skills that fit the subject. */
  tags?: string[];
  nodes?: TemplateNode[];
}

export type CourseTemplate = TemplateSpec & { nodes: TemplateNode[] };

export function template(spec: TemplateSpec): CourseTemplate {
  return { ...spec, nodes: spec.nodes ?? [] };
}

/** Counts the leaf topics in a template and how many hierarchy levels it declares. */
export function templateStats(t: CourseTemplate): { topics: number; levels: number } {
  let topics = 0;
  const visit = (nodes: TemplateNode[]) => {
    for (const entry of nodes) {
      const node = typeof entry === "string" ? { name: entry } : entry;
      if ("children" in node && node.children && node.children.length > 0) visit(node.children);
      else topics += 1;
    }
  };
  visit(t.nodes);
  return { topics, levels: t.hierarchy.length };
}

/**
 * Expands a template's nested nodes into the flat, parent-linked bundle shape
 * the .qb importer consumes. Node level = nesting depth; sort_order = position
 * among siblings.
 */
export function buildTemplateBundle(t: CourseTemplate): ParsedBundle {
  let counter = 0;
  const flat: CourseNode[] = [];

  // Node codes follow the .qb convention: a year root is PRE or HSC, its
  // modules are -M1, -M2 …, and each module's topics are -T1, -T2 … A node
  // can override the derived code by setting `code` on the template node.
  const rootCode = (name: string, index: number) => {
    if (name === "Year 11") return "PRE";
    if (name === "Year 12") return "HSC";
    const suffix = name.replace(/^Year\s*12\s*[\u2013\u2014-]\s*/, "");
    if (suffix === name) return `Y${index + 1}`;
    const initials = suffix
      .split(/\s+/)
      .map((word) => word[0])
      .join("")
      .toUpperCase();
    return `HSC-${initials}`;
  };

  const walk = (list: TemplateNode[], parent: string | null, level: number, parentCode: string) => {
    list.forEach((entry, index) => {
      const node = typeof entry === "string" ? { name: entry } : entry;
      const node_id = `${t.id}-n${++counter}`;
      const explicit = "code" in node ? node.code : undefined;
      const code =
        explicit ??
        (level === 0
          ? rootCode(node.name, index)
          : `${parentCode}-${level === 1 ? "M" : "T"}${index + 1}`);
      flat.push({
        node_id,
        course_id: t.id,
        parent_node_id: parent,
        level_index: level,
        name: node.name,
        code,
        description: "description" in node ? (node.description ?? null) : null,
        sort_order: index,
        children: [],
      });
      if ("children" in node && node.children) walk(node.children, node_id, level + 1, code);
    });
  };
  walk(t.nodes, null, 0, "");

  const hierarchy: LevelDef[] = t.hierarchy.map((label, i) => ({
    level_index: i,
    label,
    required: i === 0,
  }));

  return {
    course: {
      course_id: t.id,
      name: t.name,
      description: t.description ?? null,
      subject: t.subject ?? null,
      curriculum: t.curriculum ?? t.category,
      version_year: t.version_year ?? null,
      schema_version: 1,
      allow_multi_classification: true,
      hierarchy,
      difficulty_levels: [
        { level: 1, label: "Very Easy" },
        { level: 2, label: "Easy" },
        { level: 3, label: "Difficult" },
        { level: 4, label: "Very Difficult" },
      ],
      question_types: ["multiple_choice", "short_answer", "extended_response"],
      tags: [...(t.tags ?? [])],
      nodes: flat,
    },
    questions: [],
    assetBlobs: new Map(),
    learning: null,
  };
}

/**
 * One line per base course that visitors can install.
 */
export const COURSE_TEMPLATES: CourseTemplate[] = [
  template({
    id: "ancient-history",
    name: "Ancient History",
    category: "HSC",
    subject: "Ancient History",
    curriculum: "NSW Stage 6 (NESA)",
    version_year: "2024",
    description: "NSW Stage 6 Ancient History (2024). Year 11 and Year 12 syllabus modules and their topics.",
    hierarchy: ["Year", "Module", "Topic"],
    tags: [
      "source_analysis", "source_evaluation", "historical_interpretation", "reliability", "archaeological_evidence", "causation", "continuity_and_change", "significance", "perspectives", "essay", "extended_response", "short_answer", "multiple_choice", "comparison", "terminology",
    ],
    nodes: [
      { name: "Year 11", code: "PRE", children: [
        { name: "Historical concepts and skills 11–12", code: "PRE-M1", children: [
          { name: "Analysis and use of sources", code: "PRE-M1-T1" },
          { name: "Historical interpretation", code: "PRE-M1-T2" },
          { name: "Historical investigation and research", code: "PRE-M1-T3" },
          { name: "Explanation and communication", code: "PRE-M1-T4" },
        ] },
        { name: "Investigating ancient history – The nature of ancient history", code: "PRE-M2" },
        { name: "The investigation of ancient sites and sources", code: "PRE-M3", children: [
          { name: "Investigation", code: "PRE-M3-T1" },
        ] },
        { name: "The representation of the ancient past", code: "PRE-M4", children: [
          { name: "Investigation", code: "PRE-M4-T1" },
        ] },
        { name: "Conservation and reconstruction of ancient sites", code: "PRE-M5", children: [
          { name: "Investigation", code: "PRE-M5-T1" },
        ] },
        { name: "Cultural heritage and the role of museums", code: "PRE-M6", children: [
          { name: "Investigation", code: "PRE-M6-T1" },
        ] },
        { name: "The treatment and display of human remains", code: "PRE-M7", children: [
          { name: "Investigation", code: "PRE-M7-T1" },
        ] },
        { name: "Investigating ancient history – Case studies", code: "PRE-M8" },
        { name: "List A: Old Kingdom Egypt", code: "PRE-M9", children: [
          { name: "The geographical and historical context", code: "PRE-M9-T1" },
          { name: "The range and issues of sources", code: "PRE-M9-T2" },
          { name: "Features of Old Kingdom Egypt", code: "PRE-M9-T3" },
        ] },
        { name: "List A: Tutankhamun’s tomb", code: "PRE-M10", children: [
          { name: "The geographical and historical context", code: "PRE-M10-T1" },
          { name: "The range and issues of sources", code: "PRE-M10-T2" },
          { name: "Burial customs at the time of Tutankhamun", code: "PRE-M10-T3" },
          { name: "Analysis of the human remains", code: "PRE-M10-T4" },
        ] },
        { name: "List A: Deir el-Medina", code: "PRE-M11", children: [
          { name: "The geographical and historical context", code: "PRE-M11-T1" },
          { name: "The range and issues of sources", code: "PRE-M11-T2" },
          { name: "Features of life at Deir el-Medina", code: "PRE-M11-T3" },
        ] },
        { name: "List A: Alexandria", code: "PRE-M12", children: [
          { name: "The geographical and historical context", code: "PRE-M12-T1" },
          { name: "The range and issues of sources", code: "PRE-M12-T2" },
          { name: "Features of society in Alexandria", code: "PRE-M12-T3" },
        ] },
        { name: "List A: Thera", code: "PRE-M13", children: [
          { name: "The geographical and historical context", code: "PRE-M13-T1" },
          { name: "The range and issues of sources", code: "PRE-M13-T2" },
          { name: "Features of life at Thera", code: "PRE-M13-T3" },
        ] },
        { name: "List A: Troy", code: "PRE-M14", children: [
          { name: "The geographical and historical context", code: "PRE-M14-T1" },
          { name: "The range and issues of sources", code: "PRE-M14-T2" },
          { name: "The history of Troy and the Trojan War", code: "PRE-M14-T3" },
        ] },
        { name: "List A: The Roman games", code: "PRE-M15", children: [
          { name: "The geographical and historical context", code: "PRE-M15-T1" },
          { name: "The range and issues of sources", code: "PRE-M15-T2" },
          { name: "The nature of the Roman games", code: "PRE-M15-T3" },
        ] },
        { name: "List A: The Celts", code: "PRE-M16", children: [
          { name: "The geographical and historical context", code: "PRE-M16-T1" },
          { name: "The range and issues of sources", code: "PRE-M16-T2" },
          { name: "Features of Celtic life", code: "PRE-M16-T3" },
        ] },
        { name: "List A: Boudicca", code: "PRE-M17", children: [
          { name: "The geographical and historical context", code: "PRE-M17-T1" },
          { name: "The range and issues of sources", code: "PRE-M17-T2" },
          { name: "Boudicca’s conflict with Rome", code: "PRE-M17-T3" },
        ] },
        { name: "List B: Ancient Australia", code: "PRE-M18", children: [
          { name: "The geographical and historical context", code: "PRE-M18-T1" },
          { name: "The range and issues of sources", code: "PRE-M18-T2" },
          { name: "The archaeology of ancient Australia", code: "PRE-M18-T3" },
        ] },
        { name: "List B: The Shang dynasty", code: "PRE-M19", children: [
          { name: "The geographical and historical context", code: "PRE-M19-T1" },
          { name: "The range and issues of sources", code: "PRE-M19-T2" },
          { name: "The nature of the Shang dynasty", code: "PRE-M19-T3" },
        ] },
        { name: "List B: Ashoka", code: "PRE-M20", children: [
          { name: "The geographical and historical context", code: "PRE-M20-T1" },
          { name: "The range and issues of sources", code: "PRE-M20-T2" },
          { name: "The role and contribution of Ashoka", code: "PRE-M20-T3" },
        ] },
        { name: "List B: Nineveh", code: "PRE-M21", children: [
          { name: "The geographical and historical context", code: "PRE-M21-T1" },
          { name: "The range and issues of sources", code: "PRE-M21-T2" },
          { name: "The history of Nineveh", code: "PRE-M21-T3" },
        ] },
        { name: "List B: Persepolis", code: "PRE-M22", children: [
          { name: "The geographical and historical context", code: "PRE-M22-T1" },
          { name: "The range and issues of sources", code: "PRE-M22-T2" },
          { name: "The history of Persepolis", code: "PRE-M22-T3" },
        ] },
        { name: "List B: Civilisations of the river – Mesopotamia and the Indus Valley", code: "PRE-M23", children: [
          { name: "The geographical and historical context", code: "PRE-M23-T1" },
          { name: "The range and issues of sources", code: "PRE-M23-T2" },
          { name: "Features of civilisations of the river", code: "PRE-M23-T3" },
        ] },
        { name: "List B: Masada", code: "PRE-M24", children: [
          { name: "The geographical and historical context", code: "PRE-M24-T1" },
          { name: "The range and issues of sources", code: "PRE-M24-T2" },
          { name: "The occupation and siege of Masada", code: "PRE-M24-T3" },
        ] },
        { name: "List B: Palmyra and the Silk Road", code: "PRE-M25", children: [
          { name: "The geographical and historical context", code: "PRE-M25-T1" },
          { name: "The range and issues of sources", code: "PRE-M25-T2" },
          { name: "The history of Palmyra", code: "PRE-M25-T3" },
        ] },
        { name: "List B: Teotihuacan", code: "PRE-M26", children: [
          { name: "The geographical and historical context", code: "PRE-M26-T1" },
          { name: "The range and issues of sources", code: "PRE-M26-T2" },
          { name: "The history of Teotihuacan", code: "PRE-M26-T3" },
        ] },
        { name: "Features of ancient societies", code: "PRE-M27", children: [
          { name: "Women", code: "PRE-M27-T1" },
          { name: "Slavery", code: "PRE-M27-T2" },
          { name: "Art and architecture", code: "PRE-M27-T3" },
          { name: "Weapons and warfare", code: "PRE-M27-T4" },
          { name: "Death and funerary customs", code: "PRE-M27-T5" },
          { name: "Power and image", code: "PRE-M27-T6" },
          { name: "Trade and cultural contact", code: "PRE-M27-T7" },
        ] },
        { name: "Historical investigation", code: "PRE-M28", children: [
          { name: "The process of historical investigation", code: "PRE-M28-T1" },
        ] },
      ] },
      { name: "Year 12", code: "HSC", children: [
        { name: "Historical concepts and skills 11–12", code: "HSC-M1", children: [
          { name: "Analysis and use of sources", code: "HSC-M1-T1" },
          { name: "Historical interpretation", code: "HSC-M1-T2" },
          { name: "Historical investigation and research", code: "HSC-M1-T3" },
          { name: "Explanation and communication", code: "HSC-M1-T4" },
        ] },
        { name: "Core study: Cities of Vesuvius – Pompeii and Herculaneum", code: "HSC-M2", children: [
          { name: "Context", code: "HSC-M2-T1" },
          { name: "Source analysis: interpreting the evidence for life in Pompeii and Herculaneum", code: "HSC-M2-T2" },
          { name: "Archaeology at Pompeii and Herculaneum", code: "HSC-M2-T3" },
        ] },
        { name: "Ancient societies", code: "HSC-M3" },
        { name: "New Kingdom Egypt to the death of Amenhotep III", code: "HSC-M4", children: [
          { name: "Context", code: "HSC-M4-T1" },
          { name: "Evaluation", code: "HSC-M4-T2" },
          { name: "Social and political organisation", code: "HSC-M4-T3" },
          { name: "Economic activities", code: "HSC-M4-T4" },
          { name: "Religious ideology and practice", code: "HSC-M4-T5" },
          { name: "Cultural life", code: "HSC-M4-T6" },
        ] },
        { name: "New Kingdom Egypt during the Ramesside period", code: "HSC-M5", children: [
          { name: "Context", code: "HSC-M5-T1" },
          { name: "Evaluation", code: "HSC-M5-T2" },
          { name: "Social and political organisation", code: "HSC-M5-T3" },
          { name: "Economic activities", code: "HSC-M5-T4" },
          { name: "Religious ideology and practice", code: "HSC-M5-T5" },
          { name: "Cultural life", code: "HSC-M5-T6" },
        ] },
        { name: "Israel from Solomon to the fall of Samaria", code: "HSC-M6", children: [
          { name: "Context", code: "HSC-M6-T1" },
          { name: "Evaluation", code: "HSC-M6-T2" },
          { name: "Social and political organisation", code: "HSC-M6-T3" },
          { name: "Economic activities", code: "HSC-M6-T4" },
          { name: "Religious ideology and practice", code: "HSC-M6-T5" },
          { name: "Cultural life", code: "HSC-M6-T6" },
        ] },
        { name: "Persia in the time of Darius and Xerxes", code: "HSC-M7", children: [
          { name: "Context", code: "HSC-M7-T1" },
          { name: "Evaluation", code: "HSC-M7-T2" },
          { name: "Social and political organisation", code: "HSC-M7-T3" },
          { name: "Economic activities", code: "HSC-M7-T4" },
          { name: "Religious ideology and practice", code: "HSC-M7-T5" },
          { name: "Cultural life", code: "HSC-M7-T6" },
        ] },
        { name: "China during the Han dynasty", code: "HSC-M8", children: [
          { name: "Context", code: "HSC-M8-T1" },
          { name: "Evaluation", code: "HSC-M8-T2" },
          { name: "Social and political organisation", code: "HSC-M8-T3" },
          { name: "Economic activities", code: "HSC-M8-T4" },
          { name: "Religious ideology and practice", code: "HSC-M8-T5" },
          { name: "Cultural life", code: "HSC-M8-T6" },
        ] },
        { name: "Minoan Crete in the Bronze Age", code: "HSC-M9", children: [
          { name: "Context", code: "HSC-M9-T1" },
          { name: "Evaluation", code: "HSC-M9-T2" },
          { name: "Social and political organisation", code: "HSC-M9-T3" },
          { name: "Economic activities", code: "HSC-M9-T4" },
          { name: "Religious ideology and practice", code: "HSC-M9-T5" },
          { name: "Cultural life", code: "HSC-M9-T6" },
        ] },
        { name: "Sparta to the Battle of Leuctra 371 BCE", code: "HSC-M10", children: [
          { name: "Context", code: "HSC-M10-T1" },
          { name: "Evaluation", code: "HSC-M10-T2" },
          { name: "Social and political organisation", code: "HSC-M10-T3" },
          { name: "Economic activities", code: "HSC-M10-T4" },
          { name: "Religious ideology and practice", code: "HSC-M10-T5" },
          { name: "Cultural life", code: "HSC-M10-T6" },
        ] },
        { name: "Athens in the time of Pericles", code: "HSC-M11", children: [
          { name: "Context", code: "HSC-M11-T1" },
          { name: "Evaluation", code: "HSC-M11-T2" },
          { name: "Social and political organisation", code: "HSC-M11-T3" },
          { name: "Economic activities", code: "HSC-M11-T4" },
          { name: "Religious ideology and practice", code: "HSC-M11-T5" },
          { name: "Cultural life", code: "HSC-M11-T6" },
        ] },
        { name: "Historical personalities", code: "HSC-M12" },
        { name: "Egypt – Hatshepsut", code: "HSC-M13", children: [
          { name: "Context", code: "HSC-M13-T1" },
          { name: "Background", code: "HSC-M13-T2" },
          { name: "Key features and developments", code: "HSC-M13-T3" },
          { name: "Evaluation", code: "HSC-M13-T4" },
        ] },
        { name: "Egypt – Akhenaten", code: "HSC-M14", children: [
          { name: "Context", code: "HSC-M14-T1" },
          { name: "Background", code: "HSC-M14-T2" },
          { name: "Key features and developments", code: "HSC-M14-T3" },
          { name: "Evaluation", code: "HSC-M14-T4" },
        ] },
        { name: "The Near East – Xerxes", code: "HSC-M15", children: [
          { name: "Context", code: "HSC-M15-T1" },
          { name: "Background", code: "HSC-M15-T2" },
          { name: "Key features and developments", code: "HSC-M15-T3" },
          { name: "Evaluation", code: "HSC-M15-T4" },
        ] },
        { name: "China – Qin Shi Huangdi", code: "HSC-M16", children: [
          { name: "Context", code: "HSC-M16-T1" },
          { name: "Background", code: "HSC-M16-T2" },
          { name: "Key features and developments", code: "HSC-M16-T3" },
          { name: "Evaluation", code: "HSC-M16-T4" },
        ] },
        { name: "Greece – Pericles", code: "HSC-M17", children: [
          { name: "Context", code: "HSC-M17-T1" },
          { name: "Background", code: "HSC-M17-T2" },
          { name: "Key features and developments", code: "HSC-M17-T3" },
          { name: "Evaluation", code: "HSC-M17-T4" },
        ] },
        { name: "Greece – Alexander the Great", code: "HSC-M18", children: [
          { name: "Context", code: "HSC-M18-T1" },
          { name: "Background", code: "HSC-M18-T2" },
          { name: "Key features and developments", code: "HSC-M18-T3" },
          { name: "Evaluation", code: "HSC-M18-T4" },
        ] },
        { name: "Rome – Julius Caesar", code: "HSC-M19", children: [
          { name: "Context", code: "HSC-M19-T1" },
          { name: "Background", code: "HSC-M19-T2" },
          { name: "Key features and developments", code: "HSC-M19-T3" },
          { name: "Evaluation", code: "HSC-M19-T4" },
        ] },
        { name: "Rome – Agrippina the Younger", code: "HSC-M20", children: [
          { name: "Context", code: "HSC-M20-T1" },
          { name: "Background", code: "HSC-M20-T2" },
          { name: "Key features and developments", code: "HSC-M20-T3" },
          { name: "Evaluation", code: "HSC-M20-T4" },
        ] },
        { name: "Historical periods", code: "HSC-M21" },
        { name: "New Kingdom Egypt to the death of Thutmose IV", code: "HSC-M22", children: [
          { name: "Context", code: "HSC-M22-T1" },
          { name: "Internal developments", code: "HSC-M22-T2" },
          { name: "Foreign relations", code: "HSC-M22-T3" },
        ] },
        { name: "New Kingdom Egypt – Amenhotep III to the death of Ramesses II", code: "HSC-M23", children: [
          { name: "Context", code: "HSC-M23-T1" },
          { name: "Internal developments", code: "HSC-M23-T2" },
          { name: "Foreign relations", code: "HSC-M23-T3" },
        ] },
        { name: "The Levant in the period c. 869–586 BCE", code: "HSC-M24", children: [
          { name: "Context", code: "HSC-M24-T1" },
          { name: "Israel and Judah in the Ancient Levant", code: "HSC-M24-T2" },
          { name: "Foreign relations with Assyria and Babylon", code: "HSC-M24-T3" },
        ] },
        { name: "Persia – Cyrus II to the death of Darius III", code: "HSC-M25", children: [
          { name: "Context", code: "HSC-M25-T1" },
          { name: "The establishment and expansion of the Persian Empire", code: "HSC-M25-T2" },
          { name: "The collapse of the Persian Empire", code: "HSC-M25-T3" },
        ] },
        { name: "Imperial China – the Qin and Han 247–87 BCE", code: "HSC-M26", children: [
          { name: "Context", code: "HSC-M26-T1" },
          { name: "The rise and fall of the Qin dynasty", code: "HSC-M26-T2" },
          { name: "The establishment of the Han dynasty", code: "HSC-M26-T3" },
          { name: "The empire of the Han", code: "HSC-M26-T4" },
        ] },
        { name: "The Greek world 500–440 BCE", code: "HSC-M27", children: [
          { name: "Context", code: "HSC-M27-T1" },
          { name: "The Persian Wars", code: "HSC-M27-T2" },
          { name: "Athens and the Athenian Empire", code: "HSC-M27-T3" },
        ] },
        { name: "Greece from 404 BCE to the death of Philip II", code: "HSC-M28", children: [
          { name: "Context", code: "HSC-M28-T1" },
          { name: "Significant developments 404–362 BCE", code: "HSC-M28-T2" },
          { name: "Greece and the rise of Macedon", code: "HSC-M28-T3" },
        ] },
        { name: "The fall of the Roman Republic 78–42 BCE", code: "HSC-M29", children: [
          { name: "Context", code: "HSC-M29-T1" },
          { name: "Political developments in the late Republic", code: "HSC-M29-T2" },
          { name: "The Civil War and the fall of the Republic", code: "HSC-M29-T3" },
        ] },
        { name: "The Augustan Age 44 BCE–14 CE", code: "HSC-M30", children: [
          { name: "Context", code: "HSC-M30-T1" },
          { name: "The Augustan principate", code: "HSC-M30-T2" },
          { name: "The empire under Augustus", code: "HSC-M30-T3" },
        ] },
        { name: "The Julio-Claudians 14–68 CE", code: "HSC-M31", children: [
          { name: "Context", code: "HSC-M31-T1" },
          { name: "The development of the principate under the Julio-Claudian rulers", code: "HSC-M31-T2" },
          { name: "The empire", code: "HSC-M31-T3" },
        ] },
      ] },
    ],
  }),
  template({
    id: "biology",
    name: "Biology",
    category: "HSC",
    subject: "Biology",
    curriculum: "NSW Stage 6 (NESA)",
    version_year: "2025",
    description: "NSW Stage 6 Biology (2025). Year 11 and Year 12 syllabus modules and their topics.",
    hierarchy: ["Year", "Module", "Topic"],
    tags: [
      "conceptual", "explanation", "data_analysis", "graphing", "diagram", "experimental_design", "practical_investigation", "modelling", "calculation", "evaluation", "communication", "multiple_choice", "short_answer", "extended_response", "action_required",
    ],
    nodes: [
      { name: "Year 11", code: "PRE", children: [
        { name: "Working scientifically", code: "PRE-M1", children: [
          { name: "Questioning and predicting", code: "PRE-M1-T1" },
          { name: "Planning scientific investigations", code: "PRE-M1-T2" },
          { name: "Conducting scientific investigations", code: "PRE-M1-T3" },
          { name: "Processing data and information", code: "PRE-M1-T4" },
          { name: "Analysing data and information", code: "PRE-M1-T5" },
          { name: "Problem-solving", code: "PRE-M1-T6" },
          { name: "Communicating", code: "PRE-M1-T7" },
        ] },
        { name: "Cells as the basis of life", code: "PRE-M2", children: [
          { name: "Cell structures and functions", code: "PRE-M2-T1" },
          { name: "Cells and their environments", code: "PRE-M2-T2" },
          { name: "Biochemical processes", code: "PRE-M2-T3" },
          { name: "Cell division", code: "PRE-M2-T4" },
        ] },
        { name: "Cells to systems", code: "PRE-M3", children: [
          { name: "Cell organisation", code: "PRE-M3-T1" },
          { name: "Plants as autotrophic organisms", code: "PRE-M3-T2" },
          { name: "Animals as heterotrophic organisms", code: "PRE-M3-T3" },
          { name: "Homeostasis in humans", code: "PRE-M3-T4" },
        ] },
        { name: "Evolution and ecosystems", code: "PRE-M4", children: [
          { name: "Natural selection", code: "PRE-M4-T1" },
          { name: "Evolution and adaptations", code: "PRE-M4-T2" },
          { name: "Ecosystem dynamics", code: "PRE-M4-T3" },
        ] },
      ] },
      { name: "Year 12", code: "HSC", children: [
        { name: "Working scientifically", code: "HSC-M1", children: [
          { name: "Questioning and predicting", code: "HSC-M1-T1" },
          { name: "Planning scientific investigations", code: "HSC-M1-T2" },
          { name: "Conducting scientific investigations", code: "HSC-M1-T3" },
          { name: "Processing data and information", code: "HSC-M1-T4" },
          { name: "Analysing data and information", code: "HSC-M1-T5" },
          { name: "Problem-solving", code: "HSC-M1-T6" },
          { name: "Communicating", code: "HSC-M1-T7" },
        ] },
        { name: "Heredity", code: "HSC-M2", children: [
          { name: "Polypeptide synthesis", code: "HSC-M2-T1" },
          { name: "Inheritance patterns", code: "HSC-M2-T2" },
          { name: "Genetic variants", code: "HSC-M2-T3" },
        ] },
        { name: "Diseases", code: "HSC-M3", children: [
          { name: "Non-infectious diseases", code: "HSC-M3-T1" },
          { name: "Infectious diseases", code: "HSC-M3-T2" },
          { name: "Epidemiological studies", code: "HSC-M3-T3" },
        ] },
        { name: "Biodiversity", code: "HSC-M4", children: [
          { name: "Changing ecosystems", code: "HSC-M4-T1" },
          { name: "Genetic diversity", code: "HSC-M4-T2" },
          { name: "Sustainable ecosystems", code: "HSC-M4-T3" },
        ] },
        { name: "Biotechnology", code: "HSC-M5", children: [
          { name: "Modern biotechnologies", code: "HSC-M5-T1" },
          { name: "Biotechnology in human diseases", code: "HSC-M5-T2" },
          { name: "Biotechnology in agriculture and biodiversity", code: "HSC-M5-T3" },
        ] },
      ] },
    ],
  }),
  template({
    id: "chemistry",
    name: "Chemistry",
    category: "HSC",
    subject: "Chemistry",
    curriculum: "NSW Stage 6 (NESA)",
    version_year: "2025",
    description: "NSW Stage 6 Chemistry (2025). Year 11 and Year 12 syllabus modules and their topics.",
    hierarchy: ["Year", "Module", "Topic"],
    tags: [
      "calculation", "stoichiometry", "conceptual", "explanation", "data_analysis", "graphing", "diagram", "practical_investigation", "experimental_design", "modelling", "derivation", "evaluation", "multiple_choice", "short_answer", "extended_response",
    ],
    nodes: [
      { name: "Year 11", code: "PRE", children: [
        { name: "Working scientifically", code: "PRE-M1", children: [
          { name: "Questioning and predicting", code: "PRE-M1-T1" },
          { name: "Planning scientific investigations", code: "PRE-M1-T2" },
          { name: "Conducting scientific investigations", code: "PRE-M1-T3" },
          { name: "Processing data and information", code: "PRE-M1-T4" },
          { name: "Analysing data and information", code: "PRE-M1-T5" },
          { name: "Problem-solving", code: "PRE-M1-T6" },
          { name: "Communicating", code: "PRE-M1-T7" },
        ] },
        { name: "Properties and structure of matter", code: "PRE-M2", children: [
          { name: "Separation of mixtures", code: "PRE-M2-T1" },
          { name: "Atomic structure and electron configuration", code: "PRE-M2-T2" },
          { name: "Patterns and trends in the periodic table", code: "PRE-M2-T3" },
          { name: "Chemical bonding", code: "PRE-M2-T4" },
        ] },
        { name: "Quantitative chemistry", code: "PRE-M3", children: [
          { name: "Conservation of mass", code: "PRE-M3-T1" },
          { name: "Mole concept", code: "PRE-M3-T2" },
          { name: "Measures of concentration", code: "PRE-M3-T3" },
          { name: "Properties of gases", code: "PRE-M3-T4" },
        ] },
        { name: "Chemical reactions", code: "PRE-M4", children: [
          { name: "Classifying chemical reactions", code: "PRE-M4-T1" },
          { name: "Rates of reactions", code: "PRE-M4-T2" },
          { name: "Energy changes", code: "PRE-M4-T3" },
        ] },
      ] },
      { name: "Year 12", code: "HSC", children: [
        { name: "Working scientifically", code: "HSC-M1", children: [
          { name: "Questioning and predicting", code: "HSC-M1-T1" },
          { name: "Planning scientific investigations", code: "HSC-M1-T2" },
          { name: "Conducting scientific investigations", code: "HSC-M1-T3" },
          { name: "Processing data and information", code: "HSC-M1-T4" },
          { name: "Analysing data and information", code: "HSC-M1-T5" },
          { name: "Problem-solving", code: "HSC-M1-T6" },
          { name: "Communicating", code: "HSC-M1-T7" },
        ] },
        { name: "Equilibrium", code: "HSC-M2", children: [
          { name: "Dynamic equilibrium", code: "HSC-M2-T1" },
          { name: "Factors that affect equilibrium", code: "HSC-M2-T2" },
          { name: "Calculating the equilibrium constant", code: "HSC-M2-T3" },
          { name: "Solution equilibria", code: "HSC-M2-T4" },
        ] },
        { name: "Acid–base reactions", code: "HSC-M3", children: [
          { name: "Properties of acids and bases", code: "HSC-M3-T1" },
          { name: "Using Brønsted–Lowry theory", code: "HSC-M3-T2" },
          { name: "Quantitative analysis", code: "HSC-M3-T3" },
        ] },
        { name: "Organic chemistry", code: "HSC-M4", children: [
          { name: "Hydrocarbons", code: "HSC-M4-T1" },
          { name: "Alcohols", code: "HSC-M4-T2" },
          { name: "Organic acids", code: "HSC-M4-T3" },
          { name: "Esters", code: "HSC-M4-T4" },
        ] },
        { name: "Applying chemical ideas", code: "HSC-M5", children: [
          { name: "Analysis and uses of organic substances", code: "HSC-M5-T1" },
          { name: "Analysis and uses of inorganic substances", code: "HSC-M5-T2" },
        ] },
      ] },
    ],
  }),
  template({
    id: "economics",
    name: "Economics",
    category: "HSC",
    subject: "Economics",
    curriculum: "NSW Stage 6 (NESA)",
    version_year: "2025",
    description: "NSW Stage 6 Economics (2025). Year 11 and Year 12 syllabus modules and their topics.",
    hierarchy: ["Year", "Module", "Topic"],
    tags: [
      "explanation", "analysis", "evaluation", "data_analysis", "graphing", "calculation", "case_study", "contemporary_examples", "policy_analysis", "statistics", "interpretation", "extended_response", "short_answer", "multiple_choice", "action_required",
    ],
    nodes: [
      { name: "Year 11", code: "PRE", children: [
        { name: "Introduction to economics", code: "PRE-M1", children: [
          { name: "Economic thinking", code: "PRE-M1-T1" },
          { name: "Operation of an economy", code: "PRE-M1-T2" },
          { name: "Economic model: production possibilities", code: "PRE-M1-T3" },
          { name: "Economic model: circular flow of income", code: "PRE-M1-T4" },
          { name: "Economic model: business cycle", code: "PRE-M1-T5" },
        ] },
        { name: "Markets", code: "PRE-M2", children: [
          { name: "Role of markets", code: "PRE-M2-T1" },
          { name: "Demand", code: "PRE-M2-T2" },
          { name: "Supply", code: "PRE-M2-T3" },
          { name: "Market equilibrium", code: "PRE-M2-T4" },
          { name: "Price elasticity of demand", code: "PRE-M2-T5" },
          { name: "Price elasticity of supply", code: "PRE-M2-T6" },
          { name: "Market structures and competition for sellers", code: "PRE-M2-T7" },
          { name: "Nature and types of market failure", code: "PRE-M2-T8" },
          { name: "Government intervention in market failures", code: "PRE-M2-T9" },
        ] },
        { name: "Household and business sector", code: "PRE-M3", children: [
          { name: "Households: the consumption of goods and services", code: "PRE-M3-T1" },
          { name: "Households: the provision of labour", code: "PRE-M3-T2" },
          { name: "Businesses: production of goods and services", code: "PRE-M3-T3" },
          { name: "Businesses: the provision of income", code: "PRE-M3-T4" },
        ] },
        { name: "Financial sector", code: "PRE-M4", children: [
          { name: "Role of financial sector", code: "PRE-M4-T1" },
          { name: "Types of financial markets: equity markets", code: "PRE-M4-T2" },
          { name: "Types of financial markets: debt markets", code: "PRE-M4-T3" },
        ] },
        { name: "Government sector", code: "PRE-M5", children: [
          { name: "Role of government", code: "PRE-M5-T1" },
          { name: "Taxation", code: "PRE-M5-T2" },
          { name: "Government spending", code: "PRE-M5-T3" },
        ] },
        { name: "International sector", code: "PRE-M6", children: [
          { name: "International trade", code: "PRE-M6-T1" },
          { name: "International investment", code: "PRE-M6-T2" },
          { name: "Exchange rates", code: "PRE-M6-T3" },
          { name: "Balance of payments", code: "PRE-M6-T4" },
        ] },
      ] },
      { name: "Year 12", code: "HSC", children: [
        { name: "Economic issues in the Australian economy", code: "HSC-M1", children: [
          { name: "Economic growth", code: "HSC-M1-T1" },
          { name: "Employment and unemployment", code: "HSC-M1-T2" },
          { name: "Inflation", code: "HSC-M1-T3" },
          { name: "Inequality", code: "HSC-M1-T4" },
          { name: "Environmental sustainability", code: "HSC-M1-T5" },
        ] },
        { name: "Economic management of the Australian economy", code: "HSC-M2", children: [
          { name: "Economic objectives", code: "HSC-M2-T1" },
          { name: "Fiscal policy", code: "HSC-M2-T2" },
          { name: "Monetary policy", code: "HSC-M2-T3" },
          { name: "Microeconomic policy", code: "HSC-M2-T4" },
          { name: "Labour market policy", code: "HSC-M2-T5" },
          { name: "Environmental policy", code: "HSC-M2-T6" },
          { name: "Policy mix", code: "HSC-M2-T7" },
        ] },
        { name: "Australia and the global economy", code: "HSC-M3", children: [
          { name: "Global trade", code: "HSC-M3-T1" },
          { name: "Global investment", code: "HSC-M3-T2" },
          { name: "Exchange rates", code: "HSC-M3-T3" },
          { name: "International economic development", code: "HSC-M3-T4" },
          { name: "Impacts of the global economy on Australia", code: "HSC-M3-T5" },
        ] },
      ] },
    ],
  }),
  template({
    id: "english-advanced",
    name: "English Advanced",
    category: "HSC",
    subject: "English Advanced",
    curriculum: "NSW Stage 6 (NESA)",
    version_year: "2024",
    description: "NSW Stage 6 English Advanced (2024). Year 11 and Year 12 syllabus modules and their topics.",
    hierarchy: ["Year", "Module", "Topic"],
    tags: [
      "textual_analysis", "essay", "extended_response", "creative_writing", "reflection", "comparative_study", "close_reading", "thesis", "evidence", "context", "imaginative_writing", "critical_analysis", "multimodal", "short_answer", "multiple_choice",
    ],
    nodes: [
      { name: "Year 11", code: "PRE", children: [
        { name: "Reading to write: Transition to English Advanced", code: "PRE-M1", children: [
          { name: "Understanding", code: "PRE-M1-T1" },
          { name: "Responding", code: "PRE-M1-T2" },
        ] },
        { name: "Narratives that shape our world", code: "PRE-M2", children: [
          { name: "Understanding", code: "PRE-M2-T1" },
          { name: "Responding", code: "PRE-M2-T2" },
        ] },
        { name: "Critical study of literature", code: "PRE-M3", children: [
          { name: "Understanding", code: "PRE-M3-T1" },
          { name: "Responding", code: "PRE-M3-T2" },
        ] },
      ] },
      { name: "Year 12", code: "HSC", children: [
        { name: "Texts and human experiences", code: "HSC-M1", children: [
          { name: "Understanding", code: "HSC-M1-T1" },
          { name: "Responding", code: "HSC-M1-T2" },
          { name: "Prose fiction", code: "HSC-M1-T3" },
          { name: "Poetry", code: "HSC-M1-T4" },
          { name: "Drama, film, media or nonfiction", code: "HSC-M1-T5" },
        ] },
        { name: "Textual conversations", code: "HSC-M2", children: [
          { name: "Understanding", code: "HSC-M2-T1" },
          { name: "Responding", code: "HSC-M2-T2" },
          { name: "Prose fiction and poetry", code: "HSC-M2-T3" },
          { name: "Poetry and film", code: "HSC-M2-T4" },
          { name: "Poetry and drama", code: "HSC-M2-T5" },
          { name: "Drama and nonfiction", code: "HSC-M2-T6" },
          { name: "Prose fiction and film", code: "HSC-M2-T7" },
        ] },
        { name: "Critical study of literature", code: "HSC-M3", children: [
          { name: "Understanding", code: "HSC-M3-T1" },
          { name: "Responding", code: "HSC-M3-T2" },
          { name: "Prose fiction", code: "HSC-M3-T3" },
          { name: "Poetry", code: "HSC-M3-T4" },
          { name: "Drama", code: "HSC-M3-T5" },
        ] },
        { name: "The craft of writing", code: "HSC-M4", children: [
          { name: "Understanding", code: "HSC-M4-T1" },
          { name: "Responding", code: "HSC-M4-T2" },
        ] },
      ] },
    ],
  }),
  template({
    id: "english-extension",
    name: "English Extension",
    category: "HSC",
    subject: "English Extension",
    curriculum: "NSW Stage 6 (NESA)",
    version_year: "2024",
    description: "NSW Stage 6 English Extension (2024). Year 11 and Year 12 syllabus modules and their topics.",
    hierarchy: ["Year", "Module", "Topic"],
    tags: [
      "critical_analysis", "essay", "extended_response", "independent_research", "creative_writing", "reflection", "literary_theory", "comparative_study", "close_reading", "thesis", "major_work", "proposal", "source_analysis", "short_answer", "multiple_choice",
    ],
    nodes: [
      { name: "Year 11", code: "PRE", children: [
        { name: "Texts, culture and value", code: "PRE-M1", children: [
          { name: "Related research project", code: "PRE-M1-T1" },
          { name: "Understanding", code: "PRE-M1-T2" },
          { name: "Responding", code: "PRE-M1-T3" },
        ] },
      ] },
      { name: "Year 12 – Extension 1", code: "HSC-E1", children: [
        { name: "Literary worlds", code: "HSC-E1-M1", children: [
          { name: "Understanding", code: "HSC-E1-M1-T1" },
          { name: "Responding", code: "HSC-E1-M1-T2" },
          { name: "Elective 1: Confessional worlds", code: "HSC-E1-M1-T3" },
          { name: "Elective 2: Historical worlds", code: "HSC-E1-M1-T4" },
          { name: "Elective 3: Hybrid worlds", code: "HSC-E1-M1-T5" },
          { name: "Elective 4: Natural worlds", code: "HSC-E1-M1-T6" },
          { name: "Elective 5: Shakespearean worlds", code: "HSC-E1-M1-T7" },
        ] },
      ] },
      { name: "Year 12 – Extension 2", code: "HSC-E2", children: [
        { name: "Author and authority", code: "HSC-E2-M1", children: [
          { name: "Author study", code: "HSC-E2-M1-T1" },
          { name: "Understanding", code: "HSC-E2-M1-T2" },
          { name: "Responding", code: "HSC-E2-M1-T3" },
          { name: "Author study", code: "HSC-E2-M1-T4" },
        ] },
        { name: "Major work", code: "HSC-E2-M2", children: [
          { name: "Understanding", code: "HSC-E2-M2-T1" },
          { name: "Responding", code: "HSC-E2-M2-T2" },
        ] },
      ] },
    ],
  }),
  template({
    id: "english-standard",
    name: "English Standard",
    category: "HSC",
    subject: "English Standard",
    curriculum: "NSW Stage 6 (NESA)",
    version_year: "2024",
    description: "NSW Stage 6 English Standard (2024). Year 11 and Year 12 syllabus modules and their topics.",
    hierarchy: ["Year", "Module", "Topic"],
    tags: [
      "textual_analysis", "essay", "extended_response", "creative_writing", "reflection", "close_reading", "comprehension", "context", "evidence", "imaginative_writing", "multimodal", "media_analysis", "short_answer", "multiple_choice", "response_to_text",
    ],
    nodes: [
      { name: "Year 11", code: "PRE", children: [
        { name: "Reading to write: Transition to English Standard", code: "PRE-M1", children: [
          { name: "Understanding", code: "PRE-M1-T1" },
          { name: "Responding", code: "PRE-M1-T2" },
        ] },
        { name: "Contemporary possibilities", code: "PRE-M2", children: [
          { name: "Understanding", code: "PRE-M2-T1" },
          { name: "Responding", code: "PRE-M2-T2" },
        ] },
        { name: "Close study of literature", code: "PRE-M3", children: [
          { name: "Understanding", code: "PRE-M3-T1" },
          { name: "Responding", code: "PRE-M3-T2" },
        ] },
      ] },
      { name: "Year 12", code: "HSC", children: [
        { name: "Texts and human experiences", code: "HSC-M1", children: [
          { name: "Understanding", code: "HSC-M1-T1" },
          { name: "Responding", code: "HSC-M1-T2" },
          { name: "Prose fiction", code: "HSC-M1-T3" },
          { name: "Poetry", code: "HSC-M1-T4" },
          { name: "Drama, film, media or nonfiction", code: "HSC-M1-T5" },
        ] },
        { name: "Language, identity and culture", code: "HSC-M2", children: [
          { name: "Understanding", code: "HSC-M2-T1" },
          { name: "Responding", code: "HSC-M2-T2" },
          { name: "Prose fiction", code: "HSC-M2-T3" },
          { name: "Poetry", code: "HSC-M2-T4" },
          { name: "Drama, film, media or nonfiction", code: "HSC-M2-T5" },
        ] },
        { name: "Close study of literature", code: "HSC-M3", children: [
          { name: "Understanding", code: "HSC-M3-T1" },
          { name: "Responding", code: "HSC-M3-T2" },
          { name: "Prose fiction", code: "HSC-M3-T3" },
          { name: "Poetry", code: "HSC-M3-T4" },
          { name: "Drama, film, media or nonfiction", code: "HSC-M3-T5" },
        ] },
        { name: "The craft of writing", code: "HSC-M4", children: [
          { name: "Understanding", code: "HSC-M4-T1" },
          { name: "Responding", code: "HSC-M4-T2" },
        ] },
      ] },
    ],
  }),
  template({
    id: "english-studies",
    name: "English Studies",
    category: "HSC",
    subject: "English Studies",
    curriculum: "NSW Stage 6 (NESA)",
    version_year: "2024",
    description: "NSW Stage 6 English Studies (2024). Year 11 and Year 12 syllabus modules and their topics.",
    hierarchy: ["Year", "Module", "Topic"],
    tags: [
      "comprehension", "functional_writing", "workplace_communication", "media_analysis", "reflection", "creative_writing", "multimodal", "oral_presentation", "portfolio", "reading", "writing", "viewing", "short_answer", "multiple_choice", "extended_response",
    ],
    nodes: [
      { name: "Year 11", code: "PRE", children: [
        { name: "Reading to write: Transition to English Studies", code: "PRE-M1", children: [
          { name: "Understanding", code: "PRE-M1-T1" },
          { name: "Responding", code: "PRE-M1-T2" },
        ] },
        { name: "Elective focus areas", code: "PRE-M2" },
        { name: "Elective A: Voices of Australia", code: "PRE-M3", children: [
          { name: "Understanding", code: "PRE-M3-T1" },
          { name: "Responding", code: "PRE-M3-T2" },
        ] },
        { name: "Elective B: Media and influence", code: "PRE-M4", children: [
          { name: "Understanding", code: "PRE-M4-T1" },
          { name: "Responding", code: "PRE-M4-T2" },
        ] },
        { name: "Elective C: On the road", code: "PRE-M5", children: [
          { name: "Understanding", code: "PRE-M5-T1" },
          { name: "Responding", code: "PRE-M5-T2" },
        ] },
        { name: "Elective D: Playing the game", code: "PRE-M6", children: [
          { name: "Understanding", code: "PRE-M6-T1" },
          { name: "Responding", code: "PRE-M6-T2" },
        ] },
        { name: "Elective E: Lyrical voices", code: "PRE-M7", children: [
          { name: "Understanding", code: "PRE-M7-T1" },
          { name: "Responding", code: "PRE-M7-T2" },
        ] },
        { name: "Elective F: Everyday heroes", code: "PRE-M8", children: [
          { name: "Understanding", code: "PRE-M8-T1" },
          { name: "Responding", code: "PRE-M8-T2" },
        ] },
        { name: "Elective G: Part of a family", code: "PRE-M9", children: [
          { name: "Understanding", code: "PRE-M9-T1" },
          { name: "Responding", code: "PRE-M9-T2" },
        ] },
        { name: "Elective H: Uncovering the truth", code: "PRE-M10", children: [
          { name: "Understanding", code: "PRE-M10-T1" },
          { name: "Responding", code: "PRE-M10-T2" },
        ] },
        { name: "Elective I: The big screen", code: "PRE-M11", children: [
          { name: "Understanding", code: "PRE-M11-T1" },
          { name: "Responding", code: "PRE-M11-T2" },
        ] },
        { name: "Elective J: Representing the past", code: "PRE-M12", children: [
          { name: "Understanding", code: "PRE-M12-T1" },
          { name: "Responding", code: "PRE-M12-T2" },
        ] },
        { name: "Elective K: Achieving through English – English in education, work and community", code: "PRE-M13", children: [
          { name: "Understanding", code: "PRE-M13-T1" },
          { name: "Responding", code: "PRE-M13-T2" },
        ] },
      ] },
      { name: "Year 12", code: "HSC", children: [
        { name: "Narrative and human experiences", code: "HSC-M1", children: [
          { name: "Understanding", code: "HSC-M1-T1" },
          { name: "Responding", code: "HSC-M1-T2" },
          { name: "Prose fiction", code: "HSC-M1-T3" },
          { name: "Poetry", code: "HSC-M1-T4" },
          { name: "Drama, film, media or nonfiction", code: "HSC-M1-T5" },
        ] },
        { name: "Writing for purpose", code: "HSC-M2", children: [
          { name: "Understanding", code: "HSC-M2-T1" },
          { name: "Responding", code: "HSC-M2-T2" },
          { name: "Short prescribed texts", code: "HSC-M2-T3" },
        ] },
        { name: "Elective focus areas", code: "HSC-M3" },
        { name: "Elective A: Voices of Australia", code: "HSC-M4", children: [
          { name: "Understanding", code: "HSC-M4-T1" },
          { name: "Responding", code: "HSC-M4-T2" },
        ] },
        { name: "Elective B: Media and influence", code: "HSC-M5", children: [
          { name: "Understanding", code: "HSC-M5-T1" },
          { name: "Responding", code: "HSC-M5-T2" },
        ] },
        { name: "Elective C: On the road", code: "HSC-M6", children: [
          { name: "Understanding", code: "HSC-M6-T1" },
          { name: "Responding", code: "HSC-M6-T2" },
        ] },
        { name: "Elective D: Playing the game", code: "HSC-M7", children: [
          { name: "Understanding", code: "HSC-M7-T1" },
          { name: "Responding", code: "HSC-M7-T2" },
        ] },
        { name: "Elective E: Lyrical voices", code: "HSC-M8", children: [
          { name: "Understanding", code: "HSC-M8-T1" },
          { name: "Responding", code: "HSC-M8-T2" },
        ] },
        { name: "Elective F: Everyday heroes", code: "HSC-M9", children: [
          { name: "Understanding", code: "HSC-M9-T1" },
          { name: "Responding", code: "HSC-M9-T2" },
        ] },
        { name: "Elective G: Part of a family", code: "HSC-M10", children: [
          { name: "Understanding", code: "HSC-M10-T1" },
          { name: "Responding", code: "HSC-M10-T2" },
        ] },
        { name: "Elective H: Uncovering the truth", code: "HSC-M11", children: [
          { name: "Understanding", code: "HSC-M11-T1" },
          { name: "Responding", code: "HSC-M11-T2" },
        ] },
        { name: "Elective I: The big screen", code: "HSC-M12", children: [
          { name: "Understanding", code: "HSC-M12-T1" },
          { name: "Responding", code: "HSC-M12-T2" },
        ] },
        { name: "Elective J: Representing the past", code: "HSC-M13", children: [
          { name: "Understanding", code: "HSC-M13-T1" },
          { name: "Responding", code: "HSC-M13-T2" },
        ] },
        { name: "Elective K: Achieving through English – English in education, work and community", code: "HSC-M14", children: [
          { name: "Understanding", code: "HSC-M14-T1" },
          { name: "Responding", code: "HSC-M14-T2" },
        ] },
      ] },
    ],
  }),
  template({
    id: "enterprise-computing",
    name: "Enterprise Computing",
    category: "HSC",
    subject: "Enterprise Computing",
    curriculum: "NSW Stage 6 (NESA)",
    version_year: "2022",
    description: "NSW Stage 6 Enterprise Computing (2022). Year 11 and Year 12 syllabus modules and their topics.",
    hierarchy: ["Year", "Module", "Topic"],
    tags: [
      "programming", "algorithm_design", "data_modelling", "database", "networking", "cybersecurity", "user_experience", "problem_solving", "systems_analysis", "project_management", "evaluation", "documentation", "calculation", "multiple_choice", "short_answer",
    ],
    nodes: [
      { name: "Year 11", code: "PRE", children: [
        { name: "Interactive media and the user experience", code: "PRE-M1", children: [
          { name: "Ubiquity of interactive media", code: "PRE-M1-T1" },
          { name: "Capture, store and integrate data", code: "PRE-M1-T2" },
          { name: "Create interactive media systems", code: "PRE-M1-T3" },
        ] },
        { name: "Networking systems and social computing", code: "PRE-M2", children: [
          { name: "Introduction to human-centric computing", code: "PRE-M2-T1" },
          { name: "Storage and workflow in enterprise networks", code: "PRE-M2-T2" },
          { name: "Network architecture and infrastructure", code: "PRE-M2-T3" },
          { name: "Creating a network", code: "PRE-M2-T4" },
        ] },
        { name: "Principles of cybersecurity", code: "PRE-M3", children: [
          { name: "Understanding privacy and security", code: "PRE-M3-T1" },
          { name: "Security awareness", code: "PRE-M3-T2" },
          { name: "Cyber law and ethics", code: "PRE-M3-T3" },
        ] },
      ] },
      { name: "Year 12", code: "HSC", children: [
        { name: "Data science", code: "HSC-M1", children: [
          { name: "Collecting, storing and analysing data", code: "HSC-M1-T1" },
          { name: "Data quality", code: "HSC-M1-T2" },
          { name: "Processing and presenting data", code: "HSC-M1-T3" },
        ] },
        { name: "Data visualisation", code: "HSC-M2", children: [
          { name: "Using data to tell a story", code: "HSC-M2-T1" },
          { name: "Interpreting data visualisations", code: "HSC-M2-T2" },
          { name: "Designing for user experience", code: "HSC-M2-T3" },
          { name: "Creating data visualisations", code: "HSC-M2-T4" },
        ] },
        { name: "Intelligent systems", code: "HSC-M3", children: [
          { name: "Systems and their applications", code: "HSC-M3-T1" },
          { name: "Data and intelligent systems", code: "HSC-M3-T2" },
          { name: "Creating intelligent systems", code: "HSC-M3-T3" },
        ] },
        { name: "Enterprise project", code: "HSC-M4", children: [
          { name: "Identifying and defining", code: "HSC-M4-T1" },
          { name: "Researching and planning", code: "HSC-M4-T2" },
          { name: "Producing and implementing", code: "HSC-M4-T3" },
          { name: "Testing and evaluating", code: "HSC-M4-T4" },
        ] },
      ] },
    ],
  }),
  template({
    id: "geography",
    name: "Geography",
    category: "HSC",
    subject: "Geography",
    curriculum: "NSW Stage 6 (NESA)",
    version_year: "2022",
    description: "NSW Stage 6 Geography (2022). Year 11 and Year 12 syllabus modules and their topics.",
    hierarchy: ["Year", "Module", "Topic"],
    tags: [
      "data_analysis", "fieldwork", "mapping", "spatial_technologies", "graphing", "explanation", "evaluation", "case_study", "stimulus_analysis", "calculation", "sustainability", "extended_response", "short_answer", "multiple_choice", "action_required",
    ],
    nodes: [
      { name: "Year 11", code: "PRE", children: [
        { name: "Geographical inquiry skills", code: "PRE-M1", children: [
          { name: "Acquiring geographical information", code: "PRE-M1-T1" },
          { name: "Processing geographical information", code: "PRE-M1-T2" },
          { name: "Applying geographical understanding", code: "PRE-M1-T3" },
          { name: "Communicating geographical understanding", code: "PRE-M1-T4" },
        ] },
        { name: "Geographical tools", code: "PRE-M2", children: [
          { name: "Maps", code: "PRE-M2-T1" },
          { name: "Fieldwork", code: "PRE-M2-T2" },
          { name: "Graphs and statistics", code: "PRE-M2-T3" },
          { name: "Spatial technologies", code: "PRE-M2-T4" },
          { name: "Visual representations", code: "PRE-M2-T5" },
        ] },
        { name: "Earth’s natural systems", code: "PRE-M3", children: [
          { name: "Overview of the uniqueness and diversity of the Earth", code: "PRE-M3-T1" },
          { name: "Processes, cycles and circulations connecting natural systems", code: "PRE-M3-T2" },
          { name: "Natural systems and land cover change", code: "PRE-M3-T3" },
        ] },
        { name: "People, patterns and processes", code: "PRE-M4", children: [
          { name: "Overview of the diversity and extent of human activity", code: "PRE-M4-T1" },
          { name: "Population and resource consumption", code: "PRE-M4-T2" },
          { name: "People, patterns and processes study", code: "PRE-M4-T3" },
          { name: "Study 1: Human resilience in diverse environments", code: "PRE-M4-T4" },
          { name: "Study 2: Local places and global economic change", code: "PRE-M4-T5" },
          { name: "Study 3: Place and cultural change", code: "PRE-M4-T6" },
          { name: "Study 4: Political power and contested spaces", code: "PRE-M4-T7" },
          { name: "Study 5: Technological advances and the transformation of places", code: "PRE-M4-T8" },
        ] },
        { name: "Human–environment interactions", code: "PRE-M5", children: [
          { name: "Overview of change to Earth’s natural systems over time", code: "PRE-M5-T1" },
          { name: "Land use and land cover change", code: "PRE-M5-T2" },
          { name: "Human–environment interactions study", code: "PRE-M5-T3" },
          { name: "Study 1: A geographic region", code: "PRE-M5-T4" },
          { name: "Study 2: A contemporary hazard", code: "PRE-M5-T5" },
          { name: "Study 3: Climate change", code: "PRE-M5-T6" },
        ] },
        { name: "Geographical investigation", code: "PRE-M6" },
      ] },
      { name: "Year 12", code: "HSC", children: [
        { name: "Geographical inquiry skills", code: "HSC-M1", children: [
          { name: "Acquiring geographical information", code: "HSC-M1-T1" },
          { name: "Processing geographical information", code: "HSC-M1-T2" },
          { name: "Applying geographical understanding", code: "HSC-M1-T3" },
          { name: "Communicating geographical understanding", code: "HSC-M1-T4" },
        ] },
        { name: "Geographical tools", code: "HSC-M2", children: [
          { name: "Maps", code: "HSC-M2-T1" },
          { name: "Fieldwork", code: "HSC-M2-T2" },
          { name: "Graphs and statistics", code: "HSC-M2-T3" },
          { name: "Spatial technologies", code: "HSC-M2-T4" },
          { name: "Visual representations", code: "HSC-M2-T5" },
        ] },
        { name: "Global sustainability", code: "HSC-M3", children: [
          { name: "Sustainability in the contemporary world", code: "HSC-M3-T1" },
          { name: "Evaluating sustainability", code: "HSC-M3-T2" },
          { name: "Investigation of a global economic activity", code: "HSC-M3-T3" },
        ] },
        { name: "Rural and urban places", code: "HSC-M4", children: [
          { name: "Rural and urban settlement", code: "HSC-M4-T1" },
          { name: "Investigation of a rural and an urban place", code: "HSC-M4-T2" },
          { name: "Investigation of a large city outside Australia", code: "HSC-M4-T3" },
        ] },
        { name: "Ecosystems and global biodiversity", code: "HSC-M5", children: [
          { name: "Ecosystems and biodiversity", code: "HSC-M5-T1" },
          { name: "Investigation of ecosystems", code: "HSC-M5-T2" },
        ] },
      ] },
    ],
  }),
  template({
    id: "legal-studies",
    name: "Legal Studies",
    category: "HSC",
    subject: "Legal Studies",
    curriculum: "NSW Stage 6 (NESA)",
    version_year: "2025",
    description: "NSW Stage 6 Legal Studies (2025). Year 11 and Year 12 syllabus modules and their topics.",
    hierarchy: ["Year", "Module", "Topic"],
    tags: [
      "legal_reasoning", "case_analysis", "legislation_analysis", "scenario_application", "evaluation", "explanation", "essay", "extended_response", "media_analysis", "contemporary_issues", "comparison", "legal_terminology", "short_answer", "multiple_choice", "action_required",
    ],
    nodes: [
      { name: "Year 11", code: "PRE", children: [
        { name: "Legal themes and skills", code: "PRE-M1", children: [
          { name: "Legal themes", code: "PRE-M1-T1" },
          { name: "Analysis and use of sources", code: "PRE-M1-T2" },
          { name: "Interpretation", code: "PRE-M1-T3" },
          { name: "Investigation and research", code: "PRE-M1-T4" },
          { name: "Evaluation", code: "PRE-M1-T5" },
        ] },
        { name: "Investigating the law", code: "PRE-M2", children: [
          { name: "Legal foundations", code: "PRE-M2-T1" },
          { name: "Aboriginal and Torres Strait Islander Customary Lore", code: "PRE-M2-T2" },
          { name: "Sources of law", code: "PRE-M2-T3" },
          { name: "Legal institutions", code: "PRE-M2-T4" },
          { name: "The constitutional framework", code: "PRE-M2-T5" },
          { name: "The global legal system", code: "PRE-M2-T6" },
          { name: "Legal rights", code: "PRE-M2-T7" },
        ] },
        { name: "Disputes under the law", code: "PRE-M3", children: [
          { name: "Criminal law", code: "PRE-M3-T1" },
          { name: "Civil law", code: "PRE-M3-T2" },
          { name: "Disputes with the state", code: "PRE-M3-T3" },
        ] },
        { name: "Changing the law", code: "PRE-M4", children: [
          { name: "Reasons for change", code: "PRE-M4-T1" },
          { name: "Drivers of change", code: "PRE-M4-T2" },
          { name: "Processes of change", code: "PRE-M4-T3" },
          { name: "Outcomes of change", code: "PRE-M4-T4" },
          { name: "Case study 1: The recognition of land rights in NSW and native title for Aboriginal and Torres Strait Islander Peoples", code: "PRE-M4-T5" },
          { name: "Case study 2: An area of law reform", code: "PRE-M4-T6" },
        ] },
        { name: "Experiences with the law", code: "PRE-M5" },
        { name: "Case study 1: Young people", code: "PRE-M6", children: [
          { name: "The nature of the experience", code: "PRE-M6-T1" },
          { name: "Access to justice", code: "PRE-M6-T2" },
          { name: "Responsiveness of the legal system", code: "PRE-M6-T3" },
        ] },
        { name: "Case study 2: ONE group in society", code: "PRE-M7", children: [
          { name: "The nature of the experience", code: "PRE-M7-T1" },
          { name: "Access to justice", code: "PRE-M7-T2" },
          { name: "Responsiveness of the legal system", code: "PRE-M7-T3" },
        ] },
      ] },
      { name: "Year 12", code: "HSC", children: [
        { name: "Legal themes and skills", code: "HSC-M1", children: [
          { name: "Legal themes", code: "HSC-M1-T1" },
          { name: "Analysis and use of sources", code: "HSC-M1-T2" },
          { name: "Interpretation", code: "HSC-M1-T3" },
          { name: "Investigation and research", code: "HSC-M1-T4" },
          { name: "Evaluation", code: "HSC-M1-T5" },
        ] },
        { name: "The criminal justice system (core)", code: "HSC-M2", children: [
          { name: "The nature of crime", code: "HSC-M2-T1" },
          { name: "Investigation", code: "HSC-M2-T2" },
          { name: "Pre-trial", code: "HSC-M2-T3" },
          { name: "Trial", code: "HSC-M2-T4" },
          { name: "Sentencing", code: "HSC-M2-T5" },
          { name: "Post-sentencing", code: "HSC-M2-T6" },
        ] },
        { name: "International relations and human rights (core)", code: "HSC-M3", children: [
          { name: "The nature of international relations", code: "HSC-M3-T1" },
          { name: "The nature of human rights", code: "HSC-M3-T2" },
          { name: "International protection of human rights", code: "HSC-M3-T3" },
          { name: "Australian protection of human rights", code: "HSC-M3-T4" },
          { name: "Promotion of human rights", code: "HSC-M3-T5" },
        ] },
        { name: "Options", code: "HSC-M4" },
        { name: "Consumer law (option)", code: "HSC-M5", children: [
          { name: "The nature of consumer law", code: "HSC-M5-T1" },
          { name: "Marketing and advertising", code: "HSC-M5-T2" },
          { name: "Credit services", code: "HSC-M5-T3" },
          { name: "Industry standards and product safety", code: "HSC-M5-T4" },
          { name: "Competition in the marketplace", code: "HSC-M5-T5" },
        ] },
        { name: "Family law (option)", code: "HSC-M6", children: [
          { name: "The nature of family law", code: "HSC-M6-T1" },
          { name: "Family relationships", code: "HSC-M6-T2" },
          { name: "Children", code: "HSC-M6-T3" },
          { name: "Conflict", code: "HSC-M6-T4" },
          { name: "Protection", code: "HSC-M6-T5" },
        ] },
        { name: "Housing law (option)", code: "HSC-M7", children: [
          { name: "The nature of housing law", code: "HSC-M7-T1" },
          { name: "Securing a home", code: "HSC-M7-T2" },
          { name: "Conflict", code: "HSC-M7-T3" },
          { name: "Housing affordability", code: "HSC-M7-T4" },
          { name: "Homelessness", code: "HSC-M7-T5" },
        ] },
        { name: "Peace, conflict and the law (option)", code: "HSC-M8", children: [
          { name: "The nature of peace and conflict", code: "HSC-M8-T1" },
          { name: "Global cooperation", code: "HSC-M8-T2" },
          { name: "War and conflict", code: "HSC-M8-T3" },
          { name: "Implications of conflict", code: "HSC-M8-T4" },
          { name: "Maintaining peace and security", code: "HSC-M8-T5" },
        ] },
        { name: "Workplace law (option)", code: "HSC-M9", children: [
          { name: "The nature of workplace law", code: "HSC-M9-T1" },
          { name: "Safety", code: "HSC-M9-T2" },
          { name: "Fair pay", code: "HSC-M9-T3" },
          { name: "Leave", code: "HSC-M9-T4" },
          { name: "Discrimination and termination", code: "HSC-M9-T5" },
        ] },
      ] },
    ],
  }),
  template({
    id: "mathematics-advanced",
    name: "Mathematics Advanced",
    category: "HSC",
    subject: "Mathematics Advanced",
    curriculum: "NSW Stage 6 (NESA)",
    version_year: "2024",
    description: "NSW Stage 6 Mathematics Advanced (2024). Year 11 and Year 12 syllabus modules and their topics.",
    hierarchy: ["Year", "Module", "Topic"],
    tags: [
      "calculation", "algebraic_manipulation", "graphing", "proof", "problem_solving", "modelling", "interpretation", "calculus", "trigonometry", "functions", "probability", "statistics", "short_answer", "extended_response", "multiple_choice",
    ],
    nodes: [
      { name: "Year 11", code: "PRE", children: [
        { name: "Working with functions", code: "PRE-M1", children: [
          { name: "Algebraic techniques", code: "PRE-M1-T1" },
          { name: "Introduction to functions and relations", code: "PRE-M1-T2" },
          { name: "Linear functions", code: "PRE-M1-T3" },
          { name: "Quadratic and cubic functions", code: "PRE-M1-T4" },
          { name: "Reciprocal functions", code: "PRE-M1-T5" },
          { name: "Constructing and using functions", code: "PRE-M1-T6" },
          { name: "Direct and inverse variation", code: "PRE-M1-T7" },
          { name: "Circles and semicircles", code: "PRE-M1-T8" },
          { name: "Properties of functions, relations and graphs", code: "PRE-M1-T9" },
          { name: "Piecewise-defined functions", code: "PRE-M1-T10" },
          { name: "Absolute value functions", code: "PRE-M1-T11" },
        ] },
        { name: "Trigonometry and measure of angles", code: "PRE-M2", children: [
          { name: "Trigonometry with acute angles", code: "PRE-M2-T1" },
          { name: "Trigonometry with angles of any magnitude", code: "PRE-M2-T2" },
          { name: "Radians", code: "PRE-M2-T3" },
        ] },
        { name: "Trigonometric identities and equations", code: "PRE-M3" },
        { name: "Introduction to differentiation", code: "PRE-M4", children: [
          { name: "Estimating change", code: "PRE-M4-T1" },
          { name: "The derivative", code: "PRE-M4-T2" },
          { name: "Calculations with the derivative", code: "PRE-M4-T3" },
          { name: "Graphical applications of the derivative", code: "PRE-M4-T4" },
          { name: "The derivative as a rate of change", code: "PRE-M4-T5" },
        ] },
        { name: "Exponential and logarithmic functions", code: "PRE-M5", children: [
          { name: "Exponential functions", code: "PRE-M5-T1" },
          { name: "Logarithmic functions", code: "PRE-M5-T2" },
        ] },
        { name: "Graph transformations", code: "PRE-M6" },
        { name: "Probability and data", code: "PRE-M7", children: [
          { name: "Sets and set notation", code: "PRE-M7-T1" },
          { name: "Probability", code: "PRE-M7-T2" },
          { name: "Conditional probability", code: "PRE-M7-T3" },
          { name: "Data", code: "PRE-M7-T4" },
        ] },
      ] },
      { name: "Year 12", code: "HSC", children: [
        { name: "Further graph transformations and modelling", code: "HSC-M1", children: [
          { name: "Transformations of trigonometric functions", code: "HSC-M1-T1" },
          { name: "Modelling with functions", code: "HSC-M1-T2" },
        ] },
        { name: "Sequences and series", code: "HSC-M2", children: [
          { name: "Sequences and series", code: "HSC-M2-T1" },
          { name: "Arithmetic sequences and series", code: "HSC-M2-T2" },
          { name: "Geometric sequences and series", code: "HSC-M2-T3" },
        ] },
        { name: "Differential calculus", code: "HSC-M3", children: [
          { name: "Differentiation with exponential functions", code: "HSC-M3-T1" },
          { name: "Differentiation with logarithmic functions", code: "HSC-M3-T2" },
          { name: "Differentiation with trigonometric functions", code: "HSC-M3-T3" },
          { name: "Using derivatives", code: "HSC-M3-T4" },
        ] },
        { name: "Integral calculus", code: "HSC-M4", children: [
          { name: "Primitive functions", code: "HSC-M4-T1" },
          { name: "The definite integral", code: "HSC-M4-T2" },
          { name: "The Fundamental Theorem of Calculus", code: "HSC-M4-T3" },
          { name: "Indefinite integrals", code: "HSC-M4-T4" },
          { name: "Integration with exponential functions", code: "HSC-M4-T5" },
          { name: "Integration with logarithmic functions", code: "HSC-M4-T6" },
          { name: "Integration with trigonometric functions", code: "HSC-M4-T7" },
          { name: "Areas and the definite integral", code: "HSC-M4-T8" },
        ] },
        { name: "Applications of calculus", code: "HSC-M5", children: [
          { name: "Turning points, inflections and graphing", code: "HSC-M5-T1" },
          { name: "Optimisation", code: "HSC-M5-T2" },
          { name: "Rates of change", code: "HSC-M5-T3" },
        ] },
        { name: "Random variables", code: "HSC-M6", children: [
          { name: "Discrete random variables", code: "HSC-M6-T1" },
          { name: "Continuous random variables", code: "HSC-M6-T2" },
          { name: "The normal distribution", code: "HSC-M6-T3" },
        ] },
        { name: "Financial mathematics", code: "HSC-M7", children: [
          { name: "Reducing balance loans", code: "HSC-M7-T1" },
          { name: "Annuities", code: "HSC-M7-T2" },
        ] },
      ] },
    ],
  }),
  template({
    id: "mathematics-extension-1",
    name: "Mathematics Extension 1",
    category: "HSC",
    subject: "Mathematics Extension 1",
    curriculum: "NSW Stage 6 (NESA)",
    version_year: "2024",
    description: "NSW Stage 6 Mathematics Extension 1 (2024). Year 11 and Year 12 syllabus modules and their topics.",
    hierarchy: ["Year", "Module", "Topic"],
    tags: [
      "calculation", "proof", "algebraic_manipulation", "graphing", "problem_solving", "modelling", "vectors", "calculus", "trigonometry", "combinatorics", "binomial", "distributions", "short_answer", "extended_response", "multiple_choice",
    ],
    nodes: [
      { name: "Year 11", code: "PRE", children: [
        { name: "Further work with functions", code: "PRE-M1", children: [
          { name: "Graphical relationships", code: "PRE-M1-T1" },
          { name: "Inverse functions", code: "PRE-M1-T2" },
          { name: "Parametric form of a function or relation", code: "PRE-M1-T3" },
          { name: "Inequalities", code: "PRE-M1-T4" },
        ] },
        { name: "Polynomials", code: "PRE-M2", children: [
          { name: "Language and graphs of polynomials", code: "PRE-M2-T1" },
          { name: "Remainder and factor theorems", code: "PRE-M2-T2" },
          { name: "Sums and products of zeroes of polynomials", code: "PRE-M2-T3" },
        ] },
        { name: "Further trigonometry", code: "PRE-M3", children: [
          { name: "Trigonometry in three dimensions", code: "PRE-M3-T1" },
          { name: "Further trigonometric identities", code: "PRE-M3-T2" },
          { name: "Further trigonometric equations", code: "PRE-M3-T3" },
        ] },
        { name: "Permutations and combinations", code: "PRE-M4" },
        { name: "The binomial theorem", code: "PRE-M5" },
      ] },
      { name: "Year 12", code: "HSC", children: [
        { name: "Proof by mathematical induction", code: "HSC-M1" },
        { name: "Introduction to vectors", code: "HSC-M2", children: [
          { name: "Vector representation and notation", code: "HSC-M2-T1" },
          { name: "Introduction to 2D and 3D vectors", code: "HSC-M2-T2" },
          { name: "Operating with vectors", code: "HSC-M2-T3" },
          { name: "Further operations with vectors", code: "HSC-M2-T4" },
          { name: "Motion in vector form in two dimensions", code: "HSC-M2-T5" },
          { name: "Projectile motion", code: "HSC-M2-T6" },
        ] },
        { name: "Inverse trigonometric functions", code: "HSC-M3", children: [
          { name: "Definitions of inverse trigonometric functions", code: "HSC-M3-T1" },
          { name: "Graphs of inverse trigonometric functions", code: "HSC-M3-T2" },
        ] },
        { name: "Further calculus skills", code: "HSC-M4", children: [
          { name: "Further derivatives of functions", code: "HSC-M4-T1" },
          { name: "Techniques of integration", code: "HSC-M4-T2" },
        ] },
        { name: "Further applications of calculus", code: "HSC-M5", children: [
          { name: "Multiplicity of zeroes of polynomial functions", code: "HSC-M5-T1" },
          { name: "Further rates of change", code: "HSC-M5-T2" },
          { name: "Areas between curves and volumes of solids of revolution", code: "HSC-M5-T3" },
          { name: "Differential equations", code: "HSC-M5-T4" },
        ] },
        { name: "The binomial distribution and sampling distribution of the mean", code: "HSC-M6", children: [
          { name: "Bernoulli distributions", code: "HSC-M6-T1" },
          { name: "Binomial distributions", code: "HSC-M6-T2" },
          { name: "Sampling distribution of the mean and the central limit theorem", code: "HSC-M6-T3" },
        ] },
      ] },
    ],
  }),
  template({
    id: "mathematics-extension-2",
    name: "Mathematics Extension 2",
    category: "HSC",
    subject: "Mathematics Extension 2",
    curriculum: "NSW Stage 6 (NESA)",
    version_year: "2024",
    description: "NSW Stage 6 Mathematics Extension 2 (2024). Year 11 and Year 12 syllabus modules and their topics.",
    hierarchy: ["Year", "Module", "Topic"],
    tags: [
      "proof", "complex_numbers", "vectors", "integration", "mechanics", "calculus", "algebraic_manipulation", "graphing", "problem_solving", "modelling", "derivation", "rigorous_argument", "short_answer", "extended_response", "multiple_choice",
    ],
    nodes: [
      { name: "Year 12", code: "HSC", children: [
        { name: "The nature of proof", code: "HSC-M1", children: [
          { name: "The language and notation of proof", code: "HSC-M1-T1" },
          { name: "Illustrations of proofs", code: "HSC-M1-T2" },
          { name: "Proof of inequalities", code: "HSC-M1-T3" },
          { name: "Further proof by mathematical induction", code: "HSC-M1-T4" },
        ] },
        { name: "Further work with vectors", code: "HSC-M2", children: [
          { name: "Vector equations of lines and curves", code: "HSC-M2-T1" },
          { name: "Vectors and geometry", code: "HSC-M2-T2" },
        ] },
        { name: "Introduction to complex numbers", code: "HSC-M3", children: [
          { name: "Arithmetic of complex numbers", code: "HSC-M3-T1" },
          { name: "Geometric representation of complex numbers", code: "HSC-M3-T2" },
          { name: "Solving equations with complex numbers", code: "HSC-M3-T3" },
          { name: "Powers and roots of complex numbers", code: "HSC-M3-T4" },
          { name: "Describing lines, curves and regions", code: "HSC-M3-T5" },
        ] },
        { name: "Further integration", code: "HSC-M4" },
        { name: "Applications of calculus to mechanics", code: "HSC-M5", children: [
          { name: "Forces and further motion in a straight line", code: "HSC-M5-T1" },
          { name: "Simple harmonic motion", code: "HSC-M5-T2" },
          { name: "Modelling motion without resistance", code: "HSC-M5-T3" },
          { name: "Rectilinear resisted motion", code: "HSC-M5-T4" },
          { name: "Vertical resisted motion", code: "HSC-M5-T5" },
          { name: "Projectiles and resisted motion", code: "HSC-M5-T6" },
        ] },
      ] },
    ],
  }),
  template({
    id: "mathematics-standard",
    name: "Mathematics Standard",
    category: "HSC",
    subject: "Mathematics Standard",
    curriculum: "NSW Stage 6 (NESA)",
    version_year: "2024",
    description: "NSW Stage 6 Mathematics Standard (2024). Year 11 and Year 12 syllabus modules and their topics.",
    hierarchy: ["Year", "Module", "Topic"],
    tags: [
      "calculation", "financial_mathematics", "measurement", "statistics", "probability", "graphing", "networks", "trigonometry", "problem_solving", "modelling", "interpretation", "practical_application", "short_answer", "extended_response", "multiple_choice",
    ],
    nodes: [
      { name: "Year 11", code: "PRE", children: [
        { name: "Formulas and equations", code: "PRE-M1" },
        { name: "Linear relationships", code: "PRE-M2", children: [
          { name: "Linear modelling", code: "PRE-M2-T1" },
          { name: "Direct variation", code: "PRE-M2-T2" },
        ] },
        { name: "Earning money", code: "PRE-M3", children: [
          { name: "Ways of earning", code: "PRE-M3-T1" },
          { name: "Taxation", code: "PRE-M3-T2" },
        ] },
        { name: "Managing money", code: "PRE-M4", children: [
          { name: "Purchasing goods", code: "PRE-M4-T1" },
          { name: "Budgeting", code: "PRE-M4-T2" },
        ] },
        { name: "Applications of measurement", code: "PRE-M5", children: [
          { name: "Practicalities of measurement", code: "PRE-M5-T1" },
          { name: "Perimeter, area and volume", code: "PRE-M5-T2" },
        ] },
        { name: "Time and location", code: "PRE-M6", children: [
          { name: "Positions on the Earth’s surface", code: "PRE-M6-T1" },
          { name: "Time and time differences", code: "PRE-M6-T2" },
        ] },
        { name: "Networks, paths and trees", code: "PRE-M7", children: [
          { name: "Network concepts", code: "PRE-M7-T1" },
          { name: "Shortest paths and spanning trees", code: "PRE-M7-T2" },
        ] },
        { name: "Data analysis", code: "PRE-M8", children: [
          { name: "Statistical investigation process", code: "PRE-M8-T1" },
          { name: "Population and sample", code: "PRE-M8-T2" },
          { name: "Data classification", code: "PRE-M8-T3" },
          { name: "Display and interpret grouped and ungrouped data", code: "PRE-M8-T4" },
          { name: "Measures of centre and spread", code: "PRE-M8-T5" },
          { name: "Quartiles and interquartile range", code: "PRE-M8-T6" },
          { name: "Five-number summary and box plots", code: "PRE-M8-T7" },
          { name: "Clusters and outliers", code: "PRE-M8-T8" },
        ] },
      ] },
      { name: "Year 12 – Standard 1", code: "HSC-S1", children: [
        { name: "Algebraic relationships", code: "HSC-S1-M1", children: [
          { name: "Simultaneous linear equations", code: "HSC-S1-M1-T1" },
          { name: "Graphs of practical situations", code: "HSC-S1-M1-T2" },
        ] },
        { name: "Investment", code: "HSC-S1-M2" },
        { name: "Depreciation and loans", code: "HSC-S1-M3", children: [
          { name: "Depreciation", code: "HSC-S1-M3-T1" },
          { name: "Loans", code: "HSC-S1-M3-T2" },
          { name: "Credit cards", code: "HSC-S1-M3-T3" },
        ] },
        { name: "Right-angled triangles", code: "HSC-S1-M4" },
        { name: "Ratios and rates", code: "HSC-S1-M5", children: [
          { name: "Ratios", code: "HSC-S1-M5-T1" },
          { name: "Rates", code: "HSC-S1-M5-T2" },
        ] },
        { name: "Bivariate data analysis", code: "HSC-S1-M6", children: [
          { name: "Bivariate datasets", code: "HSC-S1-M6-T1" },
          { name: "Scatter plots and lines of best fit", code: "HSC-S1-M6-T2" },
        ] },
        { name: "Relative frequency and probability", code: "HSC-S1-M7" },
      ] },
      { name: "Year 12 – Standard 2", code: "HSC-S2", children: [
        { name: "Algebraic relationships", code: "HSC-S2-M1", children: [
          { name: "Simultaneous linear equations", code: "HSC-S2-M1-T1" },
          { name: "Exponential relationships", code: "HSC-S2-M1-T2" },
          { name: "Quadratic relationships", code: "HSC-S2-M1-T3" },
          { name: "Reciprocal relationships", code: "HSC-S2-M1-T4" },
        ] },
        { name: "Investment and loans", code: "HSC-S2-M2", children: [
          { name: "Investment", code: "HSC-S2-M2-T1" },
          { name: "Depreciation", code: "HSC-S2-M2-T2" },
          { name: "Loans", code: "HSC-S2-M2-T3" },
          { name: "Credit cards", code: "HSC-S2-M2-T4" },
        ] },
        { name: "Annuities", code: "HSC-S2-M3" },
        { name: "Trigonometry", code: "HSC-S2-M4" },
        { name: "Ratios and rates", code: "HSC-S2-M5", children: [
          { name: "Ratios", code: "HSC-S2-M5-T1" },
          { name: "Rates", code: "HSC-S2-M5-T2" },
        ] },
        { name: "Network flow", code: "HSC-S2-M6" },
        { name: "Critical path analysis", code: "HSC-S2-M7" },
        { name: "Bivariate data analysis", code: "HSC-S2-M8", children: [
          { name: "Bivariate datasets", code: "HSC-S2-M8-T1" },
          { name: "Scatter plots and lines of best fit", code: "HSC-S2-M8-T2" },
        ] },
        { name: "Relative frequency and probability", code: "HSC-S2-M9" },
        { name: "The normal distribution", code: "HSC-S2-M10", children: [
          { name: "Normally distributed datasets", code: "HSC-S2-M10-T1" },
          { name: "Calculating z-scores", code: "HSC-S2-M10-T2" },
          { name: "Probability using z-scores", code: "HSC-S2-M10-T3" },
        ] },
      ] },
    ],
  }),
  template({
    id: "modern-history",
    name: "Modern History",
    category: "HSC",
    subject: "Modern History",
    curriculum: "NSW Stage 6 (NESA)",
    version_year: "2024",
    description: "NSW Stage 6 Modern History (2024). Year 11 and Year 12 syllabus modules and their topics.",
    hierarchy: ["Year", "Module", "Topic"],
    tags: [
      "source_analysis", "source_evaluation", "historical_interpretation", "reliability", "historiography", "causation", "continuity_and_change", "significance", "perspectives", "essay", "extended_response", "short_answer", "multiple_choice", "comparison", "terminology",
    ],
    nodes: [
      { name: "Year 11", code: "PRE", children: [
        { name: "Historical concepts and skills 11–12", code: "PRE-M1", children: [
          { name: "Analysis and use of sources", code: "PRE-M1-T1" },
          { name: "Historical interpretation", code: "PRE-M1-T2" },
          { name: "Historical investigation and research", code: "PRE-M1-T3" },
          { name: "Explanation and communication", code: "PRE-M1-T4" },
        ] },
        { name: "Investigating modern history – The nature of modern history", code: "PRE-M2" },
        { name: "The investigation of historic sites and sources", code: "PRE-M3", children: [
          { name: "Investigation", code: "PRE-M3-T1" },
        ] },
        { name: "The contestability of the past", code: "PRE-M4", children: [
          { name: "Investigation", code: "PRE-M4-T1" },
        ] },
        { name: "The construction of modern histories", code: "PRE-M5", children: [
          { name: "Investigation", code: "PRE-M5-T1" },
        ] },
        { name: "The representation and commemoration of the past", code: "PRE-M6", children: [
          { name: "Investigation", code: "PRE-M6-T1" },
        ] },
        { name: "Investigating modern history – Case studies", code: "PRE-M7" },
        { name: "List A: Australia and the rise of communism", code: "PRE-M8", children: [
          { name: "The historical context", code: "PRE-M8-T1" },
          { name: "The nature of the communist presence in Australia and Asia", code: "PRE-M8-T2" },
          { name: "A relevant historical debate or issue", code: "PRE-M8-T3" },
        ] },
        { name: "List A: Making change: The Day of Mourning to the National Apology to the Stolen Generations", code: "PRE-M9", children: [
          { name: "The historical context", code: "PRE-M9-T1" },
          { name: "The nature and impact of the modern Aboriginal political movement", code: "PRE-M9-T2" },
          { name: "A relevant historical debate or issue", code: "PRE-M9-T3" },
        ] },
        { name: "List A: The changing nature of Anglo–Irish relations", code: "PRE-M10", children: [
          { name: "The historical context", code: "PRE-M10-T1" },
          { name: "The nature of Anglo–Irish relations", code: "PRE-M10-T2" },
          { name: "A relevant historical debate or issue", code: "PRE-M10-T3" },
        ] },
        { name: "List A: The decline and fall of the Romanov dynasty", code: "PRE-M11", children: [
          { name: "The historical context", code: "PRE-M11-T1" },
          { name: "The nature of the decline and fall of the Romanov dynasty", code: "PRE-M11-T2" },
          { name: "A relevant historical debate or issue", code: "PRE-M11-T3" },
        ] },
        { name: "List A: The transatlantic slave trade", code: "PRE-M12", children: [
          { name: "The historical context", code: "PRE-M12-T1" },
          { name: "The nature of the transatlantic slave trade", code: "PRE-M12-T2" },
          { name: "A relevant historical debate or issue", code: "PRE-M12-T3" },
        ] },
        { name: "List A: The American Civil War", code: "PRE-M13", children: [
          { name: "The historical context", code: "PRE-M13-T1" },
          { name: "The nature of the American Civil War", code: "PRE-M13-T2" },
          { name: "A relevant historical debate or issue", code: "PRE-M13-T3" },
        ] },
        { name: "List A: The rise of the American environmental movement", code: "PRE-M14", children: [
          { name: "The historical context", code: "PRE-M14-T1" },
          { name: "The nature of the American environmental movement", code: "PRE-M14-T2" },
          { name: "A relevant historical debate or issue", code: "PRE-M14-T3" },
        ] },
        { name: "List A: Women’s movements", code: "PRE-M15", children: [
          { name: "The historical context", code: "PRE-M15-T1" },
          { name: "The nature of women’s movements", code: "PRE-M15-T2" },
          { name: "A relevant historical debate or issue", code: "PRE-M15-T3" },
        ] },
        { name: "List B: The Boxer Rebellion in China", code: "PRE-M16", children: [
          { name: "The historical context", code: "PRE-M16-T1" },
          { name: "The nature and course of the Boxer Rebellion in China", code: "PRE-M16-T2" },
          { name: "A relevant historical debate or issue", code: "PRE-M16-T3" },
        ] },
        { name: "List B: The British in India and Burma", code: "PRE-M17", children: [
          { name: "The historical context", code: "PRE-M17-T1" },
          { name: "Conflict and resistance to British rule", code: "PRE-M17-T2" },
          { name: "A relevant historical debate or issue", code: "PRE-M17-T3" },
        ] },
        { name: "List B: The Meiji Restoration", code: "PRE-M18", children: [
          { name: "The historical context", code: "PRE-M18-T1" },
          { name: "The nature of the Meiji Restoration", code: "PRE-M18-T2" },
          { name: "A relevant historical debate or issue", code: "PRE-M18-T3" },
        ] },
        { name: "List B: Tibet in the modern world", code: "PRE-M19", children: [
          { name: "The historical context", code: "PRE-M19-T1" },
          { name: "The nature of Tibet’s relations with China", code: "PRE-M19-T2" },
          { name: "A relevant historical debate or issue", code: "PRE-M19-T3" },
        ] },
        { name: "List B: Contact in the Pacific", code: "PRE-M20", children: [
          { name: "The historical context", code: "PRE-M20-T1" },
          { name: "The nature and impact of the contact in the Pacific", code: "PRE-M20-T2" },
          { name: "A relevant historical debate or issue", code: "PRE-M20-T3" },
        ] },
        { name: "List B: The making of modern South Africa", code: "PRE-M21", children: [
          { name: "The historical context", code: "PRE-M21-T1" },
          { name: "The nature of modern South Africa 1867–1920", code: "PRE-M21-T2" },
          { name: "A relevant historical debate or issue", code: "PRE-M21-T3" },
        ] },
        { name: "List B: The origins of the Arab–Israeli conflict", code: "PRE-M22", children: [
          { name: "The historical context", code: "PRE-M22-T1" },
          { name: "The nature of tensions in the region", code: "PRE-M22-T2" },
          { name: "A relevant historical debate or issue", code: "PRE-M22-T3" },
        ] },
        { name: "The shaping of the modern world", code: "PRE-M23" },
        { name: "The Age of Enlightenment", code: "PRE-M24", children: [
          { name: "The historical context", code: "PRE-M24-T1" },
          { name: "The nature of the Age of Enlightenment", code: "PRE-M24-T2" },
          { name: "The significance of the Age of Enlightenment", code: "PRE-M24-T3" },
        ] },
        { name: "The French Revolution", code: "PRE-M25", children: [
          { name: "The historical context", code: "PRE-M25-T1" },
          { name: "The nature of the French Revolution", code: "PRE-M25-T2" },
          { name: "The significance of the French Revolution", code: "PRE-M25-T3" },
        ] },
        { name: "The Age of Imperialism", code: "PRE-M26", children: [
          { name: "The historical context", code: "PRE-M26-T1" },
          { name: "The impact of imperialism", code: "PRE-M26-T2" },
          { name: "The significance of imperialism", code: "PRE-M26-T3" },
        ] },
        { name: "The Industrial Age", code: "PRE-M27", children: [
          { name: "The historical context", code: "PRE-M27-T1" },
          { name: "The nature and course of the Industrial Age", code: "PRE-M27-T2" },
          { name: "The significance of the Industrial Age", code: "PRE-M27-T3" },
        ] },
        { name: "The First World War", code: "PRE-M28", children: [
          { name: "The historical context", code: "PRE-M28-T1" },
          { name: "The nature and course of WWI", code: "PRE-M28-T2" },
          { name: "The significance of WWI", code: "PRE-M28-T3" },
        ] },
        { name: "The Age of Decolonisation", code: "PRE-M29", children: [
          { name: "The historical context", code: "PRE-M29-T1" },
          { name: "The nature of decolonisation", code: "PRE-M29-T2" },
          { name: "The significance of decolonisation", code: "PRE-M29-T3" },
        ] },
        { name: "Historical investigation", code: "PRE-M30", children: [
          { name: "The process of historical investigation", code: "PRE-M30-T1" },
        ] },
      ] },
      { name: "Year 12", code: "HSC", children: [
        { name: "Historical concepts and skills 11–12", code: "HSC-M1", children: [
          { name: "Analysis and use of sources", code: "HSC-M1-T1" },
          { name: "Historical interpretation", code: "HSC-M1-T2" },
          { name: "Historical investigation and research", code: "HSC-M1-T3" },
          { name: "Explanation and communication", code: "HSC-M1-T4" },
        ] },
        { name: "Core study: Democracy and dictatorship 1919–1939", code: "HSC-M2", children: [
          { name: "Context", code: "HSC-M2-T1" },
          { name: "Interwar dictatorships", code: "HSC-M2-T2" },
          { name: "The collapse of German democracy", code: "HSC-M2-T3" },
          { name: "Source analysis: interpreting the evidence for the Nazi regime in power 1933–1939", code: "HSC-M2-T4" },
        ] },
        { name: "National studies", code: "HSC-M3" },
        { name: "Australia 1918–1949", code: "HSC-M4", children: [
          { name: "Context", code: "HSC-M4-T1" },
          { name: "The changing face of Australia after the First World War", code: "HSC-M4-T2" },
          { name: "Australia and the Great Depression", code: "HSC-M4-T3" },
          { name: "Australia and the world 1918–1949", code: "HSC-M4-T4" },
        ] },
        { name: "China 1927–1949", code: "HSC-M5", children: [
          { name: "Context", code: "HSC-M5-T1" },
          { name: "The rise of the Chinese Communist Party (CCP)", code: "HSC-M5-T2" },
          { name: "Resistance to Japan", code: "HSC-M5-T3" },
          { name: "The victory of the CCP", code: "HSC-M5-T4" },
        ] },
        { name: "Cuba 1940–1991", code: "HSC-M6", children: [
          { name: "Context", code: "HSC-M6-T1" },
          { name: "The Cuban Revolution 1953–1959", code: "HSC-M6-T2" },
          { name: "Cuba under Fidel Castro 1959–1991", code: "HSC-M6-T3" },
          { name: "Cuban foreign policy 1959–1991", code: "HSC-M6-T4" },
        ] },
        { name: "Indonesia 1945–2004", code: "HSC-M7", children: [
          { name: "Context", code: "HSC-M7-T1" },
          { name: "The 1965 coup", code: "HSC-M7-T2" },
          { name: "Suharto and the New Order", code: "HSC-M7-T3" },
          { name: "Indonesian foreign policy 1945–2004", code: "HSC-M7-T4" },
        ] },
        { name: "Iran 1945–1989", code: "HSC-M8", children: [
          { name: "Context", code: "HSC-M8-T1" },
          { name: "Iran under the Shah 1953–1979", code: "HSC-M8-T2" },
          { name: "The Revolution of 1978–1979", code: "HSC-M8-T3" },
          { name: "Iran under Khomeini 1979–1989", code: "HSC-M8-T4" },
        ] },
        { name: "Japan 1904–1937", code: "HSC-M9", children: [
          { name: "Context", code: "HSC-M9-T1" },
          { name: "Challenges to traditional power and authority 1918–1930", code: "HSC-M9-T2" },
          { name: "The rise of militarism in the 1930s", code: "HSC-M9-T3" },
          { name: "Japanese foreign policy 1918–1937", code: "HSC-M9-T4" },
        ] },
        { name: "Russia and the Soviet Union 1917–1941", code: "HSC-M10", children: [
          { name: "Context", code: "HSC-M10-T1" },
          { name: "Stalin’s rise to power 1924–1929", code: "HSC-M10-T2" },
          { name: "The Soviet state under Stalin to 1941", code: "HSC-M10-T3" },
          { name: "Soviet foreign policy 1928–1941", code: "HSC-M10-T4" },
        ] },
        { name: "United States 1919–1941", code: "HSC-M11", children: [
          { name: "Context", code: "HSC-M11-T1" },
          { name: "The Great Depression", code: "HSC-M11-T2" },
          { name: "Society in the United States 1919–1941", code: "HSC-M11-T3" },
          { name: "US foreign policy 1919–1941", code: "HSC-M11-T4" },
        ] },
        { name: "Peace and conflict", code: "HSC-M12" },
        { name: "Conflict in Europe 1935–1945", code: "HSC-M13", children: [
          { name: "Context", code: "HSC-M13-T1" },
          { name: "The outbreak and course of the European war", code: "HSC-M13-T2" },
          { name: "Civilians at war", code: "HSC-M13-T3" },
          { name: "The end of the conflict", code: "HSC-M13-T4" },
        ] },
        { name: "Conflict in the Pacific 1937–1951", code: "HSC-M14", children: [
          { name: "Context", code: "HSC-M14-T1" },
          { name: "The outbreak and course of the Pacific War", code: "HSC-M14-T2" },
          { name: "Civilians at war", code: "HSC-M14-T3" },
          { name: "End of the conflict", code: "HSC-M14-T4" },
        ] },
        { name: "The Cold War 1945–1991", code: "HSC-M15", children: [
          { name: "Context", code: "HSC-M15-T1" },
          { name: "The development of the Cold War to 1968", code: "HSC-M15-T2" },
          { name: "Cold War relations during the period of détente 1969–1979", code: "HSC-M15-T3" },
          { name: "Renewal and the end of the Cold War 1980–1991", code: "HSC-M15-T4" },
        ] },
        { name: "The Arab–Israeli conflict 1948–2000", code: "HSC-M16", children: [
          { name: "Context", code: "HSC-M16-T1" },
          { name: "War and peace", code: "HSC-M16-T2" },
          { name: "The Occupied Territories and Israel’s relationship with Lebanon", code: "HSC-M16-T3" },
          { name: "Successes and setbacks of the peace process 1987–2000", code: "HSC-M16-T4" },
        ] },
        { name: "Conflict in Vietnam, Cambodia and Laos 1954–1976", code: "HSC-M17", children: [
          { name: "Context", code: "HSC-M17-T1" },
          { name: "Conflict in Vietnam 1964–1973", code: "HSC-M17-T2" },
          { name: "The end of the war 1973–1976", code: "HSC-M17-T3" },
        ] },
        { name: "Conflict in the Gulf 1980–2017", code: "HSC-M18", children: [
          { name: "Context", code: "HSC-M18-T1" },
          { name: "The First Gulf War and its consequences", code: "HSC-M18-T2" },
          { name: "The road to war", code: "HSC-M18-T3" },
          { name: "From war to ‘insurgency’", code: "HSC-M18-T4" },
        ] },
        { name: "Change in the modern world", code: "HSC-M19" },
        { name: "The Nuclear Age 1945–2021", code: "HSC-M20", children: [
          { name: "Context", code: "HSC-M20-T1" },
          { name: "Nuclear technology as military technology", code: "HSC-M20-T2" },
          { name: "Nuclear technology as progressive technology", code: "HSC-M20-T3" },
          { name: "Towards nuclear disarmament", code: "HSC-M20-T4" },
        ] },
        { name: "Civil rights in the United States 1945–1972", code: "HSC-M21", children: [
          { name: "Context", code: "HSC-M21-T1" },
          { name: "Civil rights: activism and opposition", code: "HSC-M21-T2" },
          { name: "Civil rights: leadership and achievements", code: "HSC-M21-T3" },
        ] },
        { name: "The Anti-Apartheid Movement in South Africa 1948–1994", code: "HSC-M22", children: [
          { name: "Context", code: "HSC-M22-T1" },
          { name: "National resistance to apartheid", code: "HSC-M22-T2" },
          { name: "Repression and control by South African governments", code: "HSC-M22-T3" },
          { name: "The end of apartheid", code: "HSC-M22-T4" },
        ] },
        { name: "The struggle for democracy in Burma 1948–2021", code: "HSC-M23", children: [
          { name: "Context", code: "HSC-M23-T1" },
          { name: "Socialist military government in Burma", code: "HSC-M23-T2" },
          { name: "The impact of the 8888 Uprising", code: "HSC-M23-T3" },
          { name: "The response of the military government 1990–2011", code: "HSC-M23-T4" },
          { name: "Steps towards democracy in Burma/Myanmar 2011–2021", code: "HSC-M23-T5" },
        ] },
        { name: "From the Cultural Revolution to Tiananmen Square 1966–1989", code: "HSC-M24", children: [
          { name: "Context", code: "HSC-M24-T1" },
          { name: "The Cultural Revolution", code: "HSC-M24-T2" },
          { name: "Deng Xiaoping and the modernisation of China", code: "HSC-M24-T3" },
        ] },
        { name: "The changing world order 1989–2016", code: "HSC-M25", children: [
          { name: "Context", code: "HSC-M25-T1" },
          { name: "Establishing the new world order 1989–2001", code: "HSC-M25-T2" },
          { name: "Challenges to the new world order 2001–2008", code: "HSC-M25-T3" },
          { name: "A ‘post-American’ world 2008–2016", code: "HSC-M25-T4" },
        ] },
      ] },
    ],
  }),
  template({
    id: "music-1",
    name: "Music 1",
    category: "HSC",
    subject: "Music 1",
    curriculum: "NSW Stage 6 (NESA)",
    version_year: "2025",
    description: "NSW Stage 6 Music 1 (2025). Year 11 and Year 12 syllabus modules and their topics.",
    hierarchy: ["Year", "Module", "Topic"],
    tags: [
      "aural_analysis", "musicology", "composition", "performance", "listening", "score_reading", "music_language", "context_analysis", "creative_practice", "reflection", "improvisation", "analysis", "short_answer", "extended_response", "multiple_choice",
    ],
    nodes: [
      { name: "Year 11", code: "PRE", children: [
        { name: "Music context and Music language", code: "PRE-M1", children: [
          { name: "Music context", code: "PRE-M1-T1" },
          { name: "Theoretical language", code: "PRE-M1-T2" },
          { name: "Compositional language", code: "PRE-M1-T3" },
          { name: "Notational language", code: "PRE-M1-T4" },
        ] },
        { name: "Contexts of music", code: "PRE-M2", children: [
          { name: "Performing", code: "PRE-M2-T1" },
          { name: "Listening, analysing and responding", code: "PRE-M2-T2" },
          { name: "Creating and composing", code: "PRE-M2-T3" },
        ] },
        { name: "Creative practice", code: "PRE-M3", children: [
          { name: "Performing", code: "PRE-M3-T1" },
          { name: "Listening, analysing and responding", code: "PRE-M3-T2" },
          { name: "Creating and composing", code: "PRE-M3-T3" },
        ] },
        { name: "Music in focus", code: "PRE-M4", children: [
          { name: "Performing", code: "PRE-M4-T1" },
          { name: "Listening, analysing and responding", code: "PRE-M4-T2" },
          { name: "Creating and composing", code: "PRE-M4-T3" },
        ] },
      ] },
      { name: "Year 12", code: "HSC", children: [
        { name: "Music context and Music language", code: "HSC-M1", children: [
          { name: "Music context", code: "HSC-M1-T1" },
          { name: "Theoretical language", code: "HSC-M1-T2" },
          { name: "Compositional language", code: "HSC-M1-T3" },
          { name: "Notational language", code: "HSC-M1-T4" },
        ] },
        { name: "Music of the last 25 years (Australian focus)", code: "HSC-M2", children: [
          { name: "Performing", code: "HSC-M2-T1" },
          { name: "Listening, analysing and responding", code: "HSC-M2-T2" },
          { name: "Creating and composing", code: "HSC-M2-T3" },
        ] },
        { name: "Music across cultures, traditions and time", code: "HSC-M3", children: [
          { name: "Performing", code: "HSC-M3-T1" },
          { name: "Listening, analysing and responding", code: "HSC-M3-T2" },
          { name: "Creating and composing", code: "HSC-M3-T3" },
        ] },
        { name: "Music for screen, stage and story", code: "HSC-M4", children: [
          { name: "Performing", code: "HSC-M4-T1" },
          { name: "Listening, analysing and responding", code: "HSC-M4-T2" },
          { name: "Creating and composing", code: "HSC-M4-T3" },
        ] },
      ] },
    ],
  }),
  template({
    id: "music-2",
    name: "Music 2",
    category: "HSC",
    subject: "Music 2",
    curriculum: "NSW Stage 6 (NESA)",
    version_year: "2025",
    description: "NSW Stage 6 Music 2 (2025). Year 11 and Year 12 syllabus modules and their topics.",
    hierarchy: ["Year", "Module", "Topic"],
    tags: [
      "aural_analysis", "musicology", "composition", "performance", "listening", "score_reading", "music_language", "context_analysis", "creative_practice", "reflection", "harmony", "analysis", "short_answer", "extended_response", "multiple_choice",
    ],
    nodes: [
      { name: "Year 11", code: "PRE", children: [
        { name: "Music context and Music language", code: "PRE-M1", children: [
          { name: "Context", code: "PRE-M1-T1" },
          { name: "Theoretical language", code: "PRE-M1-T2" },
          { name: "Compositional language", code: "PRE-M1-T3" },
          { name: "Notational language", code: "PRE-M1-T4" },
        ] },
        { name: "Music of Western art traditions 1", code: "PRE-M2", children: [
          { name: "Performing", code: "PRE-M2-T1" },
          { name: "Listening, analysing and responding", code: "PRE-M2-T2" },
          { name: "Creating and composing", code: "PRE-M2-T3" },
        ] },
        { name: "Music for drama, movement and entertainment", code: "PRE-M3", children: [
          { name: "Performing", code: "PRE-M3-T1" },
          { name: "Listening, analysing and responding", code: "PRE-M3-T2" },
          { name: "Creating and composing", code: "PRE-M3-T3" },
        ] },
        { name: "Music of the 20th and 21st centuries", code: "PRE-M4", children: [
          { name: "Performing", code: "PRE-M4-T1" },
          { name: "Listening, analysing and responding", code: "PRE-M4-T2" },
          { name: "Creating and composing", code: "PRE-M4-T3" },
        ] },
      ] },
      { name: "Year 12", code: "HSC", children: [
        { name: "Music context and Music language", code: "HSC-M1", children: [
          { name: "Context", code: "HSC-M1-T1" },
          { name: "Theoretical language", code: "HSC-M1-T2" },
          { name: "Compositional language", code: "HSC-M1-T3" },
          { name: "Notational language", code: "HSC-M1-T4" },
        ] },
        { name: "Music of the last 25 years (Australian focus)", code: "HSC-M2", children: [
          { name: "Performing", code: "HSC-M2-T1" },
          { name: "Listening, analysing and responding", code: "HSC-M2-T2" },
          { name: "Creating and composing", code: "HSC-M2-T3" },
        ] },
        { name: "Music of Western art traditions 2", code: "HSC-M3", children: [
          { name: "Performing", code: "HSC-M3-T1" },
          { name: "Listening, analysing and responding", code: "HSC-M3-T2" },
          { name: "Creating and composing", code: "HSC-M3-T3" },
        ] },
        { name: "Elective project", code: "HSC-M4", children: [
          { name: "Performing", code: "HSC-M4-T1" },
          { name: "Listening, analysing and responding (musicology)", code: "HSC-M4-T2" },
          { name: "Creating and composing", code: "HSC-M4-T3" },
        ] },
      ] },
    ],
  }),
  template({
    id: "physics",
    name: "Physics",
    category: "HSC",
    subject: "Physics",
    curriculum: "NSW Stage 6 (NESA)",
    version_year: "2025",
    description: "NSW Stage 6 Physics (2025). Year 11 and Year 12 syllabus modules and their topics.",
    hierarchy: ["Year", "Module", "Topic"],
    tags: [
      "calculation", "conceptual", "derivation", "data_analysis", "graphing", "diagram", "practical_investigation", "experimental_design", "modelling", "measurement", "evaluation", "short_answer", "extended_response", "multiple_choice", "action_required",
    ],
    nodes: [
      { name: "Year 11", code: "PRE", children: [
        { name: "Working scientifically", code: "PRE-M1", children: [
          { name: "Questioning and predicting", code: "PRE-M1-T1" },
          { name: "Planning scientific investigations", code: "PRE-M1-T2" },
          { name: "Conducting scientific investigations", code: "PRE-M1-T3" },
          { name: "Processing data and information", code: "PRE-M1-T4" },
          { name: "Analysing data and information", code: "PRE-M1-T5" },
          { name: "Problem-solving", code: "PRE-M1-T6" },
          { name: "Communicating", code: "PRE-M1-T7" },
        ] },
        { name: "Fundamentals of mechanics", code: "PRE-M2", children: [
          { name: "Quantities of motion", code: "PRE-M2-T1" },
          { name: "Motion relationships", code: "PRE-M2-T2" },
          { name: "Forces and motion", code: "PRE-M2-T3" },
          { name: "Motion on inclined planes", code: "PRE-M2-T4" },
          { name: "Momentum and energy", code: "PRE-M2-T5" },
        ] },
        { name: "Waves", code: "PRE-M3", children: [
          { name: "Wave properties", code: "PRE-M3-T1" },
          { name: "Light and sound", code: "PRE-M3-T2" },
          { name: "Wave behaviours", code: "PRE-M3-T3" },
        ] },
        { name: "Electricity and magnetism", code: "PRE-M4", children: [
          { name: "Electrostatics", code: "PRE-M4-T1" },
          { name: "Electric circuits", code: "PRE-M4-T2" },
          { name: "Magnetism", code: "PRE-M4-T3" },
        ] },
      ] },
      { name: "Year 12", code: "HSC", children: [
        { name: "Working scientifically", code: "HSC-M1", children: [
          { name: "Questioning and predicting", code: "HSC-M1-T1" },
          { name: "Planning scientific investigations", code: "HSC-M1-T2" },
          { name: "Conducting scientific investigations", code: "HSC-M1-T3" },
          { name: "Processing data and information", code: "HSC-M1-T4" },
          { name: "Analysing data and information", code: "HSC-M1-T5" },
          { name: "Problem-solving", code: "HSC-M1-T6" },
          { name: "Communicating", code: "HSC-M1-T7" },
        ] },
        { name: "Advanced mechanics", code: "HSC-M2", children: [
          { name: "Projectile motion", code: "HSC-M2-T1" },
          { name: "Circular motion", code: "HSC-M2-T2" },
          { name: "Motion in gravitational fields", code: "HSC-M2-T3" },
        ] },
        { name: "Electromagnetism", code: "HSC-M3", children: [
          { name: "Charged particles in electric and magnetic fields", code: "HSC-M3-T1" },
          { name: "The motor effect and electric motors", code: "HSC-M3-T2" },
          { name: "Electromagnetic induction", code: "HSC-M3-T3" },
          { name: "Applications of electromagnetic induction", code: "HSC-M3-T4" },
        ] },
        { name: "Nature of light", code: "HSC-M4", children: [
          { name: "Electromagnetic waves", code: "HSC-M4-T1" },
          { name: "The wave model of light", code: "HSC-M4-T2" },
          { name: "The quantum model of light", code: "HSC-M4-T3" },
          { name: "Light and special relativity", code: "HSC-M4-T4" },
        ] },
        { name: "Matter, energy and the cosmos", code: "HSC-M5", children: [
          { name: "Modelling the atom", code: "HSC-M5-T1" },
          { name: "Radioactivity", code: "HSC-M5-T2" },
          { name: "Nuclear energy", code: "HSC-M5-T3" },
          { name: "Astrophysics", code: "HSC-M5-T4" },
        ] },
      ] },
    ],
  }),
  template({
    id: "physics-2017",
    name: "Physics (2017)",
    category: "HSC",
    subject: "Physics",
    curriculum: "NSW Stage 6 (NESA)",
    version_year: "2017",
    description: "NSW Stage 6 Physics (2017). Year 11 and Year 12 syllabus modules and their topics.",
    hierarchy: ["Year", "Module", "Topic"],
    tags: [
      "calculation", "conceptual", "derivation", "data_analysis", "graphing", "diagram", "practical_investigation", "experimental_design", "modelling", "measurement", "evaluation", "short_answer", "extended_response", "multiple_choice", "action_required",
    ],
    nodes: [
      { name: "Year 11", code: "PRE", children: [
        { name: "Working scientifically", code: "PRE-M1", children: [
          { name: "Questioning and Predicting", code: "PRE-M1-T1" },
          { name: "Planning Investigations", code: "PRE-M1-T2" },
          { name: "Conducting Investigations", code: "PRE-M1-T3" },
          { name: "Processing Data and Information", code: "PRE-M1-T4" },
          { name: "Analysing Data and Information", code: "PRE-M1-T5" },
          { name: "Problem Solving", code: "PRE-M1-T6" },
          { name: "Communicating", code: "PRE-M1-T7" },
        ] },
        { name: "Kinematics", code: "PRE-M2", children: [
          { name: "Motion in a Straight Line", code: "PRE-M2-T1" },
          { name: "Motion on a Plane", code: "PRE-M2-T2" },
        ] },
        { name: "Dynamics", code: "PRE-M3", children: [
          { name: "Forces", code: "PRE-M3-T1" },
          { name: "Forces, Acceleration and Energy", code: "PRE-M3-T2" },
          { name: "Momentum, Energy and Simple Systems", code: "PRE-M3-T3" },
        ] },
        { name: "Waves and Thermodynamics", code: "PRE-M4", children: [
          { name: "Wave Properties", code: "PRE-M4-T1" },
          { name: "Wave Behaviour", code: "PRE-M4-T2" },
          { name: "Sound Waves", code: "PRE-M4-T3" },
          { name: "Ray Model of Light", code: "PRE-M4-T4" },
          { name: "Thermodynamics", code: "PRE-M4-T5" },
        ] },
        { name: "Electricity and Magnetism", code: "PRE-M5", children: [
          { name: "Electrostatics", code: "PRE-M5-T1" },
          { name: "Electric Circuits", code: "PRE-M5-T2" },
          { name: "Magnetism", code: "PRE-M5-T3" },
        ] },
      ] },
      { name: "Year 12", code: "HSC", children: [
        { name: "Working scientifically", code: "HSC-M1", children: [
          { name: "Questioning and Predicting", code: "HSC-M1-T1" },
          { name: "Planning Investigations", code: "HSC-M1-T2" },
          { name: "Conducting Investigations", code: "HSC-M1-T3" },
          { name: "Processing Data and Information", code: "HSC-M1-T4" },
          { name: "Analysing Data and Information", code: "HSC-M1-T5" },
          { name: "Problem Solving", code: "HSC-M1-T6" },
          { name: "Communicating", code: "HSC-M1-T7" },
        ] },
        { name: "Advanced Mechanics", code: "HSC-M2", children: [
          { name: "Projectile Motion", code: "HSC-M2-T1" },
          { name: "Circular Motion", code: "HSC-M2-T2" },
          { name: "Motion in Gravitational Fields", code: "HSC-M2-T3" },
        ] },
        { name: "Electromagnetism", code: "HSC-M3", children: [
          { name: "Charged Particles, Conductors and Electric and Magnetic Fields", code: "HSC-M3-T1" },
          { name: "The Motor Effect", code: "HSC-M3-T2" },
          { name: "Electromagnetic Induction", code: "HSC-M3-T3" },
          { name: "Applications of the Motor Effect", code: "HSC-M3-T4" },
        ] },
        { name: "The Nature of Light", code: "HSC-M4", children: [
          { name: "Electromagnetic Spectrum", code: "HSC-M4-T1" },
          { name: "Light: Wave Model", code: "HSC-M4-T2" },
          { name: "Light: Quantum Model", code: "HSC-M4-T3" },
          { name: "Light and Special Relativity", code: "HSC-M4-T4" },
        ] },
        { name: "From the Universe to the Atom", code: "HSC-M5", children: [
          { name: "Origins of the Elements", code: "HSC-M5-T1" },
          { name: "Structure of the Atom", code: "HSC-M5-T2" },
          { name: "Quantum Mechanical Nature of the Atom", code: "HSC-M5-T3" },
          { name: "Properties of the Nucleus", code: "HSC-M5-T4" },
          { name: "Deep inside the Atom", code: "HSC-M5-T5" },
        ] },
      ] },
    ],
  }),
  template({
    id: "biology-2017",
    name: "Biology (2017)",
    category: "HSC",
    subject: "Biology",
    curriculum: "NSW Stage 6 (NESA)",
    version_year: "2017",
    description: "NSW Stage 6 Biology (2017). Year 11 and Year 12 syllabus modules and their topics.",
    hierarchy: ["Year", "Module", "Topic"],
    tags: [
      "conceptual", "explanation", "data_analysis", "graphing", "diagram", "experimental_design", "practical_investigation", "modelling", "calculation", "evaluation", "communication", "multiple_choice", "short_answer", "extended_response", "action_required",
    ],
    nodes: [
      { name: "Year 11", code: "PRE", children: [
        { name: "Working scientifically", code: "PRE-M1", children: [
          { name: "Questioning and Predicting", code: "PRE-M1-T1" },
          { name: "Planning Investigations", code: "PRE-M1-T2" },
          { name: "Conducting Investigations", code: "PRE-M1-T3" },
          { name: "Processing Data and Information", code: "PRE-M1-T4" },
          { name: "Analysing Data and Information", code: "PRE-M1-T5" },
          { name: "Problem Solving", code: "PRE-M1-T6" },
          { name: "Communicating", code: "PRE-M1-T7" },
        ] },
        { name: "Cells as the Basis of Life", code: "PRE-M2", children: [
          { name: "Cell Structure", code: "PRE-M2-T1" },
          { name: "Cell Function", code: "PRE-M2-T2" },
        ] },
        { name: "Organisation of Living Things", code: "PRE-M3", children: [
          { name: "Organisation of Cells", code: "PRE-M3-T1" },
          { name: "Nutrient and Gas Requirements", code: "PRE-M3-T2" },
          { name: "Transport", code: "PRE-M3-T3" },
        ] },
        { name: "Biological Diversity", code: "PRE-M4", children: [
          { name: "Effects of the Environment on Organisms", code: "PRE-M4-T1" },
          { name: "Adaptations", code: "PRE-M4-T2" },
          { name: "Theory of Evolution by Natural Selection", code: "PRE-M4-T3" },
          { name: "Evolution – the Evidence", code: "PRE-M4-T4" },
        ] },
        { name: "Ecosystem Dynamics", code: "PRE-M5", children: [
          { name: "Population Dynamics", code: "PRE-M5-T1" },
          { name: "Past Ecosystems", code: "PRE-M5-T2" },
          { name: "Future Ecosystems", code: "PRE-M5-T3" },
        ] },
      ] },
      { name: "Year 12", code: "HSC", children: [
        { name: "Working scientifically", code: "HSC-M1", children: [
          { name: "Questioning and Predicting", code: "HSC-M1-T1" },
          { name: "Planning Investigations", code: "HSC-M1-T2" },
          { name: "Conducting Investigations", code: "HSC-M1-T3" },
          { name: "Processing Data and Information", code: "HSC-M1-T4" },
          { name: "Analysing Data and Information", code: "HSC-M1-T5" },
          { name: "Problem Solving", code: "HSC-M1-T6" },
          { name: "Communicating", code: "HSC-M1-T7" },
        ] },
        { name: "Heredity", code: "HSC-M2", children: [
          { name: "Reproduction", code: "HSC-M2-T1" },
          { name: "Cell Replication", code: "HSC-M2-T2" },
          { name: "DNA and Polypeptide Synthesis", code: "HSC-M2-T3" },
          { name: "Genetic Variation", code: "HSC-M2-T4" },
          { name: "Inheritance Patterns in a Population", code: "HSC-M2-T5" },
        ] },
        { name: "Genetic Change", code: "HSC-M3", children: [
          { name: "Mutation", code: "HSC-M3-T1" },
          { name: "Biotechnology", code: "HSC-M3-T2" },
          { name: "Genetic Technologies", code: "HSC-M3-T3" },
        ] },
        { name: "Infectious Disease", code: "HSC-M4", children: [
          { name: "Causes of Infectious Disease", code: "HSC-M4-T1" },
          { name: "Responses to Pathogens", code: "HSC-M4-T2" },
          { name: "Immunity", code: "HSC-M4-T3" },
          { name: "Prevention, Treatment and Control", code: "HSC-M4-T4" },
        ] },
        { name: "Non-infectious Disease and Disorders", code: "HSC-M5", children: [
          { name: "Homeostasis", code: "HSC-M5-T1" },
          { name: "Causes and Effects", code: "HSC-M5-T2" },
          { name: "Epidemiology", code: "HSC-M5-T3" },
          { name: "Prevention", code: "HSC-M5-T4" },
          { name: "Technologies and Disorders", code: "HSC-M5-T5" },
        ] },
      ] },
    ],
  }),
  template({
    id: "chemistry-2017",
    name: "Chemistry (2017)",
    category: "HSC",
    subject: "Chemistry",
    curriculum: "NSW Stage 6 (NESA)",
    version_year: "2017",
    description: "NSW Stage 6 Chemistry (2017). Year 11 and Year 12 syllabus modules and their topics.",
    hierarchy: ["Year", "Module", "Topic"],
    tags: [
      "calculation", "stoichiometry", "conceptual", "explanation", "data_analysis", "graphing", "diagram", "practical_investigation", "experimental_design", "modelling", "derivation", "evaluation", "multiple_choice", "short_answer", "extended_response",
    ],
    nodes: [
      { name: "Year 11", code: "PRE", children: [
        { name: "Working scientifically", code: "PRE-M1", children: [
          { name: "Questioning and Predicting", code: "PRE-M1-T1" },
          { name: "Planning Investigations", code: "PRE-M1-T2" },
          { name: "Conducting Investigations", code: "PRE-M1-T3" },
          { name: "Processing Data and Information", code: "PRE-M1-T4" },
          { name: "Analysing Data and Information", code: "PRE-M1-T5" },
          { name: "Problem Solving", code: "PRE-M1-T6" },
          { name: "Communicating", code: "PRE-M1-T7" },
        ] },
        { name: "Properties and Structure of Matter", code: "PRE-M2", children: [
          { name: "Properties of Matter", code: "PRE-M2-T1" },
          { name: "Atomic structure and atomic mass", code: "PRE-M2-T2" },
          { name: "Periodicity", code: "PRE-M2-T3" },
          { name: "Bonding", code: "PRE-M2-T4" },
        ] },
        { name: "Introduction to Quantitative Chemistry", code: "PRE-M3", children: [
          { name: "Chemical Reactions and Stoichiometry", code: "PRE-M3-T1" },
          { name: "Mole Concept", code: "PRE-M3-T2" },
          { name: "Concentration and Molarity", code: "PRE-M3-T3" },
          { name: "Gas Laws", code: "PRE-M3-T4" },
        ] },
        { name: "Reactive Chemistry", code: "PRE-M4", children: [
          { name: "Chemical Reactions", code: "PRE-M4-T1" },
          { name: "Predicting Reactions of Metals", code: "PRE-M4-T2" },
          { name: "Rates of Reactions", code: "PRE-M4-T3" },
        ] },
        { name: "Drivers of Reactions", code: "PRE-M5", children: [
          { name: "Energy Changes in Chemical Reactions", code: "PRE-M5-T1" },
          { name: "Enthalpy and Hess’s Law", code: "PRE-M5-T2" },
          { name: "Entropy and Gibbs Free Energy", code: "PRE-M5-T3" },
        ] },
      ] },
      { name: "Year 12", code: "HSC", children: [
        { name: "Working scientifically", code: "HSC-M1", children: [
          { name: "Questioning and Predicting", code: "HSC-M1-T1" },
          { name: "Planning Investigations", code: "HSC-M1-T2" },
          { name: "Conducting Investigations", code: "HSC-M1-T3" },
          { name: "Processing Data and Information", code: "HSC-M1-T4" },
          { name: "Analysing Data and Information", code: "HSC-M1-T5" },
          { name: "Problem Solving", code: "HSC-M1-T6" },
          { name: "Communicating", code: "HSC-M1-T7" },
        ] },
        { name: "Equilibrium and Acid Reactions", code: "HSC-M2", children: [
          { name: "Static and Dynamic Equilibrium", code: "HSC-M2-T1" },
          { name: "Factors that Affect Equilibrium", code: "HSC-M2-T2" },
          { name: "Calculating the Equilibrium Constant (Keq)", code: "HSC-M2-T3" },
          { name: "Solution Equilibria", code: "HSC-M2-T4" },
        ] },
        { name: "Acid/Base Reactions", code: "HSC-M3", children: [
          { name: "Properties of Acids and Bases", code: "HSC-M3-T1" },
          { name: "Using Brønsted–Lowry Theory", code: "HSC-M3-T2" },
          { name: "Quantitative Analysis", code: "HSC-M3-T3" },
        ] },
        { name: "Organic Chemistry", code: "HSC-M4", children: [
          { name: "Nomenclature", code: "HSC-M4-T1" },
          { name: "Hydrocarbons", code: "HSC-M4-T2" },
          { name: "Products of Reactions Involving Hydrocarbons", code: "HSC-M4-T3" },
          { name: "Alcohols", code: "HSC-M4-T4" },
          { name: "Reactions of Organic Acids and Bases", code: "HSC-M4-T5" },
          { name: "Polymers", code: "HSC-M4-T6" },
        ] },
        { name: "Applying Chemical Ideas", code: "HSC-M5", children: [
          { name: "Analysis of Inorganic Substances", code: "HSC-M5-T1" },
          { name: "Analysis of Organic Substances", code: "HSC-M5-T2" },
          { name: "Chemical Synthesis and Design", code: "HSC-M5-T3" },
        ] },
      ] },
    ],
  }),
  template({
    id: "ancient-history-2017",
    name: "Ancient History (2017)",
    category: "HSC",
    subject: "Ancient History",
    curriculum: "NSW Stage 6 (NESA)",
    version_year: "2017",
    description: "NSW Stage 6 Ancient History (2017). Year 11 and Year 12 syllabus modules and their topics.",
    hierarchy: ["Year", "Module", "Topic"],
    tags: [
      "source_analysis", "source_evaluation", "historical_interpretation", "reliability", "archaeological_evidence", "causation", "continuity_and_change", "significance", "perspectives", "essay", "extended_response", "short_answer", "multiple_choice", "comparison", "terminology",
    ],
    nodes: [
      { name: "Year 11", code: "PRE", children: [
        { name: "Historical Concepts and Skills", code: "PRE-M1", children: [
          { name: "Analysis and use of sources", code: "PRE-M1-T1" },
          { name: "Historical interpretation", code: "PRE-M1-T2" },
          { name: "Historical investigation and research", code: "PRE-M1-T3" },
          { name: "Explanation and communication", code: "PRE-M1-T4" },
        ] },
        { name: "Investigating Ancient History – The Nature of Ancient History", code: "PRE-M2" },
        { name: "The Investigation of Ancient Sites and Sources", code: "PRE-M3", children: [
          { name: "the changing nature of archaeological excavation and recording techniques", code: "PRE-M3-T1" },
          { name: "the contribution of archaeological and scientific techniques to the discovery and investigation of the ancient past, including site surveys using radar, excavation, dating methods, forensic examination and DNA analysis", code: "PRE-M3-T2" },
          { name: "problems associated with reconstructing the past through archaeological evidence, for example in relation to understanding ancient customs and religious beliefs", code: "PRE-M3-T3" },
          { name: "the contribution and limitations of ancient texts, inscriptions and iconography to an understanding of the ancient past", code: "PRE-M3-T4" },
        ] },
        { name: "Historical Authentication and Reliability", code: "PRE-M4", children: [
          { name: "problems of authenticity, including the identification and origin of ancient artefacts, human remains and documents, and the reliability of ancient writers who did not witness the events they describe", code: "PRE-M4-T1" },
          { name: "methods of authentication, including scientific and comparative dating techniques for documents and objects, and cross-referencing of ancient sources", code: "PRE-M4-T2" },
          { name: "ancient sources that have been deemed to be fakes or forgeries over time and the difficulties of authentication associated with these sources", code: "PRE-M4-T3" },
          { name: "the motivations of the perpetrators of fakes and forgeries", code: "PRE-M4-T4" },
        ] },
        { name: "The Representation of the Ancient Past", code: "PRE-M5", children: [
          { name: "the representation of the ancient past in the modern world, for example in art, myths and legends, memorials, museums, the media, film, documentaries, multimedia and interactive media", code: "PRE-M5-T1" },
          { name: "the various ways a person, site, society or event from the ancient past has been represented over time, for example by contemporaries of the time and in later times", code: "PRE-M5-T2" },
          { name: "the reasons for the differing representations", code: "PRE-M5-T3" },
          { name: "a critical evaluation of the representations using available sources", code: "PRE-M5-T4" },
        ] },
        { name: "Preservation, Conservation and/or Reconstruction of Ancient Sites", code: "PRE-M6", children: [
          { name: "the nature of the site(s), and the condition and extent of the remains", code: "PRE-M6-T1" },
          { name: "issues of conservation and preservation of the site(s), including factors which threaten the integrity or survival of the ancient site, for example environmental factors, war, deliberate destruction, pillaging, poverty", code: "PRE-M6-T2" },
          { name: "the effectiveness/appropriateness of methods used to preserve, conserve and/or reconstruct the site(s), including relevant national or international charters or conventions, for example UNESCO, and international efforts to protect ancient sites of World Heritage significance", code: "PRE-M6-T3" },
          { name: "the reconstruction of the ancient site(s), for example to restore a site to its original form, and digital reconstructions", code: "PRE-M6-T4" },
        ] },
        { name: "Cultural Heritage and the Role of Museums", code: "PRE-M7", children: [
          { name: "the nature and significance of the cultural property for the society to which it belongs", code: "PRE-M7-T1" },
          { name: "the arguments for and against the return of the cultural property to its original home", code: "PRE-M7-T2" },
          { name: "the nature and impact of looting and the illegal trade of antiquities on cultural heritage", code: "PRE-M7-T3" },
          { name: "the role of museums in acquiring, collecting and storing artefacts/cultural materials", code: "PRE-M7-T4" },
          { name: "the contributions of museums to our understanding of ancient ways of life and the question of whose past is represented in museum displays and exhibitions", code: "PRE-M7-T5" },
        ] },
        { name: "The Treatment and Display of Human Remains", code: "PRE-M8", children: [
          { name: "the condition of the human remains and how they were preserved, discovered and/or removed from where they were found", code: "PRE-M8-T1" },
          { name: "the methods and results of scientific analysis (dating of finds and forensic techniques) and modern preservation of the remains", code: "PRE-M8-T2" },
          { name: "the significance of the human remains and other sources, for example written, for an understanding of the life and times in which they lived", code: "PRE-M8-T3" },
          { name: "the ethical issues relevant to the treatment, display and ownership of the remains, for example the use of invasive methods of scientific analysis", code: "PRE-M8-T4" },
        ] },
        { name: "Investigating Ancient History – Case Studies", code: "PRE-M9" },
        { name: "A1: Old Kingdom Egypt", code: "PRE-M10", children: [
          { name: "the geographical and historical context", code: "PRE-M10-T1" },
          { name: "the range of sources", code: "PRE-M10-T2" },
          { name: "features of Old Kingdom Egypt as revealed through the sources", code: "PRE-M10-T3" },
        ] },
        { name: "A2: Tutankhamun’s Tomb", code: "PRE-M11", children: [
          { name: "the geographical and historical context", code: "PRE-M11-T1" },
          { name: "the range of sources", code: "PRE-M11-T2" },
          { name: "burial customs at the time of Tutankhamun as revealed through the sources", code: "PRE-M11-T3" },
        ] },
        { name: "A3: Deir el-Medina", code: "PRE-M12", children: [
          { name: "the geographical and historical context", code: "PRE-M12-T1" },
          { name: "the range of sources", code: "PRE-M12-T2" },
          { name: "everyday life at Deir el-Medina as revealed through the sources", code: "PRE-M12-T3" },
        ] },
        { name: "A4: Alexandria", code: "PRE-M13", children: [
          { name: "the geographical and historical context", code: "PRE-M13-T1" },
          { name: "the range of sources", code: "PRE-M13-T2" },
          { name: "the history of Alexandria as revealed through the sources", code: "PRE-M13-T3" },
        ] },
        { name: "A5: Thera", code: "PRE-M14", children: [
          { name: "the geographical and historical context", code: "PRE-M14-T1" },
          { name: "the range of sources", code: "PRE-M14-T2" },
          { name: "the history of Thera as revealed through the sources", code: "PRE-M14-T3" },
        ] },
        { name: "A6: Troy", code: "PRE-M15", children: [
          { name: "the geographical and historical context", code: "PRE-M15-T1" },
          { name: "the range of sources", code: "PRE-M15-T2" },
          { name: "the history of Troy and the Trojan War as revealed through the sources", code: "PRE-M15-T3" },
        ] },
        { name: "A7: The Roman Games", code: "PRE-M16", children: [
          { name: "the geographical and historical context", code: "PRE-M16-T1" },
          { name: "the range of sources", code: "PRE-M16-T2" },
          { name: "the nature of the Roman games as revealed through the sources", code: "PRE-M16-T3" },
        ] },
        { name: "A8: The Celts", code: "PRE-M17", children: [
          { name: "the geographical and historical context", code: "PRE-M17-T1" },
          { name: "the range of sources", code: "PRE-M17-T2" },
          { name: "the nature of Celtic life as revealed through the sources", code: "PRE-M17-T3" },
        ] },
        { name: "A9: Boudicca", code: "PRE-M18", children: [
          { name: "the geographical and historical context", code: "PRE-M18-T1" },
          { name: "the range of sources", code: "PRE-M18-T2" },
          { name: "Boudicca’s conflict with Rome as revealed through the sources", code: "PRE-M18-T3" },
        ] },
        { name: "B1: Ancient Australia", code: "PRE-M19", children: [
          { name: "the geographical and historical context", code: "PRE-M19-T1" },
          { name: "the range of sources and their condition", code: "PRE-M19-T2" },
          { name: "ancient Australia as revealed through the sources", code: "PRE-M19-T3" },
          { name: "the significance of the site today", code: "PRE-M19-T4" },
        ] },
        { name: "B2: The Shang Dynasty", code: "PRE-M20", children: [
          { name: "the geographical and historical context", code: "PRE-M20-T1" },
          { name: "the range of sources", code: "PRE-M20-T2" },
          { name: "the nature of the Shang dynasty as revealed through the sources", code: "PRE-M20-T3" },
        ] },
        { name: "B3: Ashoka", code: "PRE-M21", children: [
          { name: "the geographical and historical context", code: "PRE-M21-T1" },
          { name: "the range of sources", code: "PRE-M21-T2" },
          { name: "the role and contribution of Ashoka as revealed through the sources", code: "PRE-M21-T3" },
        ] },
        { name: "B4: Nineveh", code: "PRE-M22", children: [
          { name: "the geographical and historical context", code: "PRE-M22-T1" },
          { name: "the range of sources", code: "PRE-M22-T2" },
          { name: "the history of Nineveh as revealed through the sources", code: "PRE-M22-T3" },
        ] },
        { name: "B5: Persepolis", code: "PRE-M23", children: [
          { name: "the geographical and historical context", code: "PRE-M23-T1" },
          { name: "the range of sources", code: "PRE-M23-T2" },
          { name: "the history of Persepolis as revealed through the sources", code: "PRE-M23-T3" },
        ] },
        { name: "B6: Masada", code: "PRE-M24", children: [
          { name: "the geographical and historical context", code: "PRE-M24-T1" },
          { name: "the range of sources", code: "PRE-M24-T2" },
          { name: "the occupation and siege of Masada as revealed through the sources", code: "PRE-M24-T3" },
        ] },
        { name: "B7: Palmyra and the Silk Road", code: "PRE-M25", children: [
          { name: "the geographical and historical context", code: "PRE-M25-T1" },
          { name: "the range of sources", code: "PRE-M25-T2" },
          { name: "the history of Palmyra as revealed through the sources", code: "PRE-M25-T3" },
        ] },
        { name: "B8: Teotihuacan", code: "PRE-M26", children: [
          { name: "the geographical and historical context", code: "PRE-M26-T1" },
          { name: "the range of sources", code: "PRE-M26-T2" },
          { name: "the history of Teotihuacan as revealed through the sources", code: "PRE-M26-T3" },
        ] },
        { name: "B9: The Emergence of Early Societies", code: "PRE-M27", children: [
          { name: "the geographical and historical context", code: "PRE-M27-T1" },
          { name: "the range of sources", code: "PRE-M27-T2" },
          { name: "the emergence of early societies as revealed through the sources", code: "PRE-M27-T3" },
        ] },
        { name: "Features of Ancient Societies", code: "PRE-M28", children: [
          { name: "Women", code: "PRE-M28-T1" },
          { name: "Slavery", code: "PRE-M28-T2" },
          { name: "Art and Architecture", code: "PRE-M28-T3" },
          { name: "Weapons and Warfare", code: "PRE-M28-T4" },
          { name: "Death and Funerary Customs", code: "PRE-M28-T5" },
          { name: "Power and Image", code: "PRE-M28-T6" },
          { name: "Trade and Cultural Contact", code: "PRE-M28-T7" },
        ] },
        { name: "Historical Investigation", code: "PRE-M29", children: [
          { name: "The process of historical investigation", code: "PRE-M29-T1" },
        ] },
      ] },
      { name: "Year 12", code: "HSC", children: [
        { name: "Historical Concepts and Skills", code: "HSC-M1", children: [
          { name: "Analysis and use of sources", code: "HSC-M1-T1" },
          { name: "Historical interpretation", code: "HSC-M1-T2" },
          { name: "Historical investigation and research", code: "HSC-M1-T3" },
          { name: "Explanation and communication", code: "HSC-M1-T4" },
        ] },
        { name: "Core Study: Cities of Vesuvius – Pompeii and Herculaneum", code: "HSC-M2", children: [
          { name: "Survey", code: "HSC-M2-T1" },
          { name: "Investigating and interpreting the sources for Pompeii and Herculaneum", code: "HSC-M2-T2" },
          { name: "Reconstructing and conserving the past", code: "HSC-M2-T3" },
        ] },
        { name: "Ancient Societies", code: "HSC-M3" },
        { name: "Option A: New Kingdom Egypt society to the death of Amenhotep III", code: "HSC-M4", children: [
          { name: "The historical and geographical context", code: "HSC-M4-T1" },
          { name: "Social structure and political organisation", code: "HSC-M4-T2" },
          { name: "The economy", code: "HSC-M4-T3" },
          { name: "Religion, death and burial", code: "HSC-M4-T4" },
          { name: "Cultural and everyday life", code: "HSC-M4-T5" },
        ] },
        { name: "Option B: New Kingdom Egypt society during the Ramesside period", code: "HSC-M5", children: [
          { name: "The historical and geographical context", code: "HSC-M5-T1" },
          { name: "Social structure and political organisation", code: "HSC-M5-T2" },
          { name: "The economy", code: "HSC-M5-T3" },
          { name: "Religion, death and burial", code: "HSC-M5-T4" },
          { name: "Cultural and everyday life", code: "HSC-M5-T5" },
        ] },
        { name: "Option C: Society in Israel from Solomon to the fall of Samaria", code: "HSC-M6", children: [
          { name: "The historical and geographical context", code: "HSC-M6-T1" },
          { name: "Social structure and political organisation", code: "HSC-M6-T2" },
          { name: "The economy", code: "HSC-M6-T3" },
          { name: "Religion, death and burial", code: "HSC-M6-T4" },
          { name: "Cultural and everyday life", code: "HSC-M6-T5" },
        ] },
        { name: "Option D: Persian society at the time of Darius and Xerxes", code: "HSC-M7", children: [
          { name: "The historical and geographical context", code: "HSC-M7-T1" },
          { name: "Social structure and political organisation", code: "HSC-M7-T2" },
          { name: "The economy", code: "HSC-M7-T3" },
          { name: "Religion, death and burial", code: "HSC-M7-T4" },
          { name: "Cultural and everyday life", code: "HSC-M7-T5" },
        ] },
        { name: "Option E: Society in China during the Han Dynasty 206 BC–AD 220", code: "HSC-M8", children: [
          { name: "The historical and geographical context", code: "HSC-M8-T1" },
          { name: "Social structure and political organisation", code: "HSC-M8-T2" },
          { name: "The economy", code: "HSC-M8-T3" },
          { name: "Religion, death and burial", code: "HSC-M8-T4" },
          { name: "Cultural and everyday life", code: "HSC-M8-T5" },
        ] },
        { name: "Option F: Bronze Age – Minoan Crete", code: "HSC-M9", children: [
          { name: "The historical and geographical context", code: "HSC-M9-T1" },
          { name: "Social structure and political organisation", code: "HSC-M9-T2" },
          { name: "The economy", code: "HSC-M9-T3" },
          { name: "Religion, death and burial", code: "HSC-M9-T4" },
          { name: "Cultural and everyday life", code: "HSC-M9-T5" },
        ] },
        { name: "Option G: Spartan society to the Battle of Leuctra 371 BC", code: "HSC-M10", children: [
          { name: "The historical and geographical context", code: "HSC-M10-T1" },
          { name: "Social structure and political organisation", code: "HSC-M10-T2" },
          { name: "The economy", code: "HSC-M10-T3" },
          { name: "Religion, death and burial", code: "HSC-M10-T4" },
          { name: "Cultural and everyday life", code: "HSC-M10-T5" },
        ] },
        { name: "Option H: Athenian society in the time of Pericles", code: "HSC-M11", children: [
          { name: "The historical and geographical context", code: "HSC-M11-T1" },
          { name: "Social structure and political organisation", code: "HSC-M11-T2" },
          { name: "The economy", code: "HSC-M11-T3" },
          { name: "Religion, death and burial", code: "HSC-M11-T4" },
          { name: "Cultural and everyday life", code: "HSC-M11-T5" },
        ] },
        { name: "Personalities in their Times", code: "HSC-M12" },
        { name: "Option A: Egypt – Hatshepsut", code: "HSC-M13", children: [
          { name: "The historical context", code: "HSC-M13-T1" },
          { name: "Background and rise to prominence", code: "HSC-M13-T2" },
          { name: "Key features and developments", code: "HSC-M13-T3" },
          { name: "Evaluation", code: "HSC-M13-T4" },
        ] },
        { name: "Option B: Egypt – Akhenaten", code: "HSC-M14", children: [
          { name: "The historical context", code: "HSC-M14-T1" },
          { name: "Background and rise to prominence", code: "HSC-M14-T2" },
          { name: "Key features and developments", code: "HSC-M14-T3" },
          { name: "Evaluation", code: "HSC-M14-T4" },
        ] },
        { name: "Option C: The Near East – Sennacherib", code: "HSC-M15", children: [
          { name: "The historical context", code: "HSC-M15-T1" },
          { name: "Background and rise to prominence", code: "HSC-M15-T2" },
          { name: "Key features and developments", code: "HSC-M15-T3" },
          { name: "Evaluation", code: "HSC-M15-T4" },
        ] },
        { name: "Option D: The Near East – Xerxes", code: "HSC-M16", children: [
          { name: "The historical context", code: "HSC-M16-T1" },
          { name: "Background and rise to prominence", code: "HSC-M16-T2" },
          { name: "Key features and developments", code: "HSC-M16-T3" },
          { name: "Evaluation", code: "HSC-M16-T4" },
        ] },
        { name: "Option E: China – Qin Shihuangdi", code: "HSC-M17", children: [
          { name: "The historical context", code: "HSC-M17-T1" },
          { name: "Background and rise to prominence", code: "HSC-M17-T2" },
          { name: "Key features and developments", code: "HSC-M17-T3" },
          { name: "Evaluation", code: "HSC-M17-T4" },
        ] },
        { name: "Option F: Greece – Pericles", code: "HSC-M18", children: [
          { name: "The historical context", code: "HSC-M18-T1" },
          { name: "Background and rise to prominence", code: "HSC-M18-T2" },
          { name: "Key features and developments", code: "HSC-M18-T3" },
          { name: "Evaluation", code: "HSC-M18-T4" },
        ] },
        { name: "Option G: Greece – Alexander the Great", code: "HSC-M19", children: [
          { name: "The historical context", code: "HSC-M19-T1" },
          { name: "Background and rise to prominence", code: "HSC-M19-T2" },
          { name: "Key features and developments", code: "HSC-M19-T3" },
          { name: "Evaluation", code: "HSC-M19-T4" },
        ] },
        { name: "Option H: Rome – Tiberius Gracchus", code: "HSC-M20", children: [
          { name: "The historical context", code: "HSC-M20-T1" },
          { name: "Background and rise to prominence", code: "HSC-M20-T2" },
          { name: "Key features and developments", code: "HSC-M20-T3" },
          { name: "Evaluation", code: "HSC-M20-T4" },
        ] },
        { name: "Option I: Rome – Julius Caesar", code: "HSC-M21", children: [
          { name: "The historical context", code: "HSC-M21-T1" },
          { name: "Background and rise to prominence", code: "HSC-M21-T2" },
          { name: "Key features and developments", code: "HSC-M21-T3" },
          { name: "Evaluation", code: "HSC-M21-T4" },
        ] },
        { name: "Option J: Rome – Agrippina the Younger", code: "HSC-M22", children: [
          { name: "The historical context", code: "HSC-M22-T1" },
          { name: "Background and rise to prominence", code: "HSC-M22-T2" },
          { name: "Key features and developments", code: "HSC-M22-T3" },
          { name: "Evaluation", code: "HSC-M22-T4" },
        ] },
        { name: "Historical Periods", code: "HSC-M23" },
        { name: "Option A: New Kingdom Egypt to the Death of Thutmose IV", code: "HSC-M24", children: [
          { name: "the chronological and geographical context of Egypt in the Near East, key powers in the region and the nature of contact with other societies", code: "HSC-M24-T1" },
          { name: "Internal developments", code: "HSC-M24-T2" },
          { name: "Expansion of Egypt’s boundaries", code: "HSC-M24-T3" },
        ] },
        { name: "Option B: New Kingdom Egypt – Amenhotep III to the Death of Ramesses II", code: "HSC-M25", children: [
          { name: "the chronological and geographical context of Egypt in the Near East, key powers in the region and the nature of contact with other societies", code: "HSC-M25-T1" },
          { name: "Internal developments", code: "HSC-M25-T2" },
          { name: "Foreign relations", code: "HSC-M25-T3" },
        ] },
        { name: "Option C: The Ancient Levant – First Temple Period c. 970–586 BC", code: "HSC-M26", children: [
          { name: "the chronological and geographical context of the Ancient Levant in the Near East, key powers in the region and the nature of contact with other societies", code: "HSC-M26-T1" },
          { name: "Israel and Judah in the Ancient Levant", code: "HSC-M26-T2" },
          { name: "Foreign relations with Assyria and Babylon", code: "HSC-M26-T3" },
        ] },
        { name: "Option D: Persia – Cyrus II to the Death of Darius III", code: "HSC-M27", children: [
          { name: "the chronological and geographical context of Persia in the Near East and Asia, key powers in the region and the nature of contact with other societies", code: "HSC-M27-T1" },
          { name: "Internal developments of Persia", code: "HSC-M27-T2" },
          { name: "The Persian Empire", code: "HSC-M27-T3" },
        ] },
        { name: "Option E: Imperial China – The Qin and Han 247–87 BC", code: "HSC-M28", children: [
          { name: "the chronological and geographical context of China in the East, key powers in the region and the nature of contact with other societies", code: "HSC-M28-T1" },
          { name: "Establishment of Qin power", code: "HSC-M28-T2" },
          { name: "Fall of the Qin and establishment of the Han", code: "HSC-M28-T3" },
          { name: "The empire", code: "HSC-M28-T4" },
        ] },
        { name: "Option F: The Greek World 500–440 BC", code: "HSC-M29", children: [
          { name: "the chronological and geographical context of ancient Greece in the Mediterranean and the Near East, key powers in the region and the nature of contact with other societies", code: "HSC-M29-T1" },
          { name: "Persian Wars", code: "HSC-M29-T2" },
          { name: "Development of Athens and the Athenian Empire", code: "HSC-M29-T3" },
          { name: "Athens and Sparta", code: "HSC-M29-T4" },
        ] },
        { name: "Option G: 4th–Century Greece to the Death of Philip II", code: "HSC-M30", children: [
          { name: "the chronological and geographical context of ancient Greece in the Mediterranean, key powers in the region and the nature of contact with other societies", code: "HSC-M30-T1" },
          { name: "Significant developments 404–362 BC", code: "HSC-M30-T2" },
          { name: "Greece and the rise of Macedon", code: "HSC-M30-T3" },
        ] },
        { name: "Option H: The Fall of the Roman Republic 78–31 BC", code: "HSC-M31", children: [
          { name: "the chronological and geographical context of Rome in the Mediterranean and the Near East, key powers in the region and the nature of contact with other societies", code: "HSC-M31-T1" },
          { name: "Political developments in the late Republic", code: "HSC-M31-T2" },
          { name: "Wars and expansion", code: "HSC-M31-T3" },
          { name: "Fall of the Republic", code: "HSC-M31-T4" },
        ] },
        { name: "Option I: The Augustan Age 44 BC–AD 14", code: "HSC-M32", children: [
          { name: "the chronological and geographical context of Rome in the Mediterranean and the Near East, key powers in the region and the nature of contact with other societies", code: "HSC-M32-T1" },
          { name: "Establishment of the principate", code: "HSC-M32-T2" },
          { name: "The Augustan principate", code: "HSC-M32-T3" },
          { name: "Augustus and the empire", code: "HSC-M32-T4" },
        ] },
        { name: "Option J: The Julio-Claudians AD 14–69", code: "HSC-M33", children: [
          { name: "the chronological and geographical context of Rome in the Mediterranean and the Near East, key powers in the region and the nature of contact with other societies", code: "HSC-M33-T1" },
          { name: "Development of the principate", code: "HSC-M33-T2" },
          { name: "The empire", code: "HSC-M33-T3" },
        ] },
      ] },
    ],
  }),
  template({
    id: "modern-history-2017",
    name: "Modern History (2017)",
    category: "HSC",
    subject: "Modern History",
    curriculum: "NSW Stage 6 (NESA)",
    version_year: "2017",
    description: "NSW Stage 6 Modern History (2017). Year 11 and Year 12 syllabus modules and their topics.",
    hierarchy: ["Year", "Module", "Topic"],
    tags: [
      "source_analysis", "source_evaluation", "historical_interpretation", "reliability", "historiography", "causation", "continuity_and_change", "significance", "perspectives", "essay", "extended_response", "short_answer", "multiple_choice", "comparison", "terminology",
    ],
    nodes: [
      { name: "Year 11", code: "PRE", children: [
        { name: "Historical Concepts and Skills", code: "PRE-M1", children: [
          { name: "Analysis and use of sources", code: "PRE-M1-T1" },
          { name: "Historical interpretation", code: "PRE-M1-T2" },
          { name: "Historical investigation and research", code: "PRE-M1-T3" },
          { name: "Explanation and communication", code: "PRE-M1-T4" },
        ] },
        { name: "Investigating Modern History – The Nature of Modern History", code: "PRE-M2" },
        { name: "The Investigation of Historic Sites and Sources", code: "PRE-M3", children: [
          { name: "the nature, range and importance of archives to historians of modern history and the digitisation of archival records", code: "PRE-M3-T1" },
          { name: "the reconstruction of historic sites and site chronology using evidence", code: "PRE-M3-T2" },
          { name: "the contribution of archaeological and scientific techniques in the investigation of the past, including site surveys, excavation, forensic examination, DNA analysis and exhumation", code: "PRE-M3-T3" },
          { name: "the contribution of historic sites and oral testimony to an understanding of events, developments and life in the past", code: "PRE-M3-T4" },
        ] },
        { name: "The Contestability of the Past", code: "PRE-M4", children: [
          { name: "how historians test hypotheses about the past through the corroboration of sources", code: "PRE-M4-T1" },
          { name: "problems associated with the evaluation of sources: authenticity, and reliability and usefulness for particular historical inquiries", code: "PRE-M4-T2" },
          { name: "the importance of understanding the historical context in the interpretation of sources", code: "PRE-M4-T3" },
          { name: "the role of sources and evidence in the evaluation of different theories about the past", code: "PRE-M4-T4" },
        ] },
        { name: "The Construction of Modern Histories", code: "PRE-M5", children: [
          { name: "an overview of different types of histories, including narrative history, biography, social and cultural history", code: "PRE-M5-T1" },
          { name: "the role of evidence, interpretation and perspective in the construction of historical accounts", code: "PRE-M5-T2" },
          { name: "problems associated with the construction of modern histories: the abundance of documentary material, the incomplete nature of evidence and political controls on access to source materials, including classified records", code: "PRE-M5-T3" },
          { name: "the role of selectivity, emphasis and omission in the construction of historical accounts", code: "PRE-M5-T4" },
        ] },
        { name: "History and Memory", code: "PRE-M6", children: [
          { name: "the nature of history compared to memoir, including oral accounts and national ceremonies", code: "PRE-M6-T1" },
          { name: "the contribution of oral history to our understanding of the past", code: "PRE-M6-T2" },
          { name: "the tensions between national memory and different perspectives on the past", code: "PRE-M6-T3" },
          { name: "an example of how memory can turn into myth", code: "PRE-M6-T4" },
          { name: "the variety of expressions of collective memory and a critical examination of an expression of memory as reflected through a film, monument, official document, statue or oral account", code: "PRE-M6-T5" },
        ] },
        { name: "The Representation and Commemoration of the Past", code: "PRE-M7", children: [
          { name: "the public nature of history and the uses of history", code: "PRE-M7-T1" },
          { name: "how history is represented through ONE of the following: memorials, museums, the media, film, documentaries and online", code: "PRE-M7-T2" },
          { name: "the need for critical analysis of representations of the past and historical methods that can be used for this purpose", code: "PRE-M7-T3" },
          { name: "the various ways the past is commemorated, including the role of key influences, eg nationalism and nation-building", code: "PRE-M7-T4" },
        ] },
        { name: "Investigating Modern History – Case Studies", code: "PRE-M8" },
        { name: "A1: Australia and the Rise of Communism", code: "PRE-M9", children: [
          { name: "the historical context", code: "PRE-M9-T1" },
          { name: "the nature of the communist presence in Australia and Asia", code: "PRE-M9-T2" },
          { name: "a relevant historical debate or issue", code: "PRE-M9-T3" },
        ] },
        { name: "A2: Making Change: Day of Mourning to Mabo", code: "PRE-M10", children: [
          { name: "the historical context", code: "PRE-M10-T1" },
          { name: "the nature of the modern Aboriginal political movement", code: "PRE-M10-T2" },
          { name: "a relevant historical debate or issue", code: "PRE-M10-T3" },
        ] },
        { name: "A3: The Changing Nature of Anglo-Irish Relations", code: "PRE-M11", children: [
          { name: "the historical context", code: "PRE-M11-T1" },
          { name: "the nature of Anglo-Irish relations", code: "PRE-M11-T2" },
          { name: "a relevant historical debate or issue", code: "PRE-M11-T3" },
        ] },
        { name: "A4: The Decline and Fall of the Romanov Dynasty", code: "PRE-M12", children: [
          { name: "the historical context", code: "PRE-M12-T1" },
          { name: "the nature of the decline and fall of the Romanov dynasty", code: "PRE-M12-T2" },
          { name: "a relevant historical debate or issue", code: "PRE-M12-T3" },
        ] },
        { name: "A5: The Trans-Atlantic Slave Trade", code: "PRE-M13", children: [
          { name: "the historical context", code: "PRE-M13-T1" },
          { name: "the nature of the Trans-Atlantic slave trade", code: "PRE-M13-T2" },
          { name: "a relevant historical debate or issue", code: "PRE-M13-T3" },
        ] },
        { name: "A6: The American Civil War", code: "PRE-M14", children: [
          { name: "the historical context", code: "PRE-M14-T1" },
          { name: "the nature of the American Civil War", code: "PRE-M14-T2" },
          { name: "a relevant historical debate or issue", code: "PRE-M14-T3" },
        ] },
        { name: "A7: The Rise of the Environmental Movement", code: "PRE-M15", children: [
          { name: "the historical context", code: "PRE-M15-T1" },
          { name: "the nature of the environmental movement", code: "PRE-M15-T2" },
          { name: "a relevant historical debate or issue", code: "PRE-M15-T3" },
        ] },
        { name: "A8: Women’s Movements", code: "PRE-M16", children: [
          { name: "the historical context", code: "PRE-M16-T1" },
          { name: "the nature of women’s movements", code: "PRE-M16-T2" },
          { name: "a relevant historical debate or issue", code: "PRE-M16-T3" },
        ] },
        { name: "B1: The Boxer Rebellion in China", code: "PRE-M17", children: [
          { name: "the historical context", code: "PRE-M17-T1" },
          { name: "the nature of the Boxer Rebellion in China", code: "PRE-M17-T2" },
          { name: "a relevant historical debate or issue", code: "PRE-M17-T3" },
        ] },
        { name: "B2: The British in India and Burma", code: "PRE-M18", children: [
          { name: "the historical context", code: "PRE-M18-T1" },
          { name: "the nature of tensions with the British", code: "PRE-M18-T2" },
          { name: "a relevant historical debate or issue", code: "PRE-M18-T3" },
        ] },
        { name: "B3: The Meiji Restoration", code: "PRE-M19", children: [
          { name: "the historical context", code: "PRE-M19-T1" },
          { name: "the nature of the Meiji Restoration", code: "PRE-M19-T2" },
          { name: "a relevant historical debate or issue", code: "PRE-M19-T3" },
        ] },
        { name: "B4: Tibet in the Modern World", code: "PRE-M20", children: [
          { name: "the historical context", code: "PRE-M20-T1" },
          { name: "the nature of Tibet’s relations with China", code: "PRE-M20-T2" },
          { name: "a relevant historical debate or issue", code: "PRE-M20-T3" },
        ] },
        { name: "B5: Making Contact with the Pacific", code: "PRE-M21", children: [
          { name: "the historical context", code: "PRE-M21-T1" },
          { name: "the nature of contact with the Pacific", code: "PRE-M21-T2" },
          { name: "a relevant historical debate or issue", code: "PRE-M21-T3" },
        ] },
        { name: "B6: The Making of Modern South Africa", code: "PRE-M22", children: [
          { name: "the historical context", code: "PRE-M22-T1" },
          { name: "the nature of modern South Africa 1890–1910", code: "PRE-M22-T2" },
          { name: "a relevant historical debate or issue", code: "PRE-M22-T3" },
        ] },
        { name: "B7: The Origins of the Arab–Israeli Conflict", code: "PRE-M23", children: [
          { name: "the historical context", code: "PRE-M23-T1" },
          { name: "the nature of Arab–Israeli tensions", code: "PRE-M23-T2" },
          { name: "a relevant historical debate or issue", code: "PRE-M23-T3" },
        ] },
        { name: "B8: The Cuban Revolution", code: "PRE-M24", children: [
          { name: "the historical context", code: "PRE-M24-T1" },
          { name: "the nature of the Cuban Revolution", code: "PRE-M24-T2" },
          { name: "a relevant historical debate or issue", code: "PRE-M24-T3" },
        ] },
        { name: "Historical Investigation", code: "PRE-M25", children: [
          { name: "The process of historical investigation", code: "PRE-M25-T1" },
        ] },
        { name: "The Shaping of the Modern World", code: "PRE-M26" },
        { name: "Topic 1: The Enlightenment", code: "PRE-M27", children: [
          { name: "the historical context", code: "PRE-M27-T1" },
          { name: "the nature of the Enlightenment", code: "PRE-M27-T2" },
          { name: "the nature and legacy of the Enlightenment and its influence on modernity", code: "PRE-M27-T3" },
        ] },
        { name: "Topic 2: The French Revolution", code: "PRE-M28", children: [
          { name: "the historical context", code: "PRE-M28-T1" },
          { name: "the nature of the French Revolution", code: "PRE-M28-T2" },
          { name: "the nature and legacy of the French Revolution and its influence on modernity", code: "PRE-M28-T3" },
        ] },
        { name: "Topic 3: The Age of Imperialism", code: "PRE-M29", children: [
          { name: "the historical context", code: "PRE-M29-T1" },
          { name: "the nature of the Age of Imperialism", code: "PRE-M29-T2" },
          { name: "the nature and legacy of imperialism and its influence on modernity", code: "PRE-M29-T3" },
        ] },
        { name: "Topic 4: The Industrial Age", code: "PRE-M30", children: [
          { name: "the historical context", code: "PRE-M30-T1" },
          { name: "the nature of the Industrial Age", code: "PRE-M30-T2" },
          { name: "the nature and legacy of the Industrial Age and its influence on modernity", code: "PRE-M30-T3" },
        ] },
        { name: "Topic 5: World War I", code: "PRE-M31", children: [
          { name: "the historical context", code: "PRE-M31-T1" },
          { name: "the nature of World War I", code: "PRE-M31-T2" },
          { name: "the nature and legacy of World War I and its influence on modernity", code: "PRE-M31-T3" },
        ] },
        { name: "Topic 6: The End of Empire", code: "PRE-M32", children: [
          { name: "the historical context", code: "PRE-M32-T1" },
          { name: "the nature of ‘the end of empire’", code: "PRE-M32-T2" },
          { name: "the nature and legacy of ‘the end of empire’ and its influence on modernity", code: "PRE-M32-T3" },
        ] },
      ] },
      { name: "Year 12", code: "HSC", children: [
        { name: "Historical Concepts and Skills", code: "HSC-M1", children: [
          { name: "Analysis and use of sources", code: "HSC-M1-T1" },
          { name: "Historical interpretation", code: "HSC-M1-T2" },
          { name: "Historical investigation and research", code: "HSC-M1-T3" },
          { name: "Explanation and communication", code: "HSC-M1-T4" },
        ] },
        { name: "Core Study: Power and Authority in the Modern World 1919–1946", code: "HSC-M2", children: [
          { name: "Survey", code: "HSC-M2-T1" },
          { name: "The rise of dictatorships after World War I", code: "HSC-M2-T2" },
          { name: "The Nazi regime to 1939", code: "HSC-M2-T3" },
          { name: "The search for peace and security in the world", code: "HSC-M2-T4" },
        ] },
        { name: "National Studies", code: "HSC-M3" },
        { name: "Option A: Australia 1918–1949", code: "HSC-M4", children: [
          { name: "Australia and the aftermath of World War I", code: "HSC-M4-T1" },
          { name: "Changing face of Australia in the 1920s", code: "HSC-M4-T2" },
          { name: "Government policy 1918–1949", code: "HSC-M4-T3" },
          { name: "Post-World War II influences", code: "HSC-M4-T4" },
        ] },
        { name: "Option B: China 1927–1949", code: "HSC-M5", children: [
          { name: "The Nationalist decade 1927–1937", code: "HSC-M5-T1" },
          { name: "The rise of the Communist Party", code: "HSC-M5-T2" },
          { name: "Resistance to Japan", code: "HSC-M5-T3" },
          { name: "The triumph of the Chinese Communist Party", code: "HSC-M5-T4" },
        ] },
        { name: "Option C: India 1942–1984", code: "HSC-M6", children: [
          { name: "India towards independence", code: "HSC-M6-T1" },
          { name: "India as a new nation 1947–1964", code: "HSC-M6-T2" },
          { name: "India under Indira Gandhi", code: "HSC-M6-T3" },
          { name: "Indian foreign policy", code: "HSC-M6-T4" },
        ] },
        { name: "Option D: Indonesia 1945–2005", code: "HSC-M7", children: [
          { name: "Emergence of the Indonesian Republic 1945–1965", code: "HSC-M7-T1" },
          { name: "The 1965 coup", code: "HSC-M7-T2" },
          { name: "The New Order", code: "HSC-M7-T3" },
          { name: "Indonesian foreign policy", code: "HSC-M7-T4" },
        ] },
        { name: "Option E: Japan 1904–1937", code: "HSC-M8", children: [
          { name: "Japan as an emerging power", code: "HSC-M8-T1" },
          { name: "Challenges to traditional power and authority in the 1920s", code: "HSC-M8-T2" },
          { name: "Rise of militarism in the 1930s", code: "HSC-M8-T3" },
          { name: "Japanese foreign policy", code: "HSC-M8-T4" },
        ] },
        { name: "Option F: Russia and the Soviet Union 1917–1941", code: "HSC-M9", children: [
          { name: "Bolshevik consolidation of power", code: "HSC-M9-T1" },
          { name: "The Bolsheviks and the power struggle following the death of Lenin", code: "HSC-M9-T2" },
          { name: "The Soviet State under Stalin", code: "HSC-M9-T3" },
          { name: "Soviet foreign policy", code: "HSC-M9-T4" },
        ] },
        { name: "Option G: USA 1919–1941", code: "HSC-M10", children: [
          { name: "The USA in the aftermath of World War I and politics in the 1920s", code: "HSC-M10-T1" },
          { name: "The Great Depression and its impact", code: "HSC-M10-T2" },
          { name: "US society 1919–1941", code: "HSC-M10-T3" },
          { name: "US foreign policy", code: "HSC-M10-T4" },
        ] },
        { name: "Option H: Iran 1945–1989", code: "HSC-M11", children: [
          { name: "Iran from the end of World War II to the 1953 Coup", code: "HSC-M11-T1" },
          { name: "The rule of the Shah of Iran 1953–1979", code: "HSC-M11-T2" },
          { name: "The Revolution of 1979", code: "HSC-M11-T3" },
          { name: "Iran under Khomeini 1979–1989", code: "HSC-M11-T4" },
        ] },
        { name: "Peace and Conflict", code: "HSC-M12" },
        { name: "Option A: Conflict in Indochina 1954–1979", code: "HSC-M13", children: [
          { name: "Decolonisation in Indochina", code: "HSC-M13-T1" },
          { name: "Conflict in Vietnam, 1954–1964", code: "HSC-M13-T2" },
          { name: "The Second Indochina War", code: "HSC-M13-T3" },
          { name: "The spread of the conflict to Cambodia and Laos", code: "HSC-M13-T4" },
        ] },
        { name: "Option B: Conflict in the Pacific 1937–1951", code: "HSC-M14", children: [
          { name: "Growth of Pacific tensions", code: "HSC-M14-T1" },
          { name: "The outbreak and course of the Pacific War", code: "HSC-M14-T2" },
          { name: "Civilians at war", code: "HSC-M14-T3" },
          { name: "End of the conflict", code: "HSC-M14-T4" },
        ] },
        { name: "Option C: Conflict in Europe 1935–1945", code: "HSC-M15", children: [
          { name: "Growth of European tensions", code: "HSC-M15-T1" },
          { name: "German foreign policy", code: "HSC-M15-T2" },
          { name: "Course of the European war", code: "HSC-M15-T3" },
          { name: "Civilians at war", code: "HSC-M15-T4" },
          { name: "End of the conflict", code: "HSC-M15-T5" },
        ] },
        { name: "Option D: The Cold War 1945–1991", code: "HSC-M16", children: [
          { name: "Origins of the Cold War 1945–1953", code: "HSC-M16-T1" },
          { name: "Development of the Cold War to 1968", code: "HSC-M16-T2" },
          { name: "Détente", code: "HSC-M16-T3" },
          { name: "Renewal and end of the Cold War", code: "HSC-M16-T4" },
        ] },
        { name: "Option E: Conflict in the Gulf 1980–2011", code: "HSC-M17", children: [
          { name: "Origins of the First Gulf War", code: "HSC-M17-T1" },
          { name: "Tension in the Gulf", code: "HSC-M17-T2" },
          { name: "Consequences of the 1991 defeat of Saddam Hussein", code: "HSC-M17-T3" },
          { name: "The Iraq War", code: "HSC-M17-T4" },
          { name: "Iraq in transition 2003–2011", code: "HSC-M17-T5" },
        ] },
        { name: "Option F: The Arab–Israeli Conflict 1948–1996", code: "HSC-M18", children: [
          { name: "Origins of tension", code: "HSC-M18-T1" },
          { name: "War and peace", code: "HSC-M18-T2" },
          { name: "The Occupied Territories and Lebanon", code: "HSC-M18-T3" },
          { name: "The peace process", code: "HSC-M18-T4" },
        ] },
        { name: "Change in the Modern World", code: "HSC-M19" },
        { name: "Option A: Pro-democracy Movement in Burma 1945–2010", code: "HSC-M20", children: [
          { name: "Modern Burma at the end of World War II", code: "HSC-M20-T1" },
          { name: "Independence and democracy", code: "HSC-M20-T2" },
          { name: "The rise of the military in Burma", code: "HSC-M20-T3" },
          { name: "The uprising of 1988 and the election of Aung San Suu Kyi in 1990", code: "HSC-M20-T4" },
          { name: "The response of the military government 1990–2010", code: "HSC-M20-T5" },
        ] },
        { name: "Option B: The Cultural Revolution to Tiananmen Square 1966–1989", code: "HSC-M21", children: [
          { name: "Political and social conditions in China at the start of the period", code: "HSC-M21-T1" },
          { name: "The Cultural Revolution", code: "HSC-M21-T2" },
          { name: "Deng Xiaoping and the modernisation of China", code: "HSC-M21-T3" },
          { name: "The Tiananmen Square protests", code: "HSC-M21-T4" },
        ] },
        { name: "Option C: Civil Rights in the USA 1945–1968", code: "HSC-M22", children: [
          { name: "The position of African Americans at the start of the period", code: "HSC-M22-T1" },
          { name: "Struggles for civil rights", code: "HSC-M22-T2" },
          { name: "Key events of the civil rights movement", code: "HSC-M22-T3" },
          { name: "Achievements of the civil rights movement", code: "HSC-M22-T4" },
        ] },
        { name: "Option D: The Changing World Order 1945–2011", code: "HSC-M23", children: [
          { name: "World order 1945–1989", code: "HSC-M23-T1" },
          { name: "The collapse of the USSR and the nature of post-Soviet societies", code: "HSC-M23-T2" },
          { name: "The influence of the USA internationally 1991–2011", code: "HSC-M23-T3" },
          { name: "New centres of global power 1989–2011", code: "HSC-M23-T4" },
          { name: "The United Nations in post-Cold War history 1991–2011", code: "HSC-M23-T5" },
        ] },
        { name: "Option E: The Nuclear Age 1945–2011", code: "HSC-M24", children: [
          { name: "The birth of the Nuclear Age", code: "HSC-M24-T1" },
          { name: "The first use of atomic weapons and nuclear deterrence", code: "HSC-M24-T2" },
          { name: "The nuclear threat and weapons testing", code: "HSC-M24-T3" },
          { name: "Towards nuclear disarmament", code: "HSC-M24-T4" },
          { name: "The benefits and risks of the Nuclear Age", code: "HSC-M24-T5" },
        ] },
        { name: "Option F: Apartheid in South Africa 1960–1994", code: "HSC-M25", children: [
          { name: "The nature of the apartheid system", code: "HSC-M25-T1" },
          { name: "National resistance to apartheid", code: "HSC-M25-T2" },
          { name: "Repression and control by South African governments", code: "HSC-M25-T3" },
          { name: "End of apartheid", code: "HSC-M25-T4" },
        ] },
      ] },
    ],
  }),
  template({
    id: "legal-studies-2009",
    name: "Legal Studies (2009)",
    category: "HSC",
    subject: "Legal Studies",
    curriculum: "NSW Stage 6 (NESA)",
    version_year: "2009",
    description: "NSW Stage 6 Legal Studies (2009). Year 11 and Year 12 syllabus modules and their topics.",
    hierarchy: ["Year", "Module", "Topic"],
    tags: [
      "legal_reasoning", "case_analysis", "legislation_analysis", "scenario_application", "evaluation", "explanation", "essay", "extended_response", "media_analysis", "contemporary_issues", "comparison", "legal_terminology", "short_answer", "multiple_choice", "action_required",
    ],
    nodes: [
      { name: "Year 11", code: "PRE", children: [
        { name: "Law in practice", code: "PRE-M1", children: [
          { name: "Contemporary legal issues", code: "PRE-M1-T1" },
        ] },
        { name: "The legal system", code: "PRE-M2", children: [
          { name: "Basic legal concepts", code: "PRE-M2-T1" },
          { name: "Sources of contemporary Australian law", code: "PRE-M2-T2" },
          { name: "Classification of law", code: "PRE-M2-T3" },
          { name: "Law reform", code: "PRE-M2-T4" },
          { name: "Law reform in action", code: "PRE-M2-T5" },
        ] },
        { name: "The individual and the law", code: "PRE-M3", children: [
          { name: "Your rights and responsibilities", code: "PRE-M3-T1" },
          { name: "Resolving disputes", code: "PRE-M3-T2" },
          { name: "Contemporary issue: The individual and technology", code: "PRE-M3-T3" },
        ] },
      ] },
      { name: "Year 12", code: "HSC", children: [
        { name: "Human rights", code: "HSC-M1", children: [
          { name: "The nature and development of human rights", code: "HSC-M1-T1" },
          { name: "Promoting and enforcing human rights", code: "HSC-M1-T2" },
          { name: "Contemporary issue concerning the promotion and/or enforcement of human rights", code: "HSC-M1-T3" },
        ] },
        { name: "Option 1: Consumers", code: "HSC-M2", children: [
          { name: "The nature of consumer law", code: "HSC-M2-T1" },
          { name: "Consumer redress and remedies", code: "HSC-M2-T2" },
          { name: "Contemporary issues concerning consumers", code: "HSC-M2-T3" },
        ] },
        { name: "Option 2: Global environmental protection", code: "HSC-M3", children: [
          { name: "The nature of global environmental protection", code: "HSC-M3-T1" },
          { name: "Responses to global environmental protection", code: "HSC-M3-T2" },
          { name: "Contemporary issues concerning global environmental protection", code: "HSC-M3-T3" },
        ] },
        { name: "Option 3: Family", code: "HSC-M4", children: [
          { name: "The nature of family law", code: "HSC-M4-T1" },
          { name: "Responses to problems in family relationships", code: "HSC-M4-T2" },
          { name: "Contemporary issues concerning family law", code: "HSC-M4-T3" },
        ] },
        { name: "Option 4: Indigenous peoples", code: "HSC-M5", children: [
          { name: "Nature of the law and indigenous peoples", code: "HSC-M5-T1" },
          { name: "Responses to indigenous peoples", code: "HSC-M5-T2" },
          { name: "Contemporary issues concerning indigenous peoples", code: "HSC-M5-T3" },
        ] },
        { name: "Option 5: Shelter", code: "HSC-M6", children: [
          { name: "The nature of shelter", code: "HSC-M6-T1" },
          { name: "Legal protection and remedies associated with securing shelter", code: "HSC-M6-T2" },
          { name: "Contemporary issues concerning shelter", code: "HSC-M6-T3" },
        ] },
        { name: "Option 6: Workplace", code: "HSC-M7", children: [
          { name: "The nature of workplace law", code: "HSC-M7-T1" },
          { name: "Regulation of the workplace", code: "HSC-M7-T2" },
          { name: "Contemporary issues concerning the workplace", code: "HSC-M7-T3" },
        ] },
        { name: "Option 7: World order", code: "HSC-M8", children: [
          { name: "The nature of world order", code: "HSC-M8-T1" },
          { name: "Responses to world order", code: "HSC-M8-T2" },
          { name: "Contemporary issues concerning world order", code: "HSC-M8-T3" },
        ] },
        { name: "Crime", code: "HSC-M9", children: [
          { name: "The nature of crime", code: "HSC-M9-T1" },
          { name: "The criminal investigation process", code: "HSC-M9-T2" },
          { name: "The criminal trial process", code: "HSC-M9-T3" },
          { name: "Sentencing and punishment", code: "HSC-M9-T4" },
          { name: "Young offenders", code: "HSC-M9-T5" },
          { name: "International crime", code: "HSC-M9-T6" },
        ] },
      ] },
    ],
  }),
  template({
    id: "economics-2011",
    name: "Economics (2011)",
    category: "HSC",
    subject: "Economics",
    curriculum: "NSW Stage 6 (NESA)",
    version_year: "2011",
    description: "NSW Stage 6 Economics (2011). Year 11 and Year 12 syllabus modules and their topics.",
    hierarchy: ["Year", "Module", "Topic"],
    tags: [
      "explanation", "analysis", "evaluation", "data_analysis", "graphing", "calculation", "case_study", "contemporary_examples", "policy_analysis", "statistics", "interpretation", "extended_response", "short_answer", "multiple_choice", "action_required",
    ],
    nodes: [
      { name: "Year 11", code: "PRE", children: [
        { name: "Introduction to Economics", code: "PRE-M1", children: [
          { name: "The nature of economics", code: "PRE-M1-T1" },
          { name: "The operation of an economy", code: "PRE-M1-T2" },
          { name: "Economies: their similarities and differences", code: "PRE-M1-T3" },
        ] },
        { name: "Consumers and Business", code: "PRE-M2", children: [
          { name: "The role of consumers in the economy", code: "PRE-M2-T1" },
          { name: "The role of business in the economy", code: "PRE-M2-T2" },
        ] },
        { name: "Markets", code: "PRE-M3", children: [
          { name: "The role of the market", code: "PRE-M3-T1" },
          { name: "Demand", code: "PRE-M3-T2" },
          { name: "Supply", code: "PRE-M3-T3" },
          { name: "Market price", code: "PRE-M3-T4" },
          { name: "Alternatives to market solutions – the role of government", code: "PRE-M3-T5" },
          { name: "Price elasticity of demand", code: "PRE-M3-T6" },
          { name: "Price elasticity of supply", code: "PRE-M3-T7" },
          { name: "Market structures", code: "PRE-M3-T8" },
        ] },
        { name: "Labour Markets", code: "PRE-M4", children: [
          { name: "Demand for and supply of labour", code: "PRE-M4-T1" },
          { name: "The Australian workforce", code: "PRE-M4-T2" },
          { name: "Labour market outcomes", code: "PRE-M4-T3" },
          { name: "Labour market trends", code: "PRE-M4-T4" },
          { name: "Labour market institutions", code: "PRE-M4-T5" },
        ] },
        { name: "Financial Markets", code: "PRE-M5", children: [
          { name: "Financial markets in Australia", code: "PRE-M5-T1" },
          { name: "Borrowers", code: "PRE-M5-T2" },
          { name: "Factors affecting the demand for funds", code: "PRE-M5-T3" },
          { name: "Lenders", code: "PRE-M5-T4" },
          { name: "Financial aggregates measured by the Reserve Bank of Australia", code: "PRE-M5-T5" },
          { name: "Interest rates", code: "PRE-M5-T6" },
        ] },
        { name: "Government in the Economy", code: "PRE-M6", children: [
          { name: "Government intervention in the economy", code: "PRE-M6-T1" },
          { name: "The role of government", code: "PRE-M6-T2" },
          { name: "Influences on government policies in Australia", code: "PRE-M6-T3" },
        ] },
      ] },
      { name: "Year 12", code: "HSC", children: [
        { name: "The Global Economy", code: "HSC-M1", children: [
          { name: "International economic integration", code: "HSC-M1-T1" },
          { name: "Trade, financial flows and foreign investment", code: "HSC-M1-T2" },
          { name: "Protection", code: "HSC-M1-T3" },
          { name: "Globalisation and economic development", code: "HSC-M1-T4" },
        ] },
        { name: "Australia’s Place in the Global Economy", code: "HSC-M2", children: [
          { name: "Australia’s trade and financial flows", code: "HSC-M2-T1" },
          { name: "Australia’s Balance of Payments", code: "HSC-M2-T2" },
          { name: "Exchange rates", code: "HSC-M2-T3" },
          { name: "Free trade and protection", code: "HSC-M2-T4" },
        ] },
        { name: "Economic Issues", code: "HSC-M3", children: [
          { name: "Economic growth", code: "HSC-M3-T1" },
          { name: "Unemployment", code: "HSC-M3-T2" },
          { name: "Inflation", code: "HSC-M3-T3" },
          { name: "External stability", code: "HSC-M3-T4" },
          { name: "Distribution of income and wealth", code: "HSC-M3-T5" },
          { name: "Environmental sustainability", code: "HSC-M3-T6" },
        ] },
        { name: "Economic Policies and Management", code: "HSC-M4", children: [
          { name: "Economic objectives", code: "HSC-M4-T1" },
          { name: "Macroeconomic policies", code: "HSC-M4-T2" },
          { name: "Fiscal policy", code: "HSC-M4-T3" },
          { name: "Monetary policy", code: "HSC-M4-T4" },
          { name: "Microeconomic policies", code: "HSC-M4-T5" },
          { name: "Labour market policies", code: "HSC-M4-T6" },
          { name: "National and global context for environmental management", code: "HSC-M4-T7" },
          { name: "Limitations of economic policies", code: "HSC-M4-T8" },
          { name: "Policy responses and their effects in dealing with the economic objectives", code: "HSC-M4-T9" },
        ] },
      ] },
    ],
  }),
  template({
    id: "music-1-2010",
    name: "Music 1 (2010)",
    category: "HSC",
    subject: "Music 1",
    curriculum: "NSW Stage 6 (NESA)",
    version_year: "2010",
    description: "NSW Stage 6 Music 1 (2010). Year 11 and Year 12 syllabus modules and their topics.",
    hierarchy: ["Year", "Module", "Topic"],
    tags: [
      "aural_analysis", "musicology", "composition", "performance", "listening", "score_reading", "music_language", "context_analysis", "creative_practice", "reflection", "improvisation", "analysis", "short_answer", "extended_response", "multiple_choice",
    ],
    nodes: [
      { name: "Year 11", code: "PRE", children: [
        { name: "Musical concepts", code: "PRE-M1", children: [
          { name: "duration", code: "PRE-M1-T1" },
          { name: "pitch", code: "PRE-M1-T2" },
          { name: "dynamics and expressive techniques", code: "PRE-M1-T3" },
          { name: "tone colour", code: "PRE-M1-T4" },
          { name: "texture", code: "PRE-M1-T5" },
          { name: "structure", code: "PRE-M1-T6" },
        ] },
        { name: "Music context and language", code: "PRE-M2", children: [
          { name: "Music context", code: "PRE-M2-T1" },
          { name: "Theoretical language", code: "PRE-M2-T2" },
          { name: "Compositional language", code: "PRE-M2-T3" },
          { name: "Notational language", code: "PRE-M2-T4" },
        ] },
        { name: "Topics available for study", code: "PRE-M3", children: [
          { name: "An instrument and its repertoire", code: "PRE-M3-T1" },
          { name: "Australian music", code: "PRE-M3-T2" },
          { name: "Baroque music", code: "PRE-M3-T3" },
          { name: "Jazz", code: "PRE-M3-T4" },
          { name: "Medieval music", code: "PRE-M3-T5" },
          { name: "Methods of notating music", code: "PRE-M3-T6" },
          { name: "Music and religion", code: "PRE-M3-T7" },
          { name: "Music and the related arts", code: "PRE-M3-T8" },
          { name: "Music for large ensembles", code: "PRE-M3-T9" },
          { name: "Music for radio, film, television and multimedia", code: "PRE-M3-T10" },
          { name: "Music for small ensembles", code: "PRE-M3-T11" },
          { name: "Music in education", code: "PRE-M3-T12" },
          { name: "Music of a culture (Preliminary course)", code: "PRE-M3-T13" },
          { name: "Music of a culture (HSC course)", code: "PRE-M3-T14" },
          { name: "Music of the 18th century", code: "PRE-M3-T15" },
          { name: "Music of the 19th century", code: "PRE-M3-T16" },
          { name: "Music of the 20th and 21st centuries", code: "PRE-M3-T17" },
          { name: "Popular music", code: "PRE-M3-T18" },
          { name: "Renaissance music", code: "PRE-M3-T19" },
          { name: "Rock music", code: "PRE-M3-T20" },
          { name: "Technology and its influence on music", code: "PRE-M3-T21" },
          { name: "Theatre music", code: "PRE-M3-T22" },
        ] },
        { name: "Creative practice", code: "PRE-M4", children: [
          { name: "Performing", code: "PRE-M4-T1" },
          { name: "Listening, analysing and responding", code: "PRE-M4-T2" },
          { name: "Creating and composing", code: "PRE-M4-T3" },
        ] },
      ] },
      { name: "Year 12", code: "HSC", children: [
        { name: "Musical concepts", code: "HSC-M1", children: [
          { name: "duration", code: "HSC-M1-T1" },
          { name: "pitch", code: "HSC-M1-T2" },
          { name: "dynamics and expressive techniques", code: "HSC-M1-T3" },
          { name: "tone colour", code: "HSC-M1-T4" },
          { name: "texture", code: "HSC-M1-T5" },
          { name: "structure", code: "HSC-M1-T6" },
        ] },
        { name: "Music context and language", code: "HSC-M2", children: [
          { name: "Music context", code: "HSC-M2-T1" },
          { name: "Theoretical language", code: "HSC-M2-T2" },
          { name: "Compositional language", code: "HSC-M2-T3" },
          { name: "Notational language", code: "HSC-M2-T4" },
        ] },
        { name: "Topics available for study", code: "HSC-M3", children: [
          { name: "An instrument and its repertoire", code: "HSC-M3-T1" },
          { name: "Australian music", code: "HSC-M3-T2" },
          { name: "Baroque music", code: "HSC-M3-T3" },
          { name: "Jazz", code: "HSC-M3-T4" },
          { name: "Medieval music", code: "HSC-M3-T5" },
          { name: "Methods of notating music", code: "HSC-M3-T6" },
          { name: "Music and religion", code: "HSC-M3-T7" },
          { name: "Music and the related arts", code: "HSC-M3-T8" },
          { name: "Music for large ensembles", code: "HSC-M3-T9" },
          { name: "Music for radio, film, television and multimedia", code: "HSC-M3-T10" },
          { name: "Music for small ensembles", code: "HSC-M3-T11" },
          { name: "Music in education", code: "HSC-M3-T12" },
          { name: "Music of a culture (Preliminary course)", code: "HSC-M3-T13" },
          { name: "Music of a culture (HSC course)", code: "HSC-M3-T14" },
          { name: "Music of the 18th century", code: "HSC-M3-T15" },
          { name: "Music of the 19th century", code: "HSC-M3-T16" },
          { name: "Music of the 20th and 21st centuries", code: "HSC-M3-T17" },
          { name: "Popular music", code: "HSC-M3-T18" },
          { name: "Renaissance music", code: "HSC-M3-T19" },
          { name: "Rock music", code: "HSC-M3-T20" },
          { name: "Technology and its influence on music", code: "HSC-M3-T21" },
          { name: "Theatre music", code: "HSC-M3-T22" },
        ] },
        { name: "Music of the last 25 years (Australian focus)", code: "HSC-M4", children: [
          { name: "Performing", code: "HSC-M4-T1" },
          { name: "Listening, analysing and responding", code: "HSC-M4-T2" },
          { name: "Creating and composing", code: "HSC-M4-T3" },
        ] },
        { name: "Music across cultures, traditions and time", code: "HSC-M5", children: [
          { name: "Performing", code: "HSC-M5-T1" },
          { name: "Listening, analysing and responding", code: "HSC-M5-T2" },
          { name: "Creating and composing", code: "HSC-M5-T3" },
        ] },
      ] },
    ],
  }),
  template({
    id: "music-2-2010",
    name: "Music 2 (2010)",
    category: "HSC",
    subject: "Music 2",
    curriculum: "NSW Stage 6 (NESA)",
    version_year: "2010",
    description: "NSW Stage 6 Music 2 (2010). Year 11 and Year 12 syllabus modules and their topics.",
    hierarchy: ["Year", "Module", "Topic"],
    tags: [
      "aural_analysis", "musicology", "composition", "performance", "listening", "score_reading", "music_language", "context_analysis", "creative_practice", "reflection", "harmony", "analysis", "short_answer", "extended_response", "multiple_choice",
    ],
    nodes: [
      { name: "Year 11", code: "PRE", children: [
        { name: "Musical concepts", code: "PRE-M1", children: [
          { name: "duration", code: "PRE-M1-T1" },
          { name: "pitch", code: "PRE-M1-T2" },
          { name: "dynamics and expressive techniques", code: "PRE-M1-T3" },
          { name: "tone colour", code: "PRE-M1-T4" },
          { name: "texture", code: "PRE-M1-T5" },
          { name: "structure", code: "PRE-M1-T6" },
        ] },
        { name: "Music context and language", code: "PRE-M2", children: [
          { name: "Context", code: "PRE-M2-T1" },
          { name: "Theoretical language", code: "PRE-M2-T2" },
          { name: "Compositional language", code: "PRE-M2-T3" },
          { name: "Notational language", code: "PRE-M2-T4" },
        ] },
        { name: "Music 1600–1900", code: "PRE-M3", children: [
          { name: "Baroque", code: "PRE-M3-T1" },
          { name: "Classical", code: "PRE-M3-T2" },
          { name: "Nineteenth century music", code: "PRE-M3-T3" },
        ] },
        { name: "Additional topics", code: "PRE-M4", children: [
          { name: "Australian music", code: "PRE-M4-T1" },
          { name: "Music of a culture", code: "PRE-M4-T2" },
          { name: "Medieval music", code: "PRE-M4-T3" },
          { name: "Renaissance music", code: "PRE-M4-T4" },
          { name: "Music 1900–1945", code: "PRE-M4-T5" },
          { name: "Music 1945 to music 25 years ago", code: "PRE-M4-T6" },
        ] },
        { name: "Music of Western art traditions 1", code: "PRE-M5", children: [
          { name: "Performing", code: "PRE-M5-T1" },
          { name: "Listening, analysing and responding", code: "PRE-M5-T2" },
          { name: "Creating and composing", code: "PRE-M5-T3" },
        ] },
      ] },
      { name: "Year 12", code: "HSC", children: [
        { name: "Musical concepts", code: "HSC-M1", children: [
          { name: "duration", code: "HSC-M1-T1" },
          { name: "pitch", code: "HSC-M1-T2" },
          { name: "dynamics and expressive techniques", code: "HSC-M1-T3" },
          { name: "tone colour", code: "HSC-M1-T4" },
          { name: "texture", code: "HSC-M1-T5" },
          { name: "structure", code: "HSC-M1-T6" },
        ] },
        { name: "Music context and language", code: "HSC-M2", children: [
          { name: "Context", code: "HSC-M2-T1" },
          { name: "Theoretical language", code: "HSC-M2-T2" },
          { name: "Compositional language", code: "HSC-M2-T3" },
          { name: "Notational language", code: "HSC-M2-T4" },
        ] },
        { name: "Music of the last 25 years (Australian focus)", code: "HSC-M3", children: [
          { name: "Performing", code: "HSC-M3-T1" },
          { name: "Listening, analysing and responding", code: "HSC-M3-T2" },
          { name: "Creating and composing", code: "HSC-M3-T3" },
          { name: "Art music", code: "HSC-M3-T4" },
          { name: "Popular music", code: "HSC-M3-T5" },
          { name: "Music in radio, film, television and multimedia", code: "HSC-M3-T6" },
          { name: "Jazz", code: "HSC-M3-T7" },
          { name: "Music for theatre", code: "HSC-M3-T8" },
        ] },
        { name: "Additional topics", code: "HSC-M4", children: [
          { name: "Music of a culture", code: "HSC-M4-T1" },
          { name: "Medieval music", code: "HSC-M4-T2" },
          { name: "Renaissance music", code: "HSC-M4-T3" },
          { name: "Baroque music", code: "HSC-M4-T4" },
          { name: "Classical music", code: "HSC-M4-T5" },
          { name: "Music in the nineteenth century", code: "HSC-M4-T6" },
          { name: "Music 1900–1945", code: "HSC-M4-T7" },
          { name: "Music 1945 to music 25 years ago", code: "HSC-M4-T8" },
        ] },
        { name: "Music of Western art traditions 2", code: "HSC-M5", children: [
          { name: "Performing", code: "HSC-M5-T1" },
          { name: "Listening, analysing and responding", code: "HSC-M5-T2" },
          { name: "Creating and composing", code: "HSC-M5-T3" },
        ] },
        { name: "Elective project", code: "HSC-M6", children: [
          { name: "Performing", code: "HSC-M6-T1" },
          { name: "Listening, analysing and responding (musicology)", code: "HSC-M6-T2" },
          { name: "Creating and composing", code: "HSC-M6-T3" },
        ] },
      ] },
    ],
  }),
];

/** Groups every declared category in order (empties included) so the UI can
 * show a stable section list. */
export function templatesByCategory(
  categories: readonly string[] = TEMPLATE_CATEGORIES,
  templates: readonly CourseTemplate[] = COURSE_TEMPLATES
): Array<{ category: string; templates: CourseTemplate[] }> {
  return categories.map((category) => ({
    category,
    templates: templates
      .filter((t) => t.category === category)
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));
}
