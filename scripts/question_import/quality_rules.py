"""Quality rules shared by the builder, the audit and the skill generator.

These are the defects that survive a structural build because nothing in the
format rejects them: copied page furniture, printed question headers, dot
leaders, placeholder bodies that point at the exam paper, and written-response
leaves with no answer space. Importers must never ship them again.
"""
from __future__ import annotations

import re

# A printed header, optionally followed by marks and a section label.
_HEADER = re.compile(
    r"(?i)^\s*question\s+\d+\s*(?:\([^)]{0,40}?marks?\))?"
    r"\s*(?:,?\s*section\s+[ivx]+)?(?:\s|$)")

_DOT_LEADER = re.compile(r"\.{5,}")

_PLACEHOLDER = re.compile(r"(?i)\b(?:see|refer to)\s+(?:the\s+)?exam\s+paper\b")

_PAGE_MARKER = re.compile(r"(?i)={3,}\s*page\s+\d+\s*={3,}")

# Whole lines that are page furniture, never question text.
_FURNITURE = [
    re.compile(r"(?i)^do not write in (?:this|the) (?:area|space|booklet)\b.*$"),
    re.compile(r"(?i)^office use only\b.*$"),
    re.compile(r"(?i)^please turn over$"),
    re.compile(r"(?i)^blank page$"),
    re.compile(r"(?i)^this page (?:is )?intentionally left blank$"),
    re.compile(r"(?i)^©\s*\d{4}\s*nsw education standards authority$"),
    re.compile(r"(?i)^student (?:number|id)$"),
    re.compile(r"(?i)^centre (?:number|id)$"),
    re.compile(r"(?i)^higher school certificate examination$"),
    re.compile(r"(?i)^end of paper$"),
    re.compile(r"(?i)^question attempted$"),
    re.compile(r"(?i)^if you use this space,? clearly indicate which question you are answering\.?$"),
    re.compile(r"(?i)^extra writing booklets are available\.?$"),
    re.compile(r"(?i)^answer the question in the .*writing booklet.*$"),
    re.compile(r"(?i)^allow about \d+ minutes for this section\.?$"),
    re.compile(r"(?i)^attempt questions? \d+.*$"),
    re.compile(r"(?i)^total marks:?.*$"),
    re.compile(r"(?i)^(?:reading|working) time:?.*$"),
    re.compile(r"^[-–—]\s*\d+\s*[-–—]$"),
]


def text_problems(text: str) -> list[str]:
    """Return human-readable defects found in one text/heading block."""
    text = str(text or "")
    problems: list[str] = []
    if _HEADER.match(text):
        problems.append("copied printed question header")
    if _DOT_LEADER.search(text):
        problems.append("dot-leader answer line")
    if _PAGE_MARKER.search(text):
        problems.append("page marker")
    if _PLACEHOLDER.search(text):
        problems.append("placeholder body that refers to the exam paper")
    for line in text.splitlines():
        stripped = line.strip()
        if stripped and any(p.match(stripped) for p in _FURNITURE):
            problems.append(f"page furniture: {stripped[:80]!r}")
    return problems


def has_answer_area(body) -> bool:
    return any(isinstance(b, dict) and b.get("block_type") == "answer_area"
               for b in body or [])


MAX_BODY_CHARS = 1200


def body_char_count(body) -> int:
    """Characters of inline text in a body; long source text belongs in a stimulus."""
    return len("\n".join(
        str((b.get("content") or {}).get("text", ""))
        for b in body or []
        if isinstance(b, dict) and b.get("block_type") in ("text", "heading")))


def self_test() -> None:
    """Fail loudly if a rule stops catching its defect."""
    bad = [
        "Question 12 (4 marks) Explain why the rate changed.",
        "Name: ............",
        "===== PAGE 3 =====",
        "Please turn over",
        "Do NOT write in this area.",
        "Office Use Only – Do NOT write anything below this line.",
        "– 7 –",
        "See exam paper for the full question.",
    ]
    for text in bad:
        assert text_problems(text), f"quality rule missed {text!r}"
    good = [
        "Explain why the rate changed. (4 marks)",
        "Use the graph to compare the two rates.",
        "The ellipsis ... is part of the quotation.",
        "Questioning the source is expected.",
    ]
    for text in good:
        assert not text_problems(text), f"quality rule false-positive on {text!r}"
    assert has_answer_area([{"block_type": "answer_area", "content": {"lines": 4}}])
    assert not has_answer_area([{"block_type": "text", "content": {"text": "x"}}])
    assert body_char_count([{"block_type": "text", "content": {"text": "x" * 1201}}]) > MAX_BODY_CHARS


if __name__ == "__main__":
    self_test()
    print("quality rules self-test OK")
