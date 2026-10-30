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
    // html2canvas does not apply print pagination. Build fixed A4 pages first,
    // then capture each page as its own bounded canvas.
    const marginStyle = doc.createElement("style");
    marginStyle.textContent = "html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; } .pdf-page { width: 210mm; height: 297mm; box-sizing: border-box; padding: 20mm 20mm 22mm; overflow: hidden; background: #fff; color: #000; } .pdf-page + .pdf-page { margin-top: 0; }";
    doc.head.appendChild(marginStyle);
    // Let webfonts and any layout settle before capturing.
    await (doc as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready;
    const pageW = 210;
    const pageH = 297;
    const scale = 2;
    const windowWidth = Math.round(210 * 96 / 25.4);
    const pxPerMm = (windowWidth * scale) / pageW;
    const cssPageH = pageH / pageW * windowWidth;
    const paddingPx = (42 * 96) / 25.4;
    const contentHeight = cssPageH - paddingPx;
    // Cap every image to a single printable page so a tall figure never aborts
    // pagination (mirrors the limit already applied in splitTallSolution).
    doc.body.querySelectorAll("img").forEach((img) => {
      img.style.maxWidth = "100%";
      img.style.maxHeight = `${contentHeight * 0.8}px`;
      img.style.width = "auto";
      img.style.objectFit = "contain";
    });
    const sourceNodes = Array.from(doc.body.children);
    doc.body.replaceChildren();
    let currentPage: HTMLDivElement | null = null;
    let pageHasContent = false;
    const newPage = () => {
      currentPage = doc.createElement("div");
      currentPage.className = "pdf-page";
      doc.body.appendChild(currentPage);
      pageHasContent = false;
      return currentPage;
    };
    const ensurePage = () => currentPage ?? newPage();
    const contentUsed = (page: HTMLDivElement) => {
      const pageTop = page.getBoundingClientRect().top;
      const contentTop = pageTop + (20 * 96 / 25.4);
      return Math.max(0, ...Array.from(page.children, (child) => child.getBoundingClientRect().bottom - contentTop));
    };
    const splitTallQuestion = (question: Element) => {
      const original = Array.from(question.children);
      const header = original.find((child) => child.classList.contains("question-head"));
      const source = original.find((child) => child.classList.contains("question-source"));
      const middle = original.filter((child) => child !== header && child !== source);
      const units: Element[] = [];
      for (const child of middle) {
        if (child.classList.contains("answer-area") && child.children.length > 1) {
          for (const line of Array.from(child.children)) {
            const area = doc.createElement("div");
            area.className = child.className;
            if (child.hasAttribute("style")) area.setAttribute("style", child.getAttribute("style") ?? "");
            area.appendChild(line);
            units.push(area);
          }
        } else {
          units.push(child);
        }
      }
      const fragment = (continued: boolean) => {
        const part = doc.createElement("div");
        part.className = `${question.className} question-fragment${continued ? " question-continuation" : ""}`;
        if (continued && header) {
          const copy = header.cloneNode(true) as HTMLElement;
          const number = copy.querySelector<HTMLElement>(".question-number");
          if (number) number.textContent = `${number.textContent} (continued)`;
          part.appendChild(copy);
        } else if (!continued && header) {
          part.appendChild(header);
        }
        ensurePage().appendChild(part);
        pageHasContent = true;
        return part;
      };
      if (currentPage && pageHasContent) newPage();
      let part = fragment(false);
      for (const unit of units) {
        part.appendChild(unit);
        if (contentUsed(ensurePage()) > contentHeight && part.children.length > (header ? 1 : 0)) {
          part.removeChild(unit);
          if (!part.classList.contains("question-continuation") && header && part.children.length === 1) {
            part.removeChild(header);
            newPage();
            part = fragment(false);
          } else {
            newPage();
            part = fragment(true);
          }
          part.appendChild(unit);
        }
        if (contentUsed(ensurePage()) > contentHeight) {
          const image = Array.from(unit.querySelectorAll("img"))[0];
          if (image) {
            image.style.maxWidth = "100%";
            image.style.maxHeight = `${contentHeight * 0.8}px`;
            image.style.width = "auto";
            image.style.objectFit = "contain";
            continue;
          }
          throw new Error("A diagram or part of a question is taller than one printable page. Reduce its size before downloading again.");
        }
      }
      if (source) {
        part.appendChild(source);
        if (contentUsed(ensurePage()) > contentHeight && part.children.length > 1) {
          part.removeChild(source);
          newPage();
          part = fragment(true);
          part.appendChild(source);
        }
      }
    };
    const splitTallSolution = (solution: Element, prefix: Element[] = []) => {
      const children = Array.from(solution.children);
      const title = children.find((child) => child.classList.contains("solutions-qtitle"));
      const source = children.find((child) => child.classList.contains("question-source"));
      const content = children.filter((child) => child !== title && child !== source);
      const units: Element[][] = [];
      for (let i = 0; i < content.length;) {
        const unit: Element[] = [];
        while (content[i]?.classList.contains("slot-heading") || content[i]?.classList.contains("slot-label")) {
          unit.push(content[i++]);
        }
        if (i < content.length) unit.push(content[i++]);
        units.push(unit);
      }
      if (currentPage && pageHasContent) newPage();
      let fragment = doc.createElement("div");
      const makeFragment = (continued: boolean) => {
        fragment = doc.createElement("div");
        fragment.className = `${solution.className} solution-fragment${continued ? " solution-continuation" : ""}`;
        if (!continued) prefix.forEach((node) => fragment.appendChild(node));
        if (title) {
          const heading = title.cloneNode(true) as HTMLElement;
          if (continued) heading.textContent = `${heading.textContent} (continued)`;
          fragment.appendChild(heading);
        }
        if (!continued && source) fragment.appendChild(source);
        ensurePage().appendChild(fragment);
        pageHasContent = true;
      };
      makeFragment(false);
      for (const unit of units) {
        unit.forEach((node) => fragment.appendChild(node));
        if (contentUsed(ensurePage()) > contentHeight && fragment.children.length > prefix.length + (title ? 1 : 0) + (source ? 1 : 0) + unit.length) {
          unit.forEach((node) => fragment.removeChild(node));
          newPage();
          makeFragment(true);
          unit.forEach((node) => fragment.appendChild(node));
        }
        if (contentUsed(ensurePage()) > contentHeight) {
          const table = unit.find((node) => node.tagName === "TABLE") as HTMLTableElement | undefined;
          if (table) {
            fragment.removeChild(table);
            const rows = Array.from(table.tBodies).flatMap((tbody) => Array.from(tbody.rows));
            let tablePage = doc.createElement("table");
            tablePage.className = table.className;
            tablePage.setAttribute("style", table.getAttribute("style") ?? "");
            if (table.tHead) tablePage.appendChild(table.tHead.cloneNode(true));
            let tbody = doc.createElement("tbody");
            tablePage.appendChild(tbody);
            fragment.appendChild(tablePage);
            for (const row of rows) {
              tbody.appendChild(row);
              if (contentUsed(ensurePage()) > contentHeight && tbody.rows.length > 1) {
                tbody.removeChild(row);
                newPage();
                makeFragment(true);
                tablePage = doc.createElement("table");
                tablePage.className = table.className;
                tablePage.setAttribute("style", table.getAttribute("style") ?? "");
                if (table.tHead) tablePage.appendChild(table.tHead.cloneNode(true));
                tbody = doc.createElement("tbody");
                tablePage.appendChild(tbody);
                fragment.appendChild(tablePage);
                tbody.appendChild(row);
              }
            }
            continue;
          }
          const list = unit.find((node) => node.tagName === "UL" || node.tagName === "OL");
          if (list && list.children.length > 1) {
            fragment.removeChild(list);
            const items = Array.from(list.children);
            let listPage = list.cloneNode(false) as HTMLElement;
            fragment.appendChild(listPage);
            let itemCount = 0;
            for (const item of items) {
              listPage.appendChild(item);
              if (contentUsed(ensurePage()) > contentHeight && listPage.children.length > 1) {
                listPage.removeChild(item);
                itemCount += listPage.children.length;
                newPage();
                makeFragment(true);
                listPage = list.cloneNode(false) as HTMLElement;
                if (list.tagName === "OL") listPage.setAttribute("start", String(itemCount + 1));
                fragment.appendChild(listPage);
                listPage.appendChild(item);
              }
            }
            continue;
          }
          const paragraph = unit
            .filter((node) => node.tagName === "P" && !node.classList.contains("slot-heading") && !node.classList.contains("slot-label") && !node.querySelector("img"))
            .sort((a, b) => (b.textContent?.length ?? 0) - (a.textContent?.length ?? 0))[0];
          if (paragraph && (paragraph.textContent?.length ?? 0) > 120) {
            const words = (paragraph.textContent ?? "").split(/\s+/);
            const chunks: string[] = [];
            let text = "";
            for (const word of words) {
              const next = text ? `${text} ${word}` : word;
              if (next.length > 900 && text) { chunks.push(text); text = word; }
              else text = next;
            }
            if (text) chunks.push(text);
            fragment.removeChild(paragraph);
            for (const chunk of chunks) {
              const continuation = paragraph.cloneNode(false) as HTMLElement;
              continuation.textContent = chunk;
              fragment.appendChild(continuation);
              if (contentUsed(ensurePage()) > contentHeight) {
                fragment.removeChild(continuation);
                newPage();
                makeFragment(true);
                fragment.appendChild(continuation);
              }
            }
            continue;
          }
          const image = unit.flatMap((node) => Array.from(node.querySelectorAll("img")))[0];
          if (image) {
            image.style.maxWidth = "100%";
            image.style.maxHeight = `${contentHeight * 0.8}px`;
            image.style.width = "auto";
            image.style.objectFit = "contain";
            continue;
          }
          // The remaining case is one exceptionally tall text item without
          // markup boundaries. Break it into short paragraphs at word edges.
          const textNode = unit.find((node) => (node.textContent?.trim().length ?? 0) > 120);
          if (textNode) {
            const words = (textNode.textContent ?? "").split(/\s+/);
            const chunks: string[] = [];
            let chunk = "";
            for (const word of words) {
              const next = chunk ? `${chunk} ${word}` : word;
              if (next.length > 700 && chunk) { chunks.push(chunk); chunk = word; }
              else chunk = next;
            }
            if (chunk) chunks.push(chunk);
            fragment.removeChild(textNode);
            for (const value of chunks) {
              const continuation = textNode.cloneNode(false) as HTMLElement;
              continuation.textContent = value;
              fragment.appendChild(continuation);
              if (contentUsed(ensurePage()) > contentHeight) {
                fragment.removeChild(continuation);
                newPage();
                makeFragment(true);
                fragment.appendChild(continuation);
              }
            }
          }
        }
      }
    };
    const addNode = (node: Element) => {
      const page = ensurePage();
      page.appendChild(node);
      if (contentUsed(page) > contentHeight && pageHasContent) {
        page.removeChild(node);
        newPage().appendChild(node);
      }
      const activePage = ensurePage();
      if (contentUsed(activePage) > contentHeight) {
        const question = node.matches(".question, .solutions-question");
        if (question) {
          activePage.removeChild(node);
          pageHasContent = false;
          if (node.classList.contains("question")) splitTallQuestion(node);
          else splitTallSolution(node);
          return;
        }
        throw new Error("Some content is taller than one printable page. Shorten it before downloading again.");
      }
      pageHasContent = true;
    };
    const addBatch = (nodes: Element[]) => {
      if (!nodes.length) return;
      const page = ensurePage();
      const wasEmpty = !pageHasContent;
      nodes.forEach((node) => page.appendChild(node));
      if (contentUsed(page) > contentHeight && !wasEmpty) {
        nodes.forEach((node) => page.removeChild(node));
        const next = newPage();
        nodes.forEach((node) => next.appendChild(node));
      }
      const active = ensurePage();
      if (contentUsed(active) > contentHeight) {
        const solution = nodes.find((node) => node.classList.contains("solutions-question"));
        const prefix = nodes.filter((node) => node !== solution);
        if (solution) {
          nodes.forEach((node) => active.removeChild(node));
          pageHasContent = false;
          splitTallSolution(solution, prefix);
        } else {
          throw new Error("A section heading and its first question cannot fit on one page. Shorten the content before downloading again.");
        }
      }
      pageHasContent = true;
    };
    const startPage = () => {
      if (!currentPage || pageHasContent) newPage();
    };

    const alreadyPlaced = new Set<Element>();
    for (const node of sourceNodes) {
      if (alreadyPlaced.has(node)) continue;
      if (node.classList.contains("page-break")) {
        startPage();
        continue;
      }
      if (node.matches(".paper-section")) {
        startPage();
        const children = Array.from(node.children);
        const firstQuestionIndex = children.findIndex((child) => child.classList.contains("question"));
        const lead = firstQuestionIndex >= 0 ? children.slice(0, firstQuestionIndex + 1) : children;
        addBatch(lead);
        for (const child of children.slice(lead.length)) addNode(child);
        continue;
      }
      if (node.classList.contains("solutions-section")) {
        startPage();
        const next = node.nextElementSibling;
        if (next?.classList.contains("solutions-question")) {
          addBatch([node, next]);
          alreadyPlaced.add(next);
          let sibling = next.nextElementSibling;
          while (sibling?.classList.contains("solutions-question")) {
            const following = sibling.nextElementSibling;
            addNode(sibling);
            alreadyPlaced.add(sibling);
            sibling = following;
          }
        } else {
          addNode(node);
        }
        continue;
      }
      if (node.matches(".cover")) {
        startPage();
        addNode(node);
        startPage();
        continue;
      }
      addNode(node);
    }
    const pages = Array.from(doc.body.querySelectorAll<HTMLElement>(".pdf-page"));
    const totalPages = pages.length;
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    for (let page = 0; page < totalPages; page++) {
      const slice = await html2canvas(pages[page], {
        backgroundColor: "#ffffff",
        scale,
        windowWidth,
        windowHeight: cssPageH,
        width: windowWidth,
        height: cssPageH,
      });
      const ctx = slice.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("The test file could not be rendered.");
      const samplePoints = [
        [8, 8], [slice.width - 9, 8], [8, slice.height - 9], [slice.width - 9, slice.height - 9],
      ];
      const hasPageBackground = samplePoints.some(([x, y]) => {
        const pixel = ctx.getImageData(x, y, 1, 1).data;
        return pixel[3] > 0 && (pixel[0] > 220 || pixel[1] > 220 || pixel[2] > 220);
      });
      if (!hasPageBackground) {
        throw new Error(`Page ${page + 1} could not be rendered. Please try downloading the PDF again.`);
      }
      if (page > 0) pdf.addPage();
      pdf.addImage(slice.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, pageW, (slice.height / pxPerMm));
      // Restore the page number/footer that @page margin boxes provide in print.
      pdf.setFontSize(9);
      pdf.setTextColor(107, 107, 100);
      pdf.text(`Page ${page + 1} of ${totalPages}`, pageW / 2, pageH - 8, { align: "center" });
      pdf.text("Made with Quaestio", 20, pageH - 8);
    }
    return pdf.output("blob");
  } finally {
    frame.remove();
    URL.revokeObjectURL(url);
  }
}
