import json, os, re, sys, zipfile
from collections import Counter, defaultdict

ROOT = r"D:\quaestio\frontend\public\templates\hsc"
DOT = re.compile(r"-D\d+$")
DRY = "--apply" not in sys.argv


def norm(s):
    s = (s or "").lower().strip()
    s = re.sub(r"^the\s+", "", s)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return " ".join(s.split())


def path_of(n, by_id):
    parts, cur, seen = [], n, set()
    while cur and cur.get("node_id") not in seen:
        seen.add(cur.get("node_id"))
        parts.append(cur.get("name") or "")
        cur = by_id.get(cur.get("parent_node_id"))
    return " / ".join(reversed(parts))


def setup(data):
    course = data.get("course") or data
    flat = course.get("nodes") or []
    by_id = {n["node_id"]: n for n in flat}
    by_code = {n.get("code"): n for n in flat if n.get("code")}
    by_path = {path_of(n, by_id): n for n in flat}
    kids = defaultdict(list)
    for n in flat:
        if n.get("parent_node_id"):
            kids[n["parent_node_id"]].append(n)
    by_name = defaultdict(list)
    for n in flat:
        by_name[norm(n.get("name"))].append(n)
    return course, flat, by_id, by_code, by_path, kids, by_name


def descendants(n, kids):
    out = []
    for c in kids.get(n["node_id"], []):
        out.append(c)
        out.extend(descendants(c, kids))
    return out


def resolve(q, by_id, by_code, by_path):
    out = []
    for nid in q.get("node_ids") or []:
        n = by_id.get(nid)
        if n and n not in out:
            out.append(n)
    for c in q.get("node_codes") or []:
        n = by_code.get(c)
        if n and n not in out:
            out.append(n)
    for nm in q.get("node_names") or []:
        n = by_path.get(nm)
        if n and n not in out:
            out.append(n)
    return out


def is_d(n):
    return bool(DOT.search(n.get("code") or ""))


def pick_dot(parts, by_name, by_id, kids):
    """Resolve a legacy Module / Topic / Dot-point path to a current -D node."""
    if not parts:
        return None
    mod, topic, point = norm(parts[0]), norm(parts[-2]) if len(parts) >= 2 else "", norm(parts[-1])

    def anc_match(n, want_mod):
        cur = by_id.get(n.get("parent_node_id"))
        while cur:
            if norm(cur.get("name")) == want_mod:
                return True
            cur = by_id.get(cur.get("parent_node_id"))
        return False

    # 1. exact dot-point name, prefer matching module/topic ancestors
    cands = [n for n in by_name.get(point, []) if is_d(n)]
    if cands:
        cands.sort(key=lambda n: (
            -(1 if topic and norm(by_id.get(n.get("parent_node_id"), {}).get("name")) == topic else 0),
            -(1 if mod and anc_match(n, mod) else 0),
            n.get("code") or "",
        ))
        return cands[0], "exact_dot"
    # 2. exact topic name -> first -D descendant
    if topic:
        topics = by_name.get(topic, [])
        topics.sort(key=lambda n: (-(1 if mod and anc_match(n, mod) else 0), n.get("code") or ""))
        for t in topics:
            ds = sorted([d for d in descendants(t, kids) if is_d(d)], key=lambda x: x.get("code") or "")
            if ds:
                return ds[0], "topic_d"
    # 3. exact module name -> first -D descendant
    for n in by_name.get(mod, []):
        ds = sorted([d for d in descendants(n, kids) if is_d(d)], key=lambda x: x.get("code") or "")
        if ds:
            return ds[0], "module_d"
    return None, "none"


def fix(rel):
    path = os.path.join(ROOT, rel, rel + ".qb")
    with zipfile.ZipFile(path) as z:
        infos = z.infolist()
        contents = {i.filename: z.read(i.filename) for i in infos}
    cj = [n for n in contents if n.endswith("course.json")][0]
    data = json.loads(contents[cj].decode("utf-8"))
    course, flat, by_id, by_code, by_path, kids, by_name = setup(data)
    questions = data.get("questions") or course.get("questions") or []
    fixed, detail = 0, Counter()
    for q in questions:
        nodes = resolve(q, by_id, by_code, by_path)
        if any(is_d(n) for n in nodes):
            continue
        target = None
        if nodes:
            non_d = sorted(
                [n for n in nodes if not is_d(n)],
                key=lambda n: (n.get("level_index") or 0, n.get("code") or ""),
            )
            if non_d:
                ds = sorted([d for d in descendants(non_d[-1], kids) if is_d(d)], key=lambda x: x.get("code") or "")
                if ds:
                    target, kind = ds[0], "descendant"
        if target is None:
            for p in q.get("node_names") or []:
                parts = [x.strip() for x in p.split(" / ")]
                t, kind = pick_dot(parts, by_name, by_id, kids)
                if t:
                    target = t
                    break
            if target is None:
                kind = "none"
        if target is None:
            detail[("none", "?")] += 1
            continue
        code = target.get("code")
        for key in ("node_codes", "node_ids", "node_names"):
            if q.get(key) is None:
                q[key] = []
        if code in q["node_codes"]:
            continue
        q["node_codes"].append(code)
        q["node_ids"].append(target["node_id"])
        q["node_names"].append(path_of(target, by_id))
        fixed += 1
        detail[(kind, code)] += 1
    if fixed and not DRY:
        contents[cj] = json.dumps(data, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        with zipfile.ZipFile(path, "w") as z:
            for i in infos:
                zi = zipfile.ZipInfo(i.filename, date_time=i.date_time)
                zi.compress_type = i.compress_type
                zi.external_attr = i.external_attr
                zi.create_system = i.create_system
                z.writestr(zi, contents[i.filename])
    return fixed, detail


for rel in sys.argv[1:] or ["physics"]:
    n, detail = fix(rel)
    print(f"{rel}: {'would fix' if DRY else 'fixed'} {n}")
    for k, v in detail.most_common(30):
        print(f"   {k[0]:11} {k[1]}  x{v}")
