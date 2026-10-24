import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

/**
 * Rasterise a self-contained HTML artifact into a real PDF file the user can
 * download. The HTML is rendered at A4 width in a hidden same-origin iframe,
 * captured page by page with html2canvas, and each slice is written into a
 * jsPDF page. Text becomes an image (no selectable text), which is the price
 * of producing a file with no print dialog. Lazy-loaded so the ~400 kB of
 * rasteriser code stays out of the entry bundle.
 */
export async function htmlBlobToPdfBlob(blob: Blob): Promise<Blob> {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0";
  const url = URL.createObjectURL(blob);
  frame.src = url;
  document.body.appendChild(frame);
  try {
    await new Promise<void>((resolve) => {
      frame.onload = () => resolve();
    });
    const win = frame.contentWindow;
    const doc = win?.document;
    if (!doc?.body) throw new Error("The test file could not be rendered.");
    // Mimic the @page margins from the print stylesheet on screen, since
    // html2canvas captures the screen layout (where @page is ignored).
    const marginStyle = doc.createElement("style");
    marginStyle.textContent = "body { padding: 20mm 20mm 22mm 20mm; box-sizing: border-box; }";
    doc.head.appendChild(marginStyle);
    // Let webfonts and any layout settle before capturing.
    await (doc as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready;
    const canvas = await html2canvas(doc.body, {
      backgroundColor: "#ffffff",
      scale: 2,
      windowWidth: doc.documentElement.scrollWidth,
    });
    const pageW = 210;
    const pageH = 297;
    const pxPerMm = canvas.width / pageW;
    const sliceH = Math.floor(pageH * pxPerMm);
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    const totalPages = Math.max(1, Math.ceil(canvas.height / sliceH));
    for (let y = 0, page = 1; y < canvas.height; y += sliceH, page++) {
      const height = Math.min(sliceH, canvas.height - y);
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = height;
      const ctx = slice.getContext("2d");
      if (!ctx) throw new Error("The test file could not be rendered.");
      ctx.drawImage(canvas, 0, y, canvas.width, height, 0, 0, canvas.width, height);
      if (y > 0) pdf.addPage();
      pdf.addImage(slice.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, pageW, (height / pxPerMm));
      // Restore the page number/footer that @page margin boxes provide in print.
      pdf.setFontSize(9);
      pdf.setTextColor(107, 107, 100);
      pdf.text(`Page ${page} of ${totalPages}`, pageW / 2, pageH - 8, { align: "center" });
      pdf.text("Made with Quaestio", 20, pageH - 8);
    }
    return pdf.output("blob");
  } finally {
    frame.remove();
    URL.revokeObjectURL(url);
  }
}
