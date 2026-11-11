import json, zipfile, re

def norm(s):
    s = (s or "").lower().strip()
    s = re.sub(r"^the\s+", "", s)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return " ".join(s.split())

p = r"frontend/public/templates/hsc/physics/physics.qb"
with zipfile.ZipFile(p) as z:
    d = json.loads(z.read("course.json").decode("utf-8"))
nodes = d["course"]["nodes"]
by_name = {}
for n in nodes:
    by_name.setdefault(norm(n["name"]), []).append(n)
for q in d["questions"]:
    if q["question_id"] in ("qhsc2001_17", "qhsc2001_01", "qhsc2001_02"):
        print("QID", q["question_id"], q["node_codes"])
        for nm in q["node_names"]:
            parts = nm.split(" / ")
            print("  LEGACY:", repr(parts[-1]))
            print("  NORM:  ", repr(norm(parts[-1])))
            print("  MATCH: ", [(x["code"], x["name"][:60]) for x in by_name.get(norm(parts[-1]), [])])
        print()
