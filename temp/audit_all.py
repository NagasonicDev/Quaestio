import subprocess, zipfile, json, io, re
from pathlib import Path
from collections import Counter, defaultdict

BASE = "0a21011"
ROOT = Path("frontend/public/templates/hsc")
DOT = re.compile(r"-D\d+$")
WORD = re.compile(r"[A-Za-z][A-Za-z'\-]{3,}")
STOP = set("""this that with from have been were which what when where their there these those than then they them
into about after before during between under over such only also more most some each other both same very does
question answer options option following figure diagram shows show which best correct statement statements""".split())


def load(raw):
    return json.loads(zipfile.ZipFile(io.BytesIO(raw)).read("course.json"))


def setup(d):
    nodes = d["course"]["nodes"]
    by_id = {n["node_id"]: n for n in nodes}
    by_code = {n.get("code"): n for n in nodes if n.get("code")}
    kids = defaultdict(list)
    for n in nodes:
        if n.get("parent_node_id"):
            kids[n["parent_node_id"]].append(n)
    return nodes, by_id, by_code, kids


def path(n, by_id):
    out = []
    while n:
        out.append(n.get("name") or "")
        n = by_id.get(n.get("parent_node_id"))
    return " / ".join(reversed(out))


def deepest(q):
    codes = q.get("node_codes") or []
    deep = [c for c in codes if DOT.search(c)]
    return deep[-1] if deep else (codes[-1] if codes else None)


def first_dot(node, kids):
    found = []
    stack = list(kids.get(node["node_id"], []))
    while stack:
        n = stack.pop()
        if DOT.search(n.get("code") or ""):
            found.append(n.get("code"))
        stack.extend(kids.get(n["node_id"], []))
    return sorted(found)[0] if found else None


def qtext(q):
    parts = []

    def walk(x):
        if isinstance(x, dict):
            t = x.get("text")
            if isinstance(t, str):
                parts.append(t)
            for v in x.values():
                walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)

    walk(q.get("body"))
    walk(q.get("parts"))
    walk(q.get("mcq_options"))
    return " ".join(parts)


def toks(s):
    return {w for w in (m.group(0).lower() for m in WORD.finditer(s)) if w not in STOP}


def no_text(s):
    t = s.strip()
    return len(t) < 80 or "Full MCQ stem" in t or "appear in the exam paper" in t


rows = []
examples = {}
for f in sorted(ROOT.glob("*/*.qb")):
    cid = f.parent.name
    cur = load(f.read_bytes())
    try:
        old = load(subprocess.run(["git", "show", f"{BASE}:{f.as_posix()}"], capture_output=True).stdout)
    except Exception:
        old = None
    nodes, by_id, by_code, kids = setup(cur)
    dots = [n for n in nodes if DOT.search(n.get("code") or "") and (n.get("code") or "").startswith("HSC")]
    dot_tokens = {n["code"]: toks(n.get("name") or "") for n in dots}
    oldq = {q.get("question_id"): q for q in (old or {}).get("questions", []) if q.get("question_id")}
    c = Counter()
    top = Counter()
    low_overlap = 0
    notext = 0
    changed = placeholder = redot = other = 0
    ex = []
    for q in cur["questions"]:
        code = deepest(q)
        if not (code or "").startswith("HSC"):
            continue
        c["hsc"] += 1
        c["deep" if DOT.search(code) else "shallow"] += 1
        if DOT.search(code):
            top[code] += 1
            body = toks(qtext(q))
            if no_text(qtext(q)):
                notext += 1
            elif body and not (body & dot_tokens.get(code, set())):
                low_overlap += 1
        oq = oldq.get(q.get("question_id"))
        if oq:
            oc, nc = deepest(oq), code
            if oc != nc:
                changed += 1
                onode = by_code.get(oc)
                fd = first_dot(onode, kids) if onode and not DOT.search(oc or "") else None
                if nc == fd:
                    placeholder += 1
                    if len(ex) < 2:
                        ex.append((q.get("source", {}).get("year"), q.get("source", {}).get("original_question_no"),
                                   oc, nc, path(nodes[0], by_id) if False else qtext(q)[:110].replace("\n", " ")))
                elif DOT.search(oc or "") and DOT.search(nc or ""):
                    redot += 1
                else:
                    other += 1
    topn = top.most_common(1)[0][1] if top else 0
    rows.append(dict(cid=cid, hsc=c["hsc"], deep=c["deep"], shallow=c["shallow"],
                     changed=changed, placeholder=placeholder, redot=redot, other=other,
                     topn=topn, topcode=top.most_common(1)[0][0] if top else "-",
                     dots=len(top), avail=len(dots), low=low_overlap, notext=notext))
    examples[cid] = ex

print("| course | HSC | deep | shallow | changed | first-D | re-D | other | top dot % | dots used/avail | no-text | zero-overlap |")
print("|---|---|---|---|---|---|---|---|---|---|---|---|")
for r in sorted(rows, key=lambda r: (-r["placeholder"], -r["topn"] / max(r["hsc"], 1))):
    pc = f"{100*r['topn']/r['hsc']:.0f}%" if r["hsc"] else "-"
    print(f"| {r['cid']} | {r['hsc']} | {r['deep']} | {r['shallow']} | {r['changed']} | {r['placeholder']} | {r['redot']} | {r['other']} | {pc} | {r['dots']}/{r['avail']} | {r['notext']} | {r['low']} |")

print("\n## examples")
for cid, ex in examples.items():
    for e in ex:
        print(f"- {cid} {e[0]} Q{e[1]}: {e[2]} -> {e[3]} | {e[4]}")
