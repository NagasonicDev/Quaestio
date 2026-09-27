import json, re, sys, glob, os

TXT = r"D:\quaestio\tmp\txt"
for y in range(2019, 2026):
    p = rf"D:\quaestio\imports\{y}-hsc-physics.json"
    d = json.load(open(p, encoding="utf-8"))
    qs = d["questions"]
    tot = 0
    for q in qs:
        tot += q.get("marks", 0)
        for pt in q.get("parts") or []:
            tot += pt.get("marks", 0) if False else 0
    # parent marks include parts, so total = sum of top-level marks
    # verify part marks sum == parent marks
    bad = []
    for q in qs:
        parts = q.get("parts") or []
        if parts and sum(x["marks"] for x in parts) != q["marks"]:
            bad.append((q["source"].get("original_question_no"), q["marks"], sum(x["marks"] for x in parts)))
    # MCQ key from mg
    mg = open(rf"{TXT}\{y}-hsc-physics-mg.txt", encoding="utf-8", errors="replace").read()
    m = re.search(r"Multiple-?Choice Answer Key(.*?)Page 1 of", mg, re.S | re.I)
    key = {}
    if m:
        toks = [t.strip() for t in m.group(1).split("\n") if t.strip()]
        i = 0
        while i + 1 < len(toks):
            if toks[i].isdigit() and re.fullmatch(r"[A-D]", toks[i + 1]):
                key[int(toks[i])] = toks[i + 1]
                i += 2
            else:
                i += 1
    mism = []
    for q in qs:
        n = int(re.sub(r"\D", "", str(q["source"]["original_question_no"])) or 0)
        if q["type_key"] == "multiple_choice" and n in key:
            corr = [i for i, o in enumerate(q["mcq_options"]) if o.get("is_correct")]
            got = chr(ord("A") + corr[0]) if len(corr) == 1 else "?"
            if got != key[n]:
                mism.append((n, got, key[n]))
    nmcq = sum(1 for q in qs if q["type_key"] == "multiple_choice")
    nimg = sum(1 for q in qs if any(b["block_type"] in ("image", "diagram", "graph") for b in q["body"]))
    print(f"{y}: {len(qs)} q, {tot} marks, {nmcq} MCQ, key {len(key)} entries, {nimg} q with images"
          f" | marks-mismatch {bad if bad else 'none'} | key-mismatch {mism if mism else 'none'}")
