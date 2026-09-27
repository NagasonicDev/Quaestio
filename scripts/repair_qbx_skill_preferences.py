"""Repair imported bundles to match the current Physics import skill.

Run from the repository root. The repair is deliberately limited to structural
normalisation and verifiable answer-key corrections; it does not invent missing
source material.
"""
from __future__ import annotations

import json
import pathlib
import re
import tempfile
import zipfile
import difflib

ROOT = pathlib.Path(__file__).resolve().parents[1]
IMPORTS = ROOT / "imports"
SCHEMA = json.loads((ROOT / ".opencode/skills/physics-question-import/import-schema.json").read_text(encoding="utf-8"))
COURSE_ID = SCHEMA["course_id"]
LABEL = re.compile(r"^\s*\(([a-z]+)\)\s*", re.I)


def label_key(value):
    return re.sub(r"[^a-z]", "", str(value or "").lower())


def split_marked_text(text, labels):
    """Split a text field at part labels at the start or after whitespace."""
    pattern = re.compile(r"(?m)(?:^|(?<=[.;:])\s+)((?:\([a-z]+\))+ )", re.I)
    # Keep the pattern readable while excluding the deliberate trailing space
    # used above to avoid consuming punctuation from the following segment.
    pattern = re.compile(r"(?m)(?:^|(?<=[.;:])\s+)((?:\([a-z]+\))+)")
    matches = list(pattern.finditer(text))
    if len(matches) < 2:
        broad = re.compile(r"((?:\([a-z]+\))+)", re.I)
        matches = []
        for marker in broad.finditer(text):
            before = text[:marker.start()].rstrip().lower()
            if any(before.endswith(word) for word in ("part", "question", "figure", "option")):
                continue
            matches.append(marker)
    if not matches:
        return None
    chunks = []
    for i, match in enumerate(matches):
        groups = re.findall(r"\(([a-z]+)\)", match.group(1), re.I)
        code = "".join(groups).lower()
        candidates = [k for k in labels if code.startswith(k)]
        if not candidates:
            continue
        key = max(candidates, key=len)
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        tail = text[match.end():end].strip()
        # Retain nested suffixes when this segment is being moved to a shared
        # intermediate part (for example, (a)(i) routed to part a).
        consumed = len(key)
        remainder = code[consumed:]
        suffix = "".join(f"({g})" for g in groups[1:]) if remainder else ""
        chunk = (suffix + (" " if suffix and tail else "") + tail).strip()
        if chunk:
            chunks.append((key, chunk))
    return chunks or None


def distribute_field(parent, parts, field):
    blocks = parent.get(field) or []
    if not blocks or not parts:
        return
    recipients = {label_key(p.get("part_label")): p for p in parts if label_key(p.get("part_label"))}
    if not recipients:
        return
    leftovers = []
    moved = False
    active_key = None
    for block in blocks:
        if isinstance(block, str):
            matches = split_marked_text(block, recipients)
            if matches:
                for key, content in matches:
                    recipients[key].setdefault(field, []).append(content)
                    moved = True
            else:
                leftovers.append(block)
            continue
        content = block.get("content") if isinstance(block, dict) else None
        key_name = "text" if isinstance(content, dict) and "text" in content else "latex" if isinstance(content, dict) and "latex" in content else None
        text = content.get(key_name) if key_name else None
        if not isinstance(text, str):
            if active_key in recipients:
                recipients[active_key].setdefault(field, []).append(block)
                moved = True
            else:
                leftovers.append(block)
            continue
        matches = split_marked_text(text, recipients)
        if matches:
            for key, value in matches:
                new_block = json.loads(json.dumps(block))
                new_block["content"][key_name] = value
                recipients[key].setdefault(field, []).append(new_block)
                moved = True
                active_key = key
        else:
            marker = re.match(r"^\s*((?:\([a-z]+\))+)(.*)$", text, re.I | re.S)
            codes = re.findall(r"\(([a-z]+)\)", marker.group(1), re.I) if marker else []
            code = "".join(codes).lower()
            candidates = [k for k in recipients if code.startswith(k)]
            if marker and candidates:
                active_key = max(candidates, key=len)
                tail = marker.group(2).strip()
                suffix = "".join(f"({g})" for g in codes[1:]) if len(active_key) < len(code) else ""
                tail = (suffix + (" " if suffix and tail else "") + tail).strip()
                if tail:
                    new_block = json.loads(json.dumps(block))
                    new_block["content"][key_name] = tail
                    recipients[active_key].setdefault(field, []).append(new_block)
                moved = True
            elif active_key in recipients:
                recipients[active_key].setdefault(field, []).append(block)
                moved = True
            else:
                leftovers.append(block)
    if moved:
        parent[field] = leftovers

    # Any remaining shared-field blocks are matched to the most relevant part
    # by text/numeric overlap. This covers sources whose worked solutions omit
    # the subsection labels while keeping calculations beside their answers.
    if parent.get(field):
        def plain(value):
            if isinstance(value, str):
                return value
            if isinstance(value, list):
                return " ".join(plain(v) for v in value)
            if isinstance(value, dict):
                content = value.get("content", value)
                if isinstance(content, dict):
                    return " ".join(str(content.get(k, "")) for k in ("text", "latex", "items", "description"))
                return str(content)
            return str(value or "")

        def tokens(value):
            text = plain(value).lower()
            words = set(re.findall(r"[a-z]{3,}", text))
            numbers = set(re.findall(r"\d+(?:\.\d+)?(?:e[+-]?\d+)?", text))
            symbols = set(x.lower() for x in re.findall(r"\\(?:delta|lambda|tau|varepsilon|epsilon|phi|theta|omega|mu|nu|rho|sigma|pi|alpha|beta|gamma)|(?<![\\a-z])[A-Z](?![a-z])", plain(value), re.I))
            return words, numbers, symbols

        candidates = []
        for part in parts:
            ptext = plain(part.get("body", [])) + " " + plain(part.get("answer", [])) + " " + plain(part.get("solution", []))
            candidates.append((part, tokens(ptext)))
        if (field == "solution" and len(parent[field]) > len(parts)
                and all(part.get("answer") for part in parts)
                and all(not part.get("solution") for part in parts)):
            endpoints = []
            for part, (_, _, psymbols) in candidates:
                answer_words, answer_numbers, answer_symbols = tokens(part.get("answer", []))
                best_index, best_score = None, 0
                for i, block in enumerate(parent[field]):
                    words, numbers, symbols = tokens(block)
                    score = 8 * len(answer_numbers & numbers) + 12 * len(answer_symbols & symbols) + len(answer_words & words)
                    if score > best_score:
                        best_index, best_score = i, score
                endpoints.append(best_index)
            if (all(i is not None for i in endpoints)
                    and endpoints == sorted(endpoints)
                    and len(set(endpoints)) == len(endpoints)):
                start = 0
                for (part, _), end in zip(candidates, endpoints):
                    part.setdefault(field, []).extend(parent[field][start:end + 1])
                    start = end + 1
                parent[field] = parent[field][start:]
        remaining = []
        for block in parent.get(field) or []:
            signature = plain(block)
            if any(signature == plain(existing) for part, _ in candidates for existing in part.get(field, []) or []):
                continue
            words, numbers, symbols = tokens(signature)
            best = None
            best_score = -1
            for part, (pwords, pnumbers, psymbols) in candidates:
                score = 5 * len(numbers & pnumbers) + 2 * len(words & pwords) + 12 * len(symbols & psymbols)
                ratio = difflib.SequenceMatcher(None, signature.lower(), plain(part.get("answer", [])).lower()).ratio()
                score += ratio
                if score > best_score:
                    best, best_score = part, score
            if best is not None:
                best.setdefault(field, []).append(block)
            else:
                remaining.append(block)
        parent[field] = remaining


def redistribute_sibling_sections(parts, field):
    """Split legacy combined (a)/(b) content mistakenly stored on part a."""
    if len(parts) < 2:
        return
    recipients = {label_key(p.get("part_label")): p for p in parts if label_key(p.get("part_label"))}
    if len(recipients) < 2:
        return
    staged = {key: [] for key in recipients}
    changed = False
    for source in parts:
        source_key = label_key(source.get("part_label"))
        for block in source.get(field) or []:
            text = block if isinstance(block, str) else (block.get("content") or {}).get("text") if isinstance(block, dict) else None
            matches = split_marked_text(text, recipients) if isinstance(text, str) else None
            destinations = {key for key, _ in (matches or [])}
            if matches and (len(destinations) > 1 or any(key != source_key for key in destinations)):
                for key, content in matches:
                    if isinstance(block, str):
                        staged[key].append(content)
                    else:
                        new_block = json.loads(json.dumps(block))
                        new_block["content"]["text"] = content
                        staged[key].append(new_block)
                changed = True
            else:
                staged[source_key].append(block)
    if changed:
        for key, part in recipients.items():
            # Drop exact duplicates introduced by older import passes.
            unique = []
            seen = set()
            for block in staged[key]:
                signature = json.dumps(block, ensure_ascii=False, sort_keys=True)
                if signature not in seen:
                    seen.add(signature)
                    unique.append(block)
            part[field] = unique


def normalize_question(q):
    for key in ("body", "answer", "solution"):
        q[key] = [b for b in (q.get(key) or []) if not (isinstance(b, dict) and b.get("block_type") == "text" and not (b.get("content") or {}).get("text", "").strip())]
    parts = q.get("parts") or []
    if len(parts) == 1 and not label_key(parts[0].get("part_label")):
        child = parts[0]
        existing_text = "\n".join(str(b.get("content", {}).get("text", "")) for b in q.get("body", []) if isinstance(b, dict))
        for b in child.get("body") or []:
            if b.get("block_type") == "answer_area":
                if not any(x.get("block_type") == "answer_area" for x in q.get("body", [])):
                    q.setdefault("body", []).append(b)
            elif b.get("block_type") in ("image", "diagram", "graph"):
                if b not in q.get("body", []):
                    q.setdefault("body", []).append(b)
            elif b.get("block_type") in ("text", "heading"):
                text = (b.get("content") or {}).get("text", "")
                if text and text not in existing_text:
                    q.setdefault("body", []).append(b)
                    existing_text += "\n" + text
        for field in ("answer", "solution", "marking_criteria"):
            if child.get(field):
                q[field] = child[field]
        q["parts"] = []
        q["tags"] = list(dict.fromkeys((q.get("tags") or []) + (child.get("tags") or [])))
        if not q.get("notes") and child.get("notes"):
            q["notes"] = child["notes"]
        parts = []

    # The old builder flattened labels such as a(i) and b(ii). Restore the
    # skill's required hierarchy by inserting an a/b wrapper around children.
    flat = q.get("parts") or []
    groups = {}
    for part in flat:
        m = re.fullmatch(r"([a-z]+)\(([a-z]+)\)", str(part.get("part_label", "")).lower())
        if m:
            groups.setdefault(m.group(1), []).append((m.group(2), part))
    if groups:
        kept = [p for p in flat if not any(p is child for items in groups.values() for _, child in items)]
        for outer, items in groups.items():
            first = items[0][1]
            parent_id = q.get("question_id")
            group_id = f"{parent_id}_{outer}"
            wrapper = json.loads(json.dumps(first))
            wrapper.update({"question_id": group_id, "parent_question_id": parent_id,
                           "part_label": outer, "marks": sum(int(c.get("marks") or 0) for _, c in items),
                           "body": [], "mcq_options": [], "answer": [], "solution": [],
                           "marking_criteria": [], "assets": [], "parts": []})
            for inner, child in items:
                child["part_label"] = inner
                child["parent_question_id"] = group_id
                wrapper["parts"].append(child)
            kept.append(wrapper)
        q["parts"] = sorted(kept, key=lambda x: label_key(x.get("part_label")))
        parts = q["parts"]
    else:
        parts = flat

    for field in ("answer", "solution"):
        redistribute_sibling_sections(parts, field)

    for field in ("answer", "solution"):
        distribute_field(q, parts, field)
    for part in parts:
        normalize_question(part)
        for field in ("answer", "solution"):
            unique = []
            seen = set()
            for block in part.get(field) or []:
                if isinstance(block, dict) and block.get("block_type") == "text" and not (block.get("content") or {}).get("text", "").strip():
                    continue
                signature = json.dumps(block, ensure_ascii=False, sort_keys=True)
                if signature not in seen:
                    seen.add(signature)
                    unique.append(block)
            part[field] = unique
        if (part.get("type_key") in ("short_answer", "extended_response")
                and not any(b.get("block_type") == "answer_area" for b in part.get("body") or [])
                and not any(b.get("block_type") in ("image", "diagram", "graph", "table") for b in part.get("body") or [])
                and not set(part.get("tags") or []).intersection({"drawing", "graphing", "diagram"})):
            marks = max(1, int(part.get("marks") or 1))
            part.setdefault("body", []).append({"block_type": "answer_area", "content": {"lines": 2 * marks}})
    if q.get("parts"):
        q["body"] = [b for b in q.get("body", []) if b.get("block_type") != "answer_area"]
    else:
        body = q.get("body") or []
        areas = [b for b in body if b.get("block_type") == "answer_area"]
        q["body"] = [b for b in body if b.get("block_type") != "answer_area"] + areas

    # A parent with parts is a shared-stem wrapper. Give it the required
    # aggregate marking guide when source marking is attached only to parts.
    if parts and not q.get("marking_criteria"):
        items = []
        for part in parts:
            for block in part.get("marking_criteria") or []:
                if block.get("block_type") == "list":
                    items.extend((block.get("content") or {}).get("items") or [])
        if items:
            q["marking_criteria"] = [{"block_type": "list", "content": {"ordered": False, "items": items}}]


def set_answer(q, letter):
    q["answer"] = [{"block_type": "text", "content": {"text": letter}}]


def repair_bundle(path):
    with zipfile.ZipFile(path, "r") as zin:
        entries = [(info, zin.read(info.filename)) for info in zin.infolist()]
    payload_index = next((i for i, (info, _) in enumerate(entries) if info.filename == "questions.json"), None)
    if payload_index is None:
        return False
    stage = ROOT / "tmp" / f"stage-{path.stem}" / "questions.json"
    payload = json.loads(stage.read_text(encoding="utf-8")) if stage.exists() else json.loads(entries[payload_index][1].decode("utf-8"))
    changed = False
    if payload.get("course_id") != COURSE_ID:
        payload["course_id"] = COURSE_ID
        changed = True

    for q in payload.get("questions", []):
        old = json.dumps(q, ensure_ascii=False, sort_keys=True)
        normalize_question(q)
        if q.get("parts"):
            for field in ("answer", "solution"):
                values = q.get(field) or []
                plain = " ".join(str(b.get("content", {}).get("text", "")) for b in values if isinstance(b, dict))
                if any(phrase in plain.lower() for phrase in ("refer to the part-level", "see the part answers", "see the worked solution given for each part", "see the worked solution given against each part")):
                    q[field] = []
        def set_course(x):
            x["course_id"] = COURSE_ID
            for child in x.get("parts") or []:
                set_course(child)
        set_course(q)
        if json.dumps(q, ensure_ascii=False, sort_keys=True) != old:
            changed = True

    # These letters were checked against the bundles' own keyed options.
    correct_letters = {
        ("north-sydney-boys-2023-physics.qbx", "4"): "C",
        ("sydney-boys-2012-physics.qbx", "8"): "B",
        ("sydney-boys-2012-physics.qbx", "14"): "A",
    }
    for q in payload.get("questions", []):
        letter = correct_letters.get((path.name, str(q.get("source", {}).get("original_question_no"))))
        if letter:
            set_answer(q, letter)
            changed = True

    if not changed:
        return False
    entries[payload_index] = (entries[payload_index][0], json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8"))
    with tempfile.NamedTemporaryFile(dir=path.parent, suffix=".qbx.tmp", delete=False) as tmp:
        tmp_path = pathlib.Path(tmp.name)
    try:
        with zipfile.ZipFile(tmp_path, "w", compression=zipfile.ZIP_DEFLATED) as zout:
            for info, data in entries:
                zout.writestr(info, data)
        tmp_path.replace(path)
    finally:
        tmp_path.unlink(missing_ok=True)
    return True


def main():
    repaired = []
    for path in sorted(IMPORTS.glob("*.qbx")):
        if repair_bundle(path):
            repaired.append(path.name)
    print(f"Repaired {len(repaired)} bundles")
    for name in repaired:
        print(name)


if __name__ == "__main__":
    main()
