import subprocess, zipfile, json, io, re, sys
from pathlib import Path

BASE = "0a21011"
files = subprocess.run(["git", "diff", "--name-only", BASE, "HEAD", "--", "frontend/public/templates/hsc"], capture_output=True, text=True).stdout.split()


def load(raw):
    d = json.loads(zipfile.ZipFile(io.BytesIO(raw)).read("course.json"))
    return d


def deepest(q):
    codes = q.get("node_codes") or []
    deep = [c for c in codes if re.search(r"-D\d+$", str(c))]
    return deep[-1] if deep else (codes[-1] if codes else None)


def first_d(nodes, parent):
    frontier = [n for n in nodes if n.get("code") == parent]
    seen = set()
    while frontier:
        n = frontier.pop(0)
        if n.get("code") in seen:
            continue
        seen.add(n.get("code"))
        if re.search(r"-D\d+$", n.get("code", "")):
            return n["code"]
        frontier.extend([c for c in nodes if c.get("parent_node_id") == n.get("node_id")])
    return None


total_changed = total_placeholder = 0
rows = []
for f in files:
    old_raw = subprocess.run(["git", "show", f"{BASE}:{f}"], capture_output=True).stdout
    old = load(old_raw)
    new = load(Path(f).read_bytes())
    oldq = {q["question_id"]: q for q in old["questions"] if q.get("question_id")}
    newq = {q["question_id"]: q for q in new["questions"] if q.get("question_id")}
    nodes = new["course"]["nodes"]
    changed = placeholder = 0
    for qid, nq in newq.items():
        oq = oldq.get(qid)
        if not oq:
            continue
        od, nd = deepest(oq), deepest(nq)
        if od == nd:
            continue
        changed += 1
        if od and first_d(nodes, od) == nd:
            placeholder += 1
    total_changed += changed
    total_placeholder += placeholder
    rows.append((f.split("/")[-2], changed, placeholder))

print(f"changed={total_changed} placeholder_first_d={total_placeholder}")
for name, changed, placeholder in sorted(rows, key=lambda r: -r[1]):
    if changed:
        print(f"{name:40} changed={changed:4} placeholder={placeholder:4}")
