import json, zipfile, os, glob, re
from collections import Counter, defaultdict

ROOT = r"D:\quaestio\frontend\public\templates\hsc"
DOT = re.compile(r"-D\d+$")

def load(path):
    with zipfile.ZipFile(path) as z:
        cj = [n for n in z.namelist() if n.endswith("course.json")][0]
        return json.loads(z.read(cj).decode("utf-8"))

def main():
    print(f"{'file':55} {'qs':>6} {'shallow':>8} {'deep':>6} {'nocls':>6}")
    total_shallow = 0
    for qb in sorted(glob.glob(os.path.join(ROOT, "*", "*.qb"))):
        rel = os.path.relpath(qb, ROOT).replace("\\", "/")
        data = load(qb)
        course = data.get("course") or data
        flat = course.get("nodes") or []
        by_id = {n["node_id"]: n for n in flat}
        by_code = {n.get("code"): n for n in flat if n.get("code")}
        kids = defaultdict(list)
        for n in flat:
            if n.get("parent_node_id"):
                kids[n["parent_node_id"]].append(n)
        def descendants(n, out=None):
            if out is None: out = []
            for c in kids.get(n["node_id"], []):
                out.append(c); descendants(c, out)
            return out
        def first_d(code):
            n = by_code.get(code)
            if not n: return None
            ds = [d for d in descendants(n) if DOT.search(d.get("code") or "")]
            ds.sort(key=lambda x: x.get("code") or "")
            return ds[0] if ds else None
        questions = data.get("questions") or course.get("questions") or []
        stats = Counter()
        shallow_detail = Counter()
        def codes_of(q):
            cs = list(q.get("node_codes") or [])
            for nid in q.get("node_ids") or []:
                n = by_id.get(nid)
                if n and n.get("code") and n["code"] not in cs:
                    cs.append(n["code"])
            return cs
        def scan(qs):
            for q in qs:
                cs = codes_of(q)
                if not cs:
                    stats["nocls"] += 1
                elif any(DOT.search(c or "") for c in cs):
                    stats["deep"] += 1
                else:
                    stats["shallow"] += 1
                    shallow_detail[tuple(cs)] += 1
                scan(q.get("parts") or [])
        scan(questions)
        total_shallow += stats["shallow"]
        print(f"{rel:55} {sum(stats.values()):>6} {stats['shallow']:>8} {stats['deep']:>6} {stats['nocls']:>6}")
    print("TOTAL shallow:", total_shallow)

main()
