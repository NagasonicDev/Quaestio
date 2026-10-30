import type { Question } from "../api/types";
import { getFirst, all, run } from "./db/sqlite";
import * as idb from "./db/indexeddb";
import { contentHash } from "./storage";

const ALLOWED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"];
const MAX_BYTES = 15 * 1024 * 1024;

// Registry of live object URLs keyed by asset_id (used synchronously by assetUrl).
const urlCache = new Map<string, string>();

function extensionOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i >= 0 ? filename.slice(i).toLowerCase() : "";
}

function mimeFromExtension(ext: string): string {
  switch (ext) {
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".gif": return "image/gif";
    case ".webp": return "image/webp";
    case ".svg": return "image/svg+xml";
    default: return "application/octet-stream";
  }
}

/**
 * Client-side stand-in for backend POST /uploads: validates like the REST
 * endpoint, then stores the blob in IndexedDB under a fresh asset_id and
 * registers an object URL immediately so editors can preview it.
 */
export async function uploadAsset(file: File): Promise<{
  asset_path: string;
  mime_type: string;
  original_filename: string;
}> {
  const ext = extensionOf(file.name);
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error(
      `Unsupported file type '${ext}'. Allowed: ${[...ALLOWED_EXTENSIONS].sort().join(", ")}`
    );
  }
  if (file.size > MAX_BYTES) {
    throw new Error("File too large (max 15 MB)");
  }
  // Content-hash dedupe: the same bytes are stored once, so a repeated diagram
  // does not multiply IndexedDB usage. The existing id is returned unchanged.
  const hash = await contentHash(new Uint8Array(await file.arrayBuffer()));
  const existing = await idb.getAsset(hash);
  if (existing) {
    registerUrl(hash, existing);
    return {
      asset_path: hash,
      mime_type: existing.type || file.type || mimeFromExtension(ext),
      original_filename: file.name,
    };
  }
  const assetId = hash;
  await idb.putAsset(assetId, file);
  registerUrl(assetId, file);
  return {
    asset_path: assetId,
    mime_type: file.type || mimeFromExtension(ext),
    original_filename: file.name,
  };
}

function registerUrl(assetId: string, blob: Blob): void {
  if (!urlCache.has(assetId)) {
    urlCache.set(assetId, URL.createObjectURL(blob));
  }
}

/** Synchronous lookup used by renderers (QuestionReader / BlockEditor). */
export function assetUrl(assetIdOrPath: string): string {
  return urlCache.get(assetIdOrPath) ?? "";
}

/** Load an asset's blob from IndexedDB and register its object URL. */
export async function ensureAssetUrl(assetId: string): Promise<string> {
  const cached = urlCache.get(assetId);
  if (cached) return cached;
  const blob = await idb.getAsset(assetId);
  if (!blob) return "";
  registerUrl(assetId, blob);
  return urlCache.get(assetId) ?? "";
}

/** Register every asset referenced by a question tree (question + parts). */
export async function registerQuestionAssets(question: Question): Promise<void> {
  const ids = new Set<string>();
  const collect = (current: Question) => {
    for (const asset of current.assets ?? []) ids.add(asset.asset_id);
    for (const option of current.mcq_options ?? []) {
      for (const block of option.content ?? []) {
        const path = block.content?.asset_path;
        if (typeof path === "string" && path) ids.add(path);
      }
    }
    for (const part of current.parts ?? []) collect(part);
  };
  collect(question);
  for (const id of ids) await ensureAssetUrl(id);
}

/**
 * The client-only twin of backend finalize_uploaded_assets: ensure every
 * image/diagram/graph block whose asset_path refers to a stored blob gets an
 * Asset row so the ownership record stays complete. Re-runs are no-ops.
 */
export async function finalizeQuestionAssets(
  questionId: string,
  rows: Array<{ slot: string; position: number; block_type: string; content_json: string }>
): Promise<void> {
  const IMAGE_TYPES = new Set(["image", "diagram", "graph"]);
  const seen = new Set<string>();
  const blobs = await idb.listAssetIds();
  const blobSet = new Set(blobs);
  for (const row of rows) {
    if (!IMAGE_TYPES.has(row.block_type)) continue;
    let content: any;
    try {
      content = JSON.parse(row.content_json);
    } catch {
      continue;
    }
    const path = content?.asset_path;
    if (typeof path !== "string" || !path || seen.has(path)) continue;
    seen.add(path);
    if (!blobSet.has(path)) continue;
    const existing = await getAssetRow(path);
    if (existing) continue;
    const blob = await idb.getAsset(path);
    const mime =
      blob?.type || mimeFromExtension(extensionOf(path)) || "application/octet-stream";
    await insertAsset(path, questionId, mime, content.alt_text ?? null, content.caption ?? null);
  }
}

async function getAssetRow(assetId: string): Promise<any> {
  return getFirst("SELECT asset_id FROM asset WHERE asset_id = ?", [assetId]);
}

async function insertAsset(
  assetId: string,
  questionId: string,
  mime: string,
  altText: string | null,
  caption: string | null
): Promise<void> {
  await run(
    `INSERT INTO asset (asset_id, question_id, file_path, mime_type, width, height, alt_text, caption, original_filename)
     VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, NULL)`,
    [assetId, questionId, assetId, mime, altText, caption]
  );
}

/**
 * Remove an asset's blob + object URL (used on question delete). Content-hash
 * ids mean several questions can share one blob, so the blob and its cached URL
 * are only dropped once no question still references it.
 */
export async function deleteAssetBlob(assetId: string): Promise<void> {
  const refCount = await countAssetReferences(assetId);
  if (refCount > 0) return;
  await deleteUnreferencedAssetBlob(assetId);
}

/** Delete a blob after the caller has confirmed no question references it. */
export async function deleteUnreferencedAssetBlob(assetId: string): Promise<void> {
  const url = urlCache.get(assetId);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(assetId);
  }
  await idb.deleteAsset(assetId);
}

/** All asset ids still referenced anywhere in course content, in a single pass. */
export async function referencedAssetIds(): Promise<Set<string>> {
  const used = new Set<string>();
  const [blockRows, optionRows, stimulusRows] = await Promise.all([
    all<{ content_json: string }>("SELECT content_json FROM content_block WHERE block_type IN ('image', 'diagram', 'graph')"),
    all<{ content_json: string }>("SELECT content_json FROM mcq_option"),
    all<{ content_json: string }>("SELECT content_json FROM stimulus_block"),
  ]);
  const discardCollect = (value: unknown) => {
    if (typeof value !== "string") return;
    used.add(value);
  };
  for (const row of blockRows) {
    try { discardCollect(JSON.parse(row.content_json)?.asset_path); } catch { /* malformed JSON — skip */ }
  }
  for (const row of optionRows) {
    try {
      const parsed = JSON.parse(row.content_json);
      for (const block of Array.isArray(parsed) ? parsed : [parsed]) discardCollect(block?.content?.asset_path);
    } catch { /* malformed JSON — skip */ }
  }
  for (const row of stimulusRows) {
    try {
      const parsed = JSON.parse(row.content_json);
      if (Array.isArray(parsed)) {
        for (const block of parsed) discardCollect(block?.content?.asset_path ?? block?.asset_path);
      } else {
        discardCollect(parsed?.asset_path ?? parsed?.content?.asset_path);
      }
    } catch { /* malformed JSON — skip */ }
  }
  return used;
}
export async function findUnreferencedAssetIds(assetIds: Iterable<string>): Promise<string[]> {
  const unreferenced = new Set(assetIds);
  if (!unreferenced.size) return [];
  const [blocks, options, stimuli] = await Promise.all([
    all<{ content_json: string }>("SELECT content_json FROM content_block WHERE block_type IN ('image', 'diagram', 'graph')"),
    all<{ content_json: string }>("SELECT content_json FROM mcq_option"),
    all<{ content_json: string }>("SELECT content_json FROM stimulus_block"),
  ]);
  const discard = (path: unknown) => {
    if (typeof path === "string") unreferenced.delete(path);
  };
  for (const row of blocks) {
    try { discard(JSON.parse(row.content_json)?.asset_path); } catch { /* malformed JSON — skip */ }
  }
  for (const row of options) {
    try {
      const parsed = JSON.parse(row.content_json);
      for (const block of Array.isArray(parsed) ? parsed : [parsed]) discard(block?.content?.asset_path);
    } catch { /* malformed JSON — skip */ }
  }
  for (const row of stimuli) {
    try {
      const parsed = JSON.parse(row.content_json);
      if (Array.isArray(parsed)) {
        for (const block of parsed) discard(block?.content?.asset_path);
      } else {
        discard(parsed?.asset_path ?? parsed?.content?.asset_path);
      }
    } catch { /* malformed JSON — skip */ }
  }
  return [...unreferenced];
}

export function clearAssetUrlCache(): void {
  for (const url of urlCache.values()) {
    try { URL.revokeObjectURL(url); } catch { /* ignore */ }
  }
  urlCache.clear();
}
export async function countAssetReferences(assetId: string): Promise<number> {
  // Count questions that still reference this asset, parsing content instead of
  // treating the asset id as a SQL substring.
  const [blockRows, optionRows, stimulusRows] = await Promise.all([
    all<{ question_id: string; content_json: string }>(
      `SELECT q.question_id, cb.content_json FROM question q
       JOIN content_block cb ON cb.question_id = q.question_id
       WHERE cb.block_type IN ('image', 'diagram', 'graph')`
    ),
    all<{ question_id: string; content_json: string }>(
      `SELECT q.question_id, mo.content_json FROM question q
       JOIN mcq_option mo ON mo.question_id = q.question_id`
    ),
    all<{ content_json: string }>("SELECT content_json FROM stimulus_block"),
  ]);
  const questions = new Set<string>();
  for (const row of blockRows) {
    try {
      if (JSON.parse(row.content_json)?.asset_path === assetId) questions.add(row.question_id);
    } catch { /* malformed JSON - skip */ }
  }
  for (const row of optionRows) {
    try {
      const parsed = JSON.parse(row.content_json);
      const blocks = Array.isArray(parsed) ? parsed : [parsed];
      if (blocks.some((block: any) => block?.content?.asset_path === assetId)) questions.add(row.question_id);
    } catch { /* malformed JSON - skip */ }
  }
  // A stimulus reference does not belong to a question, but still keeps the blob.
  let stimulusRefs = 0;
  for (const row of stimulusRows) {
    try {
      const parsed = JSON.parse(row.content_json);
      const blocks = Array.isArray(parsed) ? parsed : [parsed];
      if (blocks.some((block: any) => block?.asset_path === assetId || block?.content?.asset_path === assetId)) stimulusRefs += 1;
    } catch { /* malformed JSON - skip */ }
  }
  return questions.size + stimulusRefs;
}

export async function deleteUnclaimedAssetBlobs(assetIds: string[]): Promise<void> {
  for (const assetId of assetIds) {
    const row = await getAssetRow(assetId);
    if (!row) await deleteAssetBlob(assetId);
  }
}
