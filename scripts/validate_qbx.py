"""Validate a .qbx bundle against import-schema.json and the export-shape rules.

    python scripts\\validate_qbx.py imports\\2024-hsc-physics.qbx

The defaults suit the NESA HSC papers (100 marks, questions numbered 1..N, every
multiple-choice question answered). School trial papers need the relaxations:

    python scripts\\validate_qbx.py imports\\sydney-boys-2019-physics.qbx ^
        --marks any --numbering any --allow-unanswered-mcq
"""

import argparse
import copy
import difflib
import io
import json
import pathlib
import re
import struct
import sys
import zipfile

HERE = pathlib.Path(__file__).resolve().parent
SCHEMA = next(
    path for path in (
        HERE.parent / "import-schema.json",
        HERE.parent / ".opencode" / "skills" / "physics-question-import" / "import-schema.json",
        pathlib.Path(".opencode/skills/physics-question-import/import-schema.json"),
    ) if path.exists()
)
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


def plain(block):
    """Extract searchable text from a content block."""
    content = block.get("content", {}) if isinstance(block, dict) else {}
    if not isinstance(content, dict):
        return ""
    return " ".join(str(content.get(k, "")) for k in ("text", "latex", "code"))


def norm(text):
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def check_multipart_solutions(payload, errs, fix=False):
    """Move clear parent-level solution duplicates onto parts; report ambiguity.

    In --fix mode, exact matches and clearly unique text matches are relocated
    directly. Remaining worked steps are placed by their best text match while
    preserving source order between already identified parts.
    """
    changes = []

    def visit(q, where):
        parts = q.get("parts") or []
        if parts:
            parent_solution = q.get("solution") or []
            remaining = []
            remaining_indices = []
            anchors = {}
            for block_index, block in enumerate(parent_solution):
                text = norm(plain(block))
                if not text:
                    remaining.append(block)
                    remaining_indices.append(block_index)
                    continue
                exact_solution = []
                exact_answer = []
                scored_parts = []
                for part in parts:
                    sol_text = norm(" ".join(plain(b) for b in part.get("solution", []) or []))
                    ans_text = norm(" ".join(plain(b) for b in part.get("answer", []) or []))
                    if text and sol_text and text in sol_text or sol_text and sol_text in text:
                        exact_solution.append(part)
                    elif text and ans_text and (text in ans_text or ans_text in text):
                        exact_answer.append(part)
                    else:
                        target_text = norm(" ".join(
                            plain(b) for field in ("body", "answer", "solution")
                            for b in part.get(field, []) or []
                        ))
                        source_words = set(re.findall(r"[a-z]{4,}", text))
                        target_words = set(re.findall(r"[a-z]{4,}", target_text))
                        overlap = len(source_words & target_words) / max(1, len(source_words))
                        sequence = difflib.SequenceMatcher(None, text, target_text).ratio()
                        scored_parts.append((max(overlap, sequence), part))

                if len(exact_solution) == 1:
                    target = exact_solution[0]
                    if fix:
                        anchors[block_index] = parts.index(target)
                        changes.append(f"{where}: removed duplicated parent solution block (already on part {target.get('part_label')})")
                        continue
                    remaining.append(block)
                    remaining_indices.append(block_index)
                    continue
                if len(exact_answer) == 1 and not exact_answer[0].get("solution"):
                    if fix:
                        target = exact_answer[0]
                        anchors[block_index] = parts.index(target)
                        moved = copy.deepcopy(block)
                        moved["slot"] = "solution"
                        moved["position"] = len(target.get("solution") or [])
                        target.setdefault("solution", []).append(moved)
                        changes.append(f"{where}: moved parent solution block to part {target.get('part_label')} (matches its answer)")
                        continue
                if scored_parts:
                    scored_parts.sort(key=lambda item: item[0], reverse=True)
                    best_score, target = scored_parts[0]
                    next_score = scored_parts[1][0] if len(scored_parts) > 1 else 0
                    if best_score >= 0.22 and best_score - next_score >= 0.05:
                        if fix:
                            anchors[block_index] = parts.index(target)
                            moved = copy.deepcopy(block)
                            moved["slot"] = "solution"
                            moved["position"] = len(target.get("solution") or [])
                            target.setdefault("solution", []).append(moved)
                            changes.append(f"{where}: moved parent solution block to best-matching part {target.get('part_label')} (text match {best_score:.2f})")
                            continue
                remaining.append(block)
                remaining_indices.append(block_index)

            # When some blocks are clear matches and others are bare working
            # steps, retain their original sequence and fit the remaining
            # blocks between those known part locations. Text overlap breaks
            # ties; the original part order is the final tie-breaker.
            if fix and remaining and anchors:
                keep_blocks = []
                keep_indices = []
                for block_index, block in zip(remaining_indices, remaining):
                    previous = [(i, part_i) for i, part_i in anchors.items() if i < block_index]
                    following = [(i, part_i) for i, part_i in anchors.items() if i > block_index]
                    previous_anchor = max(previous, default=None)
                    next_anchor = min(following, default=None)
                    lower = previous_anchor[1] if previous_anchor else 0
                    upper = next_anchor[1] if next_anchor else len(parts) - 1
                    source_text = norm(plain(block))
                    source_words = set(re.findall(r"[a-z]{4,}", source_text))
                    choices = []
                    for part_i in range(lower, upper + 1):
                        part = parts[part_i]
                        target_text = norm(" ".join(
                            plain(b) for field in ("body", "answer", "solution")
                            for b in part.get(field, []) or []
                        ))
                        target_words = set(re.findall(r"[a-z]{4,}", target_text))
                        overlap = len(source_words & target_words) / max(1, len(source_words))
                        sequence = difflib.SequenceMatcher(None, source_text, target_text).ratio()
                        source_math = set(re.findall(r"\\[A-Za-z]+|[A-Z](?:_[A-Za-z0-9]+)?", plain(block)))
                        target_math = set(re.findall(r"\\[A-Za-z]+|[A-Z](?:_[A-Za-z0-9]+)?", " ".join(
                            plain(b) for field in ("body", "answer", "solution")
                            for b in part.get(field, []) or []
                        )))
                        math_match = len(source_math & target_math) / max(1, len(source_math))
                        choices.append((max(overlap, sequence, math_match), part_i))
                    if choices:
                        best_score = max(score for score, _ in choices)
                        expected = min(len(parts) - 1, block_index * len(parts) // max(1, len(parent_solution)))
                        tied = [part_i for score, part_i in choices if best_score - score < 0.05]
                        if previous_anchor is None and next_anchor is not None:
                            target_i = expected
                        elif (previous_anchor and next_anchor
                              and previous_anchor[1] != next_anchor[1]):
                            target_i = tied[0]
                        elif previous_anchor and next_anchor:
                            target_i = previous_anchor[1]
                        else:
                            target_i = expected if expected in tied else tied[0]
                        target = parts[target_i]
                        moved = copy.deepcopy(block)
                        moved["slot"] = "solution"
                        moved["position"] = len(target.get("solution") or [])
                        target.setdefault("solution", []).append(moved)
                        anchors[block_index] = target_i
                        changes.append(f"{where}: placed remaining solution block on part {target.get('part_label')} using text match and source order")
                    else:
                        keep_blocks.append(block)
                        keep_indices.append(block_index)
                remaining, remaining_indices = keep_blocks, keep_indices

            if fix:
                q["solution"] = remaining
            if remaining:
                errs.append(f"{where}: {len(remaining)} parent-level solution block(s) remain; assign them to the correct part(s) before importing")
            for part in parts:
                visit(part, where + "/" + str(part.get("part_label")))

    for question in payload.get("questions", []):
        visit(question, "Q" + str(question.get("source", {}).get("original_question_no")))
    return changes


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
    ap.add_argument("--fix", action="store_true",
                    help="write a repaired sibling .qbx, relocating clearly matched multipart solutions")
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
            return 1
        payload = json.loads(z.read("questions.json").decode("utf-8"))

        repairs = check_multipart_solutions(payload, errs, fix=a.fix)

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

    if a.fix:
        fixed_path = qbx.with_name(qbx.stem + "-fixed" + qbx.suffix)
        with zipfile.ZipFile(qbx, "r") as source_zip, zipfile.ZipFile(fixed_path, "w") as fixed_zip:
            for info in source_zip.infolist():
                data = (json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
                        if info.filename == "questions.json" else source_zip.read(info.filename))
                fixed_zip.writestr(info, data)
        print(f"Repaired copy: {fixed_path}")
        for repair in repairs:
            print("  repaired: " + repair)
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
    return 1 if errs else 0


if __name__ == "__main__":
    raise SystemExit(main())
