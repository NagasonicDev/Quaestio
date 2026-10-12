"""Package an installed question-import skill into a distributable .skill file.

    python scripts/build_skill.py                     # every skill, to ./
    python scripts/build_skill.py --course physics
    python scripts/build_skill.py --check             # fail on stale rendered files

A .skill file is just a zip (renamed) holding the skill's own files at the root:

    SKILL.md                 rendered from scripts/question_import/SKILL_TEMPLATE.md
                            + this skill's course-instructions.md + import-schema.json
    WORKFLOW.md              the shared extraction contract
    import-schema.json       this course's machine reference
    nodes.txt                `code | full path`
    course-instructions.md   the course-specific rules SKILL.md embeds
    scripts/*.py             the shared toolchain

Nothing is authored here. Run `python scripts/skill_render.py` first; `--check`
refuses to package a skill whose rendered files are stale.

Entries are STORED (uncompressed) and written without directory entries, sorted,
with a fixed timestamp, so building the same tree twice produces byte-identical
output. That is what makes a .skill reviewable in git rather than opaque churn.
"""

from __future__ import annotations

import argparse
import hashlib
import shutil
import sys
import zipfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SKILLS_DIR = REPO / ".opencode" / "skills"
TOOLCHAIN = REPO / "scripts" / "question_import"
sys.path.insert(0, str(REPO / "scripts"))
from skill_render import COMMON_SKILL_DIR, generated_files  # noqa: E402

# Fixed DOS timestamp (the earliest a ZIP can express) for reproducible output.
FIXED_DATE = (1980, 1, 1, 0, 0, 0)

REQUIRED = ["SKILL.md", "WORKFLOW.md", "import-schema.json", "nodes.txt",
            "course-instructions.md"]
SKIP_DIRS = {"__pycache__", ".git", ".pytest_cache", ".mypy_cache"}
GENERATED = {"SKILL.md", "WORKFLOW.md", "nodes.txt"}


def toolchain() -> list[Path]:
    """The shared scripts, excluding the render-only template."""
    return sorted(p for p in TOOLCHAIN.glob("*.py")
                  if p.name != "SKILL_TEMPLATE.md")


def script_drift(skill_dir: Path) -> list[str]:
    """Names of scripts under `skill_dir/scripts` that differ from the shared copy.

    The scripts are vendored into every skill so a downloaded bundle is
    self-contained, which means four copies can drift. This is the check that
    stops it.
    """
    shared = {p.name: p.read_bytes() for p in toolchain()}
    bad = []
    for name, want in shared.items():
        local = skill_dir / "scripts" / name
        if not local.exists() or local.read_bytes() != want:
            bad.append(f"scripts/{name}")
    local = skill_dir / "scripts"
    if local.is_dir():
        for p in sorted(local.glob("*.py")):
            if p.name not in shared:
                bad.append(f"scripts/{p.name} (not in scripts/question_import)")
    return bad


def sync_scripts(skill_dir: Path) -> list[Path]:
    dst = skill_dir / "scripts"
    dst.mkdir(parents=True, exist_ok=True)
    for p in toolchain():
        (dst / p.name).write_bytes(p.read_bytes())
    for p in sorted(dst.glob("*.py")):
        if p.name not in {q.name for q in toolchain()}:
            p.unlink()
    pycache = dst / "__pycache__"
    if pycache.is_dir():
        shutil.rmtree(pycache)
    return collect(skill_dir)


def collect(skill_dir: Path) -> list[Path]:
    missing = [n for n in REQUIRED if not (skill_dir / n).exists()]
    if missing:
        raise SystemExit(f"missing from {skill_dir}: {', '.join(missing)}")
    files = [skill_dir / n for n in REQUIRED]
    files += sorted(
        p for p in (skill_dir / "scripts").rglob("*")
        if p.is_file()
        and not any(part in SKIP_DIRS for part in p.parts)
        and p.suffix != ".pyc"
        and p.name != ".gitignore"
    )
    return files


def package(skill_dir: Path, out: Path) -> tuple[int, str, list[Path]]:
    stale = [p.name for p, want in generated_files(skill_dir)
             if not p.exists() or p.read_text(encoding="utf-8") != want]
    drift = script_drift(skill_dir)
    if stale or drift:
        bits = ", ".join(stale + drift)
        raise SystemExit(f"{skill_dir.name}: {bits} is out of date -- "
                         f"run: python scripts/skill_render.py && "
                         f"python scripts/build_skill.py --sync")
    files = collect(skill_dir)
    with zipfile.ZipFile(out, "w", zipfile.ZIP_STORED) as z:
        for p in files:
            info = zipfile.ZipInfo(p.relative_to(skill_dir).as_posix(),
                                   date_time=FIXED_DATE)
            info.compress_type = zipfile.ZIP_STORED
            info.external_attr = 0o644 << 16
            z.writestr(info, p.read_bytes())
    return out.stat().st_size, hashlib.sha256(out.read_bytes()).hexdigest(), files


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--course", action="append",
                    help="course slug, e.g. physics (repeatable; default: all)")
    ap.add_argument("--out", help="output .skill path (single --course only)")
    ap.add_argument("--skill-dir", help="an explicit skill directory")
    ap.add_argument("--check", action="store_true",
                    help="report stale rendered files or drifted scripts")
    ap.add_argument("--sync", action="store_true",
                    help="copy scripts/question_import/*.py into each skill dir")
    args = ap.parse_args()

    if args.skill_dir:
        dirs = [Path(args.skill_dir)]
    elif args.course:
        dirs = [SKILLS_DIR / c if (SKILLS_DIR / c).is_dir()
                else SKILLS_DIR / f"{c}-question-import" for c in args.course]
    else:
        dirs = sorted(d for d in SKILLS_DIR.iterdir()
                      if d.is_dir() and (d / "import-schema.json").exists())
    for d in dirs:
        if not d.is_dir():
            raise SystemExit(f"no such skill directory: {d}")

    if args.sync:
        for d in dirs:
            sync_scripts(d)
            print(f"synced {d.name}/scripts ({len(toolchain())} files)")
        if not args.check:
            return 0

    if args.check:
        bad = 0
        for d in dirs:
            stale = [p.name for p, want in generated_files(d)
                     if not p.exists() or p.read_text(encoding="utf-8") != want]
            drift = [] if args.sync else script_drift(d)
            if stale or drift:
                bad += 1
                print(f"STALE {d.name}: {', '.join(stale + drift)}")
            else:
                print(f"ok   {d.name}")
        if bad:
            print("\nfix with:\n  python scripts/skill_render.py\n"
                  "  python scripts/build_skill.py --sync")
        return 1 if bad else 0

    if args.out and len(dirs) != 1:
        raise SystemExit("--out needs exactly one --course or --skill-dir")

    for d in dirs:
        out = Path(args.out) if args.out else REPO / f"{d.name}.skill"
        size, digest, files = package(d, out)
        print(f"{out}  ({size:,} bytes, {len(files)} entries)\nsha256 {digest}")
        for p in files:
            gen = " (generated)" if p.name in GENERATED else ""
            print(f"  {p.relative_to(d).as_posix():<34} {p.stat().st_size:>9,}{gen}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())