import JSZip from "jszip";
import * as idb from "./db/indexeddb.ts";
import { all } from "./db/sqlite.ts";
import { newId } from "./id.ts";
import { contentHash } from "./storage.ts";
import { ensureAssetUrl } from "./assets.ts";

/**
 * Read a `.qbx` zip and stage its question JSON + image blobs into the local
 * stores, returning the (asset-rewritten) payload ready for `data.importJson`.
 *
 * Shared by the manual Import page and the template installer, so a template
 * added to a library can pull in its shipped HSC exam bundles without code
 * duplication.
 */
export async function parseQuestionBundleBlob(blob: Blob): Promise<Record<string, any> & { assetIds: string[] }> {
  let archive: JSZip;
  try {
    archive = await JSZip.loadAsync(blob);
  } catch {
    throw new Error("This is not a valid .qbx question bundle.");
  }
  const manifest = archive.file("questions.json");
  if (!manifest) throw new Error("This .qbx bundle has no questions.json file.");
  const payload = JSON.parse(await manifest.async("string"));
  if (payload.export_schema_version !== 1 || !Array.isArray(payload.questions)) {
    throw new Error("Unsupported or invalid .qbx question bundle.");
  }

  const blobs = new Map<string, Blob>();
  const folder = archive.folder("assets");
  if (folder) {
    for (const path in folder.files) {
      const entry = folder.files[path];
      if (entry.dir) continue;
      const filename = path.split("/").pop() ?? "";
      const assetId = filename.replace(/\.[^.]*$/, "");
      if (assetId) blobs.set(assetId, await entry.async("blob"));
    }
  }

  const referencedAssetIds = new Set<string>();
  const collectBlocks = (blocks: any[]) => {
    for (const block of Array.isArray(blocks) ? blocks : []) {
      const oldId = block?.content?.asset_path;
      if (typeof oldId === "string" && oldId) referencedAssetIds.add(oldId);
    }
  };
  const collectQuestion = (question: any) => {
    for (const asset of question.assets ?? []) {
      if (asset?.asset_id) referencedAssetIds.add(String(asset.asset_id));
    }
    for (const slot of ["body", "hint", "answer", "solution", "marking_criteria"]) collectBlocks(question[slot]);
    for (const option of question.mcq_options ?? []) collectBlocks(option.content);
    for (const part of question.parts ?? []) collectQuestion(part);
  };
  for (const question of payload.questions) collectQuestion(question);
  for (const stimulus of Array.isArray(payload.stimuli) ? payload.stimuli : []) collectBlocks(stimulus?.blocks);

  const existingAssets = new Set<string>([
    ...await idb.listAssetIds(),
    ...(await all<{ asset_id: string }>("SELECT asset_id FROM asset")).map((r) => r.asset_id),
  ]);
  const assetMap = new Map<string, string>();
  const hashToTarget = new Map<string, string>();
  for (const oldId of referencedAssetIds) {
    const blob = blobs.get(oldId);
    if (!blob) continue;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const hash = await contentHash(bytes);
    let target: string;
    if (existingAssets.has(hash)) {
      target = hash;
    } else if (hashToTarget.has(hash)) {
      target = hashToTarget.get(hash)!;
    } else if (existingAssets.has(oldId)) {
      target = newId("asset");
    } else {
      target = oldId;
    }
    hashToTarget.set(hash, target);
    if (target !== oldId) assetMap.set(oldId, target);
    existingAssets.add(target);
  }

  const rewriteBlocks = (blocks: any[]) => {
    for (const block of Array.isArray(blocks) ? blocks : []) {
      const oldId = block?.content?.asset_path;
      if (typeof oldId === "string" && assetMap.has(oldId)) block.content.asset_path = assetMap.get(oldId);
    }
  };
  const rewriteQuestion = (question: any) => {
    for (const asset of question.assets ?? []) {
      const oldId = String(asset.asset_id);
      const mapped = assetMap.get(oldId);
      if (mapped) {
        asset.asset_id = mapped;
        asset.file_path = mapped;
      }
    }
    for (const slot of ["body", "hint", "answer", "solution", "marking_criteria"]) rewriteBlocks(question[slot]);
    for (const option of question.mcq_options ?? []) rewriteBlocks(option.content);
    for (const part of question.parts ?? []) rewriteQuestion(part);
  };
  for (const question of payload.questions) rewriteQuestion(question);
  for (const stimulus of Array.isArray(payload.stimuli) ? payload.stimuli : []) rewriteBlocks(stimulus?.blocks);

  const targetIds: string[] = [];
  for (const oldId of referencedAssetIds) {
    const target = assetMap.get(oldId) ?? oldId;
    targetIds.push(target);
    const blob = blobs.get(oldId);
    if (blob) {
      const already = await idb.getAsset(target);
      if (!already) await idb.putAsset(target, blob);
    }
  }
  for (const id of new Set(targetIds)) await ensureAssetUrl(id);

  return { ...payload, questions: payload.questions, assetIds: [...new Set(targetIds)] };
}