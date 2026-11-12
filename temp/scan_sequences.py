"""Find repeated block sequences (not just adjacent identical blocks) in bundles."""
import json
import sys
import zipfile
from pathlib import Path


def load(path):
    with zipfile.ZipFile(path) as z:
        name = "course.json" if "course.json" in z.namelist() else "questions.json"
        return json.loads(z.read(name))


def sig(b):
    return json.dumps([b.get("block_type"), b.get("content")], sort_keys=True, ensure_ascii=False)


def repeated_run(blocks):
    """Return (start, length) of the first repeated contiguous sequence."""
    sigs = [sig(b) for b in blocks]
    n = len(sigs)
    for size in range(1, n // 2 + 1):
        for i in range(0, n - 2 * size + 1):
            if sigs[i:i + size] == sigs[i + size:i + 2 * size]:
                return i, size
    return None


def walk(q, qid, path="", hits=None):
    if hits is None:
        hits = []
    body = q.get("body") or []
    run = repeated_run(body)
    if run:
        hits.append((qid, path or "top", "body", run, len(body)))
    opts = q.get("mcq_options") or []
    opt_sigs = [json.dumps([[b.get("block_type"), b.get("content")] for b in (o.get("content") or [])],
                           sort_keys=True, ensure_ascii=False) for o in opts]
    if len(opt_sigs) >= 2 and len(opt_sigs) % 2 == 0:
        half = len(opt_sigs) // 2
        if opt_sigs[:half] == opt_sigs[half:]:
            hits.append((qid, path or "top", "mcq-half", (0, half), len(opts)))
    seen = {}
    for i, s in enumerate(opt_sigs):
        if s in seen:
            hits.append((qid, path or "top", "mcq-dup", (seen[s], i), len(opts)))
            break
        seen[s] = i
    for p in q.get("parts") or []:
        walk(p, qid, (path + "/" if path else "") + str(p.get("part_label")), hits)
    return hits


def scan(path):
    data = load(path)
    qs = data.get("questions") or []
    ids = {}
    for q in qs:
        ids[q.get("question_id")] = ids.get(q.get("question_id"), 0) + 1
    dup_ids = {k: v for k, v in ids.items() if v > 1}
    hits = []
    for q in qs:
        hits += walk(q, q.get("question_id"))
    return len(qs), dup_ids, hits


def main(paths):
    grand = 0
    for arg in paths:
        p = Path(arg)
        files = sorted(p.rglob("*.qb")) + sorted(p.rglob("*.qbx")) if p.is_dir() else [p]
        for f in files:
            try:
                count, dup_ids, hits = scan(f)
            except Exception as exc:
                print(f"ERROR {f}: {exc}")
                continue
            if hits or dup_ids:
                print(f"\n{f}: {len(hits)} sequence hits / {count} questions")
                if dup_ids:
                    print("  duplicate question ids:", dict(list(dup_ids.items())[:10]))
                for h in hits[:20]:
                    print(" ", h)
                grand += len(hits)
    print(f"\nTOTAL sequence hits: {grand}")


if __name__ == "__main__":
    main(sys.argv[1:])
