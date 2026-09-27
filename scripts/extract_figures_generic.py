"""Extract question figures from a school trial HSC Physics PDF with PyMuPDF.

Same approach as ``extract_figures.py`` (which is tuned for the NESA papers):
the figures are vector line art whose labels are live text, so each figure is
recovered by clipping a page region and rendering it to PNG. What differs is
the page furniture, the question-anchor format and the section layout, all of
which vary from school to school -- so those are detected or overridden here
rather than hard-coded.

    python scripts\\extract_figures_generic.py <pdf> <outdir> [options]

Options
-------
  --zoom F            render scale (default 4.0)
  --pages A-B         0-based inclusive page range to scan (overrides detection)
  --stop-regex RE     stop before the first page matching RE
  --anchor N          force anchor pattern N (default: auto-pick the best)
  --tol F             cluster_drawings tolerance (default 8)
  --max-ar F          reject wider/taller clusters (default 7)
  --min-side F        reject clusters smaller than this in pt (default 20)
  --min-area F        reject clusters below this area in pt^2 (default 600)
  --text-dx F --text-dy F   how far a label may sit from its figure
  --pad F             padding around the clip in pt (default 8)
  --left F            x0 below which a question number counts as a margin
  --table-interior N  min interior text lines for a ruled table (default 6)

Writes ``<outdir>/index.json`` with the same entry shape as the NESA extractor:
``file, question, page, kind, option, bbox, clip, px``.
"""
import argparse
import json
import os
import re
import sys

import pymupdf

# --------------------------------------------------------------------- patterns
# Ordered best-guess for how a school paper numbers its questions. Each entry is
# (name, compiled regex, x0 window). The auto-picker keeps the first pattern
# that yields a plausible 1..N run.
ANCHOR_PATTERNS = [
    ("bare", re.compile(r"^(\d{1,2})$"), 150.0),
    ("dotted", re.compile(r"^(\d{1,2})\s*[.)]\s*$"), 150.0),
    ("inline", re.compile(r"^(\d{1,2})\s*[.)]\s+\S"), 150.0),
    ("marks", re.compile(r"^(\d{1,2})\s*\[\s*\d+\s*marks?\s*\]"), 200.0),
    ("question", re.compile(r"^Question\s+(\d{1,2})\b", re.I), 200.0),
]
DEFAULT_STOP = (r"(?im)^\s*(solutions?|marking\s+guidelines?|marking\s+scheme|"
                r"answer\s+key)\b")
LETTER = re.compile(r"^\(?([A-D])[.):]?$")


# ------------------------------------------------------------------- page furniture
def is_furniture(r, page, max_ar, min_side):
    """Page furniture that must not be fed to the clusterer.

    Zero-area dots are degenerate. Full-height or full-width thin runs are the
    page border, a header/footer rule or a sidebar. A cluster that covers most
    of the page is the border rectangle itself. A near-square cluster in a page
    corner is a scanning-registration mark.
    """
    w, h = r.width, r.height
    pw, ph = page.rect.width, page.rect.height
    if w < 0.5 and h < 0.5:
        return True
    if w >= 0.55 * pw and h >= 0.55 * ph:
        return True
    if w > 0.6 * pw and h < 4:
        return True
    if h > 0.6 * ph and w < 4:
        return True
    if h > 600 and w < 20:
        return True
    if min_side <= w <= min_side + 8 and min_side <= h <= min_side + 8:
        if ((r.x0 < 60 and r.y0 < 60) or (r.x0 > pw - 100 and r.y0 < 60)
                or (r.x0 < 60 and r.y1 > ph - 60) or (r.x0 > pw - 100 and r.y1 > ph - 60)):
            return True
    ar = w / h if h else 99.0
    if ar > max_ar or ar < 1 / max_ar:
        return True
    if w < min_side or h < min_side or r.get_area() < 1.0:
        return True
    return False


# ------------------------------------------------------------------------ tables
def table_rects(page, interior_min):
    """Ruled tables on the page, as reported by PyMuPDF's own detector.

    ``find_tables`` also reads a graph's plot area as a grid, so the
    discriminator is cell contents: a real table is densely filled with text
    strictly inside its borders, whereas a plot area is empty because its tick
    labels sit outside the axes.
    """
    out = []
    try:
        tabs = page.find_tables().tables
    except Exception:
        return out
    for t in tabs:
        R = pymupdf.Rect(t.bbox)
        if t.row_count < 4:
            continue
        interior = 0
        for blk in page.get_text("dict")["blocks"]:
            for line in blk.get("lines", []):
                lb = pymupdf.Rect(line["bbox"])
                if not "".join(s["text"] for s in line["spans"]).strip():
                    continue
                if (lb.x0 > R.x0 + 2 and lb.x1 < R.x1 - 2
                        and lb.y0 > R.y0 + 2 and lb.y1 < R.y1 - 2):
                    interior += 1
        if interior >= interior_min:
            out.append(R)
    return out


def _overlap(a, b):
    r = a & b
    return 0.0 if r.is_empty else r.get_area()


# --------------------------------------------------------------------- anchors
def page_lines(page, y_lo=0.0, y_hi=1e9):
    out = []
    for blk in page.get_text("dict")["blocks"]:
        for line in blk.get("lines", []):
            txt = "".join(s["text"] for s in line["spans"]).strip()
            if not txt:
                continue
            out.append((txt, pymupdf.Rect(line["bbox"])))
    return out


def is_answer_sheet(page):
    """A detachable multiple-choice answer sheet repeats 1..20 as a bare grid.

    It is detected by its header row -- a standalone 'Question' above standalone
    'A'/'B'/'C'/'D' cells -- not by the words 'answer sheet', which also appear
    in the instruction line printed above the first question.
    """
    text = page.get_text("text")
    head = text[:max(200, len(text) // 2)]
    return bool(re.search(r"(?m)^\s*Question\s*$", head)
                and re.search(r"(?m)^\s*A\s*$", head))


def collect_anchors(doc, pat, first_page, last_page):
    """Every margin line that looks like a question number, for one pattern."""
    regex, xmax = ANCHOR_PATTERNS[pat][1], ANCHOR_PATTERNS[pat][2]
    anchors = []
    for pno in range(first_page, last_page + 1):
        page = doc[pno]
        if is_answer_sheet(page):
            continue
        for txt, lb in page_lines(page):
            if lb.x0 > xmax or lb.y1 > page.rect.y1 - 45:
                continue
            m = regex.match(txt)
            if m:
                anchors.append((pno, lb.y0, int(m.group(1)), pat))
    return anchors


def merge_anchors(cands):
    """Greedily walk the candidates in reading order keeping a rising run.

    Papers mix numbering styles between sections -- '3.' for the multiple-choice
    part, 'Question 21' for the written part -- so the patterns have to be
    merged rather than picked between. A candidate is accepted only if it
    extends the run, which is what rejects repeated numbers, mark values and
    page furniture that happen to sit in the margin.
    """
    cands = sorted(cands, key=lambda a: (a[0], a[1]))
    kept, expected, missing = [], None, []
    for c in cands:
        n = c[2]
        if expected is None:
            if n > 3:
                continue
            kept.append(c)
            expected = n + 1
            continue
        if n == expected:
            kept.append(c)
            expected = n + 1
        elif expected < n <= expected + 3:
            missing.extend(range(expected, n))
            kept.append(c)
            expected = n + 1
    return kept, missing


def pick_anchors(doc, forced, first_page, last_page):
    if forced is not None:
        pats = [forced]
    else:
        pats = list(range(len(ANCHOR_PATTERNS)))
    cands = []
    for p in pats:
        cands += collect_anchors(doc, p, first_page, last_page)
    kept, missing = merge_anchors(cands)
    if len(kept) < 5:
        sys.exit(f"only {len(kept)} question anchors found; pass --pages or --anchor N")
    names = ",".join(sorted({ANCHOR_PATTERNS[k[3]][0] for k in kept}))
    if missing:
        print(f"WARNING numbering gaps: {missing}")
    return kept, names


def find_stop_page(doc, first, last, regex):
    rx = re.compile(regex)
    for pno in range(first, last + 1):
        head = doc[pno].get_text("text")[:400]
        if rx.search(head):
            return pno
    return last + 1


def question_page_set(doc, anchors, first, last):
    """Pages that may hold question figures.

    A page qualifies if it carries an anchor, or if it directly continues a
    qualifying page. A gap with no anchor and no accepted predecessor is page
    furniture, a cover or the start of the solutions.
    """
    ap = {a[0] for a in anchors}
    ok, prev = set(), False
    for pno in range(first, last + 1):
        if pno in ap or prev:
            ok.add(pno)
            prev = True
        else:
            prev = False
    return ok


def question_at(anchors, pno, y):
    best = None
    for ap, ay, q in anchors:
        if ap > pno:
            break
        if ap == pno and ay > y:
            break
        best = q
    return best


# ---------------------------------------------------------------- option letters
def option_letters(page):
    out = []
    for txt, lb in page_lines(page):
        m = LETTER.match(txt)
        if m:
            out.append((m.group(1), lb))
    return out


def letter_for(fig, letters, dx_win=60.0):
    best, best_d = None, 1e9
    for ch, lb in letters:
        dy = fig.y0 - lb.y0
        if not (-16.0 <= dy <= 44.0):
            continue
        dx = max(0.0, max(fig.x0, lb.x0) - min(fig.x1, lb.x1))
        if dx > dx_win:
            continue
        d = abs(dy) + dx
        if d < best_d:
            best, best_d = ch, d
    return best


def grid_letters(figs, page):
    """Assign A-D to the cells of a multiple-choice option grid.

    A letter is only trusted when the page really carries an option grid: at
    least three of its figures claim distinct letters. Without that test a lone
    figure sitting beside an '(A)' in the stem would be mislabelled, and the
    bundle would attach a whole-question diagram to a single option.
    """
    letters = option_letters(page)
    raw = {i: letter_for(f["rect"], letters) for i, f in enumerate(figs)}
    claimed = {v for v in raw.values() if v}
    if len(claimed) < 3:
        return {i: None for i in raw}
    return raw


# ------------------------------------------------------------------------ render
def grow(figs, page, text_dx, text_dy):
    """Extend each figure's rect over the text labels that belong to it.

    Labels are assigned to the *nearest* figure, so a 2x2 option grid does not
    bleed its neighbour's letter across the gutter.
    """
    lines = []
    for txt, lb in page_lines(page):
        if lb.y1 < 40 or lb.y0 > page.rect.y1 - 30:
            continue
        lines.append((txt, lb))

    def nearby(a, b):
        dx = max(0.0, max(a.x0, b.x0) - min(a.x1, b.x1))
        beside = min(a.y1, b.y1) - max(a.y0, b.y0) > 0
        if beside:
            return dx if dx <= text_dx else None
        dy = max(0.0, max(a.y0, b.y0) - min(a.y1, b.y1))
        if dy > text_dy or dx > 12.0:
            return None
        # a line above the figure that starts to the left of it and is wider
        # than it is a wrapped stem, not a label
        if a.y1 <= b.y0 and a.x0 < b.x0 - 5 and a.width > 0.5 * b.width:
            return None
        return dx + dy

    boxes = []
    for i, d in enumerate(figs):
        rect = d["rect"]
        box = pymupdf.Rect(rect)
        for txt, lb in lines:
            if lb.width > 0.55 * page.rect.width:
                continue
            best, best_dist = None, 1e9
            for j, o in enumerate(figs):
                dist = nearby(lb, o["rect"])
                if dist is None:
                    continue
                if dist < best_dist:
                    best, best_dist = j, dist
            if best == i:
                box |= lb
        boxes.append(box)
    return boxes


def trim_sides(boxes):
    """A figure must not grow past the midpoint to a horizontally adjacent peer."""
    orig = [pymupdf.Rect(b) for b in boxes]
    for i in range(len(boxes)):
        a = boxes[i]
        for j in range(len(boxes)):
            if i == j:
                continue
            me, other = orig[i], orig[j]
            oy = min(me.y1, other.y1) - max(me.y0, other.y0)
            if oy <= 0.25 * min(me.height, other.height):
                continue
            if other.x0 >= a.x1 - 1:
                a.x1 = min(a.x1, (a.x1 + other.x0) / 2)
            elif other.x1 <= a.x0 + 1:
                a.x0 = max(a.x0, (a.x0 + other.x1) / 2)
    return boxes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("outdir")
    ap.add_argument("--zoom", type=float, default=4.0)
    ap.add_argument("--pages")
    ap.add_argument("--stop-regex", default=DEFAULT_STOP)
    ap.add_argument("--anchor", type=int, default=None)
    ap.add_argument("--tol", type=float, default=8.0)
    ap.add_argument("--max-ar", type=float, default=7.0)
    ap.add_argument("--min-side", type=float, default=20.0)
    ap.add_argument("--min-area", type=float, default=600.0)
    ap.add_argument("--text-dx", type=float, default=60.0)
    ap.add_argument("--text-dy", type=float, default=30.0)
    ap.add_argument("--pad", type=float, default=8.0)
    ap.add_argument("--table-interior", type=int, default=6)
    a = ap.parse_args()

    os.makedirs(a.outdir, exist_ok=True)
    doc = pymupdf.open(a.pdf)
    npages = doc.page_count

    if a.pages:
        lo, hi = (int(x) for x in a.pages.split("-"))
        first, last = lo, min(hi, npages - 1)
    else:
        first, last = 0, npages - 1
    if a.stop_regex:
        last = min(last, find_stop_page(doc, first, last, a.stop_regex) - 1)

    anchors, pat = pick_anchors(doc, a.anchor, first, last)
    anchors = [x[:3] for x in anchors]
    if not anchors:
        sys.exit("no anchors inside the selected page range")
    qpages = question_page_set(doc, anchors, anchors[0][0], last)
    print(f"anchor patterns {pat!r}: {len(anchors)} questions, "
          f"pages {anchors[0][0] + 1}-{last + 1} "
          f"({len(qpages)} scanned)")

    picked, rejected = [], []
    for pno in sorted(qpages):
        page = doc[pno]
        keep = [d for d in page.get_drawings() if not is_furniture(d["rect"], page, a.max_ar, a.min_side)]
        tabs = table_rects(page, a.table_interior)
        for rect in page.cluster_drawings(drawings=keep, x_tolerance=a.tol, y_tolerance=a.tol):
            r = pymupdf.Rect(rect)
            why = None
            if r.width < a.min_side or r.height < a.min_side or r.get_area() < a.min_area:
                why = "too small"
            elif r.get_area() > 0.5 * page.rect.get_area():
                why = "page border"
            elif r.x0 > 0.8 * page.rect.width:
                why = "marks column"
            elif tabs and any(_overlap(r, t) >= 0.8 * r.get_area()
                              and _overlap(r, t) >= 0.8 * t.get_area() for t in tabs):
                why = "ruled table (use a table block)"
            if why:
                rejected.append((pno + 1, why))
                continue
            q = question_at(anchors, pno, (r.y0 + r.y1) / 2)
            if not q:
                rejected.append((pno + 1, "before first question"))
                continue
            picked.append(dict(page=pno + 1, rect=r, qno=q, kind="vector"))

        for info in page.get_images(full=True):
            for ir in page.get_image_rects(info[0]):
                if ir.width < 30 or ir.height < 30:
                    continue
                rr = pymupdf.Rect(ir)
                if any(d["page"] == pno + 1 and rr.x0 >= d["rect"].x0 - 1
                       and rr.y0 >= d["rect"].y0 - 1 and rr.x1 <= d["rect"].x1 + 1
                       and rr.y1 <= d["rect"].y1 + 1 for d in picked):
                    continue
                q = question_at(anchors, pno, (rr.y0 + rr.y1) / 2)
                if q:
                    picked.append(dict(page=pno + 1, rect=rr, qno=q, kind="raster"))

    kept = []
    for d in picked:
        if d["kind"] == "vector":
            area = d["rect"].get_area()
            if area and any(o is not d and o["kind"] == "raster" and o["page"] == d["page"]
                            and _overlap(d["rect"], o["rect"]) / area > 0.5 for o in picked):
                rejected.append((d["page"], "fragment of a raster figure"))
                continue
        kept.append(d)
    picked = kept

    picked.sort(key=lambda d: (d["qno"], d["page"], round(d["rect"].y0, 1), d["rect"].x0))
    byq = {}
    for d in picked:
        byq.setdefault(d["qno"], []).append(d)

    index = []
    for qno in sorted(byq):
        figs = byq[qno]
        # a question's figures can straddle a page break, so text is grown and
        # option letters resolved per page
        bypage = {}
        for i, d in enumerate(figs):
            bypage.setdefault(d["page"], []).append(i)
        opt_of, box_of = {}, {}
        for pno_, idxs in bypage.items():
            pg = doc[pno_ - 1]
            group = [figs[i] for i in idxs]
            boxes = [grow([g], pg, a.text_dx, a.text_dy)[0] for g in group]
            if len(group) > 1:
                boxes = trim_sides(boxes)
            letters = grid_letters(group, pg)
            for k, i in enumerate(idxs):
                opt_of[i] = letters[k]
                box_of[i] = boxes[k]
        for i, d in enumerate(figs):
            pg = doc[d["page"] - 1]
            box = box_of[i]
            clip = pymupdf.Rect(box.x0 - a.pad, box.y0 - a.pad,
                                box.x1 + a.pad, box.y1 + a.pad) & pg.rect
            pix = pg.get_pixmap(matrix=pymupdf.Matrix(a.zoom, a.zoom), clip=clip, alpha=False)
            name = f"q{qno:02d}_{i + 1}.png"
            pix.save(os.path.join(a.outdir, name))
            opt = opt_of.get(i)
            index.append(dict(file=name, question=qno, page=d["page"], kind=d["kind"],
                              option=opt, bbox=[round(v, 1) for v in d["rect"]],
                              clip=[round(v, 1) for v in clip], px=[pix.width, pix.height]))
            print(f"  Q{qno:<3} {name:<12} p{d['page']:<3} {d['kind']:<6} "
                  f"opt={opt or '-':<2} {d['rect'].width:.0f}x{d['rect'].height:.0f}pt "
                  f"-> {pix.width}x{pix.height}px")

    with open(os.path.join(a.outdir, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, indent=1, ensure_ascii=False)

    print(f"\n{len(index)} images for {len(byq)} questions "
          f"(Q{', Q'.join(str(q) for q in sorted(byq))})")
    print(f"{len(rejected)} clusters rejected as non-figures")


if __name__ == "__main__":
    main()
