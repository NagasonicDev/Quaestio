import json, zipfile, sys, re
p = r"frontend/public/templates/hsc/physics/physics.qb"
with zipfile.ZipFile(p) as z:
    d = json.loads(z.read("course.json").decode("utf-8"))
nodes = d["course"]["nodes"]
by_id = {n["node_id"]: n for n in nodes}
by_code = {n["code"]: n for n in nodes}
codes = set(by_code)

n = 0
for q in d["questions"]:
    ncs = q.get("node_codes") or []
    if any(re.search(r"-D\d+$", c or "") for c in ncs):
        continue
    resolved = [c for c in ncs if c in codes]
    if resolved:
        continue
    n += 1
    if n > 25:
        break
    print("QID", q["question_id"])
    print("  codes", ncs)
    print("  names", (q.get("node_names") or [])[:3])
    print()
print("total unresolved sample", n)
