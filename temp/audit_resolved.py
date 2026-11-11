import json, zipfile, os, re
from collections import Counter, defaultdict

ROOT = r"D:\quaestio\frontend\public\templates\hsc"
DOT = re.compile(r"-D\d+$")

def load(path):
    with zipfile.ZipFile(path) as z:
        cj = [n for n in z.namelist() if n.endswith("course.json")][0]
        return json.loads(z.read(cj).decode("utf-8"))

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

def path_of(n, by_id):
    parts = []
    cur = n
    seen = set()
    while cur and cur.get("node_id") not in seen:
        seen.add(cur.get("node_id"))
        parts.append(cur.get("name") or "")
        cur = by_id.get(cur.get("parent_node_id"))
    return " / ".join(reversed(parts))

def descendants(n, kids, out=None):
    if out is None: out = []
    for c in kids.get(n["node_id"], []):
        out.append(c); descendants(c, kids, out)
    return out

def resolve(q, by_id, by_code, by_path):
    """Return list of resolved tree nodes from node_ids, node_codes, node_names."""
    out = []
    for nid in q.get("node_ids") or []:
        n = by_id.get(nid)
        if n and n not in out: out.append(n)
    for c in q.get("node_codes") or []:
        n = by_code.get(c)
        if n and n not in out: out.append(n)
    for nm in q.get("node_names") or []:
        n = by_path.get(nm)
        if n and n not in out: out.append(n)
    return out

def audit(rel):
    data = load(os.path.join(ROOT, rel, rel + ".qb"))
    course, flat, by_id, by_code, by_path, kids = setup(data)
    questions = data.get("questions") or course.get("questions") or []
    st = Counter()
    detail = Counter()
    for q in questions:
        nodes = resolve(q, by_id, by_code, by_path)
        if not nodes:
            st["unresolved"] += 1
            continue
        if any(DOT.search(n.get("code") or "") for n in nodes):
            st["deep"] += 1
            continue
        # find deepest non-D node
        nonD = [n for n in nodes if not DOT.search(n.get("code") or "")]
        nonD.sort(key=lambda n: (n.get("level_index") or 0, n.get("code") or ""))
        target = nonD[-1] if nonD else None
        ds = []
        if target:
            ds = [d for d in descendants(target, kids) if DOT.search(d.get("code") or "")]
            ds.sort(key=lambda x: x.get("code") or "")
        if ds:
            st["fixable"] += 1
            detail[("fix", target.get("code"), ds[0].get("code"))] += 1
        else:
            st["gap"] += 1
            detail[("gap", tuple(sorted(n.get("code") or "?" for n in nodes)))] += 1
    return st, detail

print(f"{'file':50} {'top':>5} {'deep':>6} {'fixable':>8} {'gap':>5} {'unres':>6}")
tot = Counter()
for qb in sorted(os.listdir(ROOT)):
    p = os.path.join(ROOT, qb, qb + ".qb")
    if not os.path.exists(p): continue
    st, detail = audit(qb)
    tot.update(st)
    if st["fixable"] or st["gap"] or st["unresolved"]:
        print(f"{qb:50} {sum(st.values()):>5} {st['deep']:>6} {st['fixable']:>8} {st['gap']:>5} {st['unresolved']:>6}")
print("TOTALS:", dict(tot))

print()
print("=== physics detail ===")
st, detail = audit("physics")
for k, v in list(detail.items())[:25]:
    print("  ", k, v)

print()
print("=== engineering detail ===")
st, detail = audit("engineering-studies")
for k, v in list(detail.items())[:15]:
    print("  ", k, v)
