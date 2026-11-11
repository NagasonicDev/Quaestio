"""Build full-classification tasks for courses whose existing labels collapse onto one dot."""
import json
import re
import zipfile
from pathlib import Path

ROOT = Path(r"D:\quaestio")
TEMPLATES = ROOT / "frontend" / "public" / "templates" / "hsc"
OUT = ROOT / "temp" / "llm"
DOT = re.compile(r"-D\d+$")
COURSES = [
    "dance", "economics-2011", "english-studies", "investigating-science",
    "music-1", "music-1-2010", "music-2", "music-2-2010",
]
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


for cid in COURSES:
    with zipfile.ZipFile(TEMPLATES / cid / f"{cid}.qb") as z:
        data = json.loads(z.read("course.json").decode("utf-8"))
    nodes = data["course"]["nodes"]
    by_id = {n["node_id"]: n for n in nodes}
    dots = [{"code": n["code"], "path": path_of(n, by_id)} for n in nodes if DOT.search(n.get("code") or "")]
    todo = []
    for q in data.get("questions", []):
        parts = []
        text_of(q.get("body"), parts)
        text_of(q.get("parts"), parts)
        text_of(q.get("mcq_options"), parts)
        text = "\n".join(parts).strip()
        if len(text) < 20:
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
    base = {
        "course_id": cid,
        "course_name": data["course"].get("course_name") or data["course"].get("name"),
        "instructions": "Choose exactly one dot-point code from `dots` for each question based on what it assesses. current_path is the current label and is known to be unreliable. Use null if the text is missing, placeholder, or no dot covers the core concept. Never invent a code.",
        "dots": dots,
    }
    chunks = [todo] if len(todo) <= MAX_QUESTIONS else [todo[i:i + MAX_QUESTIONS] for i in range(0, len(todo), MAX_QUESTIONS)]
    for i, chunk in enumerate(chunks, 1):
        name = f"recheck-{cid}.task.json" if len(chunks) == 1 else f"recheck-{cid}.part{i}.json"
        (OUT / name).write_text(json.dumps({**base, "questions": chunk}, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"{name}: {len(chunk)} q, {len(dots)} dots")
