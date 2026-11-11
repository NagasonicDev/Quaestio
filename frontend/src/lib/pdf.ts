import type { PDFDocumentLoadingTask } from "pdfjs-dist";
import { uploadAsset } from "./assets.ts";

const MAX_PDF_BYTES = 25 * 1024 * 1024;
const MAX_PAGES = 20;
// 2x A4 is about 150 dpi: sharp on screen and in print without huge PNGs.
const RENDER_SCALE = 2;

export interface PdfImageBlock {
  block_type: "image";
  content: { asset_path: string; alt_text: string; caption: string };
}

/**
 * Rasterises every page of a PDF into a stored image asset so the document
 * renders inline everywhere blocks already render (study, print, PDF/Word
 * export). The original PDF is not kept.
 */
export async function pdfToImageBlocks(file: File): Promise<PdfImageBlock[]> {
  if (file.size > MAX_PDF_BYTES) {
    throw new Error("PDF too large (max 25 MB)");
  }

  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  let loadingTask: PDFDocumentLoadingTask | null = null;
  try {
    loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    const doc = await loadingTask.promise;
    if (doc.numPages > MAX_PAGES) {
      throw new Error(`PDF has ${doc.numPages} pages (max ${MAX_PAGES})`);
    }

    const base = file.name.replace(/\.pdf$/i, "") || "document";
    const blocks: PdfImageBlock[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: RENDER_SCALE });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport }).promise;

      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((result) => (result ? resolve(result) : reject(new Error("Could not render PDF page"))), "image/png")
      );
      const uploaded = await uploadAsset(
        new File([blob], `${base}-page-${pageNumber}.png`, { type: "image/png" })
      );
      blocks.push({
        block_type: "image",
        content: {
          asset_path: uploaded.asset_path,
          alt_text: `${base} page ${pageNumber}`,
          caption: doc.numPages > 1 ? `Page ${pageNumber} of ${doc.numPages}` : "",
        },
      });
    }
    return blocks;
  } finally {
    await loadingTask?.destroy();
  }
}
