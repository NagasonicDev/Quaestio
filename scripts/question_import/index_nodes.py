"""Index the course node table for fast lookup.

    python index_nodes.py --out NODES.txt --json nodes.json
    python index_nodes.py --search "photoelectric"

Writes `NODES.txt` (`code | node_id | path`) and a JSON map. The search mode
is the first thing to run when you are unsure where a question belongs -- it
beats scrolling 700 lines of SKILL.md.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from qbx_lib import enable_utf8_stdout, NodeIndex, load_schema  # noqa: E402


def main() -> int:
    enable_utf8_stdout()
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--schema", default=None, help="path to import-schema.json")
    ap.add_argument("--out", default="NODES.txt", help="NODES.txt output path")
    ap.add_argument("--json", default="nodes.json", help="JSON map output path")
    ap.add_argument("--search", help="search node names/paths and exit")
    a = ap.parse_args()

    schema = load_schema(a.schema)
    idx = NodeIndex(schema)
    idx.write_nodelist(a.out)
    Path(a.json).write_text(json.dumps({
        "course_id": schema["course_id"],
        "course_name": schema.get("course_name"),
        "code_to_id": idx.code_to_id,
        "id_to_code": idx.id_to_code,
        "code_to_name": idx.code_to_name,
        "code_to_path": idx.code_to_path,
    }, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"{len(idx)} nodes -> {a.out}, {a.json}")

    if a.search:
        hits = idx.search(a.search)
        if not hits:
            print(f"no node matches {a.search!r}")
            # nearest nodes by shared words
            words = {w for w in a.search.lower().split() if len(w) > 3}
            for code, name in sorted(idx.code_to_name.items()):
                if words & set(name.lower().replace(",", " ").split()):
                    hits.append((code, name))
            print("loose matches:")
        for code, name in hits[:40]:
            print(f"  {code:<12} {name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
