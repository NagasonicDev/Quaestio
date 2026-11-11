import json, zipfile
from collections import Counter

def load(path):
    with zipfile.ZipFile(path) as z:
        cj = [n for n in z.namelist() if n.endswith("course.json")][0]
        return json.loads(z.read(cj).decode("utf-8"))

for rel in ["physics/physics.qb", "modern-history/modern-history.qb", "mathematics-standard/mathematics-standard.qb", "ancient-history/ancient-history.qb"]:
    p = r"D:\quaestio\frontend\public\templates\hsc\\" + rel
    d = load(p)
    course = d.get("course") or d
    flat = course.get("nodes") or []
    print("="*70)
    print(rel)
    print("sample node codes:", [n.get("code") for n in flat[:12]])
    print("level counts:", Counter(n.get("level_index") for n in flat))
    dnodes = [n for n in flat if "-D" in (n.get("code") or "")]
    print("D node levels:", Counter(n.get("level_index") for n in dnodes))
    print("sample D codes:", [n.get("code") for n in dnodes[:10]])
    qs = d.get("questions") or []
    print("q0 codes/ids/names:", qs[0].get("node_codes"), qs[0].get("node_ids"), [x[:60] for x in (qs[0].get("node_names") or [])])
    # count questions with empty ids
    empty_ids = sum(1 for q in qs if not q.get("node_ids"))
    empty_codes = sum(1 for q in qs if not q.get("node_codes"))
    print(f"top-level: empty_ids={empty_ids} empty_codes={empty_codes} total={len(qs)}")
    # parts
    parts = [p for q in qs for p in (q.get("parts") or [])]
    print(f"parts: total={len(parts)} empty_ids={sum(1 for p in parts if not p.get('node_ids'))} empty_codes={sum(1 for p in parts if not p.get('node_codes'))}")
    if parts:
        print("part0 codes/ids/names:", parts[0].get("node_codes"), parts[0].get("node_ids"), [x[:60] for x in (parts[0].get("node_names") or [])])
