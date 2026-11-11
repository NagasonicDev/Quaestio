"""Give only the topics that shallow questions point at the dot-point children
the rebuilt template gained, then point those questions at the first dot point.
Every other node and question mapping stays exactly as shipped."""

import json
import os
import re
import sys
import zipfile
from collections import Counter, defaultdict

ROOT = r"D:\quaestio\frontend\public\templates\hsc"
DOT = re.compile(r"-D\d+$")
COURSES = [
    ("mathematics-standard", r"D:\quaestio\temp\new-math.qb"),
    ("modern-history-2017", r"D:\quaestio\temp\new-mh2017.qb"),
]


def path_of(n, by_id):
    parts, cur, seen = [], n, set()
    while cur and cur.get("node_id") not in seen:
        seen.add(cur.get("node_id"))
        parts.append(cur.get("name") or "")
        cur = by_id.get(cur.get("parent_node_id"))
    return " / ".join(reversed(parts))


def setup(data):
    course = data.get("course") or data
    flat = course.get("nodes") or []
    by_id = {n["node_id"]: n for n in flat}
    by_code = {n.get("code"): n for n in flat if n.get("code")}
    by_path = {path_of(n, by_id): n for n in flat}
    kids = defaultdict(list)
    for n in flat:
        if n.get("parent_node_id"):
            kids[n["parent_node_id"]].append(n)
    return course, flat, by_id, by_code, by_path, kids


def resolve(q, by_id, by_code, by_path):
    out = []
    for nid in q.get("node_ids") or []:
        n = by_id.get(nid)
        if n and n not in out:
            out.append(n)
    for c in q.get("node_codes") or []:
        n = by_code.get(c)
        if n and n not in out:
            out.append(n)
    for nm in q.get("node_names") or []:
        n = by_path.get(nm)
        if n and n not in out:
            out.append(n)
    return out


def descendants(n, kids):
    out = []
    for c in kids.get(n["node_id"], []):
        out.append(c)
        out.extend(descendants(c, kids))
    return out


def load(path):
    with zipfile.ZipFile(path) as z:
        infos = z.infolist()
        contents = {i.filename: z.read(i.filename) for i in infos}
    cj = [n for n in contents if n.endswith("course.json")][0]
    return json.loads(contents[cj].decode("utf-8")), infos, contents, cj


def target_of(q, by_id, by_code, by_path):
    nodes = resolve(q, by_id, by_code, by_path)
    if not nodes or any(DOT.search(n.get("code") or "") for n in nodes):
        return None
    non_d = [n for n in nodes if not DOT.search(n.get("code") or "")]
    non_d.sort(key=lambda n: (n.get("level_index") or 0, n.get("code") or ""))
    return non_d[-1] if non_d else None


def patch(rel, new_path, write):
    old_path = os.path.join(ROOT, rel, rel + ".qb")
    old_data, infos, contents, cj = load(old_path)
    new_data, _, _, _ = load(new_path)
    oc, flat, by_id, by_code, by_path, kids = setup(old_data)
    _, _, _, n_by_code, _, n_kids = setup(new_data)
    questions = old_data.get("questions") or oc.get("questions") or []
    targets = {n["code"]: n for n in (target_of(q, by_id, by_code, by_path) for q in questions) if n}
    next_id = max((int(n["node_id"].rsplit("-n", 1)[1]) for n in flat if "-n" in n["node_id"])) + 1
    added = Counter()
    for code, node in targets.items():
        if kids.get(node["node_id"]):
            continue
        source = n_by_code.get(code)
        if not source:
            continue
        new_children = [c for c in n_kids.get(source["node_id"], []) if DOT.search(c.get("code") or "")]
        for i, child in enumerate(new_children):
            flat.append({
                "node_id": f"{rel}-n{next_id}",
                "course_id": rel,
                "parent_node_id": node["node_id"],
                "level_index": (node.get("level_index") or 0) + 1,
                "name": child["name"],
                "code": child["code"],
                "description": None,
                "sort_order": i,
                "children": [],
            })
            next_id += 1
        added[code] = len(new_children)
    oc, flat, by_id, by_code, by_path, kids = setup(old_data)
    fixed = 0
    for q in questions:
        target = target_of(q, by_id, by_code, by_path)
        if not target:
            continue
        ds = sorted(
            (d for d in descendants(target, kids) if DOT.search(d.get("code") or "")),
            key=lambda d: d.get("code") or "",
        )
        if not ds:
            continue
        d = ds[0]
        q["node_codes"].append(d["code"])
        q["node_ids"].append(d["node_id"])
        q["node_names"].append(path_of(d, by_id))
        fixed += 1
    print(f"{rel}: added {sum(added.values())} dot points under {len(added)} topics, fixed {fixed} questions")
    for code, count in added.most_common():
        print(f"   {code} +{count}")
    if not write:
        return
    contents[cj] = json.dumps(old_data, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    with zipfile.ZipFile(old_path, "w") as z:
        for i in infos:
            zi = zipfile.ZipInfo(i.filename, date_time=i.date_time)
            zi.compress_type = i.compress_type
            zi.external_attr = i.external_attr
            zi.create_system = i.create_system
            z.writestr(zi, contents[i.filename])


if __name__ == "__main__":
    write = "--write" in sys.argv
    for rel, new_path in COURSES:
        patch(rel, new_path, write)
