"""Find *candidate* figure regions on each page and render them as PNGs.

    python extract_figures.py "D:\\exams\\my-course\\exam.pdf" \
        --out work/2006/qp/figs --pages 1-30

READ THIS BEFORE TRUSTING THE OUTPUT.

    These are CANDIDATES, not figures. In a full exam-paper conversion the
    majority of auto-crops had to be thrown away and re-cut by hand, because
    this heuristic:

      * clusters vector drawings and raster images, so one multi-panel figure
        comes out as ONE crop and must be split per panel (very common for
        MCQ options -- "q10_a".."q10_d");
      * clips or merges axis labels, so a graph loses its axis titles;
      * picks up page furniture -- header rules, footer lines, "Marks" rules,
        answer-line boxes, the logos, section contents lists;
      * splits a data table into a single column when the table is drawn as
        separate ruled rectangles;
      * misses a figure entirely (e.g. a logic circuit drawn late on a page).

    So: run this to get a starting inventory and a rough bbox list, then
    RE-CUT every figure you actually use with `crop.py` (below) and read each
    PNG back with your image tool before it goes in the bundle. Auto-crops that
    survive verification are fine -- just verify them.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from qbx_lib import enable_utf8_stdout  # noqa: E402

try:
    import pymupdf as fitz
except ImportError:
    import fitz

# Anything taller than this relative to the page is page furniture, not a figure.
MIN_W_FRAC, MIN_H_FRAC = 0.06, 0.02
MAX_H_FRAC = 0.62
MAX_AREA_FRAC = 0.55


def _grow(r: fitz.Rect, pad: float = 2.0) -> fitz.Rect:
    return fitz.Rect(max(0, r.x0 - pad), max(0, r.y0 - pad),
                     r.x1 + pad, r.y1 + pad)


def candidates(page):
    """Rectangles that plausibly contain a figure, page-relative."""
    W, H = page.rect.width, page.rect.height
    hdr, ftr = H * 0.06, H * 0.94
    boxes = []

    def add(r, kind):
        if r.is_empty or r.is_infinite:
            return
        r = fitz.Rect(r)
        if r.height < H * MIN_H_FRAC or r.width < W * MIN_W_FRAC:
            return
        if r.height > H * MAX_H_FRAC:
            return
        if (r.width * r.height) > (W * H * MAX_AREA_FRAC):
            return
        if r.y1 <= hdr or r.y0 >= ftr:      # header / footer strip
            return
        if r.width > W * 0.97 and r.height > H * 0.9:
            return                            # page border frame
        if r.width > W * 0.90 and r.height < H * 0.012:
            return                            # full-width horizontal rule
        if r.height > H * 0.80 and r.width > W * 0.90:
            return                            # empty answer box
        boxes.append({"rect": r, "kind": kind})

    for d in page.get_drawings():
        add(fitz.Rect(d["rect"]), "vector")
    for info in page.get_images(full=True):
        for r in page.get_image_rects(info[0]):
            add(r, "raster")

    # merge overlapping/adjacent clusters, then split what is clearly 2x2
    boxes.sort(key=lambda b: (b["rect"].y0, b["rect"].x0))
    merged: list[dict] = []
    for b in boxes:
        grown = _grow(b["rect"])
        hit = None
        for m in merged:
            inter = fitz.Rect(m["rect"])
            inter.intersect(grown)
            if not inter.is_empty and inter.get_area() > 0.25 * grown.get_area():
                hit = m
                break
        if hit:
            hit["rect"] |= b["rect"]
            hit["kinds"].add(b["kind"])
        else:
            merged.append({"rect": fitz.Rect(b["rect"]), "kinds": {b["kind"]}})
    # second pass: merge anything now overlapping
    changed = True
    while changed:
        changed = False
        for i in range(len(merged)):
            for j in range(i + 1, len(merged)):
                inter = fitz.Rect(merged[i]["rect"])
                inter.intersect(merged[j]["rect"])
                if not inter.is_empty and inter.get_area() > 0.15 * min(
                        merged[i]["rect"].get_area(), merged[j]["rect"].get_area()):
                    merged[i]["rect"] |= merged[j]["rect"]
                    merged[i]["kinds"] |= merged[j]["kinds"]
                    merged.pop(j)
                    changed = True
                    break
            if changed:
                break
    out = []
    for m in merged:
        r = m["rect"] & page.rect
        if r.is_empty:
            continue
        out.append({"rect": r, "kinds": sorted(m["kinds"])})
    return out


def main() -> int:
    enable_utf8_stdout()
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pdf")
    ap.add_argument("--out", required=True, help="figures output dir")
    ap.add_argument("--pages", default=None, help="1-based page range, e.g. 3-18")
    ap.add_argument("--dpi", type=int, default=200)
    a = ap.parse_args()

    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(a.pdf)
    lo, hi = 1, doc.page_count
    if a.pages:
        p0, _, p1 = a.pages.partition("-")
        lo, hi = int(p0), int(p1 or p0)

    index = []
    for pno in range(lo - 1, min(hi, doc.page_count)):
        page = doc[pno]
        for k, c in enumerate(candidates(page), start=1):
            name = f"p{pno + 1:03d}_f{k:02d}.png"
            page.get_pixmap(dpi=a.dpi, clip=c["rect"]).save(out / name)
            index.append({"page": pno + 1, "file": name,
                          "kinds": c["kinds"],
                          "rect": [round(v, 1) for v in c["rect"]],
                          "verified": False})
            print(f"{name}  {c['kinds']}  "
                  f"w={c['rect'].width:.0f} h={c['rect'].height:.0f}")
    (out.parent / "figs.json").write_text(json.dumps(index, indent=2),
                                          encoding="utf-8")
    (out / "README.txt").write_text(
        "AUTO CANDIDATES -- not verified, not all figures.\n"
        "Re-cut what you use with crop.py and read every PNG back.\n"
        "Split 2x2 multi-panel figures into one image per MCQ option.\n"
        "Check: axis labels, (A)/(B) markers, column completeness, clipped "
        "symbols, stray header/footer rules.\n", encoding="utf-8")
    print(f"\n{len(index)} candidates -> {out}\nVERIFY EVERY ONE BEFORE USE.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
