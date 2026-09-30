"""Move multipart answers and solution blocks onto their actual parts.

Usage: python scripts/repair_multipart_solutions.py input.qbx|input.json

The source bundle is never overwritten. Direct text matches are preferred;
remaining blocks are assigned using text similarity and the order of parts.
Review the printed assignments, then run audit_qbx.py on the repaired bundle.
"""
from __future__ import annotations

import argparse
import copy
import difflib
import json
import re
import zipfile
from pathlib import Path


def block_text(block: dict) -> str:
    content = block.get("content") or {}
    if not isinstance(content, dict):
        return ""
    return " ".join(str(content.get(k, "")) for k in ("text", "latex", "code"))


def normalize(value: str) -> str:
    text = re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()
    return re.sub(r"\b[sp] waves?\b", "seismic waves", text)


def match_score(block: dict, part: dict) -> float:
    source = normalize(block_text(block))
    target = normalize(" ".join(
        block_text(item)
        for field in ("body", "answer", "solution")
        for item in part.get(field, []) or []
    ))
    source_words = set(re.findall(r"[a-z]{4,}", source))
    target_words = set(re.findall(r"[a-z]{4,}", target))
    overlap = len(source_words & target_words) / max(1, len(source_words))
    sequence = difflib.SequenceMatcher(None, source, target).ratio()
    math_re = r"\\[A-Za-z]+|(?<![A-Za-z])[A-Z](?:_[A-Za-z0-9]+)?(?![a-z])"
    source_math = set(re.findall(math_re, block_text(block)))
    target_math = set(re.findall(math_re, " ".join(
        block_text(item)
        for field in ("body", "answer", "solution")
        for item in part.get(field, []) or []
    )))
    math = len(source_math & target_math) / max(1, len(source_math))
    return max(overlap, sequence, math)


def prompt_score(block: dict, part: dict) -> float:
    """Compare against the part prompt only, avoiding sibling-answer bias."""
    source = normalize(block_text(block))
    target = normalize(" ".join(block_text(item) for item in part.get("body", []) or []))
    source_words = set(re.findall(r"[a-z]{4,}", source))
    target_words = set(re.findall(r"[a-z]{4,}", target))
    overlap = len(source_words & target_words) / max(1, len(source_words))
    math_re = r"\\[A-Za-z]+|(?<![A-Za-z])[A-Z](?:_[A-Za-z0-9]+)?(?![a-z])"
    source_math = set(re.findall(math_re, block_text(block)))
    target_math = set(re.findall(math_re, " ".join(
        block_text(item) for item in part.get("body", []) or []
    )))
    math = len(source_math & target_math) / max(1, len(source_math))
    return max(overlap, math)


def place_block(part: dict, block: dict, field: str) -> None:
    moved = copy.deepcopy(block)
    moved["slot"] = field
    moved["position"] = len(part.get(field) or [])
    part.setdefault(field, []).append(moved)


def labeled_segments(block: dict, parts: list[dict]) -> list[tuple[int, dict]] | None:
    """Split text like '(a) ... (b)(i) ...' at labels present in this level."""
    content = block.get("content") or {}
    if not isinstance(content, dict) or not isinstance(content.get("text"), str):
        return None
    labels = {str(part.get("part_label", "")).lower(): i for i, part in enumerate(parts)}
    text = content["text"]
    marker_re = re.compile(r"(?P<label>(?:\([a-z]+\))+)\s*", re.I)
    markers = []
    for match in marker_re.finditer(text):
        components = re.findall(r"\(([a-z]+)\)", match.group("label"), re.I)
        key = components[0].lower() if components else ""
        if key in labels and (match.start() == 0 or text[match.start() - 1] in " \t\r\n;:"):
            markers.append((match, labels[key], components[1:]))
    if not markers or (len(markers) == 1 and markers[0][0].start() != 0):
        return None
    out = []
    for index, (match, part_index, nested) in enumerate(markers):
        end = markers[index + 1][0].start() if index + 1 < len(markers) else len(text)
        tail = text[match.end():end].strip()
        if nested:
            tail = "".join(f"({label})" for label in nested) + (" " + tail if tail else "")
        if tail:
            fragment = copy.deepcopy(block)
            fragment["content"]["text"] = tail
            out.append((part_index, fragment))
    return out


def contains_text(block: dict, existing: list[dict]) -> bool:
    text = normalize(block_text(block))
    return bool(text and any(
        (other := normalize(block_text(item))) and (text in other or other in text)
        for item in existing
    ))


def repair_parent(parent: dict, path: str, changes: list[str]) -> None:
    parts = parent.get("parts") or []
    if not parts:
        return
    for field in ("answer", "solution"):
        blocks = parent.get(field) or []
        if not blocks:
            continue
        units: list[tuple[int, dict, int | None]] = []
        for block in blocks:
            labeled = labeled_segments(block, parts)
            if labeled:
                units.extend((len(units), fragment, part_i) for part_i, fragment in labeled)
            elif field == "answer" and block.get("block_type") == "text" and ";" in block_text(block):
                clauses = [s.strip() for s in block_text(block).split(";") if s.strip()]
                if len(clauses) > 1:
                    for clause in clauses:
                        fragment = copy.deepcopy(block)
                        fragment["content"]["text"] = clause
                        units.append((len(units), fragment, None))
                else:
                    units.append((len(units), block, None))
            else:
                units.append((len(units), block, None))

        anchors: dict[int, int] = {}
        pending: list[tuple[int, dict]] = []
        for index, block, labeled_part in units:
            if labeled_part is not None:
                part = parts[labeled_part]
                if contains_text(block, part.get(field, []) or []):
                    changes.append(f"{path}: removed duplicate parent {field} already represented on part {part.get('part_label')}")
                else:
                    place_block(part, block, field)
                    changes.append(f"{path}: moved parent {field} to part {part.get('part_label')} using its printed label")
                anchors[index] = labeled_part
                continue
            text = normalize(block_text(block))
            matches = [i for i, part in enumerate(parts) if contains_text(block, part.get(field, []) or [])]
            if len(matches) == 1:
                anchors[index] = matches[0]
                changes.append(f"{path}: removed duplicate parent {field} already represented on part {parts[matches[0]].get('part_label')}")
            else:
                score_fn = prompt_score if field == "answer" else match_score
                scores = [(score_fn(block, part), i) for i, part in enumerate(parts)]
                scores.sort(reverse=True)
                best, target_i = scores[0]
                second = scores[1][0] if len(scores) > 1 else 0
                if best >= 0.30 and best - second >= 0.05:
                    place_block(parts[target_i], block, field)
                    anchors[index] = target_i
                    changes.append(f"{path}: moved parent {field} to part {parts[target_i].get('part_label')} (distinct text match)")
                else:
                    pending.append((index, block))

        for index, block in pending:
            previous = [(i, j) for i, j in anchors.items() if i < index]
            following = [(i, j) for i, j in anchors.items() if i > index]
            previous_anchor = max(previous, default=None)
            next_anchor = min(following, default=None)
            low = previous_anchor[1] if previous_anchor else 0
            high = next_anchor[1] if next_anchor else len(parts) - 1
            candidates = [(match_score(block, parts[j]), j) for j in range(low, high + 1)]
            if not candidates:
                candidates = [(match_score(block, part), j) for j, part in enumerate(parts)]
            best = max(score for score, _ in candidates)
            expected = min(len(parts) - 1, index * len(parts) // max(1, len(units)))
            tied = [j for score, j in candidates if best - score < 0.05]
            if previous_anchor is None and next_anchor is not None:
                target_i = expected
            elif previous_anchor and next_anchor and previous_anchor[1] != next_anchor[1]:
                interior = list(range(low + 1, high))
                if interior:
                    target_i = interior[min(len(interior) - 1,
                                            (index - previous_anchor[0] - 1) * len(interior)
                                            // max(1, next_anchor[0] - previous_anchor[0] - 1))]
                else:
                    target_i = tied[0]
            elif previous_anchor and next_anchor:
                target_i = previous_anchor[1]
            elif not previous_anchor and not next_anchor:
                target_i = expected
            else:
                target_i = expected if expected in tied else tied[0]
            target = parts[target_i]
            place_block(target, block, field)
            changes.append(f"{path}: placed parent {field} on part {target.get('part_label')} using text/order match (review)")

        parent[field] = []
    for part in parts:
        repair_parent(part, path + "/" + str(part.get("part_label")), changes)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--out", type=Path, help="repaired output path (default: <name>-fixed.<ext>)")
    args = parser.parse_args()
    output = args.out or args.input.with_name(args.input.stem + "-fixed" + args.input.suffix)

    entries = None
    if args.input.suffix.lower() == ".qbx":
        with zipfile.ZipFile(args.input, "r") as source:
            entries = [(info, source.read(info.filename)) for info in source.infolist()]
        try:
            payload = json.loads(next(data for info, data in entries if info.filename == "questions.json"))
        except StopIteration:
            raise SystemExit("bundle has no questions.json")
    else:
        payload = json.loads(args.input.read_text(encoding="utf-8-sig"))

    changes: list[str] = []
    for question in payload.get("questions", []):
        label = (question.get("source") or {}).get("original_question_no", question.get("question_id", "?"))
        repair_parent(question, "Q" + str(label), changes)

    new_json = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
    if entries is None:
        output.write_bytes(new_json)
    else:
        with zipfile.ZipFile(output, "w") as target:
            for info, data in entries:
                target.writestr(info, new_json if info.filename == "questions.json" else data)
    print(f"Wrote repaired copy: {output}")
    for item in changes:
        print("  " + item)
    print(f"Processed {len(changes)} multipart answer/solution block(s). For .qbx files, run audit_qbx.py next.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
