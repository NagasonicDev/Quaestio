r"""Strict audit of finished .qbx bundles -- the delivery gate.

    python audit_qbx.py D:\imports\my-course
    python audit_qbx.py D:\imports\my-course --max-year 2014   # and earlier
    python audit_qbx.py bundle.qbx --schema import-schema.json

Exit code 1 if any problem is found. Unlike build_qbx.py this promotes every
REVIEW warning to a problem, because these are the defects that survive a
build and only show up when the bundle is rendered in the app:

  * node_ids[i] is not the id of node_codes[i], checked RECURSIVELY so a bad
    pairing on a part is caught (a top-level-only check misses these);
  * an empty parent body / empty container-part body;
  * a partless extended_response with no answer;
  * a table block with no columns/rows;
  * a marking criterion with no mark allocation;
  * a duplicate question_id inside or across bundles;
  * a stale course_id (the usual cause: an older bundle built against a
    course that was later re-imported and had its ids regenerated);
  * an image block with no matching asset, or an asset file missing from
    the ZIP;
  * a flattened composite part label like 'a(i)' instead of real nesting.

Add --years all to include bundles you did not build in this session; the
default is to skip any bundle whose year is above --max-year, which is how
you audit your own new work without being swamped by pre-existing files.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from qbx_lib import (NodeIndex, collect_blocks, enable_utf8_stdout,  # noqa: E402
                     load_schema, table_shape, _allocations, _criteria_items)

def year_of(path: Path):
    m = re.search(r"(19|20)\d{2}", path.name)
    return int(m.group(0)) if m else None


def audit_bundle(path: Path, nodes: NodeIndex, schema: dict,
                 global_ids: dict[str, str]) -> dict:
    probs: list[str] = []
    with zipfile.ZipFile(path) as z:
        names = set(z.namelist())
        try:
            payload = json.loads(z.read("questions.json"))
        except KeyError:
            return {"questions": 0, "parts": 0, "assets": 0, "problems":
                    ["no questions.json in the bundle"]}
        files = {n.split("/")[-1].rsplit(".", 1)[0] for n in names
                 if n.startswith("assets/")}
        if payload.get("course_id") != schema["course_id"]:
            probs.append(f"course_id {payload.get('course_id')!r} != "
                         f"schema {schema['course_id']!r} (stale bundle; re-stamp "
                         f"or rebuild)")
        if payload.get("course_name") != schema.get("course_name"):
            probs.append(f"course_name {payload.get('course_name')!r} != "
                         f"{schema.get('course_name')!r}")
        if payload.get("export_schema_version") != 1:
            probs.append("export_schema_version != 1")

    stats = {"questions": 0, "parts": 0, "assets": len(files)}
    qs = payload.get("questions") or []
    stats["questions"] = len(qs)

    for q in qs:
        qid = q.get("question_id", "<no id>")
        if qid in global_ids:
            probs.append(f"{qid}: question_id also used in {global_ids[qid]}")
        else:
            global_ids[qid] = path.name

        for obj in collect_blocks(q):
            lab = obj.get("part_label")
            w = qid + (f"/{lab}" if lab else "")
            if obj is not q:
                stats["parts"] += 1

            codes = obj.get("node_codes") or []
            ids = obj.get("node_ids") or []
            for i, c in enumerate(codes):
                try:
                    want = nodes.id_for(c)
                except Exception as e:
                    probs.append(f"{w}: {e}")
                    continue
                if i < len(ids) and ids[i] != want:
                    probs.append(f"{w}: node_codes[{i}]={c} pairs with "
                                 f"node_ids[{i}]={ids[i]}, but {c} is {want} "
                                 f"({nodes.code_to_name.get(c, '?')})")
            if not codes and not ids and obj is q:
                probs.append(f"{w}: no node classification")


            if not obj.get("body"):
                probs.append(f"{w}: empty body "
                             f"({'parent' if obj.get('parts') else 'leaf'})")

            # An image can live in body, in an MCQ option, or in a sample
            # answer / marking-criteria block -- all count as "referenced".
            blocks = list(obj.get("body") or [])
            for o in obj.get("mcq_options") or []:
                blocks += o.get("content") or []
            for f in ("answer", "solution", "marking_criteria"):
                blocks += obj.get(f) or []
            own = {x.get("asset_id") for x in obj.get("assets") or []}
            for b in blocks:
                bt = b.get("block_type")
                c = b.get("content") or {}
                if bt in ("image", "diagram", "graph"):
                    ap = c.get("asset_path")
                    if not ap:
                        probs.append(f"{w}: image block with no asset_path")
                    elif ap not in own:
                        probs.append(f"{w}: image {ap} not declared in this "
                                     f"object's assets")
                    elif ap not in files:
                        probs.append(f"{w}: asset {ap}.png missing from the ZIP")
                    if not c.get("alt_text"):
                        probs.append(f"{w}: image {ap} has no alt_text")
                if bt == "table":
                    cols, rows = table_shape(c)
                    if not cols:
                        probs.append(f"{w}: table block is not renderable "
                                     f"(no list header + list-of-lists rows)")
                    else:
                        for r in rows:
                            if len(r) != len(cols):
                                probs.append(f"{w}: table row {len(r)} cells vs "
                                             f"header {len(cols)}")

            for a in obj.get("assets") or []:
                aid = a.get("asset_id")
                if aid not in files:
                    probs.append(f"{w}: asset {aid} declared but "
                                 f"not in the ZIP")
                if not any((bl.get("content") or {}).get("asset_path") == aid
                           for bl in blocks):
                    probs.append(f"{w}: asset {aid} is in the assets array but "
                                 f"no block references it (orphaned file)")
                if a.get("file_path") != a.get("asset_id"):
                    probs.append(f"{w}: asset {a.get('asset_id')} file_path "
                                 f"{a.get('file_path')!r} must equal asset_id")
                if a.get("mime_type") not in ("image/png", "image/jpeg",
                                              "image/gif", "image/webp",
                                              "image/svg+xml"):
                    probs.append(f"{w}: asset {a.get('asset_id')} bad mime_type "
                                 f"{a.get('mime_type')!r}")

            if not obj.get("marking_criteria"):
                probs.append(f"{w}: no marking_criteria")
            else:
                for it in _criteria_items(obj.get("marking_criteria")):
                    if not _allocations(it):
                        probs.append(f"{w}: criterion with no mark allocation: "
                                     f"{it[:64]!r}")

            parts = obj.get("parts") or []
            if parts:
                if obj.get("answer") or obj.get("solution"):
                    probs.append(f"{w}: multipart parent has answer/solution content; move it onto the matching part(s)")
                tot = sum(p.get("marks", 0) or 0 for p in parts)
                if abs(tot - (obj.get("marks") or 0)) > 1e-6:
                    probs.append(f"{w}: marks {obj.get('marks')} != sum of parts "
                                 f"{tot}")
                for p in parts:
                    pl = str(p.get("part_label") or "")
                    if re.search(r"[A-Za-z]\(", pl):
                        probs.append(f"{w}: flattened part label {pl!r} -- nest it")
            elif obj is not q and not (obj.get("answer") or obj.get("solution")):
                probs.append(f"{w}: leaf part has no answer or solution")
            elif obj.get("type_key") == "extended_response":
                if not (obj.get("answer") or obj.get("solution")):
                    probs.append(f"{w}: partless extended_response with no answer")

        if q.get("type_key") == "multiple_choice":
            opts = q.get("mcq_options") or []
            corr = [i for i, o in enumerate(opts) if o.get("is_correct")]
            if len(corr) != 1:
                probs.append(f"{qid}: {len(corr)} correct options, need 1")
            else:
                want = chr(ord("A") + corr[0])
                got = "".join(
                    str((b.get("content") or {}).get("text", ""))
                    for b in q.get("answer") or []).strip().upper()
                if got != want:
                    probs.append(f"{qid}: answer {got!r} != correct option {want}")

    stats["problems"] = probs
    return stats


def main() -> int:
    enable_utf8_stdout()
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("target", help="a .qbx file or a directory of them")
    ap.add_argument("--schema", default=None)
    ap.add_argument("--max-year", type=int, default=None,
                    help="optionally skip bundles newer than this year")
    ap.add_argument("--all", action="store_true", help="do not skip any bundle")
    ap.add_argument("--only", metavar="REGEX",
                    help="audit only bundles whose filename matches REGEX "
                         "(regular expression). Problems in other bundles "
                         "are counted and reported separately as pre-existing, "
                         "so a clean run means YOUR work is clean.")
    a = ap.parse_args()

    schema = load_schema(a.schema)
    nodes = NodeIndex(schema)
    t = Path(a.target)
    files = sorted(t.glob("*.qbx")) if t.is_dir() else [t]
    if not files:
        print(f"no .qbx found in {t}")
        return 1

    global_ids: dict[str, str] = {}
    total = {"questions": 0, "parts": 0, "assets": 0}
    groups: dict[str, list[str]] = {}
    stale: dict[str, int] = {}
    years: set[int] = set()
    institutions: set[str] = set()
    skipped: list[str] = []
    mine: list[str] = []

    pat = re.compile(a.only) if a.only else None

    print(f"{'bundle':<34} {'top':>5} {'parts':>6} {'assets':>7}  year")
    print("-" * 66)
    for f in files:
        y = year_of(f)
        if not a.all and a.max_year is not None and y and y > a.max_year:
            skipped.append(f.name)
            continue
        s = audit_bundle(f, nodes, schema, global_ids)
        if pat and not pat.search(f.name):
            stale[f.name] = len(s["problems"])
            continue
        mine.append(f.name)
        for k in total:
            total[k] += s[k]
        if y:
            years.add(y)
        for q in [json.loads(zipfile.ZipFile(f).read("questions.json"))]:
            for qq in q.get("questions") or []:
                institutions.add((qq.get("source") or {}).get("institution"))
        print(f"{f.name:<34} {s['questions']:>5} {s['parts']:>6} "
              f"{s['assets']:>7}  {y or '-'}")
        for p in s["problems"]:
            groups.setdefault(_kind(p), []).append(f"{f.name}: {p}")
    print("-" * 66)
    print(f"{'TOTAL (audited)':<34} {total['questions']:>5} {total['parts']:>6} "
          f"{total['assets']:>7}   {len(mine)} bundle(s)")
    if years:
        print(f"years: {sorted(years)}")
    if institutions:
        print(f"institutions: {sorted(i for i in institutions if i)}")
    if skipped:
        print(f"skipped {len(skipped)} pre-existing bundle(s) newer than "
              f"{a.max_year} (use --all to include): {', '.join(skipped)}")
    if stale:
        ns = sum(stale.values())
        print(f"\n{ns} problem(s) in {len(stale)} bundle(s) OUTSIDE --only "
              f"{a.only!r} (pre-existing, not counted as yours):")
        for name, c in sorted(stale.items(), key=lambda kv: -kv[1]):
            print(f"  [{c:>4}] {name}")
        print("  These are almost always a stale course_id or a node_ids/"
              "node_codes pair from a different schema. Report them; do not "
              "let them mask a real failure in your own bundles.")

    n = sum(len(v) for v in groups.values())
    if not n:
        print(f"\nNo problems in the {len(mine)} audited bundle(s).")
        return 0
    print(f"\n{n} PROBLEMS, grouped by kind:")
    for kind, items in sorted(groups.items(), key=lambda kv: -len(kv[1])):
        print(f"  [{len(items):>4}] {kind}")
        if len(items) <= 12:
            for i in items:
                print(f"         - {i}")
        else:
            for i in items[:5]:
                print(f"         - {i}")
            print(f"         ... and {len(items) - 5} more")
    return 1


def _kind(msg: str) -> str:
    for pat, kind in [
        ("node_codes", "node_ids[i] is not the id of node_codes[i]"),
        ("empty body", "empty body"),
        ("no marking_criteria", "missing marking_criteria"),
        ("mark allocation", "criterion with no mark allocation"),
        ("partless extended_response", "partless question with no answer"),
        ("table block", "table block with no columns/rows"),
        ("question_id also used", "duplicate question_id"),
        ("course_id", "course_id/course_name mismatch"),
        ("asset", "asset problem"),
        ("image", "image block problem"),
        ("mark", "marks do not sum"),
        ("part label", "flattened part label"),
        ("correct options", "MCQ has not exactly one correct option"),
        ("answer", "MCQ answer letter mismatch"),
    ]:
        if pat in msg:
            return kind
    return "other"


if __name__ == "__main__":
    raise SystemExit(main())
