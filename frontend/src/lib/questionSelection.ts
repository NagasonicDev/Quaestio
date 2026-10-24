export interface SelectionResult {
  indexes: number[];
  /** True when the target was unreachable; the caller must surface this. */
  infeasible?: boolean;
  /** Largest reachable total at or below the target (marks, not units). */
  nearestBelow?: number;
  /** Smallest reachable total above the target, or null when none exists. */
  nearestAbove?: number | null;
}

export interface SelectionOptions {
  /** Kept for call-site compatibility; selection here is exact and seed-free. */
  seed?: number;
  /** Indexes that must not be selected (already used in another section). */
  excludeIndexes?: ReadonlySet<number>;
  /** Indexes that must be selected (pinned by the author or a topic minimum). */
  keepIndexes?: ReadonlySet<number>;
}

type Item = { index: number; marks: number };

/**
 * Select the combination of question marks that hits `targetMarks` exactly.
 *
 * Exact subset-sum by dynamic programming over the integer mark values (marks
 * are integers, so the reachable-total table is small even for hundreds of
 * candidates). Because the whole reachable set is known, a miss reports the
 * nearest reachable totals above and below instead of approximating silently.
 * Pinned questions are taken first and the rest of the target is solved around
 * them. Selection is deterministic: question order carries the variety.
 */
export function selectQuestionIndexes(
  marks: readonly number[],
  targetMarks: number,
  options: SelectionOptions = {}
): SelectionResult {
  const target = Math.max(0, Math.round(targetMarks));
  if (!marks.length) return { indexes: [], infeasible: true, nearestBelow: 0, nearestAbove: null };

  const excluded = options.excludeIndexes;
  const kept = options.keepIndexes;
  const pool: Item[] = marks
    .map((mark, index) => {
      // Marks are integer units of work; silently rounding fractional or
      // zero-valued candidates mis-solves a section, so reject them up front.
      if (!Number.isInteger(mark) || mark <= 0) {
        throw new Error(
          `Question at index ${index} has invalid marks (${mark}); marks must be positive integers.`
        );
      }
      return { index, marks: mark };
    })
    .filter((item) => !excluded?.has(item.index));
  if (!pool.length) return { indexes: [], infeasible: true, nearestBelow: 0, nearestAbove: null };

  const pinned = pool.filter((item) => kept?.has(item.index));
  const pinnedMarks = pinned.reduce((sum, item) => sum + item.marks, 0);
  const pinnedIndexes = pinned.map((item) => item.index);
  // A pinned set that already overshoots is reported, never silently dropped.
  if (pinnedMarks > target) {
    const reach = reachability(pool, target);
    let below = target;
    while (below > 0 && !reach[below]) below--;
    // Only totals that keep the pin are reachable, so scan the free pool's
    // contributions offset by the pinned marks.
    const free = pool.filter((item) => !kept?.has(item.index));
    const beyond = reachability(free, pinnedMarks);
    let above: number | null = null;
    for (let m = 0; m <= pinnedMarks; m++) {
      if (!beyond[m]) continue;
      const total = pinnedMarks + m;
      if (total > target) { above = total; break; }
    }
    return { indexes: pinnedIndexes, infeasible: true, nearestBelow: below, nearestAbove: above };
  }

  const free = pool.filter((item) => !kept?.has(item.index));
  const result = solve(free, target - pinnedMarks);
  if (!result.infeasible) return { indexes: [...pinnedIndexes, ...result.indexes] };
  return {
    indexes: [...pinnedIndexes, ...result.indexes],
    infeasible: true,
    nearestBelow: pinnedMarks + (result.nearestBelow ?? 0),
    nearestAbove: result.nearestAbove == null ? null : pinnedMarks + result.nearestAbove,
  };
}

/** Exact subset-sum for `target` over `pool`. Assumes `target >= 0`. */
function solve(pool: Item[], target: number): SelectionResult {
  if (target === 0) return { indexes: [] };
  const total = pool.reduce((sum, item) => sum + item.marks, 0);
  const cap = Math.min(total, target);

  if (total >= target) {
    const reach = reachability(pool, target);
    if (reach[target]) return { indexes: pickExact(pool, target) };
  }

  // Miss: report the nearest reachable totals on each side of the target.
  const reach = reachability(pool, cap);
  let below = cap;
  while (below > 0 && !reach[below]) below--;
  let above: number | null = null;
  if (total > target) {
    const beyond = reachability(pool, total);
    for (let m = target + 1; m <= total; m++) {
      if (beyond[m]) { above = m; break; }
    }
  }
  return { indexes: pickExact(pool, below), infeasible: true, nearestBelow: below, nearestAbove: above };
}

/**
 * 0/1 subset-sum: which totals up to `cap` some subset of the pool can reach.
 * Each item is considered once (totals descend), so an item is never reused.
 */
function reachability(pool: Item[], cap: number): Uint8Array {
  const reachable = new Uint8Array(cap + 1);
  reachable[0] = 1;
  for (const item of pool) {
    for (let m = cap; m >= item.marks; m--) {
      if (reachable[m - item.marks]) reachable[m] = 1;
    }
  }
  return reachable;
}

/**
 * Walk the pool taking any question that keeps the remaining target reachable
 * from the questions not yet considered, so the final combination sums to
 * exactly `total`. Reachability is recomputed over the remainder, which keeps
 * the 0/1 property (never reusing a question).
 */
function pickExact(pool: Item[], total: number): number[] {
  const picked: number[] = [];
  let remaining = total;
  let rest = pool.slice();
  while (remaining > 0 && rest.length) {
    const item = rest.shift()!;
    if (item.marks > remaining) continue;
    if (!reachability(rest, remaining - item.marks)[remaining - item.marks]) continue;
    picked.push(item.index);
    remaining -= item.marks;
  }
  return picked;
}
