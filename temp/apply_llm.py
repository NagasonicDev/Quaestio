"""Apply LLM dot-point classifications to a template bundle.

Only high/medium-confidence codes are applied. Low confidence and null leave
the existing classification untouched. Zip metadata and course tree preserved.
"""

import json
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(r"D:\quaestio")
TEMPLATES = ROOT / "frontend" / "public" / "templates" / "hsc"
LLM = ROOT / "temp" / "llm"
DOT = re.compile(r"-D\d+$")


def path_of(n, by_id):
    parts, cur, seen = [], n, set()
    while cur and cur.get("node_id") not in seen:
        seen.add(cur.get("node_id"))
        parts.append(cur.get("name") or "")
        cur = by_id.get(cur.get("parent_node_id"))
    return " / ".join(reversed(parts))


def load_mapping(cid, recheck=False):
    """Merge the course's output file(s); recheck output takes precedence."""
    mapping = {}
    for path in sorted(LLM.glob(f"{cid}.part*.out.json")):
        mapping.update(json.loads(path.read_text(encoding="utf-8-sig")))
    single = LLM / f"{cid}.out.json"
    if single.exists():
        mapping.update(json.loads(single.read_text(encoding="utf-8-sig")))
    if recheck:
        for path in sorted(LLM.glob(f"recheck-{cid}.part*.out.json")):
            mapping.update(json.loads(path.read_text(encoding="utf-8-sig")))
        rechecked = LLM / f"recheck-{cid}.out.json"
        if rechecked.exists():
            mapping.update(json.loads(rechecked.read_text(encoding="utf-8-sig")))
    return mapping


def apply(cid, write, demote=False):
    mapping = load_mapping(cid, recheck=demote)
    if not mapping:
        print(f"{cid}: no output file, skipped")
        return
    qb = TEMPLATES / cid / f"{cid}.qb"
    with zipfile.ZipFile(qb) as z:
        infos = z.infolist()
        contents = {i.filename: z.read(i.filename) for i in infos}
    cj = next(n for n in contents if n.endswith("course.json"))
    data = json.loads(contents[cj].decode("utf-8"))
    nodes = data["course"]["nodes"]
    by_id = {n["node_id"]: n for n in nodes}
    by_code = {n["code"]: n for n in nodes if n.get("code")}
    questions = data.get("questions", [])
    ids = {q.get("question_id") for q in questions}
    applied = skipped = invalid = demoted = 0
    missing = [qid for qid in ids if qid not in mapping]
    extra = [qid for qid in mapping if qid not in ids]

    def demote_to_topic(q):
        nonlocal demoted
        cur = next((by_id.get(nid) for nid in q.get("node_ids") or [] if by_id.get(nid)), None)
        if not cur or not DOT.search(cur.get("code") or ""):
            return False
        parent = by_id.get(cur.get("parent_node_id"))
        if not parent:
            return False
        q["node_ids"] = [parent["node_id"]]
        q["node_codes"] = [parent["code"]]
        q["node_names"] = [path_of(parent, by_id)]
        q["classification_confidence"] = "low"
        demoted += 1
        return True

    for q in questions:
        qid = q.get("question_id")
        if qid not in mapping:
            skipped += 1
            continue
        item = mapping.get(qid) or {}
        code = item.get("code")
        conf = (item.get("confidence") or "").lower()
        if not code:
            if not (demote and demote_to_topic(q)):
                skipped += 1
            continue
        if code not in by_code or not DOT.search(code):
            invalid += 1
            if demote:
                demote_to_topic(q)
            continue
        if conf not in ("high", "medium"):
            if not (demote and demote_to_topic(q)):
                skipped += 1
            continue
        node = by_code[code]
        q["node_ids"] = [node["node_id"]]
        q["node_codes"] = [code]
        q["node_names"] = [path_of(node, by_id)]
        q["classification_confidence"] = conf
        applied += 1
    print(f"{cid}: applied {applied}, skipped {skipped}, invalid {invalid}, missing {len(missing)}, extra {len(extra)}")
    if missing[:5]:
        print("   missing ids:", missing[:5])
    if extra[:5]:
        print("   extra ids:", extra[:5])
    if not write or not (applied or demoted):
        return
    contents[cj] = json.dumps(data, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    with zipfile.ZipFile(qb, "w") as z:
        for info in infos:
            zi = zipfile.ZipInfo(info.filename, date_time=info.date_time)
            zi.compress_type = info.compress_type
            zi.external_attr = info.external_attr
            zi.create_system = info.create_system
            z.writestr(zi, contents[info.filename])


if __name__ == "__main__":
    write = "--write" in sys.argv
    ids = [a for a in sys.argv[1:] if not a.startswith("--")]
    for cid in ids or ["biology"]:
        apply(cid, write, demote="--demote" in sys.argv)
