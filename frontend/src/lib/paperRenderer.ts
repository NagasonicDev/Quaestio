import type { ExamDocument } from "./examDocument";
import type { DocOptions, DocSection, DocStimulusItem } from "./docx";
import { buildDocxPaper, buildDocxSolutions, collectImages } from "./docx";
import { renderPaperHtml, renderSolutionsHtml } from "./examHtml";
import { DEFAULT_EXAM_PROFILE, type ExamProfile } from "./examProfile";
import type { ResolvedImage } from "./resolvers";

/** A snapshot plus the paper-render progress hook the builders want. */
export type RenderInput = ExamDocument & { onQuestionProgress?: (completed: number, total: number) => void };

/** A renderer turns a frozen snapshot plus its resolved assets into output bytes. */
export interface PaperRenderer {
  readonly format: "html" | "docx";
  renderPaper(doc: RenderInput, images: Map<string, ResolvedImage>): Promise<Blob>;
  renderSolutions(doc: ExamDocument, images: Map<string, ResolvedImage>, onProgress?: (completed: number, total: number) => void): Promise<Blob>;
}

/**
 * ExamDocument carries the same hydrated sections the legacy builders take;
 * this only fills in the fields the builders expect but the snapshot omits.
 */
function docOptions(doc: RenderInput, images: Map<string, ResolvedImage>): DocOptions {
  const profile: ExamProfile = doc.profile ?? DEFAULT_EXAM_PROFILE;
  return {
    title: doc.title,
    courseName: doc.courseName ?? "",
    achievedMarks: doc.totalMarks,
    sections: doc.sections as DocSection[],
    stimuli: doc.stimuli as DocStimulusItem[],
    resolvedImages: images,
    profile,
    onQuestionProgress: doc.onQuestionProgress,
  };
}

export const htmlRenderer: PaperRenderer = {
  format: "html",
  async renderPaper(doc, images) {
    return new Blob([renderPaperHtml(docOptions(doc, images))], { type: "text/html" });
  },
  async renderSolutions(doc, images, onProgress) {
    const resolvedImages = images.size ? images : await collectImages(doc.sections as DocSection[]);
    return new Blob([renderSolutionsHtml(doc.title, doc.sections as DocSection[], resolvedImages, onProgress)], { type: "text/html" });
  },
};

export const docxRenderer: PaperRenderer = {
  format: "docx",
  async renderPaper(doc, images) {
    return buildDocxPaper(docOptions(doc, images));
  },
  async renderSolutions(doc, _images, onProgress) {
    // Solutions builders resolve their own figures/equations in one shared pass.
    return buildDocxSolutions(doc.title, doc.sections as DocSection[], onProgress);
  },
};

/** format='pdf' is the HTML print pipeline; anything else keeps the editable DOCX export. */
export function createRenderer(format: string | undefined): PaperRenderer {
  return format === "pdf" ? htmlRenderer : docxRenderer;
}
