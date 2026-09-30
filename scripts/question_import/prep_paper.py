"""Turn a source PDF into a per-page working folder.

    python prep_paper.py "D:\\exams\\my-course\\exam-paper.pdf" --out work/paper/pages
    python prep_paper.py paper.pdf --out work/x --dpi 200

Writes into `<out>/`:
    p001.txt   extracted text for the page (searchable, usually good enough)
    p001.png   page render at --dpi (READ THIS whenever the text looks wrong:
               BOSTES PDFs mangle subscripts, matrices, tables and arrows)
    meta.json  page count, sizes, and where each page's images live

This is deliberately boring. The value is that every later step can quote a
`source.page` and the agent can go straight to that one PNG.
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
except ImportError:  # older wheels expose the module as `fitz`
    import fitz


def main() -> int:
    enable_utf8_stdout()
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pdf")
    ap.add_argument("--out", required=True)
    ap.add_argument("--dpi", type=int, default=150,
                    help="page render dpi (150 for reading, 200+ for crops)")
    ap.add_argument("--pages", help="1-based inclusive page range, e.g. 3-18")
    a = ap.parse_args()

    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(a.pdf)

    lo, hi = 1, doc.page_count
    if a.pages:
        p0, _, p1 = a.pages.partition("-")
        lo, hi = int(p0), int(p1 or p0)

    meta = {"source": str(Path(a.pdf).resolve()), "page_count": doc.page_count,
            "dpi": a.dpi, "pages": []}
    for pno in range(lo - 1, min(hi, doc.page_count)):
        page = doc[pno]
        n = pno + 1
        (out / f"p{n:03d}.txt").write_text(page.get_text("text"),
                                           encoding="utf-8", errors="replace")
        page.get_pixmap(dpi=a.dpi).save(out / f"p{n:03d}.png")
        imgs = []
        for i, info in enumerate(page.get_images(full=True), start=1):
            xref = info[0]
            rects = page.get_image_rects(xref)
            imgs.append({"index": i, "xref": xref,
                         "w": info[2], "h": info[3],
                         "rects": [[round(v, 1) for v in r] for r in rects]})
        meta["pages"].append({"page": n, "text_chars": len(page.get_text("text")),
                              "images": imgs,
                              "size": [round(v, 1) for v in page.rect]})
        print(f"p{n:03d}  text={meta['pages'][-1]['text_chars']:>5}  "
              f"raster={len(imgs)}")

    (out / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"\n{doc.page_count} pages in {Path(a.pdf).name} -> {out}")
    print("next: python extract_figures.py %s --out %s/figs" % (a.pdf, out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
