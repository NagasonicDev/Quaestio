/**
 * One-line timings for the document generation pipeline. Generation is a rare,
 * heavy action, so these always log; read them from the browser console to see
 * which stage a slow test spends its time in.
 */
export function logTiming(label: string, startedAt: number, detail?: string): void {
  const ms = Math.round(performance.now() - startedAt);
  console.info(`[perf] ${label}: ${ms}ms${detail ? ` — ${detail}` : ""}`);
}
