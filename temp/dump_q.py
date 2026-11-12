import json
import sys
import zipfile


def load(path):
    with zipfile.ZipFile(path) as z:
        name = "course.json" if "course.json" in z.namelist() else "questions.json"
        return json.loads(z.read(name))


def find(qs, qid):
    for q in qs:
        if q.get("question_id") == qid:
            return q
        for p in q.get("parts") or []:
            if p.get("question_id") == qid:
                return p
    return None


def show(q):
    print("id:", q.get("question_id"), "type:", q.get("type_key"), "marks:", q.get("marks"))
    print("body:")
    for b in q.get("body") or []:
        print(" ", b.get("position"), b.get("block_type"), json.dumps(b.get("content"), ensure_ascii=False)[:400])
    print("mcq:")
    for o in q.get("mcq_options") or []:
        print(" ", o.get("position"), "correct" if o.get("is_correct") else "", json.dumps(o.get("content"), ensure_ascii=False)[:400])
    print("answer:", json.dumps(q.get("answer"), ensure_ascii=False)[:300])
    print("solution:", json.dumps(q.get("solution"), ensure_ascii=False)[:300])
    print("criteria:", json.dumps(q.get("marking_criteria"), ensure_ascii=False)[:300])
    for p in q.get("parts") or []:
        print("PART", p.get("part_label"))
        show(p)


path, qid = sys.argv[1], sys.argv[2]
q = find(load(path).get("questions") or [], qid)
print("FOUND" if q else "NOT FOUND", path, qid)
if q:
    show(q)
