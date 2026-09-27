import json, sys, re

SCHEMA = r"D:\quaestio\.opencode\skills\physics-question-import\import-schema.json"
_j = json.load(open(SCHEMA, encoding="utf-8"))
BY_CODE = {n["code"]: n for n in _j["valid_node_ids"]}
BY_ID = {n["node_id"]: n for n in _j["valid_node_ids"]}

if sys.argv[1] == "codes":
    codes = sys.argv[2:]
    if not codes:
        for c, n in BY_CODE.items():
            print(f"{c}\t{n['node_id']}\t{n['path']}")
    for c in codes:
        n = BY_CODE.get(c)
        print(f"{c}\t{n['node_id'] if n else 'NOT FOUND'}\t{n['path'] if n else ''}")
elif sys.argv[1] == "search":
    q = sys.argv[2].lower()
    for c, n in BY_CODE.items():
        if q in n["path"].lower() or q in n["name"].lower():
            print(f"{c}\t{n['node_id']}\t{n['path']}")
elif sys.argv[1] == "validate":
    path = sys.argv[2]
    d = json.load(open(path, encoding="utf-8"))
    errs = []
    if d.get("schema_version") != 1:
        errs.append("schema_version != 1")
    if d.get("course_id") != _j["course_id"]:
        errs.append(f"course_id {d.get('course_id')} != {_j['course_id']}")
    if d.get("course_name") != _j["course_name"]:
        errs.append("course_name mismatch")
    qs = d.get("questions", [])
    if not qs:
        errs.append("no questions")
    tags_ok = set(_j["valid_tags"])
    types_ok = set(_j["valid_type_keys"])
    seen = set()
    for i, q in enumerate(qs):
        p = f"Q[{i}]"
        if q.get("type_key") not in types_ok:
            errs.append(f"{p} bad type_key {q.get('type_key')}")
        if not isinstance(q.get("difficulty"), int) or not 1 <= q["difficulty"] <= 4:
            errs.append(f"{p} bad difficulty {q.get('difficulty')}")
        if not isinstance(q.get("marks"), (int, float)) or q["marks"] <= 0:
            errs.append(f"{p} bad marks {q.get('marks')}")
        nids, ncs = q.get("node_ids") or [], q.get("node_codes") or []
        if len(nids) != len(ncs):
            errs.append(f"{p} node_ids/node_codes length mismatch")
        for nid, nc in zip(nids, ncs):
            if nid not in BY_ID:
                errs.append(f"{p} unknown node_id {nid}")
            elif BY_ID[nid]["code"] != nc:
                errs.append(f"{p} node_id {nid} code mismatch (is {BY_ID[nid]['code']}, got {nc})")
        for t in q.get("tags") or []:
            if t not in tags_ok:
                errs.append(f"{p} invalid tag {t}")
        if q.get("type_key") == "multiple_choice":
            opts = q.get("mcq_options")
            if not opts or len(opts) < 2:
                errs.append(f"{p} mcq without options")
            else:
                ncorr = sum(1 for o in opts if o.get("is_correct"))
                if ncorr > 1:
                    errs.append(f"{p} {ncorr} correct options")
        if not q.get("marking_criteria"):
            errs.append(f"{p} missing marking_criteria")
        else:
            for b in q["marking_criteria"]:
                if b.get("block_type") == "list":
                    for it in b["content"]["items"]:
                        if not re.search(r"mark", it, re.I):
                            errs.append(f"{p} criterion without allocation: {it[:60]}")
                else:
                    errs.append(f"{p} marking_criteria not a list block")
        if not q.get("body"):
            errs.append(f"{p} empty body")
        key = (q.get("source", {}).get("original_question_no"), q.get("source", {}).get("part_label"))
        if key in seen:
            errs.append(f"{p} duplicate source key {key}")
        seen.add(key)
        for part in q.get("parts") or []:
            if "part_label" not in part or "marks" not in part or "body" not in part:
                errs.append(f"{p} part missing required keys")
    nos = [q.get("source", {}).get("original_question_no") for q in qs]
    print(f"{path}: {len(qs)} questions")
    print("q nos:", ",".join(str(n) for n in nos))
    if errs:
        print(f"--- {len(errs)} ERRORS ---")
        for e in errs[:80]:
            print(" ", e)
    else:
        print("--- VALID ---")
