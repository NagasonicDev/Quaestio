"""Build a .qbx bundle (questions.json + assets/*.png) for one Physics paper.

Spec-driven sibling of ``build_qbx.py``: the per-paper figure plan lives in a
JSON spec instead of being hard-coded, so the same builder serves every paper
in ``imports``.

    python scripts\\build_qbx_generic.py tmp\\specs\\sydney-boys-2019.json

Spec
----
    {
      "import":  "imports/sydney-boys-2019-physics.json",
      "figdir":  "tmp/g-sb2019",
      "out":     "imports/sydney-boys-2019-physics.qbx",
      "id_prefix": "qsb2019",
      "map":  { "12": [["option", "A", ["q12_1"]],
                        ["option", "C", ["q12_2"]]] },
      "alt":  { "q12_1": "Field diagrams for options A and B ..." },
      "gaps": { "5": "why this question's figure could not be sourced" }
    }

``map`` keys are the source question numbers as printed on the paper (strings,
so "Extra Question 21" works too). Each entry is
``[target, label, [asset stems]]`` where target is ``body`` (label unused),
``part`` (label = part_label) or ``option`` (label = A/B/C/D). Asset stems are
the file stems written by ``extract_figures_generic.py``, in the order the
images appear.

What the builder repairs on the way through
-------------------------------------------
* ``node_ids`` that no longer exist in the course are re-resolved from their
  ``node_codes``, which are stable across course re-imports.
* A part's ``answer_area`` is added, or resized to two lines per mark.
* Image blocks that only carry a prose ``description`` are dropped, so a
  description is never shipped in place of a figure.
* MCQ options are labelled A-D in the app's export shape.
* ``source.name`` loses the year and the "High School"/"School" suffix; the
  year lives in ``source.year``.
"""
import json
import pathlib
import re
import shutil
import sys
import zipfile

TS = "2026-09-27T00:00:00Z"
MIME = "image/png"
SCHEMA = pathlib.Path(".opencode/skills/physics-question-import/import-schema.json")
YEAR = re.compile(r"\b(19|20)\d{2}\b")
SUFFIX = re.compile(r"\s+(High\s+School|School)\b", re.I)

_id_by_code = {}


def clean_name(name):
    """'Sydney Boys High School 2019 Trial HSC Examination' -> 'Sydney Boys Trial HSC Examination'."""
    n = YEAR.sub("", name)
    n = SUFFIX.sub("", n)
    return re.sub(r"\s{2,}", " ", n).strip(" -")


def slug(part_label):
    s = "".join(ch if ch.isalnum() else "_" for ch in part_label.lower())
    while "__" in s:
        s = s.replace("__", "_")
    return s.strip("_")


def repair_nodes(container, report):
    """Re-resolve stale node ids from their stable codes."""
    ids, codes = container.get("node_ids") or [], container.get("node_codes") or []
    out, fixed = [], 0
    for nid, code in zip(ids, codes):
        want = _id_by_code.get(code, nid)
        if want != nid:
            fixed += 1
        out.append(want)
    if fixed:
        container["node_ids"] = out
        report["node_ids_reresolved"] = report.get("node_ids_reresolved", 0) + fixed


def fix_answer_area(container, report):
    if container.get("part_label") is None:
        return
    want = max(1, 2 * (container.get("marks") or 1))
    body = container.setdefault("body", [])
    aa = [b for b in body if b["block_type"] == "answer_area"]
    if aa:
        if aa[0]["content"].get("lines") != want:
            aa[0]["content"]["lines"] = want
            report["answer_area"] = report.get("answer_area", 0) + 1
        for extra in aa[1:]:
            body.remove(extra)
    else:
        body.append({"block_type": "answer_area", "content": {"lines": want}})
        report["answer_area_added"] = report.get("answer_area_added", 0) + 1


def image_block(stem, alt):
    return {"block_type": "image",
            "content": {"asset_path": stem, "alt_text": alt, "caption": None}}


def reimage(container, stems, alt_map):
    """Replace this container's image blocks with real asset references."""
    blocks = container.get("body", container.get("content"))
    at = None
    for i, b in enumerate(blocks):
        if b["block_type"] in ("image", "diagram", "graph"):
            if at is None:
                at = i
            blocks[i] = None
    blocks[:] = [b for b in blocks if b is not None]
    if at is None:
        at = len(blocks)
        while at > 0 and blocks[at - 1]["block_type"] == "answer_area":
            at -= 1
    for off, stem in enumerate(stems):
        blocks.insert(at + off, image_block(stem, alt_map[stem]))
    return stems


def export_shape(q, qid, parent_id, part_label, year, notes, fb=None):
    fb = fb or {}

    def pick(key, default=None):
        v = q.get(key)
        if v in (None, [], {}):
            v = fb.get(key, default)
        return v

    src = q.get("source") or fb.get("source") or {}
    return {
        "question_id": qid,
        "course_id": fb.get("course_id") or q.get("course_id"),
        "type_key": pick("type_key"),
        "difficulty": pick("difficulty"),
        "marks": q.get("marks"),
        "parent_question_id": parent_id,
        "part_label": part_label,
        "notes": notes,
        "review_status": None,
        "classification_confidence": pick("classification_confidence"),
        "node_ids": pick("node_ids", []),
        "node_codes": pick("node_codes", []),
        "tags": pick("tags", []),
        "body": q.get("body") or [],
        "mcq_options": q.get("mcq_options") or [],
        "answer": q.get("answer") or [],
        "solution": q.get("solution") or [],
        "marking_criteria": q.get("marking_criteria") or [],
        "assets": [],
        "source": {"name": src.get("name"), "year": src.get("year") or year,
                   "original_question_no": src.get("original_question_no"), "page": None},
        "parts": [],
        "created_at": TS,
        "updated_at": TS,
    }


def main():
    spec = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    for n in schema["valid_node_ids"]:
        _id_by_code[n["code"]] = n["node_id"]

    src = json.loads(pathlib.Path(spec["import"]).read_text(encoding="utf-8"))
    figdir = pathlib.Path(spec["figdir"])
    index = {e["file"].rsplit(".", 1)[0]: e
             for e in json.loads((figdir / "index.json").read_text(encoding="utf-8"))}
    amap = spec.get("map", {})
    alt_map = spec.get("alt", {})
    gaps = spec.get("gaps", {})
    notes_map = spec.get("notes", {})
    course_id = src["course_id"]
    year = spec.get("year") or next(
        (q["source"].get("year") for q in src["questions"] if q.get("source", {}).get("year")),
        None)
    if not year:
        m = re.search(r"(19|20)\d{2}", pathlib.Path(spec["import"]).name)
        year = int(m.group(0)) if m else None
    source_name = spec.get("source_name") or clean_name(
        next((q["source"]["name"] for q in src["questions"] if q.get("source", {}).get("name")),
             "Physics"))

    report = {}
    out_questions, used = [], []

    def collect(container, report_used):
        seen = []
        for b in container["body"]:
            if b["block_type"] in ("image", "diagram", "graph") and "asset_path" in b["content"]:
                seen.append(b["content"]["asset_path"])
        for option in container.get("mcq_options", []):
            for b in option.get("content", []):
                if b["block_type"] in ("image", "diagram", "graph") and "asset_path" in b["content"]:
                    seen.append(b["content"]["asset_path"])
        for stem in seen:
            e = index[stem]
            container["assets"].append({
                "asset_id": stem, "file_path": stem, "mime_type": MIME,
                "width": e["px"][0], "height": e["px"][1],
                "alt_text": alt_map[stem], "caption": None})
            report_used.append(stem)
        return seen

    for n, q in enumerate(src["questions"], start=1):
        qno = str(q["source"].get("original_question_no"))
        plan = amap.get(qno, [])
        qid = f"{spec['id_prefix']}_{n:02d}"
        note = gaps.get(qno) or notes_map.get(qno)
        out = export_shape(q, qid, None, None, year, note, fb={"course_id": course_id})
        out["course_id"] = course_id
        out["source"]["name"] = source_name
        repair_nodes(out, report)
        fix_answer_area(out, report)

        for target, label, stems in plan:
            if target == "body":
                reimage(out, stems, alt_map)

        for part in q.get("parts", []):
            label = part["part_label"]
            pop = export_shape(part, f"{qid}_{slug(label)}", qid, label, year, None, fb=q)
            pop["course_id"] = course_id
            pop["source"]["name"] = source_name
            repair_nodes(pop, report)
            fix_answer_area(pop, report)
            stems = next((s for t, l, s in plan if t == "part" and l == label), [])
            if stems:
                reimage(pop, stems, alt_map)
            out["parts"].append(pop)

        # Use spreadsheet-style labels so choices beyond D are not silently
        # dropped by zip("ABCD", ...).
        def option_label(index):
            label = ""
            while index >= 0:
                label = chr(index % 26 + ord("A")) + label
                index = index // 26 - 1
            return label

        for option_index, option in enumerate(out["mcq_options"]):
            letter = option_label(option_index)
            option["label"] = letter
            stems = next((s for t, l, s in plan if t == "option" and l == letter), [])
            if stems:
                reimage(option, stems, alt_map)

        # any image block still carrying only a prose description has no file
        # behind it: drop it rather than ship the description as a figure
        for container in [out] + out["parts"]:
            container["body"][:] = [b for b in container["body"]
                                    if not (b["block_type"] in ("image", "diagram", "graph")
                                            and "asset_path" not in b["content"])]
        for option in out["mcq_options"]:
            prose = [b["content"].get("description") or b["content"].get("text") or ""
                     for b in option["content"]
                     if b["block_type"] in ("image", "diagram", "graph")
                     and "asset_path" not in b["content"]]
            option["content"][:] = [b for b in option["content"]
                                    if not (b["block_type"] in ("image", "diagram", "graph")
                                            and "asset_path" not in b["content"])]
            if not option["content"] and any(p.strip() for p in prose):
                option["content"] = [{"block_type": "text",
                                      "content": {"text": "\n\n".join(
                                          p.strip() for p in prose if p.strip())}}]

        used += collect(out, used)
        for pop in out["parts"]:
            used += collect(pop, used)

        if qno in gaps and "action_required" not in out["tags"]:
            out["tags"].append("action_required")

        out_questions.append(out)

    # ---- write the bundle -------------------------------------------------
    out_path = pathlib.Path(spec["out"])
    stage = pathlib.Path("tmp") / ("stage-" + out_path.stem)
    if stage.exists():
        shutil.rmtree(stage)
    (stage / "assets").mkdir(parents=True)
    seen_assets = set()
    for stem in used:
        if stem in seen_assets:
            continue
        seen_assets.add(stem)
        shutil.copy2(figdir / f"{stem}.png", stage / "assets" / f"{stem}.png")

    payload = {"export_schema_version": 1, "course_id": course_id,
               "course_name": src["course_name"], "questions": out_questions}
    (stage / "questions.json").write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    if out_path.exists():
        out_path.unlink()
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as z:
        z.write(stage / "questions.json", "questions.json")
        for stem in seen_assets:
            z.write(stage / "assets" / f"{stem}.png", f"assets/{stem}.png")

    total = sum(q["marks"] for q in out_questions)
    print(f"{out_path}: {len(out_questions)} questions, "
          f"{total} marks, {len(seen_assets)} assets, source '{source_name}' ({year})")
    if report:
        print("repairs:", ", ".join(f"{k}={v}" for k, v in sorted(report.items())))
    unused = sorted(set(index) - set(used))
    if unused:
        print("WARNING extracted but not attached:", ", ".join(unused))
    for qno, plan in amap.items():
        for _t, _l, stems in plan:
            for s in stems:
                if s not in index:
                    sys.exit(f"spec references unknown asset {s!r} (Q{qno})")
                if s not in seen_assets:
                    sys.exit(f"asset {s!r} (Q{qno}) was never attached to a block")


if __name__ == "__main__":
    main()
