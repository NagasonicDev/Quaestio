import json, os, re, sys, zipfile
from collections import Counter, defaultdict
sys.path.insert(0, r"D:\quaestio\temp")
import audit_resolved as a

DOT = re.compile(r"-D\d+$")
ROOT = r"D:\quaestio\frontend\public\templates\hsc"
POINTS = json.load(open(r"D:\quaestio\temp\dotpoints.json", encoding="utf-8"))


def key(x):
    import unicodedata
    x = unicodedata.normalize("NFKD", x)
    x = "".join(c for c in x if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]", "", x.lower())


for rel in sorted(os.listdir(ROOT)):
    p = os.path.join(ROOT, rel, rel + ".qb")
    if not os.path.exists(p):
        continue
    data = a.load(p)
    course, flat, by_id, by_code, by_path, kids = a.setup(data)
    groups = POINTS.get(rel) or []
    module_groups = defaultdict(list)
    for g in groups:
        if key(g["topic"]) == key(g["module"]):
            module_groups[(g["year"], key(g["module"]))].append(g)
    covered = Counter()
    for q in data.get("questions") or course.get("questions") or []:
        nodes = a.resolve(q, by_id, by_code, by_path)
        if not nodes or any(DOT.search(n.get("code") or "") for n in nodes):
            continue
        non_d = sorted((n for n in nodes if not DOT.search(n.get("code") or "")),
                       key=lambda n: (n.get("level_index") or 0, n.get("code") or ""))
        if not non_d:
            continue
        t = non_d[-1]
        path_keys = {key(x) for x in a.path_of(t, by_id).split(" / ")}
        for (year, mkey), gs in module_groups.items():
            # Question year is inferred from the topic code prefix.
            if t.get("code", "").startswith("PRE") != (year == "PRE"):
                continue
            if mkey in path_keys:
                covered[(rel, t.get("code"), gs[0]["module"])] += 1
                break
    if covered:
        print(f"\n### {rel}: {sum(covered.values())} shallow questions coverable by module-level groups")
        for (_, code, module), count in covered.most_common(10):
            print(f"  {code} x{count} | {module}")
