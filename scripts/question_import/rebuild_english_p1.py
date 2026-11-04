"""Rebuild HSC English Advanced Paper 1 unseen texts as stimuli.

    python -X utf8 scripts/question_import/rebuild_english_p1.py --all
    python -X utf8 scripts/question_import/rebuild_english_p1.py --year 2021 --write

Extracts Section I's unseen texts from the source PDFs, stores one stimulus per
text, links Texts 1-5 to questions 1-5, and leaves only the question stem plus
an answer area in each question body. Paper 2 and later questions are never
touched. A dry run is the default; ``--write`` updates both bundle trees.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import zipfile
from pathlib import Path
from typing import Iterable

sys.path.insert(0, str(Path(__file__).resolve().parent))

import qbx_lib  # noqa: E402
from text_clean import clean_text  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ROOTS = ("imports", "frontend/public/templates/hsc")

# Year -> source PDF, bundle name, expected Paper 1 text count and question ids.
# 2020 and 2024 contain Paper 2 only, so they are listed but deliberately not
# rebuilt: the source PDF has no Paper 1 stimulus booklet.
YEAR_CONFIG = {
    2020: {
        "pdf": "exams/english-advanced/2020-hsc-english-advanced.pdf",
        "bundle": "2020-hsc-english-advanced.qbx",
        "expected_texts": 0,
        "available": False,
        "question_ids": {},
    },
    2021: {
        "pdf": "exams/english-advanced/2021-hsc-english-advanced.pdf",
        "bundle": "2021-hsc-english-advanced.qbx",
        "expected_texts": 5,
        "available": True,
        "question_ids": {n: f"ea2021{n:02d}" for n in range(1, 6)},
    },
    2022: {
        "pdf": "exams/english-advanced/2022-hsc-english-advanced.pdf",
        "bundle": "2022-hsc-english-advanced.qbx",
        "expected_texts": 6,
        "available": True,
        "question_ids": {n: f"ea2022{n:02d}" for n in range(1, 6)},
    },
    2023: {
        "pdf": "exams/english-advanced/2023-hsc-english-advanced.pdf",
        "bundle": "2023-hsc-english-advanced.qbx",
        "expected_texts": 5,
        "available": True,
        "question_ids": {n: f"ea2023{n:02d}" for n in range(1, 6)},
    },
    2024: {
        "pdf": "exams/english-advanced/2024-hsc-english-advanced.pdf",
        "bundle": "2024-hsc-english-advanced.qbx",
        "expected_texts": 0,
        "available": False,
        "question_ids": {},
    },
    2025: {
        "pdf": "exams/english-advanced/2025-hsc-english-advanced-paper-1.pdf",
        "bundle": "2025-hsc-english-advanced.qbx",
        "expected_texts": 5,
        "available": True,
        "question_ids": {n: f"ea2025{n:02d}" for n in range(1, 6)},
    },
}

# Texts that sit outside the Text 1-5 link map but are still named by a
# question. 2022 Question 5 covers both Text 5 and the blocked Text 6.
EXTRA_TEXT_QUESTIONS = {
    2022: {6: ("ea202205", "Photograph")},
}

# ---------------------------------------------------------------------------
# Source-text extraction
# ---------------------------------------------------------------------------

_HEADING = re.compile(r"^Text\s+(\d+)\s*[—–-]\s*(.+)$")
_CONTINUED = re.compile(r"^Text\s+(\d+)\s*\(\s*continued\s*\)$", re.IGNORECASE)
_DOT_RUN = re.compile(r"\.{4,}")

_FURNITURE = [re.compile(p, re.IGNORECASE) for p in (
    r"\d+",
    r"\d{4}\s+HIGHER SCHOOL CERTIFICATE EXAMINATION",
    r"HIGHER SCHOOL CERTIFICATE EXAMINATION",
    r"BLANK PAGE\.?",
    r"End of Text\s+\d+\.?",
    r"Text\s+\d+\s+continues? on page\s+\d+\.?",
    r"©.*",
    r"Reproduced with permission\b.*",
    r"Reprinted by permission\b.*",
    r"With kind permission\b.*",
    r"Every effort has been made\b.*",
    r"ISBN:.*",
    r"NSW Education Standards Authority\.?",
    r"[•·▪*]+",
    r"[–—−-]+",
    r"[–—−-]\s*\d+\s*[–—−-]",
)]

# Lines that begin a publisher's copyright credit rather than the unseen text.
_PUBLISHER_LINE = re.compile(
    r"^(?:Bloomsbury|Faber(?: and Faber)?|Penguin|Random House|"
    r"The Random House|Hachette|HarperCollins|Macmillan|Pan Macmillan|"
    r"Echo Publishing|Text Publishing|Allen & Unwin|"
    r"Victoria University Press|Oxford University Press|"
    r"Cambridge University Press|University of .+? Press)\b",
    re.IGNORECASE,
)

# Any line carrying one of these is a permission/copyright credit, never
# unseen-text prose. Matched by substring because the credit can sit after a
# title (e.g. "Lost in a good book ... Reproduced with permission ...").
_LEGAL_MARKERS = (
    "©",
    "reproduced with permission",
    "republished with permission",
    "reprinted by permission",
    "with kind permission",
    "every effort has been made",
    "all rights reserved",
    "used under license",
    "copyright agency",
    "copyright owner",
    "courtesy of",
)


def _is_legal(text: str) -> bool:
    lowered = text.lower()
    return any(marker in lowered for marker in _LEGAL_MARKERS)

# A text whose page is replaced by one of these notices has no extractable
# content. It is omitted, never reconstructed from the notice.
_BLOCKED = [re.compile(p, re.IGNORECASE) for p in (
    r"This material cannot be displayed\b.*",
    r"Due to copyright restrictions,?\s+this material\b.*",
    r"until permission has been obtained\.?",
    r"Please refer to the extract\b.*",
)]


def _is_furniture(line: str) -> bool:
    return any(p.fullmatch(line) for p in _FURNITURE)


def _is_blocked_marker(line: str) -> bool:
    return any(p.match(line) for p in _BLOCKED)


def _merge_drop_caps(paragraphs: list[list[str]]) -> list[list[str]]:
    """Rejoin a printed drop cap that PDF extraction left as its own line."""
    merged: list[list[str]] = []
    carry = ""
    for lines in paragraphs:
        if carry:
            lines = [carry + lines[0]] + lines[1:]
            carry = ""
        if len(lines) > 1 and len(lines[-1]) == 1 and lines[-1].isalpha():
            carry = lines.pop()
        if lines:
            merged.append(lines)
    if carry:
        merged.append([carry])
    return merged


def _merge_continuations(paragraphs: list[list[str]]) -> list[list[str]]:
    """Rejoin paragraphs the PDF split at a page/column boundary."""
    merged: list[list[str]] = []
    for lines in paragraphs:
        text = " ".join(lines)
        if merged:
            previous = " ".join(merged[-1])
            if (not re.search(r"[.!?…:;\"”’)]$", previous)
                    and text[:1].islower()):
                merged[-1].extend(lines)
                continue
        merged.append(lines)
    return merged


def texts_from_blocks(blocks: Iterable[str]) -> tuple[list[dict], list[str]]:
    """Turn flattened PDF blocks into texts with paragraph/line blocks.

    One block is one printed paragraph, so prose keeps its paragraph boundaries
    and poetry emits one text block per line. Returns ``([{number, title,
    blocks}], warnings)``. Texts replaced in the source by a copyright notice
    are still returned, carrying only that notice as their stimulus content.
    """
    texts: list[dict] = []
    warnings: list[str] = []
    current: dict | None = None

    def flush(paragraph: list[str]) -> None:
        if current is None or current["_blocked"] or not paragraph:
            return
        if current["_poem"]:
            current["_lines"].extend(paragraph)
        else:
            current["_paragraphs"].append(paragraph)

    for raw in blocks:
        if not isinstance(raw, str):
            continue
        # A headingless run of prose before any Text heading is ignored.
        marker_lines = [line.strip() for line in raw.splitlines()
                        if _is_blocked_marker(line.strip())]
        if current is not None and marker_lines:
            flush(paragraph)
            paragraph = []
            current["_blocked"] = True
            for raw_line in raw.splitlines():
                line = re.sub(r"[ \t\u00a0]+", " ", raw_line).strip()
                if (line and len(line) > 2
                        and not re.fullmatch(r"[–—−-]+\s*\d+\s*[–—−-]+", line)
                        and line not in current["_notice"]):
                    current["_notice"].append(line)
            # A block that only opens the notice may also carry following,
            # non-blocked lines; fall through only if we did not set the flag.
            continue
        if current is not None and current["_blocked"]:
            new_heading = False
            for raw_line in raw.splitlines():
                probe = re.sub(r"[ \t\u00a0]+", " ", raw_line).strip()
                match = _HEADING.match(probe)
                if match and len(probe) < 120 and not _DOT_RUN.search(probe):
                    new_heading = True
                    break
            if new_heading:
                current["_blocked"] = False
                # fall through; the normal heading logic below handles it
            else:
                for raw_line in raw.splitlines():
                    line = re.sub(r"[ \t\u00a0]+", " ", raw_line).strip()
                    if not line:
                        continue
                    if len(line) <= 2:
                        continue
                    if re.fullmatch(r"[–—−-]+\s*\d+\s*[–—−-]+", line):
                        continue
                    if line not in current["_notice"]:
                        current["_notice"].append(line)
                continue
        if _is_legal(raw):
            continue
        paragraph: list[str] = []
        for raw_line in raw.splitlines():
            line = re.sub(r"[ \t\u00a0]+", " ", raw_line).strip()
            if not line:
                continue
            # Some PDFs keep several printed paragraphs in one block and mark
            # each new paragraph with a leading space.
            if (paragraph and current is not None and not current["_poem"]
                    and raw_line[:1].isspace()):
                flush(paragraph)
                paragraph = []

            if _CONTINUED.match(line):
                flush(paragraph)
                paragraph = []
                continue

            match = _HEADING.match(line)
            if match and len(line) < 120 and not _DOT_RUN.search(line):
                flush(paragraph)
                paragraph = []
                title = re.sub(r"\s+", " ", match.group(2)).strip()
                number = int(match.group(1))
                if any(t["number"] == number for t in texts):
                    warnings.append(
                        f"Text {number} appears twice in the source; kept both.")
                current = {
                    "number": number,
                    "title": title,
                    "_poem": "poem" in title.lower(),
                    "_paragraphs": [],
                    "_lines": [],
                    "_notice": [],
                    "_blocked": False,
                }
                texts.append(current)
                continue

            if current is None:
                continue
            if _is_blocked_marker(line):
                current["_blocked"] = True
                if line not in current["_notice"]:
                    current["_notice"].append(line)
                paragraph = []
                continue
            if (_DOT_RUN.search(line) or _is_furniture(line)
                    or _is_legal(line) or _PUBLISHER_LINE.match(line)):
                continue
            paragraph.append(line)
        flush(paragraph)

    extracted: list[dict] = []
    for entry in texts:
        label = f"Text {entry['number']} — {entry['title']}"
        if entry["_notice"]:
            output_blocks = [qbx_lib.text(line) for line in entry["_notice"]]
            extracted.append({
                "number": entry["number"],
                "title": entry["title"],
                "blocks": output_blocks,
            })
            warnings.append(f"{label}: copyright-restricted source PDF notice preserved as a "
                            f"reference (not the restricted text).")
            continue
        if entry["_blocked"]:
            output_blocks = [qbx_lib.text(
                "This source is not displayed in the original HSC examination "
                "due to copyright restrictions.")]
            extracted.append({
                "number": entry["number"],
                "title": entry["title"],
                "blocks": output_blocks,
            })
            warnings.append(f"{label} is copyright-restricted in the source PDF; "
                            f"only the publication reference was retained.")
            continue
        if entry["_poem"]:
            output_blocks = [qbx_lib.text(line) for line in entry["_lines"]]
        else:
            output_blocks = [qbx_lib.text(" ".join(p))
                             for p in _merge_continuations(
                                 _merge_drop_caps(entry["_paragraphs"]))]
        if not output_blocks:
            warnings.append(f"{label} has no extractable content; omitted.")
            continue
        extracted.append({
            "number": entry["number"],
            "title": entry["title"],
            "blocks": output_blocks,
        })
    return extracted, warnings




def extract_texts(pdf_path: Path) -> tuple[list[dict] | None, list[str]]:
    """Extract Section I texts from *pdf_path*; ``None`` means no Paper 1."""
    try:
        import pymupdf
    except ImportError:  # pragma: no cover - environment guard
        return None, [f"{pdf_path.name}: pymupdf is not installed"]

    if not pdf_path.exists():
        return None, [f"{pdf_path.name}: source PDF not found"]

    document = pymupdf.open(pdf_path)
    start = None
    for index, page in enumerate(document):
        # The cover page mentions "A Stimulus Booklet is provided"; only the
        # booklet cover carries the heading on its own line.
        if any(line.strip() == "Stimulus Booklet"
               for line in page.get_text().splitlines()):
            start = index
            break
    if start is None:
        return None, [f"{pdf_path.name}: no Stimulus Booklet page "
                      f"(this PDF is Paper 2 only)"]

    blocks: list[str] = []
    for page in document[start + 1:]:
        for block in page.get_text("blocks"):
            blocks.append(str(block[4] or ""))
    return texts_from_blocks(blocks)


# ---------------------------------------------------------------------------
# Question-body rewrite
# ---------------------------------------------------------------------------

_STEM_FURNITURE = [re.compile(p, re.IGNORECASE) for p in (
    r"\d+",
    r"\d{4}\s+HIGHER SCHOOL CERTIFICATE EXAMINATION",
    r"HIGHER SCHOOL CERTIFICATE EXAMINATION",
    r"English Advanced",
    r"Paper 1\b.*",
    r"Experiences",
    r"Section I\b.*",
    r"Attempt Questions?\b.*",
    r"Answer the questions\b.*",
    r"Your answer will be assessed\b.*",
    r"[●•·▪].*",
    r"If you need additional space\b.*",
    r"Please turn over\.?",
    r"End of (?:Question|paper)\b.*",
    r"[–—−-]\s*\d+\s*[–—−-]",
    r"=+\s*PAGE\b.*",
    r"BLANK PAGE\.?",
    r"©.*",
    r"NSW Education Standards Authority\.?",
    r"Centre Number",
    r"Student Number",
    r"Page",
)]

_TEXT_LINE = re.compile(r"^Text\s+\d+\s*[—–-]\s*.*$")
_TEXT_CONTINUED = re.compile(r"^Text\s+\d+\s*\(\s*continued\s*\)$",
                             re.IGNORECASE)


def stem_from_text(raw: str) -> str:
    """Keep the question stem, dropping printed headers and page furniture."""
    lines: list[str] = []
    for line in clean_text(raw).splitlines():
        line = re.sub(r"\s+", " ", line).strip()
        if not line:
            continue
        if _TEXT_LINE.match(line) or _TEXT_CONTINUED.match(line):
            continue
        if any(p.fullmatch(line) for p in _STEM_FURNITURE):
            if lines:
                break
            continue
        if len(line) < 3 or not any(ch.isalpha() for ch in line):
            if lines:
                break
            continue
        lines.append(line)
    return " ".join(lines).strip()


def _text_blocks(question: dict) -> list[dict]:
    return [b for b in question.get("body") or []
            if isinstance(b, dict) and b.get("block_type") in ("text", "heading")]


def _question_text(question: dict) -> str:
    return "\n".join(str((b.get("content") or {}).get("text", ""))
                     for b in _text_blocks(question))


def _text_type(question: dict, number: int) -> str | None:
    match = re.search(rf"Text\s+{number}\s*[—–-]\s*(.+)", _question_text(question))
    return re.sub(r"\s+", " ", match.group(1)).strip() if match else None


def rewrite_body(question: dict) -> bool:
    """Reduce a Paper 1 question body to its stem plus any non-text blocks."""
    raw = _question_text(question)
    stem = stem_from_text(raw)
    if not stem:
        return False
    kept = [b for b in question.get("body") or []
            if isinstance(b, dict) and b.get("block_type") not in ("text", "heading")]
    new_body = [qbx_lib.text(stem)] + kept
    changed = new_body != question.get("body")
    question["body"] = new_body
    return changed


# ---------------------------------------------------------------------------
# Bundle rebuild
# ---------------------------------------------------------------------------

def _question_id_for(year, number, config):
    qid = config["question_ids"].get(number)
    if qid is None:
        extra = EXTRA_TEXT_QUESTIONS.get(year, {}).get(number)
        if extra:
            qid = extra[0]
    return qid

def _missing_note(label: str) -> str:
    return (f"{label} is unavailable in the source PDF due to copyright "
            f"restrictions.")
def apply_rebuild(payload: dict, year: int, texts: list[dict],
                  config: dict, warnings: list[str]) -> dict:
    """Mutate *payload* with stimuli, links, rewritten bodies and notes."""
    questions = [q for q in payload.get("questions") or []
                 if isinstance(q, dict)]
    question_by_id = {str(q.get("question_id")): q for q in questions}
    stats = {
        "stimuli": 0,
        "links": 0,
        "rewritten": [],
        "notes_added": [],
        "missing": [],
    }

    stimuli: list[dict] = []
    links: list[dict] = []
    present: set[int] = set()
    for entry in texts:
        number = entry["number"]
        title = entry["title"]
        label = f"Text {number} — {title}"
        question_id = _question_id_for(year, number, config)
        if question_id is None:
            warnings.append(f"{year}: {label} has no Paper 1 question mapping; "
                            f"stimulus omitted")
            continue
        if question_id not in question_by_id:
            warnings.append(f"{year}: {label} points at missing question "
                            f"{question_id}; link skipped")
            continue
        if number in present:
            warnings.append(f"{year}: duplicate {label}; only the first is used")
            continue
        stimulus_id = f"stim-{year}-t{number}"
        stimuli.append({
            "stimulus_id": stimulus_id,
            "title": label,
            "blocks": entry["blocks"],
        })
        links.append({"question_id": question_id, "stimulus_id": stimulus_id})
        present.add(number)

    # Missing texts inside the Text 1-5 range, plus explicitly named extras.
    missing: list[tuple[int, str, str]] = []
    for number in range(1, 6):
        if number in present:
            continue
        question_id = _question_id_for(year, number, config)
        question = question_by_id.get(question_id or "")
        if not question:
            continue
        base_title = (EXTRA_TEXT_QUESTIONS.get(year, {}).get(number, (None, None))[1]
                      if number in EXTRA_TEXT_QUESTIONS.get(year, {})
                      else (_text_type(question, number) or 'text'))
        label = f"Text {number} — {base_title}"
        missing.append((number, label, question_id))
    for number, (question_id, title) in EXTRA_TEXT_QUESTIONS.get(year, {}).items():
        if number in present or question_id not in question_by_id:
            continue
        missing.append((number, f"Text {number} — {title}", question_id))

    for number, label, question_id in missing:
        question = question_by_id[question_id]
        note = _missing_note(label)
        if not question.get("notes"):
            question["notes"] = note
            stats["notes_added"].append(question_id)
        stats["missing"].append({
            "number": number,
            "title": label,
            "question_id": question_id,
        })

    for number in sorted(present):
        question_id = _question_id_for(year, number, config)
        question = question_by_id.get(question_id or "")
        if isinstance(question, dict) and isinstance(question.get("notes"), str) and \
           "is unavailable in the source PDF due to copyright restrictions." in question["notes"]:
            question["notes"] = None

    for question_id in config["question_ids"].values():
        question = question_by_id.get(question_id)
        if not question:
            warnings.append(f"{year}: expected question {question_id} is missing")
            continue
        if rewrite_body(question):
            stats["rewritten"].append(question_id)
        qbx_lib.ensure_answer_areas(question)

    # Validate links before they reach the bundle.
    stimulus_ids = {s["stimulus_id"] for s in stimuli}
    valid_links: list[dict] = []
    seen_questions: set[str] = set()
    seen_pairs: set[tuple[str, str]] = set()
    for link in links:
        question_id = link["question_id"]
        stimulus_id = link["stimulus_id"]
        pair = (question_id, stimulus_id)
        if question_id not in question_by_id:
            warnings.append(f"{year}: dangling question link {question_id}; skipped")
            continue
        if stimulus_id not in stimulus_ids:
            warnings.append(f"{year}: dangling stimulus link {stimulus_id}; skipped")
            continue
        if pair in seen_pairs:
            continue
        valid_links.append(link)
        seen_pairs.add(pair)

    payload["stimuli"] = stimuli
    payload["question_stimuli"] = valid_links
    stats["stimuli"] = len(stimuli)
    stats["links"] = len(valid_links)
    return stats


def _bundle_path(root: Path, bundle: str) -> Path:
    """Find a bundle under either tree layout, or under a flat root."""
    candidates = (
        root / "english-advanced" / "hsc" / bundle,
        root / "english-advanced" / bundle,
        root / "hsc" / "english-advanced" / bundle,
        root / bundle,
    )
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return candidates[0]


def _load_payload(path: Path) -> dict:
    with zipfile.ZipFile(path) as bundle:
        if "questions.json" not in bundle.namelist():
            raise ValueError(f"{path}: no questions.json")
        return json.loads(bundle.read("questions.json").decode("utf-8"))


def _write_payload(path: Path, payload: dict) -> None:
    data = (json.dumps(payload, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    tmp = path.with_name(path.name + ".tmp")
    with zipfile.ZipFile(path) as source:
        infos = source.infolist()
        with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as target:
            target.comment = source.comment
            for info in infos:
                target.writestr(info, data if info.filename == "questions.json"
                                else source.read(info))
    os.replace(tmp, path)


def run_year(year: int, roots: list[Path], write: bool) -> dict:
    config = YEAR_CONFIG[year]
    stats = {
        "year": year,
        "pdf": config["pdf"],
        "bundle": config["bundle"],
        "skipped": False,
        "texts": [],
        "stimuli": 0,
        "links": 0,
        "rewritten": [],
        "notes_added": [],
        "missing": [],
        "warnings": [],
        "written": [],
    }
    if not config.get("available", True):
        stats["skipped"] = True
        stats["warnings"].append(
            f"{year}: Paper 1 source is absent (PDF contains Paper 2 only); "
            f"skipped, no bundle changes")
        return stats

    texts, warnings = extract_texts(REPO_ROOT / config["pdf"])
    stats["warnings"].extend(warnings)
    if texts is None:
        stats["skipped"] = True
        return stats
    if len(texts) != config["expected_texts"]:
        stats["warnings"].append(
            f"{year}: extracted {len(texts)} texts, expected "
            f"{config['expected_texts']}")

    paths = [_bundle_path(root, config["bundle"]) for root in roots]
    missing_paths = [p for p in paths if not p.exists()]
    if missing_paths:
        for path in missing_paths:
            stats["warnings"].append(f"{year}: bundle not found: {path}")
        return stats

    payloads = [_load_payload(path) for path in paths]
    for path, payload in zip(paths[1:], payloads[1:]):
        if payload != payloads[0]:
            stats["warnings"].append(
                f"{year}: {path} differs from {paths[0]}; "
                f"the first payload is written to both")
    payload = payloads[0]

    result = apply_rebuild(payload, year, texts, config, stats["warnings"])
    stats.update(result)
    stats["texts"] = [
        {"number": t["number"], "title": t["title"], "blocks": len(t["blocks"])}
        for t in texts
    ]

    if write:
        for path in paths:
            _write_payload(path, payload)
            stats["written"].append(str(path))
    return stats


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def _self_test() -> None:
    blocks = [
        ("NSW Education Standards Authority\n2021\nHIGHER SCHOOL CERTIFICATE "
         "EXAMINATION\nA Stimulus Booklet is provided\nStimulus Booklet\n"
         "Section I\nPage\nText 1 – Poem ....... 2\n"
         "Text 2 — Prose extract ....... 3"),
        "Text 1 — Poem",
        "First line\nSecond line",
        "Third line",
        "A. POET",
        "Reproduced with permission of Example Press",
        "© 2021 NSW Education Standards Authority",
        "Text 1 (continued)",
        "Fourth line",
        "– 3 –",
        "Text 2 — Prose extract",
        "One sentence that\ncontinues on this line.",
        "© Example Author",
        "End of Text 2",
    ]
    texts, warnings = texts_from_blocks(blocks)
    _check(len(texts) == 2, f"expected 2 texts, got {len(texts)}")
    _check(warnings == [], f"unexpected warnings: {warnings}")
    poem, prose = texts
    _check(poem["number"] == 1 and "Poem" in poem["title"], "poem heading")
    _check([b["content"]["text"] for b in poem["blocks"]]
           == ["First line", "Second line", "Third line", "A. POET", "Fourth line"],
           f"poem lines: {poem['blocks']}")
    _check(len(prose["blocks"]) == 1, f"prose paragraphs: {prose['blocks']}")
    _check(prose["blocks"][0]["content"]["text"]
           == "One sentence that continues on this line.", "prose join")
    for entry in texts:
        for block in entry["blocks"]:
            value = block["content"]["text"]
            for banned in ("permission", "©", "– 3 –", "End of Text"):
                _check(banned not in value, f"{banned!r} leaked into {value!r}")

    _blocked_result, _blocked_warnings = texts_from_blocks(
        ["Text 1 — Poem", "This material cannot be displayed\ndue to copyright issues."])
    _check(len(_blocked_result) == 1
           and [b["content"]["text"] for b in _blocked_result[0]["blocks"]]
               == ["This material cannot be displayed",
                   "due to copyright issues."],
           "copyright notice is preserved as a reference block")

    body = ("Question 1 (3 marks)\nText 1 — Poem\nWhy does the poem matter?\n"
            "................................................................................................................................\n"
            "2021\nHIGHER SCHOOL CERTIFICATE EXAMINATION\nEnglish Advanced")
    _check(stem_from_text(body) == "Why does the poem matter?",
           f"stem extraction: {stem_from_text(body)!r}")
    _check(stem_from_text("How does the writer shape\nmeaning for the reader?")
           == "How does the writer shape meaning for the reader?",
           "wrapped stem join")

    payload = {
        "export_schema_version": 1,
        "course_id": "self-test",
        "course_name": "Self test",
        "questions": [
            {"question_id": f"ea2021{n:02d}", "marks": n, "body": [
                {"block_type": "text", "content": {
                    "text": f"Question {n} ({n} marks)\nText {n} — Poem\n"
                            f"Why is text {n} important?\n......\n2021"}},
            ]} for n in range(1, 6)
        ] + [
            {"question_id": "ea202106", "marks": 20,
             "body": [{"block_type": "text", "content": {"text": "Essay."}}]},
        ],
    }
    config = {"question_ids": {n: f"ea2021{n:02d}" for n in range(1, 6)}}
    sample = [{"number": n, "title": "Poem",
               "blocks": [qbx_lib.text(f"line {n}")]} for n in (1, 2)]
    warn: list[str] = []
    result = apply_rebuild(payload, 2021, sample, config, warn)
    _check(result["stimuli"] == 2 and result["links"] == 2, "stimuli and links")
    _check(result["rewritten"][:2] == ["ea202101", "ea202102"],
           f"bodies rewritten: {result['rewritten']}")
    _check(len([q for q in payload["questions"] if q["question_id"] == "ea202106"][0]
               ["body"]) == 1, "essay body untouched")
    _check(payload["questions"][0]["body"][0]["content"]["text"]
           == "Why is text 1 important?", "question stem kept")

    with __import__("tempfile").TemporaryDirectory() as tmpdir:
        path = Path(tmpdir) / "self.qbx"
        with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as bundle:
            bundle.writestr("questions.json", json.dumps(payload, ensure_ascii=False))
            bundle.writestr("assets/x.bin", b"\x00asset-bytes")
        _write_payload(path, payload)
        with zipfile.ZipFile(path) as bundle:
            _check(bundle.read("assets/x.bin") == b"\x00asset-bytes",
                   "non-questions zip member changed")
            stored = json.loads(bundle.read("questions.json"))
        _check(len(stored["stimuli"]) == 2, "stimuli written")
        _check(len(stored["question_stimuli"]) == 2, "links written")
        again = apply_rebuild(stored, 2021, sample, config, [])
        _check(again["rewritten"] == [], "second pass must rewrite nothing")


def _print_year(stats: dict) -> None:
    year = stats["year"]
    if stats["skipped"]:
        print(f"{year}: skipped")
    else:
        text_bits = ", ".join(
            f"Text {t['number']} ({t['title']}): {t['blocks']} blocks"
            for t in stats["texts"]) or "none"
        print(f"{year}: {stats['stimuli']} stimuli; {text_bits}")
        print(f"  links: {stats['links']}  "
              f"questions rewritten: {len(stats['rewritten'])}  "
              f"notes added: {len(stats['notes_added'])}")
    for missing in stats["missing"]:
        print(f"  MISSING {missing['title']} ({missing['question_id']})")
    for warning in stats["warnings"]:
        print(f"  warning: {warning}")
    for path in stats["written"]:
        print(f"  wrote: {path}")


def main(argv=None) -> int:
    qbx_lib.enable_utf8_stdout()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--year", type=int, action="append", metavar="YEAR",
                        help="year to rebuild (repeatable)")
    parser.add_argument("--all", action="store_true", help="rebuild every configured year")
    parser.add_argument("--write", action="store_true",
                        help="rewrite both bundle trees (default: dry run)")
    parser.add_argument("--root", action="append", metavar="PATH",
                        help="bundle tree (repeatable; defaults to "
                             + ", ".join(DEFAULT_ROOTS) + ")")
    parser.add_argument("--self-test", action="store_true",
                        help="run the extractor/rewrite checks")
    args = parser.parse_args(argv)

    if args.self_test:
        _self_test()
        print("self-test OK")
        return 0

    years = args.year or (list(YEAR_CONFIG) if args.all else [])
    if not years:
        years = list(YEAR_CONFIG)
    unknown = [y for y in years if y not in YEAR_CONFIG]
    if unknown:
        parser.error(f"unknown year(s): {', '.join(map(str, unknown))}")

    roots = [Path(r) if Path(r).is_absolute() else REPO_ROOT / r
             for r in (args.root or DEFAULT_ROOTS)]
    missing_roots = [root for root in roots if not root.exists()]
    if missing_roots:
        for root in missing_roots:
            print(f"error: root not found: {root}", file=sys.stderr)
        return 1

    all_stats = [run_year(year, roots, args.write) for year in years]
    for stats in all_stats:
        _print_year(stats)

    stimulus_total = sum(s["stimuli"] for s in all_stats)
    link_total = sum(s["links"] for s in all_stats)
    rewritten_total = sum(len(s["rewritten"]) for s in all_stats)
    warning_total = sum(len(s["warnings"]) for s in all_stats)
    print(f"\n{years} -> {stimulus_total} stimuli, {link_total} links, "
          f"{rewritten_total} questions rewritten, {warning_total} warnings"
          if len(years) <= 6 else
          f"\n{len(years)} years -> {stimulus_total} stimuli, {link_total} links, "
          f"{rewritten_total} questions rewritten, {warning_total} warnings")
    if not args.write:
        print("dry run: no bundle written (pass --write to apply)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
