"""Package the physics-question-import skill into a distributable .skill file.

    python scripts/build_skill.py
    python scripts/build_skill.py --out "physics-question-import.skill"

A .skill file is a ZIP whose entries are the skill's own files at the root:
SKILL.md, import-schema.json, and scripts/. The app reads SKILL.md; the
scripts are what an agent runs to do the work the SKILL.md describes.

Entries are STORED (uncompressed) and written without directory entries,
sorted, with a fixed timestamp, so that building the same tree twice
produces byte-identical output. That is what makes the .skill reviewable in
git rather than an opaque churn every rebuild.
"""

from __future__ import annotations

import argparse
import hashlib
import zipfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SKILL_DIR = REPO / ".opencode" / "skills" / "physics-question-import"

# Fixed DOS timestamp (the earliest a ZIP can express) for reproducible output.
FIXED_DATE = (1980, 1, 1, 0, 0, 0)

# Order matters only for readability; sorted() below makes it deterministic.
ROOT_FILES = ["SKILL.md", "import-schema.json"]
SKIP_DIRS = {"__pycache__", ".git", ".pytest_cache", ".mypy_cache"}


def collect(skill_dir: Path) -> list[Path]:
    files = [skill_dir / n for n in ROOT_FILES if (skill_dir / n).exists()]
    missing = [n for n in ROOT_FILES if not (skill_dir / n).exists()]
    if missing:
        raise SystemExit(f"missing from {skill_dir}: {', '.join(missing)}")
    files += sorted(
        p for p in (skill_dir / "scripts").rglob("*")
        if p.is_file()
        and not any(part in SKIP_DIRS for part in p.parts)
        and p.suffix != ".pyc"
        and p.name != ".gitignore"
    )
    return files


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default=str(REPO / "physics-question-import.skill"))
    ap.add_argument("--skill-dir", default=str(SKILL_DIR))
    a = ap.parse_args()

    skill_dir = Path(a.skill_dir)
    out = Path(a.out)
    files = collect(skill_dir)

    with zipfile.ZipFile(out, "w", zipfile.ZIP_STORED) as z:
        for p in files:
            rel = p.relative_to(skill_dir).as_posix()
            info = zipfile.ZipInfo(rel, date_time=FIXED_DATE)
            info.compress_type = zipfile.ZIP_STORED
            info.external_attr = 0o644 << 16
            z.writestr(info, p.read_bytes())

    digest = hashlib.sha256(out.read_bytes()).hexdigest()
    print(f"{out}  ({out.stat().st_size:,} bytes, {len(files)} entries)")
    print(f"sha256 {digest}")
    for p in files:
        print(f"  {p.relative_to(skill_dir).as_posix():<34} "
              f"{p.stat().st_size:>9,}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
