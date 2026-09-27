import sys, os
import fitz

src = sys.argv[1]
dst = sys.argv[2]
doc = fitz.open(src)
out = []
for i, page in enumerate(doc):
    out.append(f"\n===== PAGE {i+1} =====\n")
    out.append(page.get_text("text"))
os.makedirs(os.path.dirname(dst), exist_ok=True)
with open(dst, "w", encoding="utf-8") as f:
    f.write("".join(out))
print(f"{src} -> {dst} ({len(doc)} pages)")
