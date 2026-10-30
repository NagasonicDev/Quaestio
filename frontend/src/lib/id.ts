export function newId(prefix: string): string {
  const cryptoHex = globalThis.crypto?.randomUUID?.().replace(/-/g, "").slice(0, 12);
  const hex = cryptoHex ?? Math.random().toString(16).slice(2, 14).padEnd(12, "0");
  return `${prefix}_${hex}`;
}

const QUESTION_ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const QUESTION_ID_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const QUESTION_ID_DIGITS = "0123456789";

function randomQuestionIndex(max: number): number {
  const getRandomValues = globalThis.crypto?.getRandomValues?.bind(globalThis.crypto);
  if (getRandomValues) {
    const buf = new Uint32Array(1);
    getRandomValues(buf);
    return buf[0] % max;
  }
  return Math.floor(Math.random() * max);
}

export function newQuestionId(): string {
  const chars = [
    QUESTION_ID_LETTERS[randomQuestionIndex(QUESTION_ID_LETTERS.length)],
    QUESTION_ID_DIGITS[randomQuestionIndex(QUESTION_ID_DIGITS.length)],
    ...Array.from({ length: 4 }, () => QUESTION_ID_CHARS[randomQuestionIndex(QUESTION_ID_CHARS.length)]),
  ];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomQuestionIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export function claimQuestionId(preferred: unknown, used: Set<string>): string {
  let id = typeof preferred === "string" && preferred.trim() ? preferred : newQuestionId();
  while (used.has(id)) id = newQuestionId();
  used.add(id);
  return id;
}

export function isValidQuestionId(value: string): boolean {
  return /^[A-Z0-9]{6}$/.test(value) && /[A-Z]/.test(value) && /[0-9]/.test(value);
}

export function nowUtc(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate()
  ).padStart(2, "0")} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(
    2,
    "0"
  )}:${String(d.getUTCSeconds()).padStart(2, "0")}`;
}
