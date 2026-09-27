"""Remove stale figure follow-ups where the source asks students to draw."""
import json
import pathlib
import tempfile
import zipfile
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]

# Each tuple is bundle stem, printed question number, optional part label.
RESOLVED = {
    ("2019-hsc", "7", None),
    ("2021-hsc", "25", None), ("2021-hsc", "27", "a"), ("2021-hsc", "27", None),
    ("normanhurst-boys-2020", "23", None),
    ("north-sydney-boys-2019", "23", None),
    ("north-sydney-boys-2020", "28", "c"), ("north-sydney-boys-2020", "29", "b"),
    ("north-sydney-boys-2021", "19", None), ("north-sydney-boys-2022", "4", None),
    ("north-sydney-boys-2023", "17", "c"),
    ("north-sydney-girls-2020", "29", "a"), ("north-sydney-girls-2020", "30", "a"),
    ("north-sydney-girls-2020", "10", None),
    ("north-sydney-girls-2021", "27", "a"),
    ("sydney-girls-2020", "6", None), ("penrith-2019", "9", None),
    ("pymble-2022", "28", "a"), ("shore-2020", "14", None), ("shore-2020", "25", "b"),
    ("sydney-boys-2011", "32", "a"), ("sydney-grammar-2014", "30", "b"),
    ("sydney-tech-2013", "37", "a"), ("sydney-tech-2013", "38", "b"),
    ("sydney-tech-2016", "26", "a"), ("sydney-tech-2016", "27", "b"),
    ("sydney-tech-2016", "29", None), ("sydney-tech-2016", "34", None),
    ("sydney-tech-2016", "36", "c(ii)"), ("penrith-2019", "30", None),
    ("2024-hsc", "29", "a"), ("2024-hsc", "29", None),
}


def key(value):
    return "".join(c for c in str(value or "").lower() if c.isalnum())


def all_parts(q):
    for part in q.get("parts") or []:
        yield part
        yield from all_parts(part)


def find_part(q, wanted):
    def walk(parent, prefix=""):
        for part in parent.get("parts") or []:
            label = key(part.get("part_label"))
            full = prefix + label
            if full == key(wanted) or label == key(wanted):
                return part
            found = walk(part, full)
            if found is not None:
                return found
        return None
    return walk(q)


def main():
    changed = []
    for stem, qno, label in sorted(RESOLVED, key=lambda item: (item[0], item[1], item[2] or "")):
        path = ROOT / "imports" / f"{stem}-physics.qbx"
        if not path.exists():
            continue
        with zipfile.ZipFile(path, "r") as zin:
            entries = [(info, zin.read(info.filename)) for info in zin.infolist()]
        index = next(i for i, (info, _) in enumerate(entries) if info.filename == "questions.json")
        payload = json.loads(entries[index][1].decode("utf-8"))
        q = next((q for q in payload["questions"] if str(q.get("source", {}).get("original_question_no")) == qno), None)
        if q is None:
            continue
        target = q
        if label is not None:
            target = find_part(q, label) or q
        target["tags"] = [tag for tag in target.get("tags", []) if tag != "action_required"]
        target["notes"] = None
        # Builder attached gap tags/notes at question level. Clear those too
        # when all of this question's remaining parts are now resolved.
        unresolved = any("action_required" in (p.get("tags") or []) for p in all_parts(q))
        if not unresolved:
            q["tags"] = [tag for tag in q.get("tags", []) if tag != "action_required"]
            if q is not target:
                q["notes"] = None
        entries[index] = (entries[index][0], json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8"))
        with tempfile.NamedTemporaryFile(dir=path.parent, suffix=".tmp", delete=False) as tmp:
            temp = pathlib.Path(tmp.name)
        try:
            with zipfile.ZipFile(temp, "w", compression=zipfile.ZIP_DEFLATED) as zout:
                for info, data in entries:
                    zout.writestr(info, data)
            temp.replace(path)
        finally:
            temp.unlink(missing_ok=True)
        changed.append(f"{path.name} Q{qno}" + (f"({label})" if label else ""))
    # The Shore 2019 figure does show a tightening spiral. The question says
    # the electron is slowing in air, which reduces its gyroradius.
    path = ROOT / "imports" / "shore-2019-physics.qbx"
    with zipfile.ZipFile(path, "r") as zin:
        entries = [(info, zin.read(info.filename)) for info in zin.infolist()]
    index = next(i for i, (info, _) in enumerate(entries) if info.filename == "questions.json")
    payload = json.loads(entries[index][1].decode("utf-8"))
    q = next(q for q in payload["questions"] if str(q.get("source", {}).get("original_question_no")) == "15")
    q["notes"] = "The printed figure shows a tightening spiral. The stem states that the electron is slowing in air; its decreasing momentum reduces its gyroradius in the uniform magnetic field. The alt text follows the printed figure."
    entries[index] = (entries[index][0], json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8"))
    with tempfile.NamedTemporaryFile(dir=path.parent, suffix=".tmp", delete=False) as tmp:
        temp = pathlib.Path(tmp.name)
    try:
        with zipfile.ZipFile(temp, "w", compression=zipfile.ZIP_DEFLATED) as zout:
            for info, data in entries:
                zout.writestr(info, data)
        temp.replace(path)
    finally:
        temp.unlink(missing_ok=True)
    print(f"Cleared {len(changed)} resolved drawing prompts")
    for item in changed:
        print(item)

    # The old build pass copied action_required onto many complete questions
    # and parts. Keep the tag only when its own note describes an unresolved
    # extraction, corruption, or follow-up issue.
    actionable = re.compile(r"missing|not present|could not|cannot be|corrupt|contaminated|must be (?:sourced|drawn|cropped|attached)|needs? (?:manual|review|to be)|requires? manual|is absent|only copy.*(?:contaminated|marked up)|unresolved|check against", re.I)
    for path in sorted((ROOT / "imports").glob("*.qbx")):
        with zipfile.ZipFile(path, "r") as zin:
            entries = [(info, zin.read(info.filename)) for info in zin.infolist()]
        index = next(i for i, (info, _) in enumerate(entries) if info.filename == "questions.json")
        payload = json.loads(entries[index][1].decode("utf-8"))
        touched = False
        def clean(q):
            nonlocal touched
            note = str(q.get("notes") or "")
            if "action_required" in (q.get("tags") or []) and not actionable.search(note):
                q["tags"] = [tag for tag in q["tags"] if tag != "action_required"]
                touched = True
            for part in q.get("parts") or []:
                clean(part)
        for q in payload.get("questions", []):
            clean(q)
        if not touched:
            continue
        entries[index] = (entries[index][0], json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8"))
        with tempfile.NamedTemporaryFile(dir=path.parent, suffix=".tmp", delete=False) as tmp:
            temp = pathlib.Path(tmp.name)
        try:
            with zipfile.ZipFile(temp, "w", compression=zipfile.ZIP_DEFLATED) as zout:
                for info, data in entries:
                    zout.writestr(info, data)
            temp.replace(path)
        finally:
            temp.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
