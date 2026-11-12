import json
import sys
import zipfile


def load(path):
    with zipfile.ZipFile(path) as z:
        name = "course.json" if "course.json" in z.namelist() else "questions.json"
        return json.loads(z.read(name))


def texts(blocks):
    out = []
    for b in blocks or []:
        c = b.get("content") or {}
        out.append(f"{b.get('block_type')}:{c.get('text') or c.get('latex') or c.get('asset_path') or json.dumps(c, ensure_ascii=False)[:80]}")
    return " || ".join(out)


def find(qs, qid):
    for q in qs:
        if q.get("question_id") == qid:
            return q
        for p in q.get("parts") or []:
            if p.get("question_id") == qid:
                return p
    return None


path = sys.argv[1]
qs = load(path).get("questions") or []
for qid in sys.argv[2:]:
    q = find(qs, qid)
    print("\n==", qid, "found" if q else "NOT FOUND")
    if not q:
        continue
    print("BODY:", texts(q.get("body")))
    for o in q.get("mcq_options") or []:
        print("OPT", o.get("position"), "C" if o.get("is_correct") else " ", texts(o.get("content")))
