import json
import os
import re
import zipfile
from collections import Counter, defaultdict

ROOT = r"D:\quaestio\frontend\public\templates\hsc"
DOT = re.compile(r"-D\d+$")


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
    by_path = {}
    for n in flat:
        by_path[path_of(n, by_id)] = n
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


def fix_file(rel):
    path = os.path.join(ROOT, rel, rel + ".qb")
    with zipfile.ZipFile(path) as z:
        infos = z.infolist()
        contents = {i.filename: z.read(i.filename) for i in infos}
    cj = [n for n in contents if n.endswith("course.json")][0]
    data = json.loads(contents[cj].decode("utf-8"))
    course, flat, by_id, by_code, by_path, kids = setup(data)
    questions = data.get("questions") or course.get("questions") or []
    fixed = 0
    detail = Counter()
    for q in questions:
        nodes = resolve(q, by_id, by_code, by_path)
        if not nodes:
            continue
        if any(DOT.search(n.get("code") or "") for n in nodes):
            continue
        non_d = [n for n in nodes if not DOT.search(n.get("code") or "")]
        non_d.sort(key=lambda n: (n.get("level_index") or 0, n.get("code") or ""))
        target = non_d[-1] if non_d else None
        if not target:
            continue
        ds = [d for d in descendants(target, kids) if DOT.search(d.get("code") or "")]
        ds.sort(key=lambda x: x.get("code") or "")
        if not ds:
            continue
        d = ds[0]
        code = d.get("code")
        for key in ("node_codes", "node_ids", "node_names"):
            if q.get(key) is None:
                q[key] = []
        if code in q["node_codes"]:
            continue
        q["node_codes"].append(code)
        q["node_ids"].append(d["node_id"])
        q["node_names"].append(path_of(d, by_id))
        fixed += 1
        detail[(target.get("code"), code)] += 1
    if not fixed:
        return 0, detail
    contents[cj] = json.dumps(data, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    with zipfile.ZipFile(path, "w") as z:
        for i in infos:
            zi = zipfile.ZipInfo(i.filename, date_time=i.date_time)
            zi.compress_type = i.compress_type
            zi.external_attr = i.external_attr
            zi.create_system = i.create_system
            z.writestr(zi, contents[i.filename])
    return fixed, detail


if __name__ == "__main__":
    total = 0
    for qb in sorted(os.listdir(ROOT)):
        p = os.path.join(ROOT, qb, qb + ".qb")
        if not os.path.exists(p):
            continue
        n, detail = fix_file(qb)
        if n:
            total += n
            print(f"{qb}: fixed {n}")
            for k, v in detail.most_common(8):
                print(f"   {k[0]} -> {k[1]}  x{v}")
    print(f"TOTAL fixed: {total}")
