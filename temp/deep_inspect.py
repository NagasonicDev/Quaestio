import json, zipfile, os, glob
from collections import Counter, defaultdict

ROOT = r"D:\quaestio\frontend\public\templates\hsc"

def load(path):
    with zipfile.ZipFile(path) as z:
        cj = [n for n in z.namelist() if n.endswith("course.json")][0]
        return json.loads(z.read(cj).decode("utf-8"))

def build(flat):
    by_id = {n["node_id"]: n for n in flat}
    by_code = {n.get("code"): n for n in flat if n.get("code")}
    kids = defaultdict(list)
    for n in flat:
        p = n.get("parent_node_id")
        if p:
            kids[p].append(n)
    return by_id, by_code, kids

def descendants(n, kids, out=None):
    if out is None: out = []
    for c in kids.get(n["node_id"], []):
        out.append(c)
        descendants(c, kids, out)
    return out

def main():
    for qb in sorted(glob.glob(os.path.join(ROOT, "*", "*.qb"))):
        rel = os.path.relpath(qb, ROOT).replace("\\", "/")
        data = load(qb)
        course = data.get("course") or data
        flat = course.get("nodes") or []
        by_id, by_code, kids = build(flat)
        dot_level = max([n.get("level_index") for n in flat if "-D" in (n.get("code") or "")] or [None])
        def first_d(code):
            n = by_code.get(code)
            if not n: return None
            ds = [d for d in descendants(n, kids) if d.get("level_index") == dot_level and "-D" in (d.get("code") or "")]
            ds.sort(key=lambda x: x.get("code") or "")
            return ds[0] if ds else None
        questions = data.get("questions") or course.get("questions") or []
        shallow_codes = Counter()
        stats = {"fixable": 0, "unfixable": 0, "nocodes": 0}
        def scan(qs):
            for q in qs:
                codes = q.get("node_codes") or []
                lv = [by_code.get(c, {}).get("level_index") for c in codes]
                if not codes:
                    stats["nocodes"] += 1
                elif not any(l is not None and l >= dot_level for l in lv):
                    shallow_codes[tuple(codes)] += 1
                    if any(first_d(c) for c in codes):
                        stats["fixable"] += 1
                    else:
                        stats["unfixable"] += 1
                scan(q.get("parts") or [])
        scan(questions)
        if shallow_codes:
            print(f"\n=== {rel}  dotL={dot_level} fixable={stats['fixable']} unfixable={stats['unfixable']} nocodes={stats['nocodes']}")
            for codes, cnt in shallow_codes.most_common(8):
                info = []
                for c in codes:
                    d = first_d(c)
                    info.append(f"{c}->{(d or {}).get('code','NONE')}")
                print(f"   {cnt:>4}  {codes}   [{' | '.join(info)}]")

main()
