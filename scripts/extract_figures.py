"""Extract the real question figures from an HSC Physics exam PDF.

Why rendering, not unpacking
----------------------------
The NESA papers carry almost no embedded rasters (`page.get_images()` returns
a couple of hits across a whole paper). Every figure, graph and MCQ option is
vector line art whose labels are live text. So a figure is recovered by
clipping a page region and rendering it to PNG.

Pipeline
--------
1.  Question anchors from the left margin (x0 ~ 70.7): a bare number 1-20 for
    Section I, "Question N (M marks)" for Section II. Mark allocations live in
    the right-hand column, so the x0 test excludes them.
2.  Page furniture (page border, the full-height black bar, the "do not write"
    hairline, the office corner marks) is stripped *before* clustering. Left in,
    it drags real figures into one page-sized cluster that is then rejected --
    which is how the Q23/Q24/Q28 figures were being lost.
3.  `page.cluster_drawings()` at tolerance 8 groups the remaining paths into
    per-figure rects. Tolerance 8 is the sweet spot: at 3 the option graphs on
    p9 shatter, at 15 the Q18 option grid collapses into one box.
4.  Embedded rasters are a second pass; ones enclosed by a captured vector
    figure are skipped, and vector fragments lying on top of a raster are
    dropped.
5.  The clip is grown with *nearest-figure* text assignment rather than a
    global slop. Each nearby text line goes to the closest figure, so a 2x2
    option grid does not bleed its neighbour's letter across the gutter, and a
    graph's axis title below it is not cut off.
6.  Option letters ("A." .. "D." sitting just above-left of each cell) are
    detected so each option image is recorded against its letter.

Usage
-----
    python scripts\\extract_figures.py <pdf> <outdir> [zoom]
"""
import sys, os, re, json
import pymupdf

LEFT, RIGHT = 60.0, 80.0     # question numbers sit at x0 ~ 70.7
MIN_SIDE = 20.0              # pt
MIN_AREA = 600.0             # pt^2
MAX_AR = 7.0                 # wider/taller than this is a rule or bracket
TOL = 8.0                    # cluster_drawings tolerance
TEXT_DX, TEXT_DY = 60.0, 30.0   # how far a label may sit from its figure
PAD = 8.0

src = sys.argv[1]
outdir = sys.argv[2]
zoom = float(sys.argv[3]) if len(sys.argv) > 3 else 4.0
os.makedirs(outdir, exist_ok=True)

doc = pymupdf.open(src)


# ------------------------------------------------------------- page furniture
def is_furniture(r):
    """Page furniture that must not be fed to the clusterer.

    A perfectly horizontal or vertical line has zero height or width. That is
    an ordinary figure element (an axis, a connector), not furniture, so only
    genuinely degenerate dots are dropped -- rejecting h<=0 here would split
    every block diagram along its connector lines.
    """
    w, h = r.width, r.height
    if w < 0.5 and h < 0.5:
        return True
    if h > 600 and w < 35:            # full-height black bar / vertical rule
        return True
    if w > 350 and h < 3:             # the "do not write" hairline
        return True
    if 20 <= w <= 28 and 20 <= h <= 28:   # office corner marks
        if ((r.x0 < 70 and r.y0 < 70) or (r.x0 > 500 and r.y0 < 70)
                or (r.x0 < 70 and r.y1 > 760) or (r.x0 > 500 and r.y1 > 760)):
            return True
    return False


# ------------------------------------------------------------------ anchors
sec1 = re.compile(r"^(\d{1,2})$")
sec2 = re.compile(r"^Question\s+(\d+)\b")

anchors = []
for pno, page in enumerate(doc):
    for blk in page.get_text("dict")["blocks"]:
        for line in blk.get("lines", []):
            if not (LEFT <= line["bbox"][0] <= RIGHT):
                continue
            txt = "".join(s["text"] for s in line["spans"]).strip()
            m = sec2.match(txt)
            if m:
                anchors.append((pno, line["bbox"][1], int(m.group(1))))
                continue
            m = sec1.match(txt)
            if m and 1 <= int(m.group(1)) <= 20:
                anchors.append((pno, line["bbox"][1], int(m.group(1))))

anchors.sort(key=lambda a: (a[0], a[1]))
seen, ordered = set(), []
for a in anchors:
    if a[2] not in seen:
        seen.add(a[2])
        ordered.append(a)
anchors = ordered
if not anchors:
    sys.exit("no question anchors found")
last_qpage = anchors[-1][0]
print(f"{len(anchors)} questions, pages 1-{last_qpage + 1}")

BLANK, BOOKLET = "BLANK PAGE", "Section II Answer Booklet"


def question_page_set():
    """Pages that may hold question figures.

    A page qualifies if it carries an anchor, or if it directly continues a
    qualifying page. That admits genuine two-page questions while rejecting the
    blank fillers and the answer-booklet cover, which sit in a gap with no
    anchor and no accepted predecessor.
    """
    ap = {a[0] for a in anchors}
    ok, prev_ok = set(), False
    for pno in range(anchors[0][0], last_qpage + 1):
        txt = doc[pno].get_text("text")
        if BLANK in txt:
            prev_ok = False
            continue
        is_cover = BOOKLET in txt and pno not in ap
        if pno in ap or (prev_ok and not is_cover):
            ok.add(pno)
            prev_ok = True
        else:
            prev_ok = False
    return ok


def question_at(pno, y):
    """The question whose vertical span on page `pno` contains y."""
    best = None
    for ap, ay, q in anchors:
        if ap > pno:
            break
        if ap == pno and ay > y:
            break
        best = q
    return best


# ------------------------------------------------------------ option letters
LETTER = re.compile(r"^([A-D])[.):]?$")


def option_letters(page):
    """'A.' .. 'D.' labels that head a multiple-choice option cell.

    The Section I answer-sheet tick boxes in the left margin also read
    "A. B. C. D." but sit in a tight vertical stack, so they are dropped by the
    y-span test.
    """
    out = []
    for blk in page.get_text("dict")["blocks"]:
        for line in blk.get("lines", []):
            txt = "".join(s["text"] for s in line["spans"]).strip()
            m = LETTER.match(txt)
            if m:
                out.append((m.group(1), pymupdf.Rect(line["bbox"])))
    return out


def letter_for(fig, letters):
    """The option letter whose label heads this figure, if any.

    The 34pt horizontal window has to be generous: on p9 the option letters sit
    ~39pt to the left of their cell while the cells themselves are 224pt apart,
    so widening the window to 50pt still cannot reach the neighbouring letter.
    """
    best, best_d = None, 1e9
    for ch, lb in letters:
        dy = fig.y0 - lb.y0
        if not (-14.0 <= dy <= 40.0):
            continue
        dx = max(0.0, max(fig.x0, lb.x0) - min(fig.x1, lb.x1))
        if dx > 50.0:
            continue
        d = abs(dy) + dx
        if d < best_d:
            best, best_d = ch, d
    return best


def _overlap(a, b):
    r = a & b
    return 0.0 if r.is_empty else r.get_area()


def table_rects(page):
    """Ruled tables on the page, as reported by PyMuPDF's own detector.

    A hand-rolled test for "is this cluster a table" does not work here. The
    NESA tables draw their cell borders as `re` items rather than long thin
    lines, and both tables and graphs contain `c` curve items, so counting
    full-width rules cannot separate them. `find_tables()` separates the *real*
    tables, but it also reads the plot area of a graph as a grid -- the H-R
    diagram on p4, the planet orbit on p6, the Model A/B panels on p35 -- and
    trusting it blindly threw away five genuine figures.

    The discriminator is cell contents. A bordered NESA table is densely filled
    with text sitting strictly inside the cell borders, whereas a plot area is
    empty because its tick labels sit outside the axes. Measured over the 2024
    paper, every true table scores 10-16 interior text lines with 5-6 rows,
    while every graph-grid false positive scores 0-4. Requiring both
    `interior >= 6` and `row_count >= 4` separates them with margin.
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
        if interior >= 6:
            out.append(R)
    return out


# ------------------------------------------------------------------ clusters
picked, rejected = [], []
qpages = question_page_set()
for pno, page in enumerate(doc):
    if pno not in qpages:
        continue
    keep = [d for d in page.get_drawings() if not is_furniture(d["rect"])]
    tabs = table_rects(page)
    for rect in page.cluster_drawings(drawings=keep,
                                       x_tolerance=TOL, y_tolerance=TOL):
        w, h = rect.width, rect.height
        ar = w / h if h else 99
        why = None
        if w < MIN_SIDE or h < MIN_SIDE or rect.get_area() < MIN_AREA:
            why = "too small"
        elif rect.get_area() > 0.5 * page.rect.get_area():
            why = "page border"
        elif ar > MAX_AR or ar < 1 / MAX_AR:
            why = "rule / bracket"
        elif rect.x0 > 470:
            why = "marks column"
        elif tabs and any(_overlap(rect, t) >= 0.8 * rect.get_area()
                          and _overlap(rect, t) >= 0.8 * t.get_area()
                          for t in tabs):
            # Tabular data belongs in a `table` block, not a bitmap: a rendered
            # table cannot be searched, edited or marked against its cells.
            why = "ruled table (use a table block)"
        if why:
            rejected.append((pno + 1, why))
            continue
        q = question_at(pno, (rect.y0 + rect.y1) / 2)
        if not q:
            rejected.append((pno + 1, "before first question"))
            continue
        picked.append(dict(page=pno + 1, rect=pymupdf.Rect(rect), qno=q,
                           kind="vector"))

    for info in page.get_images(full=True):
        for r in page.get_image_rects(info[0]):
            if r.width < 30 or r.height < 30:
                continue
            rr = pymupdf.Rect(r)
            if any(d["page"] == pno + 1
                   and rr.x0 >= d["rect"].x0 - 1 and rr.y0 >= d["rect"].y0 - 1
                   and rr.x1 <= d["rect"].x1 + 1 and rr.y1 <= d["rect"].y1 + 1
                   for d in picked):
                continue
            q = question_at(pno, (r.y0 + r.y1) / 2)
            if q:
                picked.append(dict(page=pno + 1, rect=rr, qno=q, kind="raster"))


kept = []
for d in picked:
    if d["kind"] == "vector":
        a = d["rect"].get_area()
        if a and any(o is not d and o["kind"] == "raster" and o["page"] == d["page"]
                     and _overlap(d["rect"], o["rect"]) / a > 0.5
                     for o in picked):
            rejected.append((d["page"], "fragment of a raster figure"))
            continue
    kept.append(d)
picked = kept

picked.sort(key=lambda d: (d["qno"], d["page"], round(d["rect"].y0, 1),
                           d["rect"].x0))
byq = {}
for d in picked:
    byq.setdefault(d["qno"], []).append(d)

# ------------------------------------------------------------------- render
# Every figure is first given a clip, then that clip is trimmed against its
# neighbours. Two things bleed without the trim: a 2x2 option grid's crops
# overlap the gutter (each option is ~210pt wide in a ~230pt cell), and a wide
# label claimed by the wrong figure stretches the clip sideways over the next
# figure. Trimming to the midpoint between horizontally adjacent figures kills
# both.
index = []
for qno in sorted(byq):
    figs = byq[qno]
    boxes = []
    for i, d in enumerate(figs):
        rect = d["rect"]
        page = doc[d["page"] - 1]

        # text lines on the page, with the page furniture stripped out
        lines = []
        for blk in page.get_text("dict")["blocks"]:
            for line in blk.get("lines", []):
                lb = pymupdf.Rect(line["bbox"])
                txt = "".join(s["text"] for s in line["spans"]).strip()
                # -45 rather than -30: the "© Physics Forums" credit sits just
                # inside the old margin and was being cropped into the bottom
                # of the Q24 spectrum.
                if not txt or lb.y1 < 56 or lb.y0 > page.rect.y1 - 45:
                    continue
                lines.append((txt, lb))

        # Which text belongs to the figure? A word-count filter is not enough:
        # the question stem is broken into *lines*, and a line such as "axle
        # and placed in a uniform magnetic field. The" is only eight words, so
        # it passes and drags the whole stem into the crop. The geometry
        # separates them properly -- a label either sits level with the figure
        # (axis titles, tick values, side annotations) or hugs its edge within
        # a few points ("Temperature (K)" under a plot), whereas the stem is a
        # clear 15-20pt above the top of the art.
        def nearby(a, b):
            dx = max(0.0, max(a.x0, b.x0) - min(a.x1, b.x1))
            beside = min(a.y1, b.y1) - max(a.y0, b.y0) > 0
            if beside:
                return dx if dx <= TEXT_DX else None
            dy = max(0.0, max(a.y0, b.y0) - min(a.y1, b.y1))
            if dy > TEXT_DY or dx > 12.0:
                return None
            # A line *above* the figure that starts to the left of the figure is
            # a wrapped stem, not a label: on p20 "An aspect of the experimental
            # design is shown." begins at the page margin and sits 17pt above
            # the Chadwick diagram. Genuine labels are either centred under the
            # art or no wider than half of it.
            if a.y1 <= b.y0 and a.x0 < b.x0 - 5 and a.width > 0.5 * b.width:
                return None
            return dx + dy

        box = pymupdf.Rect(rect)
        for txt, lb in lines:
            if lb.width > 300:
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

    # Second pass: a figure must not grow past the midpoint to a horizontally
    # adjacent neighbour, or the crop picks up a slice of it. This has to use
    # the neighbours' label-extended boxes, not their raw art bboxes -- on p4
    # Cluster X ends at x=295 but Cluster Y's rotated axis title starts at
    # x=330, so trimming against Y's art would still let the title in.
    #
    # The trims are all computed from a snapshot of the untrimmed boxes:
    # reading a neighbour's box while it is being mutated makes the result
    # depend on iteration order and the midpoints compound.
    orig = [pymupdf.Rect(b) for b in boxes]
    for i in range(len(figs)):
        a = boxes[i]
        for j in range(len(figs)):
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

    for i, d in enumerate(figs):
        page = doc[d["page"] - 1]
        rect = d["rect"]
        letters = option_letters(page)
        box = boxes[i]
        clip = pymupdf.Rect(box.x0 - PAD, box.y0 - PAD,
                            box.x1 + PAD, box.y1 + PAD) & page.rect
        pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), clip=clip,
                              alpha=False)
        name = f"q{qno:02d}_{i + 1}.png"
        pix.save(os.path.join(outdir, name))
        index.append(dict(file=name, question=qno, page=d["page"],
                          kind=d["kind"],
                          option=letter_for(rect, letters),
                          bbox=[round(v, 1) for v in rect],
                          clip=[round(v, 1) for v in clip],
                          px=[pix.width, pix.height]))
        print(f"  Q{qno:<3} {name:<12} p{d['page']:<3} {d['kind']:<6} "
              f"opt={letter_for(rect, letters) or '-':<2} "
              f"{rect.width:.0f}x{rect.height:.0f}pt -> {pix.width}x{pix.height}px")

json.dump(index, open(os.path.join(outdir, "index.json"), "w", encoding="utf-8"),
          indent=1, ensure_ascii=False)

print(f"\n{len(index)} images for {len(byq)} questions "
      f"(Q{', Q'.join(str(q) for q in sorted(byq))})")
print(f"{len(rejected)} clusters rejected as non-figures")
