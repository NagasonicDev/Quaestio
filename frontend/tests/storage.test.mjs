import test from "node:test";
import assert from "node:assert/strict";
import { contentHash, describeStoragePersistence } from "../src/lib/storage.ts";

test("contentHash is stable for identical bytes", async () => {
  const a = await contentHash(new Uint8Array([1, 2, 3, 4]));
  const b = await contentHash(new Uint8Array([1, 2, 3, 4]));
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("contentHash differs for different bytes", async () => {
  const a = await contentHash(new Uint8Array([1, 2, 3, 4]));
  const b = await contentHash(new Uint8Array([4, 3, 2, 1]));
  assert.notEqual(a, b);
});

test("contentHash is empty-input safe", async () => {
  const hash = await contentHash(new Uint8Array([]));
  assert.match(hash, /^[0-9a-f]{64}$/);
});

test("describeStoragePersistence names each persistence state", () => {
  assert.match(describeStoragePersistence(true), /persistent/i);
  assert.match(describeStoragePersistence(false), /not persistent|best effort/i);
  assert.match(describeStoragePersistence(null), /unknown|not checked/i);
});
