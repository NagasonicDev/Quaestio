import test from "node:test";
import assert from "node:assert/strict";
import { run, markDirty, flushOnHide, isDirty, flush } from "../src/lib/db/sqlite.ts";

test("flushOnHide clears timer and flushes pending writes", async () => {
  await run("CREATE TABLE IF NOT EXISTS kv (k TEXT)");
  markDirty();
  assert.equal(isDirty(), true);
  flushOnHide();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(isDirty(), false);
  await flush();
  assert.equal(isDirty(), false);
});