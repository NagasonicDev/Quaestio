import workflow from "../../../scripts/question_import/WORKFLOW.md?raw";
import skillTemplate from "../../../scripts/question_import/SKILL_TEMPLATE.md?raw";
import auditQbx from "../../../scripts/question_import/audit_qbx.py?raw";
import buildQbx from "../../../scripts/question_import/build_qbx.py?raw";
import checkSchemeBundle from "../../../scripts/question_import/check_scheme_bundle.py?raw";
import crop from "../../../scripts/question_import/crop.py?raw";
import extractFigures from "../../../scripts/question_import/extract_figures.py?raw";
import indexNodes from "../../../scripts/question_import/index_nodes.py?raw";
import prepPaper from "../../../scripts/question_import/prep_paper.py?raw";
import qbxLib from "../../../scripts/question_import/qbx_lib.py?raw";
import repairMultipartSolutions from "../../../scripts/question_import/repair_multipart_solutions.py?raw";

export const questionImportScripts: Record<string, string> = {
  "scripts/audit_qbx.py": auditQbx,
  "scripts/build_qbx.py": buildQbx,
  "scripts/check_scheme_bundle.py": checkSchemeBundle,
  "scripts/crop.py": crop,
  "scripts/extract_figures.py": extractFigures,
  "scripts/index_nodes.py": indexNodes,
  "scripts/prep_paper.py": prepPaper,
  "scripts/qbx_lib.py": qbxLib,
  "scripts/repair_multipart_solutions.py": repairMultipartSolutions,
};

export const questionImportWorkflow = workflow;
export const questionImportSkillTemplate = skillTemplate;
