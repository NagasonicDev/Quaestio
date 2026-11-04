"""Remove printed page furniture from question text.

The bundles were converted from PDFs, so question bodies still carry the
paper's typography: dot leaders, ``Question N (M marks)`` headers, page
markers and writing-booklet instructions. ``clean_text`` strips those while
leaving genuine lines (labels, options, prose) untouched.

``clean_text`` may return ``""`` when a block held nothing but furniture. The
caller (the bundle walk) keeps the original block in that case -- an empty
text block would fail validation.
"""

from __future__ import annotations

import re

# Dot leaders: any run long enough to be a printed rule, not an ellipsis.
_DOT_RUN = re.compile(r"\.{5,}")

# "Question 3 (4 marks)" and the placeholder spelling
# "Question 1 (1 mark), Section I, 2020 HSC Mathematics Standard 1. ..."
_QUESTION_HEADER = re.compile(
    r"^\s*Question\s+\d+\b"
    r"(?:\s*\(\s*\d+(?:\.\d+)?\s*marks?\s*\))?"
    r"(?:\s*,\s*Section\s+[IVXLC]+\b\.?)?",
    re.IGNORECASE,
)

# Every pattern is matched against a whole (whitespace-normalised) line.
# Beyond the required set below, the variants here are whole-line running
# headers / page-navigation instructions seen in the converted papers; none of
# them can contain question text.
_FURNITURE = [re.compile(p, re.IGNORECASE) for p in (
    r"=+\s*PAGE\b.*",
    r"[–—−-]\s*\d+\s*[–—−-]",
    r"Please turn over\.?",
    r"BLANK PAGE\.?",
    r"End of paper\.?",
    r"End of (?:Question\s+\d+|Section\s+[IVX]+)\.?",
    r"^(?:©|@)\s*\d{4}\s*NSW Education Standards Authority\.?$",
    r"^NSW Education Standards Authority\.?$",
    r"^(?:.*\s)?(?:Student|Centre) Number\s*:?\.?$",
    r"^Office Use Only\b.*",
    r"Question attempted\b.*",
    r"If you use this space\b.*",
    r"If you (?:need|require|have used)\b.*(?:space|booklet|lines|page).*",
    r"(?:Extra\s+)?writing booklets? are available\.?",
    r"Answer (?:the question|parts?\b).*Writing Booklet.*",
    r"of the question on pages?\b.*Writing Booklet.*",
    r"Attempt Questions?\b.*",
    r"Allow about\b.*",
    r"You may now proceed to Section\b.*",
    r".*\(\s*continued\s*\)\.?",
    r".*\bcontinues? on page\s+\d+\s*\.?",
    r"Section\s+[IVX]+\.?",
    r"\d+(?:\.\d+)?\s*marks?\.?",
    r"[•·▪]",
    r"_{3,}",
    r"Page\s+\d+\b.*",
)] + [
    # Printed furniture is upper-case; "Do not write more than 400 words." is
    # genuine question text, so this one is deliberately case-sensitive.
    re.compile(r"Do NOT write in (?:this|the) (?:area|space|booklet)\b.*"),
]

# Printed furniture is short. A merged PDF line can hold an entire extended
# response, so never let a keyword match swallow a long line of question text.
_MAX_FURNITURE_LEN = 200


def _is_furniture(line: str) -> bool:
    if len(line) > _MAX_FURNITURE_LEN:
        return False
    return any(p.fullmatch(line) for p in _FURNITURE)


def clean_text(text: str) -> str:
    """Strip printed furniture from one text block.

    Returns ``""`` when nothing genuine is left; callers decide whether to keep
    the original block.
    """
    if not isinstance(text, str):
        return text
    # Replace leaders before splitting so "Name: ....." becomes "Name: ".
    text = _DOT_RUN.sub(" ", text)
    lines = []
    for raw in text.splitlines():
        line = re.sub(r"[ \t\u00a0]+", " ", raw).strip()
        # Merged PDFs can stack several headers on one line; strip until the
        # line stops changing so a second clean is a no-op.
        while True:
            stripped = _QUESTION_HEADER.sub("", line).lstrip(" ,;:").strip()
            if stripped == line:
                break
            line = stripped
        if not line or _is_furniture(line):
            continue
        lines.append(line)
    return "\n".join(lines)
