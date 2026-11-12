#!/usr/bin/env python3
"""Remove consecutive duplicate body blocks and identical MCQ options.

Usage:
    python scripts/dedupe_bodies.py <bundle.qb|bundle.qbx|course.json|questions.json>
    python scripts/dedupe_bodies.py <input> --write
    python scripts/dedupe_bodies.py <input> --out clean.qbx
    python scripts/dedupe_bodies.py <input> --check
    python scripts/dedupe_bodies.py --self-test

By default the input is left alone and a `<name>-deduped<ext>` copy is written,
matching repair_multipart_solutions.py. `--write` replaces the input in place;
`--check` reports only and exits 1 when duplicates or unrepaired MCQ options
are found.

Body blocks are compared by `block_type` plus `content`, ignoring block ids,
slots and positions. Adjacent copies and immediately repeated runs (A,B,A,B)
collapse to one copy. Identical MCQ options collapse to the first copy, keeping
the correct answer. When the result would have fewer than three choices the
question is reported and left unchanged: that pattern comes from a flattened
table, so deleting would leave a two-choice question and hide the source defect.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import zipfile
from pathlib import Path

JSON_NAMES = ("course.json", "questions.json")


def block_key(block: dict) -> str:
    return json.dumps(
        [block.get("block_type", ""), block.get("content") or {}],
        sort_keys=True,
        ensure_ascii=False,
    )


def dedupe_blocks(blocks: list[dict]) -> tuple[list[dict], int]:
    """Collapse adjacent duplicates and repeated contiguous runs."""
    if len(blocks) < 2:
        return blocks, 0
    out = list(blocks)
    removed = 0
    i = 0
    while i + 1 < len(out):
        matched = 0
        for run in range((len(out) - i) // 2, 0, -1):
            if all(block_key(out[i + k]) == block_key(out[i + run + k]) for k in range(run)):
                matched = run
                break
        if matched:
            del out[i + matched:i + 2 * matched]
            removed += matched
        else:
            i += 1
    if not removed:
        return blocks, 0
    return [dict(block, position=index) for index, block in enumerate(out)], removed


def dedupe_options(options: list[dict]) -> tuple[list[dict], int, str | None]:
    """Collapse identical options; refuse to leave fewer than three choices."""
    if len(options) < 2:
        return options, 0, None
    kept: list[dict] = []
    index_by_key: dict[str, int] = {}
    removed = 0
    for option in options:
        key = json.dumps(
            [block_key(block) for block in option.get("content") or []],
            ensure_ascii=False,
        )
        if key not in index_by_key:
            index_by_key[key] = len(kept)
            kept.append(dict(option))
        else:
            removed += 1
            if option.get("is_correct"):
                kept[index_by_key[key]]["is_correct"] = True
    if not removed:
        return options, 0, None
    if len(kept) < 3:
        return options, 0, f"would leave {len(kept)} choice(s)"
    return [dict(option, position=index) for index, option in enumerate(kept)], removed, None


def question_label(question: dict) -> str:
    source = question.get("source") or {}
    return str(source.get("original_question_no") or question.get("question_id") or "?")


def dedupe_question(question: dict, path: str, findings: dict) -> None:
    body = question.get("body")
    if isinstance(body, list):
        cleaned, removed = dedupe_blocks(body)
        if removed:
            question["body"] = cleaned
            findings["blocks"].append((path, removed))

    options = question.get("mcq_options")
    if isinstance(options, list):
        cleaned, removed, skipped = dedupe_options(options)
        if removed:
            question["mcq_options"] = cleaned
            findings["options"].append((path, removed))
        elif skipped:
            findings["skipped"].append((path, skipped))

    for part in question.get("parts") or []:
        label = part.get("part_label") or part.get("question_id") or "?"
        dedupe_question(part, f"{path}/{label}", findings)


def load(path: Path):
    """Return (payload, zip entries, json entry name) for a bundle or plain JSON."""
    if zipfile.is_zipfile(path):
        with zipfile.ZipFile(path) as archive:
            entries = [(info, archive.read(info.filename)) for info in archive.infolist()]
        for name in JSON_NAMES:
            for info, data in entries:
                if info.filename == name:
                    return json.loads(data), entries, name
        raise SystemExit(f"no course.json or questions.json inside {path}")
    return json.loads(path.read_text(encoding="utf-8-sig")), None, None


def write(path: Path, payload: dict, entries, json_name: str | None) -> None:
    tmp = path.with_name(path.name + ".tmp")
    if entries is None:
        tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    else:
        new_json = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        with zipfile.ZipFile(tmp, "w") as target:
            for info, data in entries:
                target.writestr(info, new_json if info.filename == json_name else data)
    # Windows can hold a freshly written archive briefly (indexer/antivirus).
    for attempt in range(4):
        try:
            tmp.replace(path)
            return
        except PermissionError:
            if attempt == 3:
                raise
            time.sleep(0.5)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("input", nargs="?", type=Path, help="bundle or JSON file to clean")
    parser.add_argument("--write", action="store_true", help="replace the input in place")
    parser.add_argument("--out", type=Path, help="write a copy to this path")
    parser.add_argument("--check", action="store_true", help="report only; exit 1 when anything is found")
    parser.add_argument("--self-test", action="store_true", help="run built-in checks and exit")
    args = parser.parse_args()

    if args.self_test:
        return self_test()
    if not args.input:
        parser.error("an input file is required unless --self-test is used")

    payload, entries, json_name = load(args.input)
    if not isinstance(payload.get("questions"), list):
        raise SystemExit(f"{args.input} has no questions array")

    findings = {"blocks": [], "options": [], "skipped": []}
    for question in payload["questions"]:
        dedupe_question(question, "Q" + question_label(question), findings)

    for path, count in findings["blocks"]:
        print(f"{path}: removed {count} duplicate body block(s)")
    for path, count in findings["options"]:
        print(f"{path}: removed {count} duplicate option(s)")
    for path, reason in findings["skipped"]:
        print(f"{path}: options NOT deduped ({reason}) - fix the source table or options")
    removed_blocks = sum(count for _, count in findings["blocks"])
    removed_options = sum(count for _, count in findings["options"])
    touched = len({path for path, _ in findings["blocks"]} | {path for path, _ in findings["options"]})
    print(f"Removed {removed_blocks} duplicate body block(s) and {removed_options} duplicate "
          f"option(s) from {touched} question(s); {len(findings['skipped'])} unrepaired.")
    found = removed_blocks or removed_options or findings["skipped"]

    if args.check:
        return 1 if found else 0
    if args.out and args.write:
        parser.error("choose either --out or --write, not both")
    output = args.input if args.write else (args.out or args.input.with_name(
        args.input.stem + "-deduped" + args.input.suffix))
    write(output, payload, entries, json_name)
    print(f"Wrote {output}")
    return 0


def self_test() -> int:
    text = lambda value: {"block_type": "text", "content": {"text": value}}

    blocks, removed = dedupe_blocks([text("A"), text("B"), text("B"), text("C")])
    assert [block["content"]["text"] for block in blocks] == ["A", "B", "C"] and removed == 1
    assert [block["position"] for block in blocks] == [0, 1, 2]

    blocks, removed = dedupe_blocks([text("A"), text("B"), text("A"), text("B")])
    assert [block["content"]["text"] for block in blocks] == ["A", "B"] and removed == 2

    blocks, removed = dedupe_blocks([text("A"), text("A"), text("A")])
    assert len(blocks) == 1 and removed == 2

    options, removed, skipped = dedupe_options([
        {"content": [text("A")], "is_correct": False},
        {"content": [text("B")], "is_correct": False},
        {"content": [text("C")], "is_correct": False},
        {"content": [text("A")], "is_correct": True},
    ])
    assert len(options) == 3 and removed == 1 and skipped is None
    assert options[0]["is_correct"] is True and options[2]["position"] == 2

    original = [{"content": [text("A")]}, {"content": [text("A")]}]
    options, removed, skipped = dedupe_options(original)
    assert options is original and removed == 0 and skipped is not None

    original = [{"content": [text("A")]}, {"content": [text("B")]},
                {"content": [text("A")]}, {"content": [text("B")]}]
    options, removed, skipped = dedupe_options(original)
    assert options is original and removed == 0 and "2 choice" in skipped

    question = {"body": [text("stem"), text("stem")], "parts": [{"body": [text("p"), text("p")]}]}
    findings = {"blocks": [], "options": [], "skipped": []}
    dedupe_question(question, "Q1", findings)
    assert len(question["body"]) == 1 and len(question["parts"][0]["body"]) == 1
    assert len(findings["blocks"]) == 2
    print("self-test passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
