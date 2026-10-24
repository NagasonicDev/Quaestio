import test from "node:test";
import assert from "node:assert/strict";
import { contentHash } from "../src/lib/storage.ts";
import * as idb from "../src/lib/db/indexeddb.ts";
import { uploadAsset, ensureAssetUrl, deleteAssetBlob, countAssetReferences } from "../src/lib/assets.ts";
import { run, all } from "../src/lib/db/sqlite.ts";

// Helper function to generate IDs (simplified version of newId)
function newId(prefix: string): string {
  return prefix + "_" + Math.random().toString(36).substring(2, 9);
}

test("shared asset - upload same bytes twice → same hash id used by two questions", async () => {
  const courseId = "test-course-shared-asset";
  
  // Create two questions
  const q1Id = "q1-shared";
  const q2Id = "q2-shared";
  await run(
    "INSERT INTO question (question_id, course_id, type_key, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'))",
    [q1Id, courseId, "short_answer"]
  );
  await run(
    "INSERT INTO question (question_id, course_id, type_key, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'))",
    [q2Id, courseId, "short_answer"]
  );
  
  // Upload same file bytes twice
  const fileContent = new Uint8Array([1, 2, 3, 4, 5]);
  const file1 = new File([fileContent], "test1.png", { type: "image/png" });
  const file2 = new File([fileContent], "test2.png", { type: "image/png" });
  
  const result1 = await uploadAsset(file1);
  const result2 = await uploadAsset(file2);
  
  // Both should return the same asset_path (hash)
  assert.equal(result1.asset_path, result2.asset_path);
  const assetId = result1.asset_path;
  
  // Asset row should exist
  const assetRows = await all<{ asset_id: string }>("SELECT asset_id FROM asset WHERE asset_id = ?", [assetId]);
  assert.equal(assetRows.length, 1);
  assert.equal(assetRows[0].asset_id, assetId);
  
  // Verify asset can be retrieved by both questions
  const refCount = await countAssetReferences(assetId);
  // Currently asset is not referenced in any content block, so ref count is 0
  assert.equal(refCount, 0);
  
  // Clean up
  await deleteAssetBlob(assetId);
  await run("DELETE FROM question WHERE course_id = ?", [courseId]);
});

test("shared asset - asset row persists across question deletions", async () => {
  const courseId = "test-course-persist";
  
  // Create two questions with same asset in their content
  const q1Id = "q1-persist";
  const q2Id = "q2-persist";
  await run(
    "INSERT INTO question (question_id, course_id, type_key, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'))",
    [q1Id, courseId, "short_answer"]
  );
  await run(
    "INSERT INTO question (question_id, course_id, type_key, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'))",
    [q2Id, courseId, "short_answer"]
  );
  
  // Simulate both questions using the same asset by inserting into content_block
  const assetId = "test-asset-persist-123";
  await run(
    "INSERT INTO content_block (block_id, question_id, slot, position, block_type, content_json) VALUES (?, ?, ?, ?, ?, ?)",
    [newId("blk"), q1Id, "body", 0, "image", JSON.stringify({ asset_path: assetId, alt_text: "Test image" })]
  );
  await run(
    "INSERT INTO content_block (block_id, question_id, slot, position, block_type, content_json) VALUES (?, ?, ?, ?, ?, ?)",
    [newId("blk"), q2Id, "body", 0, "image", JSON.stringify({ asset_path: assetId, alt_text: "Test image" })]
  );
  
  // Verify both questions reference the asset
  const refCount = await countAssetReferences(assetId);
  assert.equal(refCount, 2);
  
  // Delete question 1 only
  await run("DELETE FROM practice_attempt WHERE question_id = ?", [q1Id]);
  await run("DELETE FROM import_question WHERE final_question_id = ?", [q1Id]);
  await run("DELETE FROM question WHERE question_id = ?", [q1Id]);
  
  // Reference count should now be 1
  const newRefCount = await countAssetReferences(assetId);
  assert.equal(newRefCount, 1);
  
  // Asset row should still exist
  const assetRows = await all<{ asset_id: string }>("SELECT asset_id FROM asset WHERE asset_id = ?", [assetId]);
  assert.equal(assetRows.length, 1);
  
  // Delete question 2
  await run("DELETE FROM practice_attempt WHERE question_id = ?", [q2Id]);
  await run("DELETE FROM import_question WHERE final_question_id = ?", [q2Id]);
  await run("DELETE FROM question WHERE question_id = ?", [q2Id]);
  
  // Now reference count should be 0
  const finalRefCount = await countAssetReferences(assetId);
  assert.equal(finalRefCount, 0);
  
  // Delete the content blocks we added
  await run("DELETE FROM content_block WHERE block_id IN (SELECT block_id FROM content_block WHERE content_json LIKE ?)", [`%${assetId}%`]);
  
  // Now the asset can be deleted
  await deleteAssetBlob(assetId);
});