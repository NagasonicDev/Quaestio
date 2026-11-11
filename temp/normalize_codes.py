"""Normalize stale node_codes to the code of the resolved tree node.

Each classification entry is resolved by code, then id, then full path.
Only canonical trios are kept; arrays are left untouched when nothing resolves.
"""
import json
import sys
import zipfile
from pathlib import Path

ROOT = Path(r"D:\quaestio")
TEMPLATES = ROOT / "frontend" / "public" / "templates" / "hsc"


def path_of(node, by_id):
    parts, cur, seen = [], node, set()
    while cur and cur.get("node_id") not in seen:
        seen.add(cur.get("node_id"))
        parts.append(cur.get("name") or "")
        cur = by_id.get(cur.get("parent_node_id"))
    return " / ".join(reversed(parts))


def normalize(data):
    nodes = data["course"]["nodes"]
    by_id = {n["node_id"]: n for n in nodes}
    by_code = {n["code"]: n for n in nodes if n.get("code")}
    by_path = {path_of(n, by_id): n for n in nodes}
    changed = entries = 0

    def walk(q, inherited=None):
        nonlocal changed, entries
        ids = q.get("node_ids") or []
        codes = q.get("node_codes") or []
        names = q.get("node_names") or []
        count = max(len(ids), len(codes), len(names))
        trio = []
        for i in range(count):
            node = None
            if i < len(codes):
                node = by_code.get(codes[i])
            if node is None and i < len(ids):
                node = by_id.get(ids[i])
            if node is None and i < len(names):
                node = by_path.get(names[i])
            if node is not None:
                trio.append((node["node_id"], node["code"], path_of(node, by_id)))
        # A subpart with a stale-only code inherits its parent's resolved dot.
        if not trio and inherited and (ids or codes or names):
            trio = inherited
        if trio:
            q["node_ids"] = [t[0] for t in trio]
            q["node_codes"] = [t[1] for t in trio]
            q["node_names"] = [t[2] for t in trio]
            entries += len(trio)
            if trio != list(zip(ids, codes, names)):
                changed += 1
        for part in q.get("parts") or []:
            walk(part, trio or inherited)

    for q in data["questions"]:
        walk(q)
    return changed, entries


def run(cid, write):
    qb = TEMPLATES / cid / f"{cid}.qb"
    with zipfile.ZipFile(qb) as z:
        infos = z.infolist()
        contents = {i.filename: z.read(i.filename) for i in infos}
    cj = next(n for n in contents if n.endswith("course.json"))
    data = json.loads(contents[cj].decode("utf-8"))
    changed, entries = normalize(data)
    print(f"{cid}: changed {changed} questions, kept {entries} entries")
    if not write or not changed:
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
    for d in sorted(TEMPLATES.iterdir()):
        if d.is_dir() and (d / f"{d.name}.qb").exists():
            run(d.name, write)
