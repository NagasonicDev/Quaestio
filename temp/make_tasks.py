"""Build one classification task per template, filtered to questions that need a dot point.

A question is included when none of its resolved nodes is a -D dot point and it
has usable text. Outputs temp/llm/<course>.task.json, or .partN.json when large.
"""

import json
import re
import zipfile
from pathlib import Path

ROOT = Path(r"D:\quaestio")
TEMPLATES = ROOT / "frontend" / "public" / "templates" / "hsc"
OUT = ROOT / "temp" / "llm"
DOT = re.compile(r"-D\d+$")
MAX_BYTES = 340_000
MAX_QUESTIONS = 160


def path_of(n, by_id):
    parts, cur, seen = [], n, set()
    while cur and cur.get("node_id") not in seen:
        seen.add(cur.get("node_id"))
        parts.append(cur.get("name") or "")
        cur = by_id.get(cur.get("parent_node_id"))
    return " / ".join(reversed(parts))


def text_of(value, out):
    if isinstance(value, dict):
        if value.get("block_type") == "text" and isinstance(value.get("content", {}).get("text"), str):
            out.append(value["content"]["text"])
        for k, v in value.items():
            if k in ("answer", "solution", "marking_criteria"):
                continue
            text_of(v, out)
    elif isinstance(value, list):
        for v in value:
            text_of(v, out)


def resolved(q, by_id, by_code, by_path):
    out = []
    for nid in q.get("node_ids") or []:
        n = by_id.get(nid)
        if n and n not in out:
            out.append(n)
    for code in q.get("node_codes") or []:
        n = by_code.get(code)
        if n and n not in out:
            out.append(n)
    for name in q.get("node_names") or []:
        n = by_path.get(name)
        if n and n not in out:
            out.append(n)
    return out


def main():
    OUT.mkdir(exist_ok=True)
    tasks = []
    for course_dir in sorted(p for p in TEMPLATES.iterdir() if p.is_dir()):
        cid = course_dir.name
        with zipfile.ZipFile(course_dir / f"{cid}.qb") as z:
            data = json.loads(z.read("course.json").decode("utf-8"))
        course = data["course"]
        nodes = course["nodes"]
        by_id = {n["node_id"]: n for n in nodes}
        by_code = {n["code"]: n for n in nodes if n.get("code")}
        by_path = {path_of(n, by_id): n for n in nodes}
        dots = [
            {"code": n["code"], "path": path_of(n, by_id)}
            for n in nodes
            if DOT.search(n.get("code") or "")
        ]
        todo = []
        skipped_deep = skipped_empty = 0
        for q in data.get("questions", []):
            current = resolved(q, by_id, by_code, by_path)
            if any(DOT.search(n.get("code") or "") for n in current):
                skipped_deep += 1
                continue
            parts = []
            text_of(q.get("body"), parts)
            text_of(q.get("parts"), parts)
            text_of(q.get("mcq_options"), parts)
            text = "\n".join(parts).strip()
            if len(text) < 20:
                skipped_empty += 1
                continue
            todo.append({
                "id": q.get("question_id"),
                "year": (q.get("source") or {}).get("year"),
                "number": (q.get("source") or {}).get("original_question_no"),
                "marks": q.get("marks"),
                "type": q.get("type_key"),
                "current_path": " | ".join(q.get("node_names") or []),
                "text": text,
            })
        if not todo:
            print(f"{cid}: nothing to classify (deep {skipped_deep}, empty {skipped_empty})")
            continue
        base = {
            "course_id": cid,
            "course_name": course.get("course_name") or course.get("name"),
            "instructions": "Choose exactly one dot-point code from `dots` for each question based on what it assesses. current_path is unreliable. Use null if the text is missing, placeholder, or insufficient. Never invent a code.",
            "dots": dots,
        }
        chunks = [todo]
        size = len(json.dumps({**base, "questions": todo}, ensure_ascii=False).encode("utf-8"))
        if size > MAX_BYTES or len(todo) > MAX_QUESTIONS:
            chunks = [todo[i:i + MAX_QUESTIONS] for i in range(0, len(todo), MAX_QUESTIONS)]
        for i, chunk in enumerate(chunks, 1):
            name = f"{cid}.task.json" if len(chunks) == 1 else f"{cid}.part{i}.json"
            payload = {**base, "questions": chunk}
            path = OUT / name
            path.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
            tasks.append((cid, name, len(chunk), path.stat().st_size, skipped_deep, skipped_empty))
    print(f"\n{len(tasks)} task files")
    for cid, name, count, size, deep, empty in tasks:
        print(f"{name:42} {count:4} q {size:8} B  deep={deep} empty={empty}")


if __name__ == "__main__":
    main()
