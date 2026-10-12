"""Index the course node table for fast lookup.

    python index_nodes.py --search photoelectric        # lookup only, writes nothing
    python index_nodes.py --out NODES.txt --json nodes.json

`--search` prints `code | full path` and writes nothing. Run it with no
arguments to write `NODES.txt` and `nodes.json` for bulk work.

Search is the first thing to run when you are unsure where a question belongs.
The node tree is deliberately NOT in SKILL.md -- it is 370+ lines that the
model only needs three or four entries from.
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
    ap.add_argument("--search", metavar="TEXT",
                    help="print matching nodes as `code | full path` and exit "
                         "without writing anything")
    a = ap.parse_args()

    schema = load_schema(a.schema)
    sep = schema.get("node_path_separator", " / ")
    idx = NodeIndex(schema)

    if a.search:
        hits = idx.search(a.search)
        if not hits:
            words = {w for w in a.search.lower().split() if len(w) > 3}
            for code, name in sorted(idx.code_to_name.items()):
                if words & set(name.lower().replace(",", " ").split()):
                    hits.append((code, name))
            print(f"no exact node matches {a.search!r}; loose matches:")
        for code, name in hits[:40]:
            path = idx.code_to_path.get(code, name)
            print(f"  {code:<12} {path}")
        print(f"\n{len(hits)} hit(s). Use the CODE for node_codes, or the full "
              f"path above verbatim for node_names (separated by {sep!r}).")
        return 0

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
    return 0


if __name__ == "__main__":
    raise SystemExit(main())