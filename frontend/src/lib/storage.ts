/**
 * SHA-256 of a blob's bytes, used to store identical assets once (content-hash
 * dedupe, plan §6.2). Falls back to a hex digest of the bytes when SubtleCrypto
 * is unavailable (older/insecure contexts), so callers always get a stable key.
 */
export async function contentHash(data: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const digest = await subtle.digest("SHA-256", toBuffer(data));
    return toHex(new Uint8Array(digest));
  }
  // Fallback: FNV-1a over the bytes, widened into a 64-char hex string.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (const byte of data) {
    h1 = Math.imul(h1 ^ byte, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (byte + 1), 0x85ebca6b) >>> 0;
  }
  return (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).padStart(64, "0");
}

function toBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

/**
 * Ask the browser to keep this origin's storage instead of evicting it under
 * pressure (plan §6.2.3). Returns the resulting persisted state, or null when
 * the API is unavailable (which the settings UI reports as "unknown").
 */
export async function requestPersistentStorage(): Promise<boolean | null> {
  const storage = globalThis.navigator?.storage;
  if (!storage?.persist) return null;
  if (await storage.persisted?.()) return true;
  return storage.persist();
}

/** Human-readable persistence state for the settings screen. */
export function describeStoragePersistence(persisted: boolean | null): string {
  if (persisted === true) return "Storage is persistent: the browser will not evict your courses under disk pressure.";
  if (persisted === false) return "Storage is not persistent: the browser may evict your courses under disk pressure. Export a backup to be safe.";
  return "Storage persistence is unknown: this browser does not report it.";
}
