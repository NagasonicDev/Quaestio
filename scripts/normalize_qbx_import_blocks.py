"""Convert legacy bare-string answer blocks to the importer's content-block shape."""
import json
import pathlib
import tempfile
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
SLOTS = ("body", "answer", "solution", "marking_criteria")


def normalize_blocks(blocks):
    result = []
    for block in blocks or []:
        if block is None:
            continue
        if isinstance(block, str):
            if block.strip():
                result.append({"block_type": "text", "content": {"text": block}})
            continue
        if not isinstance(block, dict):
            continue
        if not isinstance(block.get("content"), dict):
            block["content"] = {}
        if block.get("block_type") in {"image", "diagram", "graph"} and not block["content"].get("asset_path"):
            description = block["content"].get("description") or block["content"].get("alt_text")
            if description:
                result.append({"block_type": "text", "content": {"text": str(description)}})
                continue
        result.append(block)
    return result


def normalize_question(question):
    for slot in SLOTS:
        if isinstance(question.get(slot), list):
            question[slot] = normalize_blocks(question[slot])
    for option in question.get("mcq_options") or []:
        if isinstance(option, dict):
            option["content"] = normalize_blocks(option.get("content"))
    for part in question.get("parts") or []:
        if isinstance(part, dict):
            normalize_question(part)


def main():
    changed = []
    for path in sorted((ROOT / "imports").glob("*.qbx")):
        with zipfile.ZipFile(path, "r") as zin:
            entries = [(info, zin.read(info.filename)) for info in zin.infolist()]
        index = next(i for i, (info, _) in enumerate(entries) if info.filename == "questions.json")
        payload = json.loads(entries[index][1].decode("utf-8"))
        before = entries[index][1]
        for question in payload.get("questions", []):
            if isinstance(question, dict):
                normalize_question(question)
        after = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        if after == before:
            continue
        entries[index] = (entries[index][0], after)
        with tempfile.NamedTemporaryFile(dir=path.parent, suffix=".tmp", delete=False) as tmp:
            temp = pathlib.Path(tmp.name)
        try:
            with zipfile.ZipFile(temp, "w", compression=zipfile.ZIP_DEFLATED) as zout:
                for info, data in entries:
                    zout.writestr(info, data)
            temp.replace(path)
        finally:
            temp.unlink(missing_ok=True)
        changed.append(path.name)
    print(f"Normalized import blocks in {len(changed)} bundle(s): {', '.join(changed)}")


if __name__ == "__main__":
    main()
