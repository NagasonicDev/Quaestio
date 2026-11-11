"""Restore every template bundle's questions to the 0a21011 classification.

The dot-point labels added in 8a9ee37 were all first-child placeholders, not
content-based. Keep the current course tree (including added dot points) and
replace only the questions array with the parent commit's, which also restores
nested part classifications.
"""

import io
import json
import os
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(r"D:\quaestio")
BASE = "0a21011"
TEMPLATES = ROOT / "frontend" / "public" / "templates" / "hsc"


def zip_read(path):
    with zipfile.ZipFile(path) as z:
        infos = z.infolist()
        contents = {i.filename: z.read(i.filename) for i in infos}
    cj = next(n for n in contents if n.endswith("course.json"))
    return json.loads(contents[cj].decode("utf-8")), infos, contents, cj


def parent_json(rel_path):
    raw = subprocess.run(
        ["git", "show", f"{BASE}:{rel_path}"], cwd=ROOT, capture_output=True, check=True
    ).stdout
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        cj = next(n for n in z.namelist() if n.endswith("course.json"))
        return json.loads(z.read(cj).decode("utf-8"))


def main():
    write = "--write" in sys.argv
    total = 0
    changed_files = 0
    for qb in sorted(TEMPLATES.glob("*/*.qb")):
        rel = qb.relative_to(ROOT).as_posix()
        current, infos, contents, cj = zip_read(qb)
        old = parent_json(rel)
        current_ids = [q.get("question_id") for q in current.get("questions", [])]
        old_ids = [q.get("question_id") for q in old.get("questions", [])]
        assert current_ids == old_ids, f"{rel}: question list changed"
        before = json.dumps(current.get("questions"), sort_keys=True)
        current["questions"] = old["questions"]
        after = json.dumps(current.get("questions"), sort_keys=True)
        if before == after:
            continue
        changed_files += 1
        total += len(current_ids)
        print(f"{rel}: restored {len(current_ids)} questions")
        if write:
            contents[cj] = json.dumps(current, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
            with zipfile.ZipFile(qb, "w") as z:
                for info in infos:
                    zi = zipfile.ZipInfo(info.filename, date_time=info.date_time)
                    zi.compress_type = info.compress_type
                    zi.external_attr = info.external_attr
                    zi.create_system = info.create_system
                    z.writestr(zi, contents[info.filename])
    print(f"{'Wrote' if write else 'Would restore'} {changed_files} bundles / {total} questions")


if __name__ == "__main__":
    main()
