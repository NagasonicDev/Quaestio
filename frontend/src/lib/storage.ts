/**
 * SHA-256 of a blob's bytes, used to store identical assets once (content-hash
 * dedupe, plan §6.2). When SubtleCrypto is unavailable (older/insecure
 * contexts), returns a per-call unique non-dedupe token so distinct assets can
 * never collide on a weak 64-bit hash.
 */
export async function contentHash(data: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const digest = await subtle.digest("SHA-256", toBuffer(data));
    return toHex(new Uint8Array(digest));
  }
  const random = globalThis.crypto?.getRandomValues
    ? Array.from(globalThis.crypto.getRandomValues(new Uint8Array(6))).map((b) => b.toString(16).padStart(2, "0")).join("")
    : Math.random().toString(36).slice(2);
  return `nondedup-${Date.now().toString(36)}-${random}`;
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
