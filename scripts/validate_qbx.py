"""Validate a .qbx bundle against import-schema.json and the export-shape rules.

    python scripts\\validate_qbx.py imports\\2024-hsc-physics.qbx

The defaults suit the NESA HSC papers (100 marks, questions numbered 1..N, every
multiple-choice question answered). School trial papers need the relaxations:

    python scripts\\validate_qbx.py imports\\sydney-boys-2019-physics.qbx ^
        --marks any --numbering any --allow-unanswered-mcq
"""

import argparse
import io
import json
import pathlib
import struct
import sys
import zipfile

SCHEMA = pathlib.Path(".opencode/skills/physics-question-import/import-schema.json")
EXPORT_KEYS = [
    "question_id", "course_id", "type_key", "difficulty", "marks",
    "parent_question_id", "part_label", "notes", "review_status",
    "classification_confidence", "node_ids", "node_codes", "tags", "body",
    "mcq_options", "answer", "solution", "marking_criteria", "assets", "source",
    "parts", "created_at", "updated_at",
]
ASSET_KEYS = ["asset_id", "file_path", "mime_type", "width", "height",
              "alt_text", "caption"]
BLOCK_TYPES = {"text", "heading", "equation", "table", "list", "code",
               "image", "diagram", "graph", "answer_area", "page_break"}


def png_size(data):
    """Width/height straight out of the IHDR chunk."""
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    return struct.unpack(">II", data[16:24])


def walk(blocks, errs, where):
    for b in blocks or []:
        if not isinstance(b, dict):
            errs.append(f"{where}: content block is not an object ({type(b).__name__})")
            continue
        bt = b.get("block_type")
        if bt not in BLOCK_TYPES:
            errs.append(f"{where}: unknown block_type {bt!r}")
            continue
        c = b.get("content")
        if not isinstance(c, dict):
            errs.append(f"{where}: {bt} block content is not an object")
            continue
        if bt in ("text", "heading") and not (c or {}).get("text"):
            errs.append(f"{where}: {bt} block has no text")
        if bt == "equation" and not (c or {}).get("latex"):
            errs.append(f"{where}: equation block has no latex")
        if bt == "list":
            if not (c or {}).get("items"):
                errs.append(f"{where}: list block has no items")
        if bt in ("image", "diagram", "graph"):
            ap = (c or {}).get("asset_path", "")
            if not ap:
                errs.append(f"{where}: {bt} block has no asset_path")
            for bad in ("/", "\\", "data:", "base64", "."):
                if bad in ap:
                    errs.append(f"{where}: asset_path {ap!r} contains {bad!r}")
            if not (c or {}).get("alt_text"):
                errs.append(f"{where}: {bt} block has no alt_text")


def check_criteria(q, errs, where):
    mc = q.get("marking_criteria") or []
    if not mc:
        errs.append(f"{where}: no marking_criteria")
        return
    if len(mc) != 1 or mc[0].get("block_type") != "list":
        errs.append(f"{where}: marking_criteria must be a single list block")
        return
    items = (mc[0].get("content") or {}).get("items") or []
    if not items:
        errs.append(f"{where}: marking_criteria list has no items")
    for item in items:
        if "mark" not in item.lower():
            errs.append(f"{where}: criterion without a mark allocation: {item[:60]!r}")


WARN = []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("qbx")
    ap.add_argument("--marks", default="100",
                    help="expected total marks, or 'any'")
    ap.add_argument("--numbering", default="1..N",
                    help="'1..N' or 'any'")
    ap.add_argument("--allow-unanswered-mcq", action="store_true",
                    help="tolerate a multiple-choice question with no correct option")
    ap.add_argument("--course-id", default=None,
                    help="expected course_id (default: the schema's, but a "
                         "mismatch is only a warning because ids are regenerated)")
    a = ap.parse_args()

    qbx = pathlib.Path(a.qbx)
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    node_by_id = {n["node_id"]: n for n in schema["valid_node_ids"]}
    tags = set(schema["valid_tags"])
    types = set(schema["valid_type_keys"])
    diffs = {d["level"] for d in schema["valid_difficulty_levels"]}
    want_course = a.course_id or schema["course_id"]

    errs = []
    with zipfile.ZipFile(qbx) as z:
        names = z.namelist()
        if "questions.json" not in names:
            print("FAIL: no questions.json in bundle")
            return
        payload = json.loads(z.read("questions.json").decode("utf-8"))

        if payload.get("export_schema_version") != 1:
            errs.append("export_schema_version != 1")
        if payload.get("course_name") != schema["course_name"]:
            errs.append("course_name mismatch")
        if payload.get("course_id") != want_course:
            WARN.append(f"course_id is {payload.get('course_id')}, schema says "
                        f"{want_course} (ids are regenerated on re-import)")

        assets_on_disk = {n[len("assets/"):-4] for n in names if n.startswith("assets/")}
        referenced = set()
        ids = set()
        total = 0
        key_seen = set()

        def one(q, parent, label, where):
            nonlocal total
            for k in EXPORT_KEYS:
                if k not in q:
                    errs.append(f"{where}: missing export key {k}")
            if set(q) - set(EXPORT_KEYS):
                errs.append(f"{where}: unexpected keys {sorted(set(q) - set(EXPORT_KEYS))}")
            qid = q.get("question_id")
            if not qid or qid in ids:
                errs.append(f"{where}: bad or duplicate question_id {qid!r}")
            ids.add(qid)
            if parent is None:
                key_seen.add(q.get("source", {}).get("original_question_no"))
            if q.get("parent_question_id") != parent:
                errs.append(f"{where}: parent_question_id mismatch")
            if q.get("part_label") != label:
                errs.append(f"{where}: part_label mismatch")
            if q.get("course_id") != want_course:
                errs.append(f"course_id mismatch ({q.get('course_id')})")
            if q.get("type_key") not in types:
                errs.append(f"{where}: bad type_key {q.get('type_key')!r}")
            if q.get("difficulty") not in diffs:
                errs.append(f"{where}: bad difficulty {q.get('difficulty')!r}")
            if not isinstance(q.get("marks"), int) or q["marks"] <= 0:
                errs.append(f"{where}: bad marks {q.get('marks')!r}")
            else:
                total += q["marks"] if parent is None else 0
            for t in q.get("tags") or []:
                if t not in tags:
                    errs.append(f"{where}: invalid tag {t!r}")
            nids, ncodes = q.get("node_ids") or [], q.get("node_codes") or []
            if len(nids) != len(ncodes) or not nids:
                errs.append(f"{where}: node_ids/node_codes length mismatch")
            for nid, code in zip(nids, ncodes):
                n = node_by_id.get(nid)
                if not n:
                    errs.append(f"{where}: unknown node_id {nid}")
                elif n["code"] != code:
                    errs.append(f"{where}: {nid} is {n['code']}, not {code}")
            walk(q.get("body"), errs, where)
            walk(q.get("answer"), errs, where + "/answer")
            walk(q.get("solution"), errs, where + "/solution")
            walk(q.get("marking_criteria"), errs, where + "/marking_criteria")
            check_criteria(q, errs, where)
            for opt in q.get("mcq_options") or []:
                walk(opt.get("content"), errs, where + "/" + str(opt.get("label")))
                if not opt.get("label"):
                    errs.append(f"{where}: MCQ option has no label")
                if not opt.get("content"):
                    errs.append(f"{where}/{opt.get('label')}: MCQ option has empty content")

            if q.get("type_key") == "multiple_choice":
                correct = [o for o in q["mcq_options"] if o.get("is_correct")]
                if len(correct) != 1:
                    msg = f"{where}: {len(correct)} correct options, expected 1"
                    if a.allow_unanswered_mcq and not correct:
                        WARN.append(msg + " (allowed: source does not state an answer)")
                    else:
                        errs.append(msg)
                if not q.get("answer") and not (a.allow_unanswered_mcq and not correct):
                    errs.append(f"{where}: MCQ has no answer")
                if len(correct) == 1 and q.get("answer"):
                    answer_text = " ".join(
                        str((b.get("content") or {}).get("text", ""))
                        for b in q.get("answer", []) if b.get("block_type") == "text"
                    ).strip().upper()
                    correct_label = correct[0].get("label", "").upper()
                    if answer_text not in (correct_label, f"({correct_label})"):
                        errs.append(f"{where}: answer {answer_text!r} does not match correct option {correct_label!r}")

            # Standalone written-response parts need 2 lines per mark. A nested
            # wrapper delegates response space to its children; drawing/graphing
            # parts and source-provided answer spaces use the prompt itself.
            if (label is not None and not q.get("parts")
                    and not (set(q.get("tags") or []) & {"graphing", "drawing", "diagram"})):
                aa = [b for b in q["body"] if b["block_type"] == "answer_area"]
                if not aa:
                    errs.append(f"{where}: part has no answer_area")
                elif aa[0]["content"].get("lines") != 2 * q["marks"]:
                    errs.append(f"{where}: answer_area {aa[0]['content'].get('lines')} "
                                f"lines, expected {2 * q['marks']}")

            # asset wiring
            local = set()
            for _asset in q.get("assets") or []:
                for k in ASSET_KEYS:
                    if k not in _asset:
                        errs.append(f"{where}: asset missing key {k}")
                if _asset["asset_id"] in local:
                    errs.append(f"{where}: duplicate asset {_asset['asset_id']}")
                local.add(_asset["asset_id"])
                referenced.add(_asset["asset_id"])
                if _asset["file_path"] != _asset["asset_id"]:
                    errs.append(f"{where}: {_asset['asset_id']} file_path != asset_id")
                if _asset["mime_type"] != "image/png":
                    errs.append(f"{where}: {_asset['asset_id']} mime {_asset['mime_type']}")
                if not _asset.get("alt_text"):
                    errs.append(f"{where}: {_asset['asset_id']} no alt_text")
                if f"assets/{_asset['asset_id']}.png" not in names:
                    errs.append(f"{where}: assets/{_asset['asset_id']}.png missing from ZIP")
                else:
                    size = png_size(z.read(f"assets/{_asset['asset_id']}.png"))
                    if size != (_asset["width"], _asset["height"]):
                        errs.append(f"{where}: {_asset['asset_id']} declared "
                                    f"{_asset['width']}x{_asset['height']}, PNG is {size}")
            used = set()

            def grab(blocks):
                for b in blocks or []:
                    if b["block_type"] in ("image", "diagram", "graph"):
                        used.add(b["content"]["asset_path"])

            grab(q.get("body"))
            for opt in q.get("mcq_options") or []:
                grab(opt.get("content"))
            if used - local:
                errs.append(f"{where}: blocks reference undeclared {sorted(used - local)}")
            if local - used:
                errs.append(f"{where}: declares unused assets {sorted(local - used)}")

            for b in q.get("body") or []:
                if b["block_type"] == "image" and "description" in b["content"]:
                    errs.append(f"{where}: image block still uses a description")

            for p in q.get("parts") or []:
                one(p, qid, p.get("part_label"), f"{where}/{p.get('part_label')}")

        for q in payload["questions"]:
            one(q, None, None, "Q" + str(q.get("source", {}).get("original_question_no")))

        def check_part_totals(q, where):
            parts = q.get("parts") or []
            if parts:
                psum = sum(p.get("marks", 0) for p in parts)
                if psum != q.get("marks"):
                    errs.append(f"{where}: parts sum to {psum}, parent is {q.get('marks')}")
                for p in parts:
                    check_part_totals(p, where + "/" + str(p.get("part_label")))

        for q in payload["questions"]:
            check_part_totals(q, "Q" + str(q.get("source", {}).get("original_question_no")))

        nos = sorted(int(n) for n in key_seen if str(n).isdigit())
        if a.numbering != "any" and nos != list(range(1, len(nos) + 1)):
            errs.append(f"question numbers not 1..{len(nos)}: {nos}")
        if a.marks != "any" and total != int(a.marks):
            errs.append(f"total marks {total}, expected {a.marks}")
        orphan = assets_on_disk - referenced
        if orphan:
            errs.append(f"PNG files in ZIP never referenced: {sorted(orphan)}")

    print(f"{qbx.name}: {len(payload['questions'])} questions, "
          f"{len(referenced)} assets, {total} marks")
    for w in WARN:
        print(f"  warning: {w}")
    if errs:
        print(f"--- {len(errs)} PROBLEM(S) ---")
        for e in errs:
            print("  " + e)
    else:
        print("--- VALID ---")


if __name__ == "__main__":
    main()
