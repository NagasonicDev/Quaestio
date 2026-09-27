"""Restore the nested photoelectric-effect parts and graph in NSB 2023 Q17."""
import copy
import json
import pathlib
import tempfile
import zipfile
import pymupdf

ROOT = pathlib.Path(__file__).resolve().parents[1]
PATH = ROOT / "imports/north-sydney-boys-2023-physics.qbx"
GRAPH_ASSET = "q17c_grid"


def blank_graph():
    width, height = 612, 565
    left, right, top, bottom = 72, 18, 16, 63
    plot_w, plot_h = width - left - right, height - top - bottom
    doc = pymupdf.open()
    page = doc.new_page(width=width, height=height)
    xzero = left
    yzero = top + plot_h / 2
    for i in range(71):
        x = left + plot_w * i / 70
        major = i % 10 == 0
        page.draw_line((x, top), (x, top + plot_h), color=(0.60, 0.60, 0.60) if major else (0.77, 0.77, 0.77), width=0.8 if major else 0.4)
    for i in range(41):
        y = top + plot_h * i / 40
        major = i % 5 == 0
        page.draw_line((left, y), (left + plot_w, y), color=(0.60, 0.60, 0.60) if major else (0.77, 0.77, 0.77), width=0.8 if major else 0.4)
    page.draw_rect((left, top, left + plot_w, top + plot_h), color=(0.45, 0.45, 0.45), width=0.8)
    page.draw_line((xzero, top), (xzero, top + plot_h), color=(0.05, 0.05, 0.05), width=1.6)
    page.draw_line((left, yzero), (left + plot_w, yzero), color=(0.05, 0.05, 0.05), width=1.6)
    for xval in range(0, 15, 2):
        x = left + plot_w * xval / 14
        page.draw_line((x, yzero - 4), (x, yzero + 4), color=(0.05, 0.05, 0.05), width=0.8)
        page.insert_text((x - 6, yzero + 22), str(xval), fontsize=14, fontname="tiro", color=(0.05, 0.05, 0.05))
    for yval in range(-4, 5):
        y = top + plot_h * (4 - yval) / 8
        page.draw_line((left - 4, y), (left + 4, y), color=(0.05, 0.05, 0.05), width=0.8)
        page.insert_text((left - 29, y + 5), str(yval), fontsize=13, fontname="tiro", color=(0.05, 0.05, 0.05))
    page.insert_text((left + plot_w / 2 - 55, height - 18), "f / x 10^14 Hz", fontsize=15, fontname="tiro", color=(0.05, 0.05, 0.05))
    page.insert_text((22, top + plot_h / 2 + 48), "E_max / eV", fontsize=15, fontname="tiro", color=(0.05, 0.05, 0.05), rotate=90)
    pix = page.get_pixmap(matrix=pymupdf.Matrix(2, 2), alpha=False)
    return pix.tobytes("png"), pix.width, pix.height


def make_child(template, qid, parent_id, label, marks, body, answer, solution, criteria):
    child = copy.deepcopy(template)
    child.update({
        "question_id": qid, "parent_question_id": parent_id, "part_label": label,
        "marks": marks, "body": body, "mcq_options": [], "answer": answer,
        "solution": solution, "marking_criteria": [{"block_type": "list", "content": {"ordered": False, "items": criteria}}],
        "assets": [], "parts": [], "notes": None,
    })
    return child


def main():
    grid_bytes, grid_width, grid_height = blank_graph()
    with zipfile.ZipFile(PATH, "r") as zin:
        entries = [(info, zin.read(info.filename)) for info in zin.infolist() if info.filename != f"assets/{GRAPH_ASSET}.png"]
    index = next(i for i, (info, _) in enumerate(entries) if info.filename == "questions.json")
    payload = json.loads(entries[index][1].decode("utf-8"))
    q = next(q for q in payload["questions"] if str(q.get("source", {}).get("original_question_no")) == "17")
    a = next(p for p in q["parts"] if p.get("part_label") == "a")
    b = next(p for p in q["parts"] if p.get("part_label") == "b")
    c = next(p for p in q["parts"] if p.get("part_label") == "c")

    # Remove old cross-reference placeholders copied onto part (a).
    for field in ("answer", "solution"):
        a[field] = [block for block in (a.get(field) or [])
                    if not ("part answers in the worked solutions" in str(block).lower()
                            or "part-level worked solutions" in str(block).lower())]

    graph_alt = "Photoelectric-effect graph of maximum kinetic energy E_max (eV) against frequency f (10^14 Hz), with the source line rising from approximately (6, 0.9) to (14, 4)."
    b["body"] = [
        {"block_type": "text", "content": {"text": "Use data from the graph to determine:"}},
        {"block_type": "image", "content": {"asset_path": "q17_1", "alt_text": graph_alt, "caption": None}},
    ]
    b["assets"] = [{"asset_id": "q17_1", "file_path": "q17_1", "mime_type": "image/png", "width": 1489, "height": 1095, "alt_text": graph_alt, "caption": None}]

    answers = [
        ("the threshold frequency.", "$3.8\\times10^{14}\\,\\mathrm{Hz}$ (within $0.2\\times10^{14}\\,\\mathrm{Hz}$).",
         ["The threshold frequency is read from the frequency-axis intercept.", "The intercept is approximately $3.8\\times10^{14}\\,\\mathrm{Hz}$."],
         ["1 mark: identifies the frequency-axis intercept as the threshold frequency", "1 mark: gives approximately $3.8\\times10^{14}\\,\\mathrm{Hz}$"]),
        ("a value of the Planck constant.", "$6.5\\times10^{-34}\\,\\mathrm{J\\,s}$ (within $0.2\\times10^{-34}\\,\\mathrm{J\\,s}$).",
         ["The gradient of the graph gives Planck's constant after converting eV to joules.", "The gradient gives approximately $6.5\\times10^{-34}\\,\\mathrm{J\\,s}$; equivalent working in eV s is accepted."],
         ["1 mark: calculates the gradient using a rise/run from the graph and converts to SI units", "1 mark: gives approximately $6.5\\times10^{-34}\\,\\mathrm{J\\,s}$"]),
        ("the work function of the surface.", "$1.5\\,\\mathrm{eV}$ (within $0.1\\,\\mathrm{eV}$).",
         ["The y-intercept is the negative of the work function in the photoelectric equation.", "The graph gives a work function of approximately $1.5\\,\\mathrm{eV}$."],
         ["1 mark: determines the work function from the vertical intercept", "1 mark: gives approximately $1.5\\,\\mathrm{eV}$ with graph evidence"]),
    ]
    nested = []
    for index_part, (prompt, answer_text, solution_text, criteria) in enumerate(answers, start=1):
        label = ("i", "ii", "iii")[index_part - 1]
        child = make_child(
            b, f"{b['question_id']}_{label}", b["question_id"], label, 2,
            [{"block_type": "text", "content": {"text": prompt}}, {"block_type": "answer_area", "content": {"lines": 4}}],
            [{"block_type": "text", "content": {"text": answer_text}}],
            [{"block_type": "text", "content": {"text": solution_text[0]}}, {"block_type": "equation", "content": {"latex": solution_text[1], "display": True}}],
            criteria)
        nested.append(child)
    b["parts"] = nested
    b["answer"] = []
    b["solution"] = []
    b["marking_criteria"] = [{"block_type": "list", "content": {"ordered": False,
        "items": [item for p in nested for item in p["marking_criteria"][0]["content"]["items"]]}}]

    c_alt = "Blank graph grid for maximum kinetic energy E_max (eV) against frequency f (10^14 Hz), with E_max ranging from −4 to 4 eV and frequency from 0 to 14 × 10^14 Hz."
    c["body"] = [block for block in c.get("body", []) if block.get("block_type") != "answer_area"]
    c["body"].append({"block_type": "image", "content": {"asset_path": GRAPH_ASSET, "alt_text": c_alt, "caption": None}})
    c["body"].append({"block_type": "answer_area", "content": {"lines": 4}})
    c["assets"] = [asset for asset in c.get("assets", []) if asset.get("asset_id") != GRAPH_ASSET]
    c.setdefault("assets", []).append({"asset_id": GRAPH_ASSET, "file_path": GRAPH_ASSET, "mime_type": "image/png",
        "width": grid_width, "height": grid_height, "alt_text": c_alt, "caption": None})
    q["notes"] = "The source graph is attached to part (b). Part (c) refers to axes opposite that are absent from the PDF; matching blank axes have been added, without the answer line."
    q["tags"] = [tag for tag in q.get("tags", []) if tag != "action_required"]
    for part in q["parts"]:
        part["tags"] = [tag for tag in part.get("tags", []) if tag != "action_required"]

    # The q17_1 crop was already packaged but never referenced; keep it and add
    # the newly drawn blank grid as a separate image asset.
    entries[index] = (entries[index][0], json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8"))
    entries.append((zipfile.ZipInfo(f"assets/{GRAPH_ASSET}.png"), grid_bytes))
    with tempfile.NamedTemporaryFile(dir=PATH.parent, suffix=".tmp", delete=False) as tmp:
        temp = pathlib.Path(tmp.name)
    try:
        with zipfile.ZipFile(temp, "w", compression=zipfile.ZIP_DEFLATED) as zout:
            for info, data in entries:
                zout.writestr(info, data)
        temp.replace(PATH)
    finally:
        temp.unlink(missing_ok=True)
    print("Repaired North Sydney Boys 2023 Q17 and attached its source graph and blank response axes")


if __name__ == "__main__":
    main()
