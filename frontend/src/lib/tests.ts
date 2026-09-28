import type { TestFile } from "./db/indexeddb";
import * as idb from "./db/indexeddb";
import type { Question } from "../api/types";
import type { TestSectionResult } from "../api/types";
import { buildDocxPaper, collectImages, type DocSection } from "./docx";
import { buildPdfPaper } from "./pdf";

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

/** Download a stored test paper with a sensible filename. */
export async function downloadTestFile(
  testId: string,
  which: "test" | "solutions",
  format: "docx" | "pdf"
): Promise<void> {
  const blob = await idb.getTestFile(testId, which);
  if (!blob?.size) {
    throw new Error("That file is no longer available in this browser. Generate the test again.");
  }
  const ext = format === "pdf" ? "pdf" : "docx";
  const filename = `${which === "solutions" ? "test-solutions" : "test-paper"}.${ext}`;
  triggerDownload(blob, filename);
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

export interface BuildOptions {
  testId: string;
  title: string;
  courseName: string;
  format: "docx" | "pdf";
  questions: Question[];
  sectionResults: TestSectionResult[];
  achievedMarks: number;
  sections: DocSection[];
  onProgress?: (progress: { phase: "selecting" | "paper" | "preview" | "saving"; questionCount?: number; completedQuestions?: number }) => void;
}

/**
 * Builds the paper and its PDF preview. The preview is the paper itself when
 * PDF was selected.
 */
export async function buildTestOutputs(options: BuildOptions): Promise<{ test: Blob; preview: Blob }> {
  const { title, courseName, format, sections, achievedMarks } = options;
  const timed = async <T>(phase: string, run: () => Promise<T>): Promise<T> => {
    const name = `test-generation:${options.testId}:${phase}`;
    const start = performance.now();
    performance.mark(`${name}:start`);
    try {
      return await run();
    } finally {
      performance.mark(`${name}:end`);
      performance.measure(name, { start, end: `${name}:end` });
    }
  };
  const resolvedImages = await timed("render", () => collectImages(sections));
  const totalQuestions = options.questions.length;
  const onQuestionProgress = (completedQuestions: number) => options.onProgress?.({ phase: "paper", questionCount: totalQuestions, completedQuestions });
  const docOptions = { title, courseName, achievedMarks, sections, resolvedImages, onQuestionProgress };
  options.onProgress?.({ phase: "paper", questionCount: options.questions.length });
  const test =
    await timed("export-paper", () => format === "pdf" ? buildPdfPaper(docOptions) : buildDocxPaper(docOptions));
  let preview = test;
  if (format !== "pdf") {
    options.onProgress?.({ phase: "preview", questionCount: options.questions.length });
    preview = await timed("export-preview", () => buildPdfPaper({ ...docOptions, onQuestionProgress: (completedQuestions) => options.onProgress?.({ phase: "preview", questionCount: totalQuestions, completedQuestions }) }));
  }
  return { test, preview };
}
