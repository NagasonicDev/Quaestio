export function newId(prefix: string): string {
  const hex = Math.random().toString(16).slice(2, 14).padEnd(12, "0");
  return `${prefix}_${hex}`;
}

const QUESTION_ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const QUESTION_ID_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const QUESTION_ID_DIGITS = "0123456789";

export function newQuestionId(): string {
  const chars = [
    QUESTION_ID_LETTERS[Math.floor(Math.random() * QUESTION_ID_LETTERS.length)],
    QUESTION_ID_DIGITS[Math.floor(Math.random() * QUESTION_ID_DIGITS.length)],
    ...Array.from({ length: 4 }, () => QUESTION_ID_CHARS[Math.floor(Math.random() * QUESTION_ID_CHARS.length)]),
  ];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
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
  )}:${String(d.getUTCSeconds()).padStart(2, "0")}.000000`;
}
