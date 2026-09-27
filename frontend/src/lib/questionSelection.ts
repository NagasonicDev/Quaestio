export interface SelectionResult {
  indexes: number[];
  selectionLimited: boolean;
}

/**
 * Select a good marks combination quickly using shuffled greedy passes and
 * bounded local swaps. This deliberately trades a global optimum for a hard
 * work budget; the best combination seen so far is always retained.
 * `marks` are question marks (not scaled units).
 */
export function selectQuestionIndexes(
  marks: readonly number[],
  targetUnits: number,
  options: {
    deadline?: number;
    budgetMs?: number;
    toleranceUnits?: number;
    random?: () => number;
  } = {}
): SelectionResult {
  if (!marks.length) return { indexes: [], selectionLimited: false };

  const random = options.random ?? Math.random;
  const tolerance = options.toleranceUnits ?? 50;
  const start = performance.now();
  const deadline = Math.min(options.deadline ?? Infinity, start + (options.budgetMs ?? 40));
  const units = marks.map((mark) => Math.max(1, Math.round(mark * 100)));
  const n = units.length;
  const distance = (sum: number) => Math.abs(sum - targetUnits);

  // Equal-mark sections are count selection, so solve them directly.
  if (units.every((value) => value === units[0])) {
    const count = Math.max(1, Math.min(n, Math.round(targetUnits / units[0])));
    return { indexes: Array.from({ length: count }, (_, index) => index), selectionLimited: false };
  }

  const maxMarkAtOrBelowTarget = units.reduce(
    (max, value) => value <= targetUnits ? Math.max(max, value) : max,
    0
  );
  const upperLimit = targetUnits + Math.max(tolerance, maxMarkAtOrBelowTarget);
  let bestIndexes: number[] = [];
  let bestSum = 0;
  let bestDistance = distance(0);
  let selectionLimited = false;

  const keepBest = (indexes: number[], sum: number) => {
    const nextDistance = distance(sum);
    if (nextDistance < bestDistance || (nextDistance === bestDistance && sum < bestSum)) {
      bestIndexes = [...indexes];
      bestSum = sum;
      bestDistance = nextDistance;
    }
  };

  // A single question can be the closest result when every combination
  // otherwise overshoots; seed the fallback with the best such option.
  for (let index = 0; index < n; index++) keepBest([index], units[index]);

  const order = Array.from({ length: n }, (_, index) => index);
  const selected = new Uint8Array(n);
  let currentIndexes: number[] = [];
  let currentSum = 0;
  let foundInWindow = false;

  // A few randomized greedy starts usually land in the tolerance window.
  for (let pass = 0; pass < 4 && !foundInWindow; pass++) {
    if (performance.now() >= deadline) {
      selectionLimited = true;
      break;
    }
    if (pass > 0) {
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
    }
    selected.fill(0);
    currentIndexes = [];
    currentSum = 0;
    for (let position = 0; position < order.length; position++) {
      if ((position & 255) === 0 && performance.now() >= deadline) {
        selectionLimited = true;
        break;
      }
      const index = order[position];
      const nextSum = currentSum + units[index];
      if (nextSum > upperLimit) continue;
      selected[index] = 1;
      currentIndexes.push(index);
      currentSum = nextSum;
      keepBest(currentIndexes, currentSum);
      if (bestDistance <= tolerance) {
        foundInWindow = true;
        break;
      }
    }
    if (selectionLimited) break;
  }

  // Refine a miss with bounded one-for-one and one-for-two swaps. Strict
  // improvements only are accepted, so the fallback score never gets worse.
  if (!foundInWindow && !selectionLimited && currentIndexes.length > 0) {
    let attempts = 0;
    while (attempts < 12000) {
      if ((attempts++ & 127) === 0 && performance.now() >= deadline) {
        selectionLimited = true;
        break;
      }
      if (currentIndexes.length === 0) break;
      const removeAt = Math.floor(random() * currentIndexes.length);
      const removeIndex = currentIndexes[removeAt];
      let addIndex = Math.floor(random() * n);
      let tries = 0;
      while (selected[addIndex] && tries++ < 12) addIndex = Math.floor(random() * n);
      if (selected[addIndex]) continue;

      if (random() < 0.5) {
        const nextSum = currentSum - units[removeIndex] + units[addIndex];
        if (nextSum <= upperLimit && distance(nextSum) < distance(currentSum)) {
          selected[removeIndex] = 0;
          selected[addIndex] = 1;
          currentIndexes[removeAt] = addIndex;
          currentSum = nextSum;
          keepBest(currentIndexes, currentSum);
          if (bestDistance <= tolerance) foundInWindow = true;
        }
      } else {
        let secondIndex = Math.floor(random() * n);
        tries = 0;
        while ((selected[secondIndex] || secondIndex === addIndex) && tries++ < 12) {
          secondIndex = Math.floor(random() * n);
        }
        if (selected[secondIndex] || secondIndex === addIndex) continue;
        const nextSum = currentSum - units[removeIndex] + units[addIndex] + units[secondIndex];
        if (nextSum <= upperLimit && distance(nextSum) < distance(currentSum)) {
          selected[removeIndex] = 0;
          selected[addIndex] = 1;
          selected[secondIndex] = 1;
          currentIndexes[removeAt] = addIndex;
          currentIndexes.push(secondIndex);
          currentSum = nextSum;
          keepBest(currentIndexes, currentSum);
          if (bestDistance <= tolerance) foundInWindow = true;
        }
      }
      if (foundInWindow) break;
    }
  }

  return { indexes: bestIndexes, selectionLimited };
}
