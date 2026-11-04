import test from "node:test";
import assert from "node:assert/strict";
import { run, all } from "../src/lib/db/sqlite.ts";
import { deleteCourse } from "../src/lib/data.ts";

function newId(prefix) {
  return prefix + "_" + Math.random().toString(36).substring(2, 9);
}

test("shared asset survives deletion of one of two courses", async () => {
  const courseIdA = "course-cross-a";
  const courseIdB = "course-cross-b";
  await run("INSERT INTO course (course_id, name, created_at, updated_at) VALUES (?, ?, datetime('now'), datetime('now'))", [courseIdA, "Course A"]);
  await run("INSERT INTO course (course_id, name, created_at, updated_at) VALUES (?, ?, datetime('now'), datetime('now'))", [courseIdB, "Course B"]);
  const qA = "q-cross-a";
  const qB = "q-cross-b";
  await run("INSERT INTO question (question_id, course_id, type_key, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'))", [qA, courseIdA, "short_answer"]);
  await run("INSERT INTO question (question_id, course_id, type_key, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'))", [qB, courseIdB, "short_answer"]);
  const assetId = "asset-cross-shared";
  await run("INSERT INTO content_block (block_id, question_id, slot, position, block_type, content_json) VALUES (?, ?, ?, ?, ?, ?)", [newId("blk"), qA, "body", 0, "image", JSON.stringify({ asset_path: assetId })]);
  await run("INSERT INTO content_block (block_id, question_id, slot, position, block_type, content_json) VALUES (?, ?, ?, ?, ?, ?)", [newId("blk"), qB, "body", 0, "image", JSON.stringify({ asset_path: assetId })]);
  await run("INSERT INTO asset (asset_id, question_id, file_path, mime_type) VALUES (?, ?, ?, ?)", [assetId, qA, assetId, "image/png"]);

  await deleteCourse(courseIdA);

  const rows = await all("SELECT asset_id FROM asset WHERE asset_id = ?", [assetId]);
  assert.ok(rows.length >= 1, "shared asset should survive course deletion");

  // cleanup
  await run("DELETE FROM question WHERE course_id = ?", [courseIdB]);
  await run("DELETE FROM course WHERE course_id = ?", [courseIdB]);
});