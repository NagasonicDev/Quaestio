"""
The "Download Course Skill" feature.

A .skill file is just a zip (renamed) containing:
  - SKILL.md            a short entry point: which course this skill is for,
                         that course's valid values, and a pointer to
                         WORKFLOW.md. Deliberately small — the contract lives
                         in one place so it cannot drift.
  - WORKFLOW.md         the full, course-agnostic extraction contract and
                         command pipeline, rendered from SKILL_TEMPLATE.md.
                         Shared verbatim with the frontend generator
                         (frontend/src/lib/exchange.ts) and with the installed
                         skills in .opencode/skills/.
  - import-schema.json  machine-readable reference: this course's node rows
                         (id, name, code, level, full path), valid types,
                         difficulty levels and tags. Agents search it with
                         scripts/index_nodes.py; they never need it in context.
  - nodes.txt           the same node list flattened to `code | full path`.
  - course-config.json  the full hydrated course config.
  - scripts/*.py        the shared question_import toolchain.

The produced JSON is meant to be handed back to this app via the Import page
(frontend/src/pages/Import.tsx -> lib/data.ts importJson).
"""
from __future__ import annotations

import io
import json
import sys
import zipfile
from pathlib import Path

from . import schemas

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts"))

# The rendering rules live in scripts/skill_render.py so this backend, the
# frontend generator and the repo-local renderer cannot drift apart.
from skill_render import (  # noqa: E402
    COMMON_SKILL_DIR as _COMMON_SKILL_DIR,
    NODE_PATH_SEPARATOR,
    WORKFLOW_NAME,
    flatten_nodes,
    nodes_index_markdown,
    render_template,
    schema_rows,
    skill_substitutions,
    slug,
)
from skill_render import (  # noqa: E402
    TEMPLATE_NAME,
)

COMMON_SKILL_DIR = _COMMON_SKILL_DIR
COMMON_SCRIPTS_DIR = COMMON_SKILL_DIR

# Files that belong to the course-agnostic toolchain shipped inside the bundle.
# SKILL_TEMPLATE.md is an input to rendering, not something an agent runs, so it
# is deliberately excluded.
TEMPLATE_EXCLUDED = {TEMPLATE_NAME}


def _read_common(name: str) -> str:
    return (COMMON_SKILL_DIR / name).read_text(encoding="utf-8")


def _common_workflow_markdown() -> str:
    return _read_common(WORKFLOW_NAME)


def _flatten_nodes(nodes, path: list[str] | None = None) -> list[dict]:
    """Flatten the course tree into the row shape the import scripts consume."""
    return flatten_nodes(nodes, path)


def _nodes_index_markdown(rows: list[dict]) -> str:
    """Flat `code | full path` index — greppable, and far cheaper than a tree."""
    return nodes_index_markdown(rows)


def _substitutions(config: schemas.CourseFullConfig,
                   instructions_markdown: str) -> dict[str, str]:
    return skill_substitutions(
        course_name=config.name,
        course_id=config.course_id,
        question_types=config.question_types,
        difficulty_levels=[{"level": d.level, "label": d.label}
                           for d in config.difficulty_levels],
        tags=config.tags,
        allow_multi_classification=config.allow_multi_classification,
        node_rows=_flatten_nodes(config.nodes),
        instructions_markdown=instructions_markdown,
    )


def render_skill_markdown(substitutions: dict[str, str]) -> str:
    return render_template(_read_common(TEMPLATE_NAME), substitutions)


def build_skill_markdown(config: schemas.CourseFullConfig, instructions_markdown: str) -> str:
    return render_skill_markdown(skill_substitutions(config, instructions_markdown))


def build_skill_zip(config: schemas.CourseFullConfig, instructions_markdown: str) -> bytes:
    skill_md = build_skill_markdown(config, instructions_markdown)
    nodes = _flatten_nodes(config.nodes)
    example_node = nodes[0] if nodes else None

    import_schema = {
        "course_id": config.course_id,
        "course_name": config.name,
        "schema_version": 1,
        "valid_type_keys": config.question_types,
        "valid_difficulty_levels": [{"level": d.level, "label": d.label} for d in config.difficulty_levels],
        "allow_multi_classification": config.allow_multi_classification,
        "node_path_separator": NODE_PATH_SEPARATOR,
        "valid_node_ids": schema_rows(nodes),
        "valid_tags": config.tags,
        "content_block_types": {
            "slots": ["body", "hint", "answer", "solution", "marking_criteria"],
            "types": ["text", "heading", "equation", "image", "diagram", "graph", "function", "table", "list", "code", "answer_area", "page_break"],
        },
        "mcq_option_format": {
            "content": "array of content blocks, same block format as body",
            "is_correct": "boolean; mark exactly one true when the answer is known",
            "order": "array order is the printed choice order; labels A, B, C... are implicit",
        },
        "ignored_fields": {
            "question": ["question_id", "review_status", "notes", "created_at", "updated_at"],
            "part": ["question_id", "difficulty", "node_ids", "node_codes", "node_names", "tags", "source", "notes", "classification_confidence", "mcq_options", "assets", "review_status"],
            "never_exported": ["hint"],
            "max_part_depth_rendered": 1,
        },
        "example_question": {
            "type_key": config.question_types[0] if config.question_types else "short_answer",
            "difficulty": config.difficulty_levels[0].level if config.difficulty_levels else None,
            "marks": 3,
            "node_ids": [example_node["node_id"]] if example_node else [],
            "node_codes": [example_node["code"]] if example_node and example_node["code"] else [],
            "node_names": [example_node["path"]] if example_node else [],
            "tags": [],
            "body": [
                {"block_type": "text", "content": {"text": "Example question text."}},
                {"block_type": "equation", "content": {"latex": "x^2 - 5x + 6 = 0", "display": True}},
            ],
            "hint": [{"block_type": "text", "content": {"text": "Try identifying the relevant principle first."}}],
            "answer": [{"block_type": "text", "content": {"text": "x = 2, x = 3"}}],
            "solution": [],
            "marking_criteria": [
                {"block_type": "list", "content": {"ordered": False, "items": [
                    "1 mark: uses the correct formula",
                    "1 mark: correct working shown",
                    "1 mark: correct final answer",
                ]}}
            ],
            "classification_confidence": "high",
            "source": {"name": "Example Source", "year": 2025, "original_question_no": "1"},
        },
        "example_multiple_choice": {
            "type_key": "multiple_choice",
            "body": [{"block_type": "text", "content": {"text": "What is the temperature?"}}],
            "mcq_options": [
                {"content": [{"block_type": "text", "content": {"text": "$1.6\\times10^{12}$ K"}}], "is_correct": False},
                {"content": [{"block_type": "text", "content": {"text": "$5.2\\times10^{3}$ K"}}], "is_correct": True},
            ],
            "answer": [{"block_type": "text", "content": {"text": "B"}}],
        },
    }

    course_config_json = json.loads(config.model_dump_json())

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("SKILL.md", skill_md)
        zf.writestr("WORKFLOW.md", _common_workflow_markdown())
        # Compact on purpose: this file is a machine reference. Agents search it
        # with scripts/index_nodes.py; they never need it in context.
        zf.writestr("import-schema.json", json.dumps(import_schema, separators=(",", ":")))
        zf.writestr("nodes.txt", _nodes_index_markdown(nodes))
        zf.writestr("course-config.json", json.dumps(course_config_json, indent=2))
        for script_path in sorted(COMMON_SCRIPTS_DIR.glob("*.py")):
            if script_path.name in TEMPLATE_EXCLUDED:
                continue
            zf.write(script_path, f"scripts/{script_path.name}")
    return buf.getvalue()