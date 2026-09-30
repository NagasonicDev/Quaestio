"""Re-cut a figure precisely, by hand-measured bbox in PDF points.

Auto-crops from extract_figures.py are rarely good enough. This is the tool
you actually use: find the bbox on the page render (pNNN.png), then

    python crop.py paper.pdf --page 6 --name q10_a --rect 62,410,300,560 --dpi 220
    python crop.py paper.pdf --page 6 --from 62,410 --size 238,150 --name q10_a

`--grid` overlays a coordinate grid on a page render so you can read the
numbers off the picture instead of guessing:

    python crop.py paper.pdf --grid --page 6 --out p006_grid.png

Coordinates are PyMuPDF points with the origin at the TOP-LEFT of the page.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from qbx_lib import enable_utf8_stdout  # noqa: E402

try:
    import pymupdf as fitz
except ImportError:
    import fitz


def _rect(spec: str) -> fitz.Rect:
    vals = [float(v) for v in spec.replace(" ", "").split(",")]
    if len(vals) != 4:
        raise SystemExit("--rect needs x0,y0,x1,y1")
    return fitz.Rect(*vals)


def _grid(page, dpi: int) -> fitz.Pixmap:
    step = 25.0
    W, H = page.rect.width, page.rect.height
    shapes = page.new_shape()
    x = 0.0
    while x <= W:
        shapes.draw_line(fitz.Point(x, 0), fitz.Point(x, H))
        x += step
    y = 0.0
    while y <= H:
        shapes.draw_line(fitz.Point(0, y), fitz.Point(W, y))
        y += step
    shapes.finish(color=(1, 0, 0), width=0.4)
    shapes.commit()
    pix = page.get_pixmap(dpi=dpi)
    return pix


def main() -> int:
    enable_utf8_stdout()
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pdf")
    ap.add_argument("--page", type=int, help="1-based page number")
    ap.add_argument("--rect", help="x0,y0,x1,y1 in points")
    ap.add_argument("--from", dest="frm", help="x0,y0 (with --size)")
    ap.add_argument("--size", help="w,h (with --from)")
    ap.add_argument("--name", help="output png stem, e.g. q10_a")
    ap.add_argument("--out", help="output path (default: <name>.png here)")
    ap.add_argument("--dpi", type=int, default=220)
    ap.add_argument("--grid", action="store_true",
                    help="render the page with a 25pt grid and exit")
    ap.add_argument("--annotate", action="store_true",
                    help="draw the --rect on the grid render")
    a = ap.parse_args()

    doc = fitz.open(a.pdf)

    if a.grid:
        page = doc[(a.page or 1) - 1]
        out = Path(a.out or f"p{(a.page or 1):03d}_grid.png")
        _grid(page, 150).save(out)
        print(f"grid every 25pt -> {out}")
        if a.annotate and a.rect:
            r = _rect(a.rect)
            page.draw_rect(r, color=(0, 0, 1), width=1.5)
            page.get_pixmap(dpi=150).save(out.with_name(out.stem + "_marked.png"))
            print(f"marked -> {out.with_name(out.stem + '_marked.png')}")
        return 0

    if not (a.page and a.name and (a.rect or (a.frm and a.size))):
        raise SystemExit("need --page --name and (--rect | --from --size)")

    page = doc[a.page - 1]
    r = _rect(a.rect) if a.rect else fitz.Rect(
        *[float(v) for v in f"{a.frm},{a.size}".split(",")])
    r = r & page.rect
    out = Path(a.out or f"{a.name}.png")
    out.parent.mkdir(parents=True, exist_ok=True)
    page.get_pixmap(dpi=a.dpi, clip=r).save(out)
    print(f"{a.name}: page {a.page} rect=({r.x0:.0f},{r.y0:.0f},{r.x1:.0f},"
          f"{r.y1:.0f}) -> {out}  ({r.width:.0f}x{r.height:.0f}pt)")
    print("NOW READ THE PNG BACK AND CHECK: axis labels, (A)/(B) markers, "
          "all table columns, no clipped symbols, no stray header/footer rule.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
