import subprocess, zipfile, json, io, re
from pathlib import Path
from collections import Counter

BASE = "0a21011"


def load(raw):
    return json.loads(zipfile.ZipFile(io.BytesIO(raw)).read("course.json"))


def deepest(q):
    codes = q.get("node_codes") or []
    deep = [c for c in codes if re.search(r"-D\d+$", str(c))]
    return deep[-1] if deep else (codes[-1] if codes else None)


rows = []
for f in sorted(Path("frontend/public/templates/hsc").glob("*/*.qb")):
    cur = load(f.read_bytes())
    old = load(subprocess.run(["git", "show", f"{BASE}:{f.as_posix()}"], capture_output=True).stdout)
    for label, d in (("old", old), ("new", cur)):
        hsc = [q for q in d["questions"] if (deepest(q) or "").startswith("HSC")]
        c = Counter(deepest(q) for q in hsc)
        top, n = c.most_common(1)[0] if c else (None, 0)
        if label == "old":
            old_top, old_n, total = top, n, len(hsc)
        else:
            rows.append((f.parent.name, total, old_n, old_top, n, top, len(c)))

print(f"{'course':38} {'HSC':>4} {'oldmax':>6} {'newmax':>6} {'dots':>4}  oldtop -> newtop")
for name, total, on, ot, nn, nt, nd in sorted(rows, key=lambda r: -r[4]):
    flag = " <<<" if total and nn / total > 0.5 else ""
    print(f"{name:38} {total:4} {on:6} {nn:6} {nd:4}  {ot} -> {nt}{flag}")
