import zipfile, json, re, math, sys
from collections import Counter
from pathlib import Path

DOT = re.compile(r"-D[0-9]+$")
WORD = re.compile(r"[A-Za-z][A-Za-z'\-]{3,}")
STOP = set("""this that with from have been were which what when where their there these those than then they them
into about after before during between under over such only also more most some each other both same very does
question answer options option following figure diagram shows show best correct statement statements student students
explain describe discuss analyse analyze evaluate calculate determine identify outline compare contrast using use
example examples given data information graph table sample samples study studies year hsc exam examination paper
mark marks marks question questions response responses""".split())


def words(s):
    return [w.lower() for w in WORD.findall(s) if w.lower() not in STOP]


def stem(w):
    for suf in ("ations", "ation", "ments", "ment", "ings", "ing", "ies", "ied", "ed", "es", "s"):
        if len(w) > len(suf) + 3 and w.endswith(suf):
            return w[: -len(suf)]
    return w


def toks(s):
    return {stem(w) for w in words(s)}


def qtext(q):
    parts = []

    def walk(x):
        if isinstance(x, dict):
            t = x.get("text")
            if isinstance(t, str):
                parts.append(t)
            for k, v in x.items():
                if k in ("answer", "solution", "marking_criteria"):
                    continue
                walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)

    walk(q.get("body"))
    walk(q.get("parts"))
    walk(q.get("mcq_options"))
    return " ".join(parts)


def build(cid, only=None):
    d = json.loads(zipfile.ZipFile(f"frontend/public/templates/hsc/{cid}/{cid}.qb").read("course.json"))
    nodes = d["course"]["nodes"]
    by_id = {n["node_id"]: n for n in nodes}
    kids = {}
    for n in nodes:
        kids.setdefault(n.get("parent_node_id"), []).append(n)
    dots = [n for n in nodes if DOT.search(n.get("code") or "") and (n.get("code") or "").startswith("HSC")]
    docs = {}
    for n in dots:
        chain = []
        cur = n
        while cur:
            chain.append(cur.get("name") or "")
            cur = by_id.get(cur.get("parent_node_id"))
        # dot name twice, parent topic and module once
        text = chain[0] + " " + chain[0] + " " + " ".join(chain[1:3])
        docs[n["code"]] = toks(text)
    df = Counter()
    for t in docs.values():
        df.update(set(t))
    N = len(docs)
    idf = {t: math.log((N + 1) / (c + 1)) + 1 for t, c in df.items()}
    out = []
    qs = d["questions"] if not only else [q for q in d["questions"] if str(q.get("source", {}).get("original_question_no")) in only]
    for q in qs:
        qt = toks(qtext(q))
        scores = []
        for code, dt in docs.items():
            common = qt & dt
            if not common:
                continue
            score = sum(idf.get(t, 1) for t in common) / math.sqrt(sum(idf.get(t, 1) ** 2 for t in dt) or 1)
            scores.append((score, code, sorted(common, key=lambda t: -idf.get(t, 1))[:8]))
        scores.sort(reverse=True)
        out.append((q, scores[:3]))
    return out


if __name__ == "__main__":
    cid = sys.argv[1] if len(sys.argv) > 1 else "biology-2017"
    only = set(sys.argv[2].split(",")) if len(sys.argv) > 2 else None
    for q, top in build(cid, only):
        print(f"\n{q['source'].get('year')} Q{q['source'].get('original_question_no')}: {qtext(q)[:100].replace(chr(10),' ')}")
        for s, code, terms in top:
            print(f"   {s:.3f} {code} {terms}")
