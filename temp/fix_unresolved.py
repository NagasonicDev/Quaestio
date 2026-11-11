"""Fix the residual physics legacy codes and unclassified engineering questions."""
import json
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(r"D:\quaestio")
TEMPLATES = ROOT / "frontend" / "public" / "templates" / "hsc"
DOT = re.compile(r"-D\d+$")

PHYSICS = {
    "qhsc2002_27": "PRE-M4-T2-D12",
    "qhsc2003_11": "HSC-M4-T2-D5",
    "qhsc2003_18": "HSC-M4-T4-D2",
    "qhsc2004_23": "HSC-M4-T3-D14",
    "qhsc2004_26": "PRE-M4-T3-D3",
    "qhsc2006_11": "HSC-M4-T2-D5",
    "qhsc2007_12": "HSC-M4-T2-D5",
    "qhsc2009_24": "PRE-M2-T5-D6",
    "qhsc2009_28": "HSC-M2-T3-D1",
    "qhsc2009_29": "HSC-M3-T1-D2",
    "qhsc2010_06": "HSC-M4-T1-D3",
    "qhsc2010_18": "HSC-M4-T2-D5",
    "qhsc2010_32": "HSC-M2-T2-D12",
    "qhsc2011_11": "HSC-M3-T3-D3",
    "qhsc2012_02": "HSC-M4-T1-D1",
    "qhsc2012_05": "HSC-M4-T3-D17",
    "qhsc2012_07": "HSC-M3-T2-D7",
    "qhsc2012_17": "PRE-M4-T3-D3",
    "qhsc2012_20": "HSC-M4-T3-D17",
    "qhsc2012_24": "PRE-M4-T1-D7",
    "qhsc2014_35": "HSC-M5-T1-D16",
    "qhsc2015_13": "HSC-M4-T3-D2",
    "qhsc2017_07": "HSC-M4-T4-D2",
    "qhsc2020_18": "HSC-M2-T3-D8",
    "qhsc2025_34": "HSC-M4-T1-D1",
}

ENGINEERING = {
    "FMQ9LK": "HSC-M3-T2-D19",
    "UDC6W4": "HSC-M1-T2-D37",
    "5IPBYP": "HSC-M1-T1-D10",
    "NFJZU5": "HSC-M3-T1-D24",
    "9YZ6AO": "HSC-M2-T1-D15",
    "LZMPU0": "HSC-M1-T2-D37",
    "OXL456": "HSC-M1-T2-D22",
    "7V3PT8": "HSC-M3-T1-D24",
    "LN2FHP": "HSC-M1-T1-D10",
    "2SGLN3": "HSC-M3-T2-D22",
    "65XPDJ": "HSC-M1-T2-D36",
    "70B0WT": "HSC-M1-T2-D28",
    "QE82QP": "HSC-M3-T2-D31",
    "P4KQ62": "HSC-M2-T2-D35",
    "5EG95B": "HSC-M2-T1-D14",
    "OUV4X0": "HSC-M1-T1-D9",
    "J27NJ4": "HSC-M2-T1-D23",
    "KWIN6N": "HSC-M2-T1-D11",
    "YRTE4M": "HSC-M2-T1-D11",
    "C7QXNR": "HSC-M2-T1-D14",
    "0B5YPQ": "HSC-M1-T2-D36",
    "XKC75T": "HSC-M1-T2-D22",
    "2X93LG": "HSC-M4-T1-D15",
    "EY8TLG": "HSC-M3-T1-D24",
}


def path_of(node, by_id):
    parts, cur, seen = [], node, set()
    while cur and cur.get("node_id") not in seen:
        seen.add(cur.get("node_id"))
        parts.append(cur.get("name") or "")
        cur = by_id.get(cur.get("parent_node_id"))
    return " / ".join(reversed(parts))


def apply(cid, mapping, write):
    qb = TEMPLATES / cid / f"{cid}.qb"
    with zipfile.ZipFile(qb) as z:
        infos = z.infolist()
        contents = {i.filename: z.read(i.filename) for i in infos}
    cj = next(n for n in contents if n.endswith("course.json"))
    data = json.loads(contents[cj].decode("utf-8"))
    nodes = data["course"]["nodes"]
    by_id = {n["node_id"]: n for n in nodes}
    by_code = {n["code"]: n for n in nodes if n.get("code")}
    missing_code = sorted({c for c in mapping.values() if c not in by_code})
    assert not missing_code, (cid, missing_code)
    assert all(DOT.search(c) for c in mapping.values()), cid
    applied = skipped = unknown = 0
    for q in data["questions"]:
        code = mapping.get(q.get("question_id"))
        if not code:
            skipped += 1
            continue
        node = by_code[code]
        q["node_ids"] = [node["node_id"]]
        q["node_codes"] = [code]
        q["node_names"] = [path_of(node, by_id)]
        q["classification_confidence"] = "medium"
        applied += 1
    for qid in mapping:
        if qid not in {q.get("question_id") for q in data["questions"]}:
            unknown += 1
            print(f"   unknown id: {qid}")
    print(f"{cid}: applied {applied}, skipped {skipped}, unknown {unknown}, codes {len(set(mapping.values()))}")
    if not write or not applied:
        return
    contents[cj] = json.dumps(data, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    with zipfile.ZipFile(qb, "w") as z:
        for info in infos:
            zi = zipfile.ZipInfo(info.filename, date_time=info.date_time)
            zi.compress_type = info.compress_type
            zi.external_attr = info.external_attr
            zi.create_system = info.create_system
            z.writestr(zi, contents[info.filename])


if __name__ == "__main__":
    write = "--write" in sys.argv
    apply("physics", PHYSICS, write)
    apply("engineering-studies", ENGINEERING, write)
