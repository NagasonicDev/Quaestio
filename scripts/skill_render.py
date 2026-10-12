"""Render a course skill's SKILL.md from the one shared template.

    python scripts/skill_render.py --skill-dir .opencode/skills/<slug> [--check]

Three things produce a SKILL.md and all three MUST produce identical text:

    backend/app/skill_export.py      the website's "Download Course Skill"
    scripts/build_skill.py           packages the installed skills as .skill
    scripts/skill_render.py          re-renders an installed skill in place

They all call :func:`skill_substitutions` + :func:`render_skill_markdown` here,
so the contract lives in exactly one place. Stdlib only, no FastAPI.

The pieces a skill is assembled from:

    SKILL_TEMPLATE.md            the shape of the document (frontmatter + prose)
    WORKFLOW.md                  the course-agnostic extraction contract
    course-instructions.md       this course's structure / tags / rules prose
    import-schema.json           this course's machine reference (types, levels,
                                 tags, node rows)
    nodes.txt                    `code | full path`, generated from the schema

`--check` exits non-zero when a rendered SKILL.md is stale, which is what CI
wants; `--write` rewrites it.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
COMMON_SKILL_DIR = REPO / "scripts" / "question_import"
TEMPLATE_NAME = "SKILL_TEMPLATE.md"
WORKFLOW_NAME = "WORKFLOW.md"
INSTRUCTIONS_NAME = "course-instructions.md"
SCHEMA_NAME = "import-schema.json"
SKILL_NAME = "SKILL.md"
NODES_NAME = "nodes.txt"

# The separator both importers key on when they build a node's full path:
# frontend/src/lib/data.ts builds `parent + " / " + name`, and
# scripts/question_import/qbx_lib.py resolves node_names via
# NodeIndex.path_to_id. A different separator makes every node_names entry fall
# back to a unique-bare-name match, which is a hard error for a duplicated leaf
# name and silent misclassification everywhere else.
NODE_PATH_SEPARATOR = " / "


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "course"


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def flatten_nodes(nodes, path: list[str] | None = None) -> list[dict]:
    """Flatten a nested course tree into the row shape the import scripts read.

    Accepts the backend's ``CourseNodeOut`` tree or a plain list of dicts with a
    ``children`` key. Already-flat rows (an ``import-schema.json``'s
    ``valid_node_ids``) are passed through :func:`node_path`, because walking
    them as a tree would lose every ancestor.
    """
    if path is None and nodes and not any(
            (n.get("children") if isinstance(n, dict)
             else getattr(n, "children", None)) for n in nodes):
        return node_path(list(nodes))
    path = path or []
    rows: list[dict] = []
    for n in nodes:
        row = n if isinstance(n, dict) else {
            "node_id": getattr(n, "node_id", None),
            "name": getattr(n, "name", ""),
            "code": getattr(n, "code", None),
            "level_index": getattr(n, "level_index", 0),
        }
        full = path + [row["name"]]
        rows.append({
            "node_id": row.get("node_id"),
            "name": row["name"],
            "code": row.get("code"),
            "level_index": row.get("level_index"),
            "path": NODE_PATH_SEPARATOR.join(full),
        })
        rows.extend(flatten_nodes(row.get("children") or [], full))
    return rows


def node_path(rows: list[dict], separator: str = NODE_PATH_SEPARATOR) -> list[dict]:
    """Give each pre-order node row its full path.

    Rows arrive as a pre-order DFS with a ``level_index``; the full path is
    ``level_index`` ancestors back, joined with ``separator``. An explicit
    ``path`` wins when present. Rebuilding is the default because a stored path
    can disagree with the separator the app actually uses, and a mismatched path
    is silently unresolvable: the importer falls back to a bare-name match,
    which is a hard error for a duplicated leaf name.

    This mirrors ``NodeIndex.__init__`` in scripts/question_import/qbx_lib.py.
    It is duplicated rather than shared because qbx_lib ships standalone into
    the .skill bundle and must not import from scripts/.
    """
    out: list[dict] = []
    stack: list[str] = []
    for row in rows:
        level = row.get("level_index")
        name = row.get("name") or ""
        if row.get("path"):
            full = row["path"]
            stack[:] = full.split(separator)
        elif isinstance(level, int):
            stack[:] = stack[:level] + [name]
            full = separator.join(stack)
        else:
            stack[:] = [name]
            full = name
        out.append({**row, "path": full})
    return out


def schema_rows(rows: list[dict], separator: str = NODE_PATH_SEPARATOR) -> list[dict]:
    """The `valid_node_ids` array: pre-order rows without the redundant path.

    Paths are rebuilt from `level_index` (see :func:`node_path`), so storing
    them too would only create a second copy that can disagree with the
    separator the app actually uses.
    """
    return [{k: r[k] for k in ("node_id", "code", "name", "level_index")}
            for r in node_path(rows, separator)]


def nodes_index_markdown(rows: list[dict], separator: str = NODE_PATH_SEPARATOR) -> str:
    """Flat `code | full path` index — greppable, and far cheaper than a tree."""
    return "\n".join(f"{r.get('code') or ''} | {r['path']}".rstrip()
                     for r in node_path(rows, separator))


def description_for(course_name: str) -> str:
    return (
        f"Convert exam papers, worksheets and assessments for {course_name} into "
        f"this question bank's import format. Use when digitising {course_name} "
        "source documents, extracting questions with figures, equations, tables "
        "and marking guides, classifying them to the course curriculum nodes, or "
        "auditing and repairing an existing question bundle. Returns a validated "
        ".qbx bundle plus a list of unresolved source issues. Only valid for the "
        f"{course_name} course."
    )


def skill_substitutions(*, course_name: str, course_id: str,
                        question_types, difficulty_levels, tags,
                        allow_multi_classification: bool,
                        node_rows: list[dict], instructions_markdown: str,
                        description: str | None = None) -> dict[str, str]:
    """Placeholder values for SKILL_TEMPLATE.md."""
    levels = [(d["level"], d["label"]) if isinstance(d, dict) else (d.level, d.label)
              for d in difficulty_levels]
    return {
        "COURSE_SLUG": slug(course_name),
        "COURSE_NAME": course_name,
        "COURSE_ID": course_id,
        "DESCRIPTION": description or description_for(course_name),
        "TYPES": ", ".join(f"`{t}`" for t in question_types) or "see import-schema.json",
        "LEVELS": (", ".join(f"`{lv}` = {lb}" for lv, lb in levels)
                   if levels else "none defined — omit `difficulty`"),
        "TAGS": ", ".join(f"`{t}`" for t in tags) or "none",
        "MULTI": "allowed" if allow_multi_classification else "one node only",
        "NODE_COUNT": str(len(node_rows)),
        "CLASSIFICATION_RULES": (
            "List several nodes when the question genuinely spans them, in "
            "most-specific-first order."
            if allow_multi_classification else
            "Pick exactly one node — this course allows only one per question."),
        "COURSE_INSTRUCTIONS": instructions_markdown.strip() or "_(none recorded)_",
    }


def render_template(template: str, subs: dict[str, str]) -> str:
    out = template
    for key, value in subs.items():
        out = out.replace("{{" + key + "}}", value)
    left = re.findall(r"\{\{([A-Z_]+)\}\}", out)
    if left:
        raise SystemExit(f"unrendered placeholders in SKILL_TEMPLATE.md: {sorted(set(left))}")
    return out


def render_skill_markdown(subs: dict[str, str]) -> str:
    return render_template(read(COMMON_SKILL_DIR / TEMPLATE_NAME), subs)


def substitutions_from_skill_dir(skill_dir: Path) -> dict[str, str]:
    """Build substitutions from an installed skill directory on disk."""
    schema = json.loads(read(skill_dir / SCHEMA_NAME))
    rows = node_path(schema.get("valid_node_ids") or [],
                     schema.get("node_path_separator") or NODE_PATH_SEPARATOR)
    return skill_substitutions(
        course_name=schema.get("course_name") or skill_dir.parent.name,
        course_id=schema.get("course_id", ""),
        question_types=schema.get("valid_type_keys") or [],
        difficulty_levels=schema.get("valid_difficulty_levels") or [],
        tags=schema.get("valid_tags") or [],
        allow_multi_classification=bool(schema.get("allow_multi_classification", True)),
        node_rows=rows,
        instructions_markdown=read(skill_dir / INSTRUCTIONS_NAME),
    )


def generated_files(skill_dir: Path) -> list[tuple[Path, str]]:
    """Files a skill directory must contain that are generated, not authored.

    SKILL.md, nodes.txt and WORKFLOW.md all come from scripts/question_import/.
    Only SKILL.md and nodes.txt depend on the course; WORKFLOW.md is identical
    everywhere, so a stale copy is always drift.
    """
    schema = json.loads(read(skill_dir / SCHEMA_NAME))
    sep = schema.get("node_path_separator") or NODE_PATH_SEPARATOR
    return [
        (skill_dir / SKILL_NAME,
         render_template(read(COMMON_SKILL_DIR / TEMPLATE_NAME),
                         substitutions_from_skill_dir(skill_dir))),
        (skill_dir / NODES_NAME,
         nodes_index_markdown(schema.get("valid_node_ids") or [], sep)),
        (skill_dir / WORKFLOW_NAME, read(COMMON_SKILL_DIR / WORKFLOW_NAME)),
    ]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("skill_dir", nargs="*",
                    help="installed skill directories (default: all under .opencode/skills)")
    ap.add_argument("--check", action="store_true",
                    help="report stale generated files instead of rewriting them")
    args = ap.parse_args()

    dirs = [Path(d) for d in args.skill_dir] or sorted(
        (REPO / ".opencode" / "skills").glob("*-question-import"))
    if not dirs:
        print("no skill directories found", file=sys.stderr)
        return 2

    stale = 0
    for d in dirs:
        bad = [(p, want) for p, want in generated_files(d)
               if not p.exists() or read(p) != want]
        if not bad:
            print(f"ok   {d.name}")
            continue
        stale += 1
        for p, want in bad:
            if args.check:
                print(f"STALE {p.relative_to(REPO)}")
            else:
                p.write_text(want, encoding="utf-8")
                print(f"wrote {p.relative_to(REPO)}")
    if stale and args.check:
        print("\nrun: python scripts/skill_render.py")
    return 1 if (stale and args.check) else 0


if __name__ == "__main__":
    raise SystemExit(main())