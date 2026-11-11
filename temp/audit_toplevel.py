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
    kids = defaultdict(list)
    for n in flat:
        if n.get("parent_node_id"):
            kids[n["parent_node_id"]].append(n)
    return course, flat, by_id, by_code, kids

def codes_of(q, by_id):
    cs = list(q.get("node_codes") or [])
    for nid in q.get("node_ids") or []:
        n = by_id.get(nid)
        if n and n.get("code") and n["code"] not in cs:
            cs.append(n["code"])
    return cs

print("=== TOP-LEVEL ONLY ===")
print(f"{'file':55} {'top':>5} {'shallow':>8} {'deep':>6} {'nocls':>6}")
tot = Counter()
for qb in sorted(os.listdir(ROOT)):
    p = os.path.join(ROOT, qb, qb + ".qb")
    if not os.path.exists(p): continue
    data = load(p)
    course, flat, by_id, by_code, kids = setup(data)
    questions = data.get("questions") or course.get("questions") or []
    st = Counter()
    for q in questions:
        cs = codes_of(q, by_id)
        if not cs: st["nocls"] += 1
        elif any(DOT.search(c or "") for c in cs): st["deep"] += 1
        else: st["shallow"] += 1
    tot.update(st)
    if st["shallow"] or st["nocls"]:
        print(f"{qb:55} {len(questions):>5} {st['shallow']:>8} {st['deep']:>6} {st['nocls']:>6}")
print("TOTALS:", dict(tot))

print()
print("=== PHYSICS TREE ===")
data = load(os.path.join(ROOT, "physics", "physics.qb"))
course, flat, by_id, by_code, kids = setup(data)
print("nodes:", len(flat))
bylevel = Counter(n.get("level_index") for n in flat)
print("by level:", dict(bylevel))
# sample codes per level
seen = {}
for n in flat:
    lv = n.get("level_index")
    if lv not in seen:
        seen[lv] = []
    if len(seen[lv]) < 5:
        seen[lv].append((n.get("code"), n.get("name"), n.get("node_id")))
for lv in sorted(seen):
    print(f"  L{lv}:")
    for c in seen[lv]: print("   ", c)
# find nodes whose code has -D
dnodes = [n for n in flat if DOT.search(n.get("code") or "")]
print("D nodes:", len(dnodes))
for n in dnodes[:10]:
    print("  D:", n.get("code"), "|", n.get("name"), "|", n.get("node_id"))
# top-level question codes distribution
questions = data.get("questions") or course.get("questions") or []
qc = Counter()
for q in questions:
    cs = codes_of(q, by_id)
    qc[tuple(cs)] += 1
print("top question code sets:", len(qc))
for k, v in list(qc.items())[:15]:
    print("  ", k, v)
