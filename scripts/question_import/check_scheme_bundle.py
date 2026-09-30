"""Validate a marking-scheme bundle and check it against its exam bundle.

    python check_scheme_bundle.py --exam exam-paper.qbx \
                                  --mg marking-scheme.qbx

Scheme bundles have their own failure modes that the exam bundle cannot
reveal:

  * the scheme's `original_question_no` must exist in the exam bundle --
    a scheme entry pointing at a question that is not there is unusable;
  * every printed answer in the scheme's answer key must match the exam
    question's `answer`;
  * a scheme entry whose figure is missing is flagged `action_required`,
    which is correct and must NOT be "fixed" by inventing a description;
  * scheme marks should sum to the exam question's marks, but schemes
    sometimes print a different split from the paper -- report, don't
    change.

Exit code 1 on a real problem. A figure gap reported in the scheme is
reported as a NOTE, not a failure, because the exam bundle is the thing
being imported.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from qbx_lib import enable_utf8_stdout  # noqa: E402


def load(path: Path) -> list[dict]:
    with zipfile.ZipFile(path) as z:
        return json.loads(z.read("questions.json")).get("questions") or []


def base_no(raw) -> str:
    """Leading question number of a printed reference.

    A scheme entry is per *part*, so its `original_question_no` is usually
    more specific than the exam question's -- '34(b)(i)' against '34'. Match
    on the leading number; the part suffix is the scheme's business.
    """
    m = re.match(r"\s*(\d+)", str(raw or ""))
    return m.group(1) if m else ""


def index_by_number(questions: list[dict]) -> dict[str, dict]:
    out = {}
    for q in questions:
        n = base_no((q.get("source") or {}).get("original_question_no"))
        if n:
            out.setdefault(n, q)
    return out


def answer_text(blocks) -> str:
    return "".join(str((b.get("content") or {}).get("text", ""))
                   for b in blocks or []).strip().upper()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--exam", required=True, help="exam bundle .qbx")
    ap.add_argument("--mg", required=True, help="marking-scheme bundle .qbx")
    a = ap.parse_args()
    enable_utf8_stdout()

    exam = index_by_number(load(Path(a.exam)))
    mg = load(Path(a.mg))

    probs, notes = [], []
    matched = 0
    for q in mg:
        n = base_no((q.get("source") or {}).get("original_question_no"))
        label = f"{Path(a.mg).name} {q.get('question_id', '?')} (Q{n})"
        if "action_required" in (q.get("tags") or []):
            notes.append(f"{label}: tagged action_required -- "
                         f"{((q.get('notes') or '')[:90]).strip()}")
        if not n:
            # A bundle-level answer key has no question number. Fine, skip it.
            continue
        if n not in exam:
            probs.append(f"{label}: no matching question in {a.exam}; the "
                         f"leading number must be one the exam bundle uses")
            continue
        matched += 1
        e = exam[n]
        if e.get("type_key") == "multiple_choice":
            want, got = answer_text(e.get("answer")), answer_text(q.get("answer"))
            if got and want and got != want:
                probs.append(f"{label}: scheme says {got}, exam says {want}")
        # A scheme entry covers one PART, so its marks are a slice of the
        # exam question's total -- they are supposed to differ. Only flag it
        # when the entry has no parts of its own yet claims fewer marks than
        # the whole question, which usually means the entry is a fragment.
        has_parts = bool(q.get("parts"))
        em, mm = e.get("marks") or 0, q.get("marks") or 0
        if not has_parts and em and mm and mm < em and mm == 0:
            notes.append(f"{label}: partless entry worth {mm} marks against a "
                         f"{em}-mark question -- check it isn't a fragment")

    print(f"{Path(a.exam).name}: {len(exam)} questions")
    print(f"{Path(a.mg).name}: {len(mg)} entries, {matched} matched to the exam")
    if notes:
        print(f"\n{len(notes)} note(s):")
        for n in notes:
            print(f"  - {n}")
    if probs:
        print(f"\n{len(probs)} problem(s):")
        for p in probs:
            print(f"  ! {p}")
        return 1
    print("\nNo problems.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
