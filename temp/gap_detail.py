import json
import os
import re
import zipfile
from collections import Counter, defaultdict

ROOT = r"D:\quaestio\frontend\public\templates\hsc"
DOT = re.compile(r"-D\d+$")


def load(path):
    with zipfile.ZipFile(path) as z:
        cj = [n for n in z.namelist() if n.endswith("course.json")][0]
        return json.loads(z.read(cj).decode("utf-8"))


def path_of(n, by_id):
    parts = []
    cur = n
    seen = set()
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


def descendants(n, kids):
    out = []
    for c in kids.get(n["node_id"], []):
        out.append(c)
        out.extend(descendants(c, kids))
    return out


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


for qb in sorted(os.listdir(ROOT)):
    p = os.path.join(ROOT, qb, qb + ".qb")
    if not os.path.exists(p):
        continue
    data = load(p)
    course, flat, by_id, by_code, by_path, kids = setup(data)
    questions = data.get("questions") or course.get("questions") or []
    gaps = Counter()
    unres = Counter()
    for q in questions:
        nodes = resolve(q, by_id, by_code, by_path)
        if not nodes:
            unres[tuple(q.get("node_codes") or ["(none)"])] += 1
            continue
        if any(DOT.search(n.get("code") or "") for n in nodes):
            continue
        non_d = [n for n in nodes if not DOT.search(n.get("code") or "")]
        non_d.sort(key=lambda n: (n.get("level_index") or 0, n.get("code") or ""))
        target = non_d[-1] if non_d else None
        ds = [d for d in descendants(target, kids) if DOT.search(d.get("code") or "")] if target else []
        if not ds:
            gaps[target.get("code") if target else "?"] += 1
    if gaps or unres:
        print(f"\n## {qb}  gap={sum(gaps.values())} unres={sum(unres.values())}")
        for k, v in gaps.most_common():
            print(f"   GAP {k} x{v}")
        for k, v in unres.most_common(5):
            print(f"   UNRES {k} x{v}")
