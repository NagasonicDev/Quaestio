import json, zipfile

def load(path):
    with zipfile.ZipFile(path) as z:
        cj = [n for n in z.namelist() if n.endswith("course.json")][0]
        return json.loads(z.read(cj).decode("utf-8"))

for rel in ["biology-2017/biology-2017.qb", "modern-history/modern-history.qb", "physics/physics.qb"]:
    p = r"D:\quaestio\frontend\public\templates\hsc\\" + rel
    d = load(p)
    print("="*70)
    print(rel, "top keys:", list(d.keys()))
    course = d.get("course") or d
    print("course keys:", list(course.keys()) if isinstance(course, dict) else type(course))
    nodes = course.get("nodes") or []
    print("root nodes:", len(nodes))
    if nodes:
        n0 = nodes[0]
        print("node0 keys:", list(n0.keys()))
        print("node0:", json.dumps({k: v for k, v in n0.items() if k not in ("children","nodes")}, ensure_ascii=False)[:400])
        ch = n0.get("children") or n0.get("nodes") or []
        print("node0 children:", len(ch))
        if ch:
            print("child0 keys:", list(ch[0].keys()))
            print("child0:", json.dumps({k: v for k, v in ch[0].items() if k not in ("children","nodes")}, ensure_ascii=False)[:400])
    qs = d.get("questions") or course.get("questions") or []
    print("questions:", len(qs))
    if qs:
        q0 = qs[0]
        print("q0 keys:", list(q0.keys()))
        print("q0 node_codes:", q0.get("node_codes"))
        print("q0 node_ids:", q0.get("node_ids"))
        print("q0 node_names:", q0.get("node_names"))
