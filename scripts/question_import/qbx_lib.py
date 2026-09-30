"""Shared helpers for building course question-bank import bundles.

Everything in here is deliberately dependency-light (stdlib + PyMuPDF/PIL where
needed) so it can be dropped into a scratch directory and run.

The single most important thing this module encodes is the *real* on-disk
format, which the prose in SKILL.md only describes loosely:

    block       = {"block_type": <type>, "content": {...}}
    mcq option  = {"content": [<blocks>], "is_correct": bool}   # A/B/C/D implicit
    answer      = [<blocks>]   # for MCQ, one text block holding the letter
    part        = {"part_label", "marks", "body", "marking_criteria",
                   "answer", "solution", "assets", "parts"}

Authors should use the block constructors below rather than hand-writing dicts;
they are what keeps 2000+ questions structurally consistent.
"""

from __future__ import annotations

import json
import os
import re
import sys
import unicodedata
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

# --------------------------------------------------------------------------
# Course schema
# --------------------------------------------------------------------------

SKILL_DIR = Path(__file__).resolve().parent.parent
DEFAULT_SCHEMA = SKILL_DIR / "import-schema.json"

TEXT_BLOCKS = {"text", "heading", "equation", "list", "code", "answer_area",
               "table", "image", "diagram", "graph", "page_break"}


class SpecError(Exception):
    """A structural problem that must be fixed before the bundle is delivered."""


def enable_utf8_stdout() -> None:
    """Node names and exam text contain U+2212, U+00B2 etc.

    Without this, every script dies on the Windows cp1252 console the moment
    it prints a node name. Call it first thing in main().
    """
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass


def load_schema(path=None) -> dict:
    p = Path(path) if path else DEFAULT_SCHEMA
    if not p.exists():
        raise SpecError(f"schema not found: {p}")
    with open(p, encoding="utf-8") as fh:
        return json.load(fh)


class NodeIndex:
    """Bidirectional lookups over the course's node table.

    The recurring bug this exists to prevent: a question carrying a
    ``node_code`` whose paired ``node_id`` names a *different* node. Node ids
    are regenerated whenever the course is re-imported, so the code is the
    durable truth -- but you still have to emit both, and they must agree.
    """

    def __init__(self, schema: dict):
        self.code_to_id: dict[str, str] = {}
        self.id_to_code: dict[str, str] = {}
        self.id_to_name: dict[str, str] = {}
        self.code_to_name: dict[str, str] = {}
        self.code_to_path: dict[str, str] = {}
        self.all_names: list[str] = []
        for row in schema.get("valid_node_ids", []):
            nid, code = row["node_id"], row["code"]
            self.code_to_id[code] = nid
            self.id_to_code[nid] = code
            self.id_to_name[nid] = row["name"]
            self.code_to_name[code] = row["name"]
            self.code_to_path[code] = row.get("path", "")
            if row["name"] not in self.all_names:
                self.all_names.append(row["name"])
        # valid_node_codes / valid_node_names may contain entries with no id
        for code in schema.get("valid_node_codes", []):
            if code not in self.code_to_id:
                raise SpecError(f"code {code} has no node_id in schema")

    def __len__(self):
        return len(self.code_to_id)

    def id_for(self, code: str) -> str:
        try:
            return self.code_to_id[code]
        except KeyError:
            raise SpecError(
                f"unknown node code {code!r}. Use one of: "
                f"{sorted(self.code_to_id)[:8]} ... ({len(self.code_to_id)} total)"
            ) from None

    def code_for(self, node_id: str) -> str:
        try:
            return self.id_to_code[node_id]
        except KeyError:
            raise SpecError(f"unknown node_id {node_id!r}") from None

    def search(self, needle: str, limit: int = 25) -> list[tuple[str, str]]:
        """Fuzzy-ish search over node names/paths -- your first move when unsure."""
        n = needle.lower()
        exact, starts, contains = [], [], []
        for code, name in self.code_to_name.items():
            low = name.lower()
            if low == n:
                exact.append((code, name))
            elif low.startswith(n):
                starts.append((code, name))
            elif n in low:
                contains.append((code, name))
        return (exact + starts + contains)[:limit]

    def module_of(self, code: str) -> str:
        """'M5-T2-12' -> 'M5' (or 'M5-T2' when the tree has no deeper code)."""
        return "-".join(code.split("-")[:2]) if code.count("-") >= 2 else code

    def write_nodelist(self, out_path) -> None:
        """`code | node_id | path` -- the same shape used by past conversions."""
        lines = [f"{c} | {i} | {self.code_to_path.get(c, '')}"
                 for c, i in sorted(self.code_to_id.items())]
        Path(out_path).write_text("\n".join(lines) + "\n", encoding="utf-8")


# --------------------------------------------------------------------------
# Block constructors -- the only sanctioned way to build content
# --------------------------------------------------------------------------

def text(s: str) -> dict:
    return {"block_type": "text", "content": {"text": s}}


def heading(s: str, level: int = 2) -> dict:
    return {"block_type": "heading", "content": {"text": s, "level": level}}


def equation(latex: str, display: bool = True) -> dict:
    return {"block_type": "equation", "content": {"latex": latex, "display": display}}


def table(columns, rows, caption: str | None = None) -> dict:
    c = {"columns": [str(x) for x in columns], "rows": [[("" if v is None else str(v)) for v in r] for r in rows]}
    if caption:
        c["caption"] = caption
    return {"block_type": "table", "content": c}


def ulist(items, caption: str | None = None) -> dict:
    c = {"ordered": False, "items": [str(i) for i in items]}
    if caption:
        c["caption"] = caption
    return {"block_type": "list", "content": c}


def olist(items, caption: str | None = None) -> dict:
    c = {"ordered": True, "items": [str(i) for i in items]}
    if caption:
        c["caption"] = caption
    return {"block_type": "list", "content": c}


def code(language: str, src: str) -> dict:
    return {"block_type": "code", "content": {"language": language, "code": src}}


def answer_area(lines: int) -> dict:
    return {"block_type": "answer_area", "content": {"lines": int(lines)}}


def answer_lines(marks: float) -> int:
    """Two ruled lines per mark, at least one -- the app's answer-space rule."""
    return max(1, -(-int(round(marks * 2)) // 2) * 2 if marks else 2)


def image(asset_id: str, alt_text: str, block_type: str = "image",
          caption: str | None = None) -> dict:
    c = {"asset_path": asset_id, "alt_text": alt_text}
    if caption:
        c["caption"] = caption
    return {"block_type": block_type, "content": c}


def page_break() -> dict:
    return {"block_type": "page_break", "content": {}}


def criteria(items) -> list:
    """marking_criteria as a single `list` block, one item per mark.

    Every item must already carry its allocation (see SKILL.md); build_qbx
    checks that and audit_qbx enforces it.
    """
    return [ulist(items)]


def mcq_option(blocks, correct: bool = False, label: str | None = None,
               alt_text: str | None = None) -> dict:
    o = {"content": list(blocks), "is_correct": bool(correct)}
    if label:
        o["label"] = label
    if alt_text:
        o["alt_text"] = alt_text
    return o


def answer_letter(letter: str) -> list:
    return [text(letter)]


# --------------------------------------------------------------------------
# Answer-area handling
# --------------------------------------------------------------------------

def ensure_answer_areas(q: dict) -> None:
    """Append answer_area blocks to every leaf part / partless written question.

    Idempotent. Skips MCQ, parents that own parts, and parts that already end
    with an answer_area (the paper may print a specific answer space).
    """
    if q.get("type_key") == "multiple_choice":
        return
    parts = q.get("parts") or []
    if parts:
        for p in parts:
            ensure_answer_areas(p)
        return
    body = q.setdefault("body", [])
    if any(b.get("block_type") == "answer_area" for b in body):
        return
    if not body:
        return
    body.append(answer_area(answer_lines(q.get("marks", 1))))


# --------------------------------------------------------------------------
# Validation
# --------------------------------------------------------------------------

# Accepts every allocation spelling that shows up in real mark schemes:
#   "1 mark: ...", "1-2 marks: ...", "1–2 marks: ...", "... (2 marks)",
#   "6 marks for ...", "1.5 marks: ...", "marks: 4"
# A bare "1 mark" is only an allocation when the word "mark" is not the head
# of a noun ("the mark scheme", "marks awarded"), hence the word boundary on
# the following token.
_NUM = r"\d+(?:\.\d+)?"
_BAND = rf"{_NUM}(?:\s*[-–—]\s*{_NUM})?"
_NOT_MARK_NOUN = r"(?!ed\b|ing\b|scheme)"
_ALLOC_RE = re.compile(
    rf"\(\s*({_BAND})\s*marks?\s*\)"      # ... (2 marks)
    rf"|^({_BAND})\s*marks?\b"            # 1-2 marks: ...
    rf"|\b({_BAND})\s*marks?\s*for\b"     # 1 mark for ...
    rf"|\b({_BAND})\s*marks?{_NOT_MARK_NOUN}\b"   # bare "1 mark"
    rf"|\bmarks?\s*:?\s*({_BAND})\b",     # marks: 2
    re.I)

MIME = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml"}


@dataclass
class Report:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def err(self, msg: str) -> None:
        self.errors.append(msg)

    def warn(self, msg: str) -> None:
        self.warnings.append(msg)


def _allocations(item: str) -> list[float]:
    out = []
    for m in _ALLOC_RE.finditer(item):
        for raw in m.groups():
            if not raw:
                continue
            for piece in re.split(r"[-–—]", raw):
                try:
                    out.append(float(piece))
                except ValueError:
                    pass
            break
    return out


def collect_blocks(obj: dict):
    """Yield (owner, blocks) for an object and every nested part, recursively."""
    yield obj
    for p in obj.get("parts") or []:
        yield from collect_blocks(p)


def validate_question(q: dict, *, nodes: NodeIndex, schema: dict,
                      course_id: str, rep: Report, qid: str) -> None:
    """Append every structural problem found in `q` to `rep`. Never raises."""
    where = qid or q.get("question_id") or "<no id>"

    # -- scalar fields ----------------------------------------------------
    if q.get("type_key") not in schema["valid_type_keys"]:
        rep.err(f"{where}: type_key {q.get('type_key')!r} not in "
                f"{schema['valid_type_keys']}")
    d = q.get("difficulty")
    if not isinstance(d, int) or not 1 <= d <= 4:
        rep.err(f"{where}: difficulty {d!r} must be an integer 1-4")
    m = q.get("marks")
    if not isinstance(m, (int, float)) or m <= 0:
        rep.err(f"{where}: marks {m!r} must be a positive number")
    for t in q.get("tags") or []:
        if t not in schema["valid_tags"]:
            rep.err(f"{where}: tag {t!r} not in VALID TAGS")
    if q.get("classification_confidence") not in ("high", "medium", "low"):
        rep.warn(f"{where}: classification_confidence "
                 f"{q.get('classification_confidence')!r} -- use high/medium/low")
    if q.get("course_id") != course_id:
        rep.err(f"{where}: course_id {q.get('course_id')!r} != {course_id!r}")

    src = q.get("source") or {}
    for k in ("name", "year", "original_question_no"):
        if not src.get(k) and src.get(k) != 0:
            rep.err(f"{where}: source.{k} is empty")
    inst = src.get("institution")
    low = str(inst or "").lower()
    if low and any(bad in low for bad in (
            "trial", "exam", "year", "paper", "board",
            "prelim", "final")):
        rep.warn(f"{where}: source.institution {inst!r} looks like an exam type "
                 f"rather than a school name -- keep only the institution's own "
                 f"name here and put the rest in source.name")

    if len(q.get("node_codes") or []) > 1 and not schema.get(
            "allow_multi_classification", True):
        rep.err(f"{where}: multiple nodes not allowed by the course schema")

    for obj in collect_blocks(q):
        label = obj.get("part_label")
        w = where + (f"/{label}" if label else "")
        parts = obj.get("parts") or []

        # -- node pairing -------------------------------------------------
        # Only the top-level question is required to classify. Parts inherit
        # the parent's nodes, but if a part DOES declare its own, the id and
        # the code must describe the same node -- a mismatch here is the
        # defect a top-level-only check can never see.
        codes = list(obj.get("node_codes") or [])
        ids = list(obj.get("node_ids") or [])
        if not codes and not ids:
            if obj is q:
                rep.err(f"{w}: no node_codes / node_ids")
        else:
            for i, c in enumerate(codes):
                try:
                    want = nodes.id_for(c)
                except SpecError as e:
                    rep.err(f"{w}: {e}")
                    continue
                if i < len(ids) and ids[i] != want:
                    rep.err(f"{w}: node_codes[{i}]={c} pairs with "
                            f"node_ids[{i}]={ids[i]}, but {c} is {want} "
                            f"({nodes.code_to_name.get(c, '?')}) -- the two "
                            f"lists must describe the same nodes in the same order")
            if ids and not codes:
                for i in ids:
                    try:
                        rep.warn(f"{w}: node_codes missing for node_id {i!r} "
                                 f"({nodes.code_for(i)})")
                    except SpecError as e:
                        rep.err(f"{w}: {e}")

        # -- body / blocks / assets ---------------------------------------
        owner_assets: dict[str, dict] = {
            a["asset_id"]: a for a in obj.get("assets") or []}

        body = obj.get("body")
        if not isinstance(body, list):
            rep.err(f"{w}: body must be a list of blocks, got {type(body).__name__}")
            body = []
        all_blocks = list(body)
        for o in obj.get("mcq_options") or []:
            all_blocks += o.get("content") or []
        for f in ("answer", "solution", "marking_criteria"):
            all_blocks += obj.get(f) or []
        if not body:
            if parts:
                rep.warn(f"{w}: empty body -- a parent question or container part "
                         f"must carry the shared stem / section title / lead-in, "
                         f"even if the paper prints none")
            else:
                rep.err(f"{w}: empty body on a leaf object -- it will render blank")

        for b in body:
            bt = b.get("block_type")
            if bt not in TEXT_BLOCKS:
                rep.err(f"{w}: unknown block_type {bt!r}")
                continue
            c = b.get("content") or {}
            if bt in ("text", "heading"):
                if not str(c.get("text", "")).strip():
                    rep.err(f"{w}: empty {bt} block")
            elif bt == "equation":
                if not str(c.get("latex", "")).strip():
                    rep.err(f"{w}: empty equation block")
            elif bt == "list":
                if not c.get("items"):
                    rep.err(f"{w}: list block with no items")
                for it in c.get("items") or []:
                    if not str(it).strip():
                        rep.err(f"{w}: empty list item")
            elif bt == "code":
                if not str(c.get("code", "")).strip():
                    rep.err(f"{w}: empty code block")
            elif bt == "table":
                cols, rows = table_shape(c)
                if not cols:
                    rep.err(f"{w}: table block is not renderable -- it needs a "
                            f"list header under 'columns' (or 'headers') and a "
                            f"list of equal-length lists under 'rows'; "
                            f"populate it from the paper or replace it with a "
                            f"list block")
                else:
                    for r in rows:
                        if len(r) != len(cols):
                            rep.err(f"{w}: table row has {len(r)} cells, "
                                    f"header has {len(cols)}")
            elif bt in ("image", "diagram", "graph"):
                ap = c.get("asset_path")
                if not ap:
                    rep.err(f"{w}: image block with no content.asset_path")
                elif not c.get("alt_text"):
                    rep.err(f"{w}: image {ap} has no alt_text")
                if ap and ap not in owner_assets:
                    rep.err(f"{w}: image {ap!r} is not declared in this "
                            f"object's assets array")

        for a in obj.get("assets") or []:
            used = any((bl.get("content") or {}).get("asset_path") == a["asset_id"]
                       for bl in all_blocks)
            if not used:
                rep.warn(f"{w}: asset {a['asset_id']!r} is declared but never "
                         f"referenced by an image block")

        # -- marks --------------------------------------------------------
        if parts:
            total = sum(p.get("marks", 0) or 0 for p in parts)
            if abs(total - (obj.get("marks") or 0)) > 1e-6:
                rep.err(f"{w}: marks {obj.get('marks')} != sum of immediate "
                        f"parts {total} (nested parts must sum at EVERY level)")
            labels = [p.get("part_label") for p in parts]
            if len(labels) != len(set(labels)):
                rep.err(f"{w}: duplicate part_label among {labels}")
            for lab in labels:
                if lab and re.search(r"[A-Za-z]\(", str(lab)):
                    m = re.match(r"([A-Za-z])\((\w+)\)$", str(lab))
                    if m:
                        rep.err(f"{w}: part_label {lab!r} is a flattened "
                                f"composite -- make {m.group(1)!r} a part with "
                                f"its own parts [{m.group(2)}, ...], not a "
                                f"single part labelled {lab!r}")
                    else:
                        rep.err(f"{w}: part_label {lab!r} looks like a "
                                f"flattened composite label")

        # -- marking criteria ---------------------------------------------
        crit = obj.get("marking_criteria")
        if not crit:
            rep.err(f"{w}: no marking_criteria (required at every level)")
        else:
            items = _criteria_items(crit)
            if not items:
                rep.err(f"{w}: marking_criteria contains no list/text items")
            for it in items:
                if not _allocations(it):
                    rep.err(f"{w}: marking criterion with no mark allocation: "
                            f"{it[:70]!r} -- prefix it '1 mark: ...'")

        # -- partless extended response needs an answer --------------------
        if not parts and obj.get("type_key") == "extended_response":
            if not (obj.get("answer") or obj.get("solution")):
                rep.err(f"{w}: partless extended_response has neither answer "
                        f"nor solution -- solve it from the paper or take it "
                        f"from the mark scheme")

    # -- MCQ ---------------------------------------------------------------
    if q.get("type_key") == "multiple_choice":
        opts = q.get("mcq_options") or []
        if len(opts) < 2:
            rep.err(f"{where}: multiple_choice needs at least 2 options")
        correct = [i for i, o in enumerate(opts) if o.get("is_correct")]
        if len(correct) != 1:
            rep.err(f"{where}: {len(correct)} options marked is_correct, need exactly 1")
        else:
            letter = chr(ord("A") + correct[0])
            got = "".join(str(x) for x in _flatten_text(q.get("answer") or [])).strip()
            if got.upper() != letter:
                rep.err(f"{where}: answer says {got!r} but the correct option is "
                        f"{letter}")
        for i, o in enumerate(opts):
            if not o.get("content"):
                rep.err(f"{where}: option {chr(ord('A') + i)} has no content")
            for bl in o.get("content") or []:
                if bl.get("block_type") in ("image", "diagram", "graph"):
                    ap = (bl.get("content") or {}).get("asset_path")
                    if ap not in owner_assets:
                        rep.err(f"{where}: option {chr(ord('A') + i)} image "
                                f"{ap!r} not declared in assets")
        if q.get("parts"):
            rep.err(f"{where}: multiple_choice must not have parts")


def _flatten_text(blocks) -> list[str]:
    out = []
    for b in blocks or []:
        c = b.get("content") or {}
        if b.get("block_type") in ("text", "heading"):
            out.append(str(c.get("text", "")))
    return out


def table_shape(content: dict) -> tuple[list, list]:
    """Return (header, rows) for a table block.

    The corpus contains two spellings: `columns` (what the app's own exports
    emit) and `headers` (used by some conversions). Both are accepted; what
    matters is that the header is a list of strings and every row is a list
    of the same length. Returns ([], []) when the block is unusable.
    """
    head = content.get("columns")
    if head is None:
        head = content.get("headers")
    rows = content.get("rows")
    if not isinstance(head, list) or not head:
        return [], []
    if not isinstance(rows, list) or not rows:
        return [], []
    if not all(isinstance(r, list) for r in rows):
        return [], []      # transposed / scalar rows: not renderable
    return [str(h) for h in head], rows


def _criteria_items(crit) -> list[str]:
    items = []
    for b in crit or []:
        c = b.get("content") or {}
        if b.get("block_type") == "list":
            items += [str(i) for i in c.get("items") or []]
        elif b.get("block_type") in ("text", "heading"):
            if str(c.get("text", "")).strip():
                items.append(str(c["text"]))
    return items


# --------------------------------------------------------------------------
# Normalisation + bundle writing
# --------------------------------------------------------------------------

def sync_nodes(q: dict, nodes: NodeIndex, rep: Report | None = None,
               where: str = "") -> None:
    """Reconcile node_ids and node_codes.

    When they disagree about the same position, DO NOT pick a winner
    silently. The historical record shows both fields going wrong: sometimes
    a stale node_id was paired with the right code, sometimes the code was
    mistyped while the id was right. Deciding which one the author meant
    requires reading the question, so this reports the conflict and leaves
    the code in place (codes are the durable, human-readable half) for a human
    or a follow-up pass to confirm.
    """
    codes = list(q.get("node_codes") or [])
    ids = list(q.get("node_ids") or [])
    if codes and ids:
        if len(codes) != len(ids):
            if rep:
                rep.warn(f"{where}: {len(codes)} node_codes but {len(ids)} "
                         f"node_ids -- the lists must describe the same nodes "
                         f"in the same order; rebuilt node_ids from the codes")
        for i, (c, nid) in enumerate(zip(codes, ids)):
            try:
                want = nodes.id_for(c)
            except SpecError:
                continue
            if nid != want:
                msg = (f"{where}: node_codes[{i}]={c} does not match "
                       f"node_ids[{i}]={nid} (that code is {want}, "
                       f"'{nodes.code_to_name.get(c, '?')}') -- kept the code; "
                       f"confirm the question belongs to it")
                if rep:
                    rep.warn(msg)
    if codes:
        q["node_ids"] = [nodes.id_for(c) for c in codes]
        return
    if ids:
        q["node_codes"] = [nodes.code_for(i) for i in ids]


def png_size(path: Path) -> tuple[int | None, int | None]:
    try:
        from PIL import Image
    except ImportError:
        return (None, None)
    try:
        with Image.open(path) as im:
            return im.size
    except Exception:
        return (None, None)


def stamp_assets(q: dict, assets_dir: Path, rep: Report, where: str) -> None:
    """Collect assets recursively and fill in the derived fields.

    * Recursion matters: a figure that belongs to part (b) must be written to
      the ZIP *and* declared in part (b)'s own `assets` array.
    * `file_path` is the bare asset_id, `content.asset_path` is the same, and
      the file lives at `<assets_dir>/<asset_id>.<ext>` and
      `assets/<asset_id>.<ext>` in the ZIP.
    """
    # Each object owns the assets referenced by ITS OWN body, options, answer,
    # solution and marking_criteria. Mark-scheme sample answers legitimately
    # contain figures (a model graph, an annotated diagram) -- scanning only
    # `body` silently drops those files from the ZIP.
    #
    # Do NOT scan descendant parts: a part's assets belong to the part. Letting
    # a parent claim them too duplicates the ZIP entry.
    for obj in collect_blocks(q):
        blocks = list(obj.get("body") or [])
        for o in obj.get("mcq_options") or []:
            blocks += o.get("content") or []
        for f in ("answer", "solution", "marking_criteria"):
            blocks += obj.get(f) or []
        want = []
        for b in blocks:
            if b.get("block_type") in ("image", "diagram", "graph"):
                ap = (b.get("content") or {}).get("asset_path")
                if ap and ap not in want:
                    want.append(ap)
        declared = {a["asset_id"]: a for a in obj.get("assets") or []}
        out = []
        for aid in want:
            src = None
            for ext in MIME:
                cand = assets_dir / f"{aid}{ext}"
                if cand.exists():
                    src = cand
                    break
            if src is None:
                rep.err(f"{where}: asset {aid!r} referenced by an image block is "
                        f"not on disk in {assets_dir}")
                continue
            a = dict(declared.get(aid) or {})
            a["asset_id"] = aid
            a["file_path"] = aid
            a["mime_type"] = MIME[src.suffix.lower()]
            w, h = png_size(src) if src.suffix.lower() == ".png" else (None, None)
            if w:
                a["width"], a["height"] = w, h
            a.setdefault("caption", None)
            a.setdefault("alt_text", "")
            if src.suffix.lower() == ".svg":
                a.pop("width", None)
                a.pop("height", None)
            out.append(a)
            declared[aid] = a
        obj["assets"] = out


def normalise(q: dict, *, nodes: NodeIndex, schema: dict, course_id: str,
              course_name: str, id_prefix: str | None, assets_dir: Path,
              rep: Report, index: int, seen_ids: set[str]) -> dict:
    q = dict(q)
    qid = q.get("question_id") or f"{id_prefix or 'q'}{index:02d}"
    q["question_id"] = qid
    if qid in seen_ids:
        rep.err(f"{qid}: duplicate question_id within the bundle")
    seen_ids.add(qid)
    q["course_id"] = course_id
    q["course_name"] = q.get("course_name") or course_name
    q.setdefault("parent_question_id", None)
    q.setdefault("part_label", None)
    q.setdefault("notes", None)
    q.setdefault("review_status", "imported")
    q.setdefault("difficulty", 3)
    q.setdefault("tags", [])
    q.setdefault("answer", [])
    q.setdefault("solution", [])
    q.setdefault("marking_criteria", [])
    q.setdefault("assets", [])
    q.setdefault("mcq_options", [])
    q.setdefault("parts", [])
    q.setdefault("source", {})
    q.pop("body_text_hint", None)

    sync_nodes(q, nodes, rep, qid)
    ensure_answer_areas(q)
    stamp_assets(q, assets_dir, rep, qid)
    validate_question(q, nodes=nodes, schema=schema, course_id=course_id,
                      rep=rep, qid=qid)
    return q


def build(spec: dict, out_path, *, schema=None, assets_dir=None,
          id_prefix=None, course_id=None) -> tuple[Path, Report]:
    """spec -> validated .qbx bundle. Returns (path, report)."""
    schema = schema or load_schema()
    nodes = NodeIndex(schema)
    course_id = course_id or schema["course_id"]
    course_name = spec.get("course_name") or schema.get("course_name")
    out_path = Path(out_path)
    assets_dir = Path(assets_dir) if assets_dir else out_path.parent / "assets"

    rep = Report()
    seen: set[str] = set()
    questions = []
    for i, raw in enumerate(spec.get("questions") or [], start=1):
        questions.append(normalise(raw, nodes=nodes, schema=schema,
                                   course_id=course_id, course_name=course_name,
                                   id_prefix=id_prefix or spec.get("id_prefix"),
                                   assets_dir=assets_dir, rep=rep, index=i,
                                   seen_ids=seen))

    if rep.errors:
        return out_path, rep

    payload = {
        "export_schema_version": 1,
        "course_id": course_id,
        "course_name": course_name,
        "questions": questions,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("questions.json", json.dumps(payload, ensure_ascii=False,
                                                indent=2))
        written: set[str] = set()
        for obj in [x for q in questions for x in collect_blocks(q)]:
            for a in obj.get("assets") or []:
                aid = a["asset_id"]
                if aid in written:
                    continue
                for ext in MIME:
                    src = assets_dir / f"{aid}{ext}"
                    if src.exists():
                        z.write(src, f"assets/{aid}{ext}")
                        written.add(aid)
                        break
    return out_path, rep


# --------------------------------------------------------------------------
# Small text helpers
# --------------------------------------------------------------------------

def norm_ws(s: str) -> str:
    s = unicodedata.normalize("NFKC", s or "")
    return re.sub(r"[ \t]+", " ", s).strip()


def join_answer(blocks) -> str:
    return norm_ws(" ".join(_flatten_text(blocks)))


def read_pages_text(pages_dir) -> dict[int, str]:
    """Load prep_paper.py's `pNNN.txt` output into {page: text}."""
    out = {}
    for p in sorted(Path(pages_dir).glob("p*.txt")):
        try:
            out[int(p.stem[1:])] = p.read_text(encoding="utf-8", errors="replace")
        except ValueError:
            continue
    return out
