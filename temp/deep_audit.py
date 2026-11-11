import json, zipfile, os, sys, glob

ROOT = r"D:\quaestio\frontend\public\templates\hsc"

def load(path):
    with zipfile.ZipFile(path) as z:
        names = z.namelist()
        cj = [n for n in names if n.endswith("course.json")]
        if not cj:
            return None, names, None
        raw = z.read(cj[0])
        return json.loads(raw.decode("utf-8")), names, cj[0]

def walk_nodes(nodes, parent=None, out=None):
    if out is None:
        out = []
    for n in nodes:
        out.append(n)
        ch = n.get("children") or n.get("nodes") or []
        walk_nodes(ch, n, out)
    return out

def main():
    rows = []
    for qb in sorted(glob.glob(os.path.join(ROOT, "*", "*.qb"))):
        rel = os.path.relpath(qb, ROOT).replace("\\", "/")
        try:
            data, names, cjname = load(qb)
        except Exception as e:
            rows.append((rel, "ERR", str(e)[:60], 0, 0, 0, 0, 0))
            continue
        if data is None:
            rows.append((rel, "NOCOURSE", "", 0, 0, 0, 0, 0))
            continue
        course = data.get("course") or data
        nodes = course.get("nodes") or []
        flat = walk_nodes(nodes)
        # find dot level
        dot_levels = set()
        for n in flat:
            code = n.get("code") or ""
            if "-D" in code:
                dot_levels.add(n.get("level_index"))
        dot_level = max(dot_levels) if dot_levels else None
        by_code = {n.get("code"): n for n in flat if n.get("code")}
        questions = data.get("questions") or course.get("questions") or []
        def scan(qs, shallow, deep, none, nod, total):
            for q in qs:
                total += 1
                codes = q.get("node_codes") or []
                if not codes:
                    none += 1
                else:
                    lv = [by_code.get(c, {}).get("level_index") for c in codes]
                    if dot_level is not None and any(l is not None and l >= dot_level for l in lv):
                        deep += 1
                    else:
                        shallow += 1
                scan(q.get("parts") or [], shallow, deep, none, nod, total)
            return shallow, deep, none, nod, total
        sh, dp, no, nd, tot = scan(questions, 0, 0, 0, 0, 0)
        rows.append((rel, "OK", "", len(flat), dot_level or -1, tot, sh, dp, no))
    print(f"{'file':55} {'nodes':>6} {'dotL':>5} {'qs':>6} {'shallow':>8} {'deep':>6} {'none':>5}")
    for r in rows:
        if r[1] == "OK":
            print(f"{r[0]:55} {r[3]:>6} {r[4]:>5} {r[5]:>6} {r[6]:>8} {r[7]:>6} {r[8]:>5}")
        else:
            print(f"{r[0]:55} {r[1]:>6} {r[2]}")

main()
