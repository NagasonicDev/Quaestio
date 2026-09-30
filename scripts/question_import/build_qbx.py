"""Build a validated `.qbx` bundle from a spec JSON.

    python build_qbx.py spec.json -o "D:\\imports\\my-course\\paper.qbx"
    python build_qbx.py spec.json -o out.qbx --assets out/2014/assets \
        --id-prefix paper2024

Prints OK on success. On failure it prints every structural problem and
writes nothing -- fix the spec, don't hand-patch the ZIP.

It also prints a REVIEW block for judgement calls (an empty parent body, a
criterion whose allocation is ambiguous, a node code you may have misread).
Those are not build failures, but audit_qbx.py treats them as problems, so
resolve every one of them before you deliver the bundle.

Spec format is the skill's JSON format plus an optional `id_prefix`:

    {"course_name": "My Course", "id_prefix": "paper2024", "questions": [ ... ]}

Question ids, course_id, node_ids (from node_codes), asset entries (path,
mime, pixel size) and answer_area blocks are all filled in for you if you
leave them out, and re-checked if you don't.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from qbx_lib import enable_utf8_stdout, build, load_schema  # noqa: E402


def main() -> int:
    enable_utf8_stdout()
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("spec")
    ap.add_argument("-o", "--out", required=True, help="output .qbx path")
    ap.add_argument("--assets", help="dir holding <asset_id>.png (default: "
                                      "<out dir>/assets)")
    ap.add_argument("--id-prefix", help="default question_id prefix, e.g. paper2024")
    ap.add_argument("--course-id", help="override the schema course_id")
    ap.add_argument("--schema", help="path to import-schema.json")
    a = ap.parse_args()

    # utf-8-sig: PowerShell's `Out-File -Encoding utf8` writes a BOM, and a
    # spec authored on Windows very often has one. Do not fail on it.
    spec = json.loads(Path(a.spec).read_text(encoding="utf-8-sig"))
    schema = load_schema(a.schema)
    path, rep = build(spec, a.out, schema=schema, assets_dir=a.assets,
                      id_prefix=a.id_prefix, course_id=a.course_id)

    if rep.warnings:
        print(f"REVIEW ({len(rep.warnings)}) -- resolve before delivering:")
        for w in rep.warnings:
            print(f"  ? {w}")

    if rep.errors:
        print(f"\nFAILED ({len(rep.errors)}) -- no bundle written:")
        for e in rep.errors:
            print(f"  ! {e}")
        return 1

    import zipfile
    with zipfile.ZipFile(path) as z:
        n_assets = sum(1 for n in z.namelist() if n.startswith("assets/"))
        nq = len(json.loads(z.read("questions.json"))["questions"])
    print(f"\nOK  {path}  ({nq} questions, {n_assets} assets)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
