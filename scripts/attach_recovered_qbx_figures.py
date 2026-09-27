"""Recover figures visible in source PDFs but missed by the figure extractor."""
from __future__ import annotations

import json
import pathlib
import tempfile
import zipfile

import pymupdf

ROOT = pathlib.Path(__file__).resolve().parents[1]
ASSETS = [
    # qbx, source PDF, printed page, crop rectangle in PDF points, question,
    # part label (None for the shared question stem), asset id, alt text
    ("2023-hsc-physics.qbx", "2023-hsc-physics.pdf", 10, (140, 140, 452, 320), "16", None, "q16_recovered", "Printed diagram of two parallel aluminium rods X and Y, connected by wires, with rod X resting on a table and rod Y vertically above it."),
    ("2023-hsc-physics.qbx", "2023-hsc-physics.pdf", 10, (220, 520, 370, 640), "17", None, "q17_recovered", "Printed pendulum diagram showing a lightweight arm pivoted at O, with the mass at X and Z on dashed arcs and at Y directly below the pivot."),
    ("2023-hsc-physics.qbx", "2023-hsc-physics.pdf", 18, (25, 85, 475, 365), "21", None, "q21_recovered", "Printed Hertzsprung–Russell diagram with temperature and luminosity axes, labelled stellar regions, and stars A and B."),
    ("2025-hsc-physics.qbx", "2025-hsc-physics.pdf", 19, (115, 125, 495, 410), "25", "a", "q25a_grid", "Printed blank graph grid for stopping voltage against frequency, with labelled axes and scales."),
]
NORMAN_OPTION_ROWS = [
    ("A", (55, 493, 370, 521), "Option A row of the source table: velocity arrows at X, Y and Z are up, zero and down; acceleration arrows are down, zero and down."),
    ("B", (55, 518, 370, 547), "Option B row of the source table: velocity arrows at X, Y and Z are up-right, right and down-right; acceleration arrows are up, zero and down."),
    ("C", (55, 543, 370, 572), "Option C row of the source table: velocity arrows at X, Y and Z are up-right, right and down-right; acceleration arrows point down at X, Y and Z."),
    ("D", (55, 568, 370, 597), "Option D row of the source table: velocity arrows at X, Y and Z are up-right, right and down-right; acceleration arrows are up-right, zero and down-right."),
]


def find_question(payload, number):
    return next(q for q in payload["questions"] if str(q.get("source", {}).get("original_question_no")) == number)


def attach(path, docname, page_no, clip, qno, part_label, asset_id, alt):
    qbx = ROOT / "imports" / path
    pdf = ROOT / "exams" / "physics" / docname
    document = pymupdf.open(pdf)
    pix = document[page_no - 1].get_pixmap(matrix=pymupdf.Matrix(2.5, 2.5), clip=pymupdf.Rect(*clip), alpha=False)
    image_bytes = pix.tobytes("png")
    with zipfile.ZipFile(qbx, "r") as zin:
        entries = [(info, zin.read(info.filename)) for info in zin.infolist() if info.filename != f"assets/{asset_id}.png"]
    index = next(i for i, (info, _) in enumerate(entries) if info.filename == "questions.json")
    payload = json.loads(entries[index][1].decode("utf-8"))
    q = find_question(payload, qno)
    owner = q
    blocks = q.get("body", [])
    if part_label is not None:
        owner = next(p for p in q.get("parts", []) if p.get("part_label") == part_label)
        blocks = owner.get("body", [])
    blocks[:] = [b for b in blocks if (b.get("content") or {}).get("asset_path") != asset_id]
    owner["assets"] = [a for a in owner.get("assets", []) if a.get("asset_id") != asset_id]
    image_block = {"block_type": "image", "content": {"asset_path": asset_id, "alt_text": alt, "caption": None}}
    # Place after the shared/part stem and before the response area.
    insert_at = next((i for i, block in enumerate(blocks) if block.get("block_type") == "answer_area"), len(blocks))
    blocks.insert(insert_at, image_block)
    owner.setdefault("assets", []).append({"asset_id": asset_id, "file_path": asset_id, "mime_type": "image/png", "width": pix.width, "height": pix.height, "alt_text": alt, "caption": None})
    for container in [q] + q.get("parts", []):
        tags = container.get("tags") or []
        container["tags"] = [tag for tag in tags if tag != "action_required"]
    q["notes"] = f"The printed figure on page {page_no} is included in this bundle as {asset_id}."
    entries[index] = (entries[index][0], json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8"))
    entries.append((zipfile.ZipInfo(f"assets/{asset_id}.png"), image_bytes))
    with tempfile.NamedTemporaryFile(dir=qbx.parent, suffix=".tmp", delete=False) as tmp:
        temp = pathlib.Path(tmp.name)
    try:
        with zipfile.ZipFile(temp, "w", compression=zipfile.ZIP_DEFLATED) as zout:
            for info, data in entries:
                zout.writestr(info, data)
        temp.replace(qbx)
    finally:
        temp.unlink(missing_ok=True)


def attach_norman_option_rows():
    qbx = ROOT / "imports" / "normanhurst-boys-2020-physics.qbx"
    document = pymupdf.open(ROOT / "exams/physics/Normanhurst Boys 2020 Physics Trials & Solutions.pdf")
    with zipfile.ZipFile(qbx, "r") as zin:
        entries = [(info, zin.read(info.filename)) for info in zin.infolist() if not info.filename.startswith("assets/q01_option")]
    index = next(i for i, (info, _) in enumerate(entries) if info.filename == "questions.json")
    payload = json.loads(entries[index][1].decode("utf-8"))
    q = find_question(payload, "1")
    q["tags"] = [tag for tag in q.get("tags", []) if tag != "action_required"]
    q["notes"] = "The four option rows are cropped from the printed table on page 2 and included in the bundle."
    for label, clip, alt in NORMAN_OPTION_ROWS:
        asset_id = f"q01_option{label}"
        pix = document[1].get_pixmap(matrix=pymupdf.Matrix(2.5, 2.5), clip=pymupdf.Rect(*clip), alpha=False)
        option = next(o for o in q["mcq_options"] if o.get("label") == label)
        option["content"] = [b for b in option.get("content", []) if (b.get("content") or {}).get("asset_path") != asset_id]
        option["content"].append({"block_type": "image", "content": {"asset_path": asset_id, "alt_text": alt, "caption": None}})
        q.setdefault("assets", [])[:] = [a for a in q.get("assets", []) if a.get("asset_id") != asset_id]
        q["assets"].append({"asset_id": asset_id, "file_path": asset_id, "mime_type": "image/png", "width": pix.width, "height": pix.height, "alt_text": alt, "caption": None})
        entries.append((zipfile.ZipInfo(f"assets/{asset_id}.png"), pix.tobytes("png")))
    entries[index] = (entries[index][0], json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8"))
    with tempfile.NamedTemporaryFile(dir=qbx.parent, suffix=".tmp", delete=False) as tmp:
        temp = pathlib.Path(tmp.name)
    try:
        with zipfile.ZipFile(temp, "w", compression=zipfile.ZIP_DEFLATED) as zout:
            for info, data in entries:
                zout.writestr(info, data)
        temp.replace(qbx)
    finally:
        temp.unlink(missing_ok=True)


if __name__ == "__main__":
    for item in ASSETS:
        attach(*item)
    attach_norman_option_rows()
    print(f"Attached {len(ASSETS) + len(NORMAN_OPTION_ROWS)} figures recovered from source PDFs")
