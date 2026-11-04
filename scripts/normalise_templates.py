"""Normalise question-bank bundles: strip page furniture, add answer areas.

    python scripts/normalise_templates.py                 # dry run, default roots
    python scripts/normalise_templates.py --write         # apply
    python scripts/normalise_templates.py --check         # exit 1 if anything would change

Only ``body`` text/heading blocks of top-level questions and their parts are
rewritten. Everything else -- answers, solutions, marking criteria, MCQ
options, marks, nodes -- is left exactly as it was, and every non-questions
ZIP member is copied byte-for-byte.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "question_import"))

from qbx_lib import ensure_answer_areas  # noqa: E402
from text_clean import clean_text  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ROOTS = ("imports", "frontend/public/templates/hsc")


def _count_answer_areas(obj: dict) -> int:
    body = obj.get("body") or []
    count = sum(1 for b in body
                if isinstance(b, dict) and b.get("block_type") == "answer_area")
    return count + sum(_count_answer_areas(p)
                       for p in obj.get("parts") or [] if isinstance(p, dict))


def _clean_owner(owner: dict, counts: dict, emptied: list[str]) -> None:
    """Clean the body of one question/part, then recurse into its parts."""
    for block in owner.get("body") or []:
        if not isinstance(block, dict) or block.get("block_type") not in ("text", "heading"):
            continue
        content = block.get("content")
        if not isinstance(content, dict) or not isinstance(content.get("text"), str):
            continue
        old = content["text"]
        new = clean_text(old)
        if new == old:
            continue
        if not new:
            # An empty block fails validation; keep the original and report it.
            counts["blocks_emptied"] += 1
            emptied.append(old)
            continue
        content["text"] = new
        counts["text_blocks_changed"] += 1
        counts["chars_removed"] += len(old) - len(new)

    for part in owner.get("parts") or []:
        if isinstance(part, dict):
            _clean_owner(part, counts, emptied)


def _owners(obj: dict):
    yield obj
    for part in obj.get("parts") or []:
        if isinstance(part, dict):
            yield from _owners(part)


def _has_placeholder(payload: dict) -> bool:
    """True when any question or part body carries the 'See exam paper' placeholder.

    The shipped placeholders read e.g. "2020 HSC Mathematics Standard 1. See
    exam paper ...", so the phrase is matched anywhere in the body text.
    """
    for question in payload.get("questions") or []:
        if not isinstance(question, dict):
            continue
        for owner in _owners(question):
            for block in owner.get("body") or []:
                if not isinstance(block, dict) or block.get("block_type") not in ("text", "heading"):
                    continue
                text = (block.get("content") or {}).get("text")
                if isinstance(text, str) and "see exam paper" in text.lower():
                    return True
    return False


def _content_blocks(obj: dict) -> int:
    count = sum(1 for b in obj.get("body") or []
                if isinstance(b, dict) and b.get("block_type") != "answer_area")
    return count + sum(_content_blocks(p)
                       for p in obj.get("parts") or [] if isinstance(p, dict))


def _is_empty_bundle(payload: dict) -> bool:
    questions = [q for q in payload.get("questions") or [] if isinstance(q, dict)]
    return not questions or sum(_content_blocks(q) for q in questions) == 0


def normalise_bundle(path: Path, write: bool) -> dict:
    counts = {
        "text_blocks_changed": 0,
        "chars_removed": 0,
        "blocks_emptied": 0,
        "answer_areas_added": 0,
        "changed": False,
    }
    emptied: list[str] = []
    tmp: Path | None = None

    with zipfile.ZipFile(path) as src:
        infos = src.infolist()
        if "questions.json" not in src.namelist():
            raise ValueError(f"{path}: no questions.json")
        payload = json.loads(src.read("questions.json").decode("utf-8"))

        for question in payload.get("questions") or []:
            if not isinstance(question, dict):
                continue
            _clean_owner(question, counts, emptied)
            before = _count_answer_areas(question)
            ensure_answer_areas(question)
            counts["answer_areas_added"] += _count_answer_areas(question) - before

        counts["changed"] = bool(counts["text_blocks_changed"]
                                 or counts["answer_areas_added"])
        counts["placeholder"] = _has_placeholder(payload)
        counts["empty_bundle"] = _is_empty_bundle(payload)

        if write and counts["changed"]:
            data = (json.dumps(payload, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
            tmp = path.with_name(path.name + ".tmp")
            with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as dst:
                dst.comment = src.comment
                for info in infos:
                    dst.writestr(info, data if info.filename == "questions.json"
                                 else src.read(info))

    if tmp is not None:
        os.replace(tmp, path)

    counts["emptied_blocks"] = emptied
    return counts


def _check(condition: bool, message: str) -> None:
    """Explicit assertion so ``python -O`` cannot skip the self-test."""
    if not condition:
        raise AssertionError(message)


def _self_test() -> None:
    _check(clean_text("Question 3 (4 marks)\nText 1 — Nonfiction\nName: ............ (a) Outline...")
           == "Text 1 — Nonfiction\nName: (a) Outline...",
           "dot leaders / question header cleaning")
    _check(clean_text("===== PAGE 2 =====\n– 2 –\nPlease turn over\nBLANK PAGE") == "",
           "page furniture removal")
    _check(clean_text("Do NOT write in this area.\n(a) Explain why.") == "(a) Explain why.",
           "printed Do NOT write furniture removal")
    _check(clean_text("(a) Outline one reason.") == "(a) Outline one reason.",
           "genuine label must survive")
    _check(clean_text("............") == "", "dot leaders only")
    _check(clean_text("(continued)\nSection II — Reading (continued)\ncontinues on page 15") == "",
           "continued / page navigation removal")
    _check(clean_text("======== PAGE 3\nAllow about 1 hour for this section\nEnd of Question 21") == "",
           "wrapped page marker / timing / end-of-question removal")
    _check(clean_text("Do not write more than 400 words.") == "Do not write more than 400 words.",
           "genuine 'Do not write' instruction must survive")
    _check(clean_text("Page 3") == "", "page number furniture removal")
    _check(clean_text("Page") == "Page", "bare 'Page' is not a page marker")

    stacked = "Question 1 (2 marks) Question 2 (3 marks)\n(a) Explain."
    _check(clean_text(stacked) == "(a) Explain.", "stacked headers are all stripped")
    _check(clean_text(clean_text(stacked)) == clean_text(stacked),
           "stacked headers must be idempotent")

    _check(_has_placeholder({"questions": [{
        "parts": [], "body": [{"block_type": "text",
                               "content": {"text": "See exam paper for the full stem."}}]}]}),
        "placeholder detection")
    _check(_is_empty_bundle({"questions": []}), "bundle with no questions is empty")
    _check(_is_empty_bundle({"questions": [{
        "parts": [], "body": [{"block_type": "answer_area", "content": {"lines": 2}}]}]}),
        "answer_area-only bundle is empty")

    text0 = "Question 1 (2 marks)\nName: ............ (a) Outline..."
    payload = {
        "export_schema_version": 1,
        "course_id": "self-test",
        "course_name": "Self test",
        "questions": [{
            "question_id": "q1",
            "type_key": "short_answer",
            "marks": 2,
            "body": [
                {"block_type": "text", "content": {"text": text0}},
                {"block_type": "text", "content": {"text": "Please turn over"}},
            ],
            "parts": [],
        }],
    }
    with tempfile.TemporaryDirectory() as tmpdir:
        path = Path(tmpdir) / "2020-hsc-selftest.qbx"
        with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr("questions.json", json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
            z.writestr("assets/x.bin", b"\x00asset-bytes")

        first = normalise_bundle(path, write=True)
        _check(first["text_blocks_changed"] == 1,
               f"expected 1 changed block, got {first['text_blocks_changed']}")
        _check(first["chars_removed"] == len(text0) - len(clean_text(text0)),
               f"unexpected chars_removed {first['chars_removed']}")
        _check(first["blocks_emptied"] == 1,
               f"expected 1 emptied block, got {first['blocks_emptied']}")
        _check(first["answer_areas_added"] == 1,
               f"expected 1 answer area, got {first['answer_areas_added']}")
        _check(first["changed"] is True, "first pass must report a change")
        _check(first["emptied_blocks"] == ["Please turn over"],
               f"unexpected emptied_blocks {first['emptied_blocks']}")

        with zipfile.ZipFile(path) as z:
            _check(z.namelist() == ["questions.json", "assets/x.bin"],
                   f"zip member order changed: {z.namelist()}")
            _check(z.read("assets/x.bin") == b"\x00asset-bytes",
                   "non-questions member bytes changed")
            body = json.loads(z.read("questions.json"))["questions"][0]["body"]
        _check(body[0]["content"]["text"] == "Name: (a) Outline...",
               f"body block not cleaned: {body[0]['content']['text']!r}")
        _check(body[1]["content"]["text"] == "Please turn over",
               "furniture-only block must be kept verbatim")
        _check(body[-1]["block_type"] == "answer_area", "missing appended answer area")

        second = normalise_bundle(path, write=True)
        _check(second["changed"] is False,
               f"second pass must be idempotent, got {second}")
        _check(second["blocks_emptied"] == 1, "second pass must keep counting furniture-only blocks")


def _find_bundles(roots: list[Path]) -> list[Path]:
    found: dict[Path, None] = {}
    for root in roots:
        for p in sorted(root.rglob("20[0-9][0-9]-hsc-*.qbx")):
            found[p.resolve()] = None
    return sorted(found)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--root", action="append", metavar="PATH",
                    help="bundle tree to scan (repeatable; defaults to "
                         + ", ".join(DEFAULT_ROOTS) + ")")
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--write", action="store_true", help="rewrite bundles in place")
    mode.add_argument("--check", action="store_true",
                      help="exit 1 if any bundle would change (never writes)")
    ap.add_argument("--report", metavar="PATH", help="write a JSON report here")
    ap.add_argument("--self-test", action="store_true", help="run the cleaner checks")
    args = ap.parse_args(argv)

    if args.self_test and (args.write or args.check):
        ap.error("--self-test cannot be combined with --write/--check")

    if args.self_test:
        _self_test()
        print("self-test OK")
        return 0

    roots = [Path(r) if Path(r).is_absolute() else REPO_ROOT / r
             for r in (args.root or DEFAULT_ROOTS)]

    missing = [root for root in roots if not root.exists()]
    if missing:
        for root in missing:
            print(f"error: root not found: {root}", file=sys.stderr)
        return 1

    bundles = _find_bundles(roots)
    if not bundles:
        print(f"error: no 20xx-hsc-*.qbx bundles found under "
              f"{', '.join(r.as_posix() for r in roots)}", file=sys.stderr)
        return 1

    entries = []
    errors = []
    totals = {"text_blocks_changed": 0, "chars_removed": 0,
              "blocks_emptied": 0, "answer_areas_added": 0}
    changed_paths = []
    for path in bundles:
        try:
            counts = normalise_bundle(path, write=args.write)
        except Exception as exc:  # one bad bundle must not stop the sweep
            errors.append(f"{path.as_posix()}: {type(exc).__name__}: {exc}")
            continue
        entry = {"path": path.as_posix()}
        entry.update(counts)
        entries.append(entry)
        for key in totals:
            totals[key] += counts[key]
        if counts["changed"]:
            changed_paths.append(entry["path"])

    needs_manual = [e["path"] for e in entries if e["blocks_emptied"]]
    summary = {
        "bundle_count": len(entries),
        "changed_bundles": len(changed_paths),
        **totals,
        "changed_paths": changed_paths,
        "placeholder_paths": [e["path"] for e in entries if e["placeholder"]],
        "empty_bundle_paths": [e["path"] for e in entries if e["empty_bundle"]],
        "needs_manual": needs_manual,
        "emptied_paths": needs_manual,
        "errors": errors,
    }
    report = {
        "mode": "write" if args.write else "check" if args.check else "dry-run",
        "roots": [r.as_posix() for r in roots],
        "summary": summary,
        "bundles": entries,
    }

    if args.report:
        report_path = Path(args.report)
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n",
                               encoding="utf-8")

    print(f"{summary['bundle_count']} bundles, {summary['changed_bundles']} changed, "
          f"{summary['text_blocks_changed']} text blocks, "
          f"{summary['chars_removed']} chars removed, "
          f"{summary['blocks_emptied']} blocks emptied, "
          f"{summary['answer_areas_added']} answer areas added, "
          f"{len(summary['placeholder_paths'])} placeholders, "
          f"{len(summary['empty_bundle_paths'])} empty bundles, "
          f"{len(summary['needs_manual'])} need manual")
    for err in errors:
        print(f"error: {err}", file=sys.stderr)

    if errors:
        return 1
    if args.check and changed_paths:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
