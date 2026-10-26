import type { TestFile } from "./db/indexeddb";
import * as idb from "./db/indexeddb";
import type { Question } from "../api/types";
import type { TestSectionResult } from "../api/types";
import { collectImages, type DocSection } from "./docx";
import type { ExamDocument } from "./examDocument";
import { createRenderer, type RenderInput } from "./paperRenderer";
import { logTiming } from "./timing";

const urlCache = new Map<string, string>();

function key(testId: string, which: TestFile): string {
  return `${testId}:${which}`;
}

function revokeUrl(testId: string, which: TestFile): void {
  const url = urlCache.get(key(testId, which));
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(key(testId, which));
  }
}

/** Store the paper and its in-app preview, then register fresh object URLs. */
export async function storeTestFiles(
  testId: string,
  files: { test: Blob; preview: Blob }
): Promise<void> {
  for (const which of ["test", "preview"] as const) revokeUrl(testId, which);
  await idb.putTestFile(testId, "test", files.test);
  await idb.putTestFile(testId, "preview", files.preview);
  // Register URLs from the blobs we already have. Reading them back from
  // IndexedDB immediately after writing can race the transaction commit and
  // yield empty download/preview links.
  for (const which of ["test", "preview"] as const) {
    urlCache.set(key(testId, which), URL.createObjectURL(files[which]));
  }
}

/** Resolve a file to an object URL, loading from IndexedDB if not registered yet. */
export async function ensureTestFileUrl(testId: string, which: TestFile): Promise<string | null> {
  const cached = urlCache.get(key(testId, which));
  if (cached) return cached;
  const blob = await idb.getTestFile(testId, which);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(key(testId, which), url);
  return url;
}

export function testFileUrlSync(testId: string, which: TestFile): string | null {
  return urlCache.get(key(testId, which)) ?? null;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Send a stored artifact to the user. HTML artifacts (the "pdf" pipeline) are
 * rasterised into a real PDF file so the download is one click with no print
 * dialog; legacy PDF and DOCX blobs download directly. The branch keys off the
 * blob's type, not the row's format, so legacy rows keep working.
 */
export async function downloadTestFile(
  testId: string,
  which: "test" | "solutions",
  format: "docx" | "pdf",
  testTitle?: string
): Promise<void> {
  const blob = await idb.getTestFile(testId, which);
  if (!blob?.size) {
    throw new Error("That file is no longer available in this browser. Generate the test again.");
  }
  const safeTitle = (testTitle ?? "Test")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim() || "Test";
  const base = which === "solutions" ? `${safeTitle} - Solutions` : safeTitle;
  if (blob.type === "text/html") {
    const { htmlBlobToPdfBlob } = await import("./htmlToPdf");
    triggerDownload(await htmlBlobToPdfBlob(blob), `${base}.pdf`);
    return;
  }
  const ext = blob.type === "application/pdf" || format === "pdf" ? "pdf" : "docx";
  triggerDownload(blob, `${base}.${ext}`);
}

export async function storeTestSolutionFile(testId: string, blob: Blob): Promise<void> {
  revokeUrl(testId, "solutions");
  await idb.putTestFile(testId, "solutions", blob);
  urlCache.set(key(testId, "solutions"), URL.createObjectURL(blob));
}

/** Remove a test's files from IndexedDB and revoke its object URLs. */
export async function deleteTestOutputs(testId: string): Promise<void> {
  for (const which of ["test", "preview", "solutions"] as const) revokeUrl(testId, which);
  await idb.deleteTestFiles(testId);
}

export interface TestStimulusItem {
  stimulus: import("../api/types").StimulusWithContent;
  questionNumbers: number[];
}

export interface BuildOptions {
  testId: string;
  title: string;
  courseName: string;
  format: "docx" | "pdf";
  questions: Question[];
  sectionResults: TestSectionResult[];
  achievedMarks: number;
  sections: DocSection[];
  stimuli?: TestStimulusItem[];
  /** The frozen snapshot the renderers draw from; sections/stimuli are overlaid from the fields above. */
  doc: ExamDocument;
  onProgress?: (progress: { phase: "selecting" | "paper" | "preview" | "saving"; questionCount?: number; completedQuestions?: number }) => void;
}

/**
 * Builds the paper and its preview. For the HTML pipeline (format "pdf") the
 * preview is the paper itself, so the preview is literally the output. DOCX is
 * an editable export and its preview is HTML from the same snapshot, which is
 * why a DOCX preview is not pixel-identical to the DOCX file.
 */
export async function buildTestOutputs(options: BuildOptions): Promise<{ test: Blob; preview: Blob }> {
  const { format, sections, stimuli } = options;
  const timed = async <T>(phase: string, run: () => Promise<T>): Promise<T> => {
    const name = `test-generation:${options.testId}:${phase}`;
    const start = performance.now();
    performance.mark(`${name}:start`);
    try {
      return await run();
    } finally {
      performance.mark(`${name}:end`);
      performance.measure(name, { start, end: `${name}:end` });
      logTiming(`paper:${phase}`, start);
    }
  };
  const resolvedImages = await timed("render", () => collectImages(sections, stimuli));
  const totalQuestions = options.questions.length;
  const renderer = createRenderer(format);
  const doc: RenderInput = { ...options.doc, sections, stimuli: stimuli ?? [] };
  options.onProgress?.({ phase: "paper", questionCount: totalQuestions });
  const test = await timed("export-paper", () =>
    renderer.renderPaper({ ...doc, onQuestionProgress: (completed) => options.onProgress?.({ phase: "paper", questionCount: totalQuestions, completedQuestions: completed }) }, resolvedImages));
  let preview = test;
  if (renderer.format !== "html") {
    options.onProgress?.({ phase: "preview", questionCount: totalQuestions });
    const htmlRenderer = createRenderer("pdf");
    preview = await timed("export-preview", () =>
      htmlRenderer.renderPaper({
        ...doc,
        onQuestionProgress: (completed) => options.onProgress?.({ phase: "preview", questionCount: totalQuestions, completedQuestions: completed }),
      }, resolvedImages));
  }
  return { test, preview };
}
