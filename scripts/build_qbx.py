"""Build a .qbx bundle (questions.json + assets/*.png) for one HSC Physics paper.

Reads the validated schema-1 import JSON, swaps every prose `image` block for a
real asset reference, and re-emits the questions in the app's export shape.

    python scripts\\build_qbx.py imports\\2024-hsc-physics.json tmp\\fig2024c 2024
"""

import json
import pathlib
import shutil
import sys
import zipfile

TS = "2026-09-27T00:00:00Z"
MIME = "image/png"

# question number -> list of (target, label, [asset stems])
#   target "body"   -> label unused
#   target "part"   -> label is the part_label
#   target "option" -> label is "A"/"B"/"C"/"D"
# The order of the stems is the order the image blocks appear in the container.
MAP = {
    1:   [("body", None, ["q01_1"])],
    4:   [("option", "A", ["q04_1"]), ("option", "B", ["q04_2"]),
          ("option", "C", ["q04_3"]), ("option", "D", ["q04_4"])],
    5:   [("body", None, ["q05_1", "q05_2", "q05_3"])],
    9:   [("body", None, ["q09_1"])],
    10:  [("body", None, ["q10_1"])],
    12:  [("body", None, ["q12_1"])],
    13:  [("body", None, ["q13_1"])],
    15:  [("body", None, ["q15_1"]), ("option", "A", ["q15_2"]),
          ("option", "B", ["q15_3"]), ("option", "C", ["q15_4"]),
          ("option", "D", ["q15_5"])],
    16:  [("body", None, ["q16_1"])],
    17:  [("body", None, ["q17_1"])],
    18:  [("body", None, ["q18_1"]), ("option", "A", ["q18_2"]),
          ("option", "B", ["q18_3"]), ("option", "C", ["q18_4"]),
          ("option", "D", ["q18_5"])],
    20:  [("body", None, ["q20_1"])],
    21:  [("body", None, ["q21_1"])],
    22:  [("body", None, ["q22_1"])],
    23:  [("part", "a(i)", ["q23_1"])],
    24:  [("body", None, ["q24_1"])],
    25:  [("part", "b", ["q25_1"])],
    28:  [("body", None, ["q28_1"])],
    29:  [("body", None, ["q29_1", "q29_2"])],
    30:  [("body", None, ["q30_1"])],
    31:  [("body", None, ["q31_1"])],
    33:  [("body", None, ["q33_1"])],
}

ALT = {
    "q01_1": "A circle showing the path of object P, a tangent arrow at P labelled "
             "'Direction of motion', and four candidate arrows W, X, Y and Z radiating from P.",
    "q04_1": "A coil on an axle in a uniform magnetic field B, wired through a two-segment "
             "ring lying above and below the axle to an AC supply.",
    "q04_2": "A coil on an axle in a uniform magnetic field B, wired through a two-segment "
             "ring lying above and below the axle to a DC supply.",
    "q04_3": "A coil on an axle in a uniform magnetic field B, wired through a two-segment "
             "ring lying either side of the axle to an AC supply.",
    "q04_4": "A coil on an axle in a uniform magnetic field B, wired through a two-segment "
             "ring lying either side of the axle to a DC supply.",
    "q05_1": "Hertzsprung-Russell diagram titled 'Cluster X': luminosity against surface "
             "temperature on logarithmic axes, with stars plotted on the main sequence.",
    "q05_2": "Hertzsprung-Russell diagram titled 'Cluster Y': luminosity against surface "
             "temperature on logarithmic axes, with stars plotted on the main sequence.",
    "q05_3": "Hertzsprung-Russell diagram titled 'Cluster Z': luminosity against surface "
             "temperature on logarithmic axes, with stars plotted on the main sequence.",
    "q09_1": "Two objects released from the same height: P dropped vertically and Q launched "
             "horizontally, showing the vertical and curved paths each follows.",
    "q10_1": "A straight conducting rod carrying current I in a uniform magnetic field B "
             "directed into the page, with a force arrow F acting on the rod.",
    "q12_1": "A graph of the length of a rod against the speed of the rod, with curves W, X, "
             "Y and Z and the unloaded length marked on the length axis.",
    "q13_1": "Two identical satellites A and B in circular orbits of different radii around "
             "the same planet.",
    "q15_1": "A conductor PQ able to rotate about P in a uniform magnetic field directed into "
             "the page, with a dashed circle showing the path of Q.",
    "q15_2": "Graph of emf against time: a sinusoidal curve starting at zero, rising to a "
             "positive maximum, crossing zero, reaching a negative minimum and returning to zero.",
    "q15_3": "Graph of emf against time: a curve starting at a positive maximum, falling to a "
             "negative minimum and returning to the positive maximum.",
    "q15_4": "Graph of emf against time: a horizontal straight line lying on the zero axis.",
    "q15_5": "Graph of emf against time: a horizontal straight line at a constant positive value.",
    "q16_1": "Graph of maximum kinetic energy of emitted photoelectrons against incident photon "
             "energy, showing four straight lines with different x-axis intercepts, labelled for "
             "the metals Ag, Mg, K and Li.",
    "q17_1": "Cross-section of a cyclotron: two D-shaped dees separated by a gap, an alternating "
             "voltage across the gap, magnets above and below, a particle path spiralling outward "
             "from the centre to a target.",
    "q18_1": "A bar magnet with its S pole to the left moving towards a coil wound on a core "
             "labelled X.",
    "q18_2": "Two coils, the shaded core X on the right, with a current direction arrow pointing "
             "right and the label 'Increasing current'.",
    "q18_3": "Two coils, the shaded core X on the right, with a current direction arrow pointing "
             "left and the label 'Increasing current'.",
    "q18_4": "Two coils, the shaded core X on the left, with a current direction arrow pointing "
             "right and the label 'Decreasing current'.",
    "q18_5": "Two coils, the shaded core X on the left, with a current direction arrow pointing "
             "right and the label 'Decreasing current'.",
    "q20_1": "The Earth with a laboratory X on the equator, a satellite Y in a small low orbit and "
             "a satellite Z in a larger orbit, drawn not to scale.",
    "q21_1": "A spanner on a nut, the handle extending 18 cm from the pivot, with a 75 N force "
             "applied at 40 degrees to the handle.",
    "q22_1": "A graph of recessional velocity against distance for a set of galaxies, showing a "
             "straight line through the origin.",
    "q23_1": "A block diagram of Chadwick's experiment: a source of alpha particles firing at a "
             "beryllium target, with unknown radiation emerging and striking a block of paraffin.",
    "q24_1": "An absorption spectrum: a continuous band of intensity against wavelength from 400 to "
             "700 nm, dipping to a minimum near 500 nm, with absorption lines W, X, Y and Z marked.",
    "q25_1": "A graph of the square of the orbital period against the cube of the orbital radius "
             "for five moons, with the data points lying on a straight line of best fit.",
    "q28_1": "An electron gun firing through a pair of parallel plates into a screen, with the "
             "path of the electrons and a point X marked on the screen.",
    "q29_1": "Two identical conducting rods A and B on a frictionless table connected to a battery "
             "and switch, shown in position 1 and in position 2.",
    "q29_2": "The same arrangement of rods A and B, battery and switch viewed in position 2, with "
             "the separation of the rods greater than in position 1.",
    "q30_1": "A hollow cylinder shown in cross-section about a central axis, with an object resting "
             "on the inner floor and a tangential velocity arrow.",
    "q31_1": "Two panels comparing Model A, a flat surface in a uniform field, and Model B, a curved "
             "Earth with a radial field, each showing a body launched vertically.",
    "q33_1": "A bar magnet swinging above an aluminium can, with the magnet's S pole to the left and "
             "N pole to the right, above the marked centre of the can.",
}

# Questions whose source figures could not be extracted, with the reason.
GAPS = {
    17: "The four option diagrams printed alongside this question are absent from the source PDF "
        "(page 11 carries only the stem and the cyclotron figure) and from the marking guidelines. "
        "The option text below is a placeholder and the option artwork must be sourced manually. "
        "The answer C is taken from the official Section I answer key.",
    29: "Part (a) asks the student to draw connecting wires on a blank copy of the rod layout. That "
        "blank answer frame is not present in the extracted figures and must be added manually.",
}

NOTES_BLOCKED = (
    "The MCQ options are labels on the single diagram in the question body, not separate images, "
    "so no option images are attached."
)


def image_block(stem):
    return {
        "block_type": "image",
        "content": {
            "asset_path": stem,
            "alt_text": ALT[stem],
            "caption": None,
        },
    }


def slug(part_label):
    out = []
    for ch in part_label.lower():
        out.append(ch if ch.isalnum() else "_")
    s = "".join(out)
    while "__" in s:
        s = s.replace("__", "_")
    return s.strip("_")


def reimage(container, stems, assets_out):
    """Drop every image block in `container`, insert new ones where the first was.

    Returns the index the new blocks were placed at.
    """
    blocks = container.get("body")
    if blocks is None:
        blocks = container["content"]
    at = None
    for i, b in enumerate(blocks):
        if b["block_type"] == "image":
            if at is None:
                at = i
            blocks[i] = None
    blocks[:] = [b for b in blocks if b is not None]
    if at is None:
        at = len(blocks)
        while at > 0 and blocks[at - 1]["block_type"] == "answer_area":
            at -= 1
    for offset, stem in enumerate(stems):
        blocks.insert(at + offset, image_block(stem))
        assets_out.append(stem)


def export_shape(q, qid, parent_id, part_label, year, notes, parent=None):
    src = q.get("source") or {}
    fb = parent or {}

    def pick(key, default=None):
        v = q.get(key)
        if v in (None, [], {}):
            v = fb.get(key, default)
        return v

    return {
        "question_id": qid,
        "course_id": COURSE_ID,
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
        "source": {
            "name": src.get("name") or (fb.get("source") or {}).get("name") or f"{year} HSC Physics",
            "year": src.get("year") or (fb.get("source") or {}).get("year") or year,
            "original_question_no": src.get("original_question_no")
            or (fb.get("source") or {}).get("original_question_no"),
            "page": None,
        },
        "parts": [],
        "created_at": TS,
        "updated_at": TS,
    }


def main():
    global COURSE_ID
    src_path, figdir, year = sys.argv[1], pathlib.Path(sys.argv[2]), int(sys.argv[3])
    data = json.loads(pathlib.Path(src_path).read_text(encoding="utf-8"))
    COURSE_ID = data["course_id"]
    index = {e["file"].split(".")[0]: e
             for e in json.loads((figdir / "index.json").read_text(encoding="utf-8"))}

    out_questions = []
    used = []

    for q in data["questions"]:
        qno = int(q["source"]["original_question_no"])
        plan = MAP.get(qno, [])
        qid = f"qphys{year}_{qno:02d}"
        notes = GAPS.get(qno)
        out = export_shape(q, qid, None, None, year, notes)

        for target, label, stems in plan:
            if target == "body":
                reimage(out, stems, [])

        for part in q.get("parts", []):
            label = part["part_label"]
            pid = f"{qid}_{slug(label)}"
            pop = export_shape(part, pid, qid, label, year, None, parent=q)
            stems = next((s for t, l, s in plan if t == "part" and l == label), [])
            if stems:
                reimage(pop, stems, [])
            out["parts"].append(pop)

        # options
        for letter, option in zip("ABCD", out["mcq_options"]):
            stems = next((s for t, l, s in plan if t == "option" and l == letter), [])
            option["label"] = letter
            if stems:
                reimage(option, stems, [])

        # build the assets array from the blocks actually present, on whichever
        # question or part owns the block
        def collect(container):
            seen = []
            for b in container["body"]:
                if b["block_type"] == "image" and "asset_path" in b["content"]:
                    seen.append(b["content"]["asset_path"])
            for option in container["mcq_options"]:
                for b in option["content"]:
                    if b["block_type"] == "image" and "asset_path" in b["content"]:
                        seen.append(b["content"]["asset_path"])
            for stem in seen:
                e = index[stem]
                container["assets"].append({
                    "asset_id": stem,
                    "file_path": stem,
                    "mime_type": MIME,
                    "width": e["px"][0],
                    "height": e["px"][1],
                    "alt_text": ALT[stem],
                    "caption": None,
                })
            return seen

        used += collect(out)
        for pop in out["parts"]:
            used += collect(pop)

        # any image block still carrying a prose `description` has no extracted
        # file behind it - drop it rather than ship a description as a figure
        for container in [out] + out["parts"] + out["mcq_options"]:
            if "body" in container:
                container["body"][:] = [b for b in container["body"]
                                        if not (b["block_type"] == "image"
                                                and "asset_path" not in b["content"])]
            for option in container.get("mcq_options", []):
                option["content"][:] = [b for b in option["content"]
                                        if not (b["block_type"] == "image"
                                                and "asset_path" not in b["content"])]

        # Q17's option diagrams are absent from the source, so say so in the option
        if qno == 17:
            for letter, option in zip("ABCD", out["mcq_options"]):
                option["content"] = [{
                    "block_type": "text",
                    "content": {"text": "[Option diagram not present in the source PDF - "
                                        "artwork must be sourced manually.]"},
                }]

        for container in [out] + out["parts"]:
            if qno in GAPS and "action_required" not in container["tags"]:
                container["tags"].append("action_required")

        out_questions.append(out)

    # ---- write the bundle -------------------------------------------------
    stage = pathlib.Path("tmp") / f"qbx{year}"
    if stage.exists():
        shutil.rmtree(stage)
    (stage / "assets").mkdir(parents=True)
    for stem in used:
        shutil.copy2(figdir / f"{stem}.png", stage / "assets" / f"{stem}.png")

    payload = {
        "export_schema_version": 1,
        "course_id": COURSE_ID,
        "course_name": data["course_name"],
        "questions": out_questions,
    }
    (stage / "questions.json").write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    qbx = pathlib.Path(f"imports/{year}-hsc-physics.qbx")
    if qbx.exists():
        qbx.unlink()
    with zipfile.ZipFile(qbx, "w", zipfile.ZIP_DEFLATED) as z:
        z.write(stage / "questions.json", "questions.json")
        for stem in used:
            z.write(stage / "assets" / f"{stem}.png", f"assets/{stem}.png")

    print(f"{len(out_questions)} questions, {len(used)} assets -> {qbx}")
    unused = sorted(set(index) - set(used))
    if unused:
        print("WARNING extracted but not attached:", ", ".join(unused))


if __name__ == "__main__":
    main()
