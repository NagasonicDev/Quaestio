"""Dump one template's dot points and question text for content classification."""

import json
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(r"D:\quaestio\frontend\public\templates\hsc")
OUT = Path(r"D:\quaestio\temp\llm")
DOT = re.compile(r"-D\d+$")


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


def main():
    cid = sys.argv[1]
    with zipfile.ZipFile(ROOT / cid / f"{cid}.qb") as z:
        data = json.loads(z.read("course.json").decode("utf-8"))
    course = data["course"]
    nodes = course["nodes"]
    by_id = {n["node_id"]: n for n in nodes}
    dots = [
        {"code": n["code"], "path": path_of(n, by_id), "text": n.get("name") or ""}
        for n in nodes
        if DOT.search(n.get("code") or "")
    ]
    questions = []
    for q in data.get("questions", []):
        parts = []
        text_of(q.get("body"), parts)
        text_of(q.get("parts"), parts)
        text_of(q.get("mcq_options"), parts)
        questions.append({
            "id": q.get("question_id"),
            "year": (q.get("source") or {}).get("year"),
            "number": (q.get("source") or {}).get("original_question_no"),
            "marks": q.get("marks"),
            "type": q.get("type_key"),
            "current_path": " | ".join(q.get("node_names") or []),
            "text": "\n".join(parts).strip(),
        })
    OUT.mkdir(exist_ok=True)
    payload = {
        "course_id": cid,
        "course_name": course.get("course_name") or course.get("name"),
        "instructions": "Classify each question to exactly one dot-point code from `dots` based on what the question assesses. current_path is unreliable. Use null when the text is missing or does not support a dot point. Never invent a code.",
        "dots": dots,
        "questions": questions,
    }
    path = OUT / f"{cid}.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{cid}: {len(dots)} dots, {len(questions)} questions, {path.stat().st_size} bytes -> {path}")


if __name__ == "__main__":
    main()
