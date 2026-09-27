import { performance } from "node:perf_hooks";
import { selectQuestionIndexes } from "../src/lib/questionSelection.ts";

const sizes = [1000, 10000, 50000];
const weights = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
const repetitions = 25;

for (const size of sizes) {
  for (const scenario of ["mcq", "mixed"]) {
    const marks = scenario === "mcq"
      ? Array(size).fill(1)
      : Array.from({ length: size }, () => weights[Math.floor(Math.random() * weights.length)]);
    const targetUnits = scenario === "mcq" ? 2000 : 7000;
    const timings = [];
    let achievedUnits = 0;
    for (let run = 0; run < repetitions; run++) {
      const start = performance.now();
      const result = selectQuestionIndexes(marks, targetUnits, { budgetMs: 40 });
      timings.push(performance.now() - start);
      achievedUnits = result.indexes.reduce((sum, index) => sum + Math.round(marks[index] * 100), 0);
    }
    timings.sort((a, b) => a - b);
    console.log(JSON.stringify({
      scenario,
      candidates: size,
      runs: repetitions,
      p50_ms: Number(timings[Math.floor(repetitions * 0.5)].toFixed(2)),
      p95_ms: Number(timings[Math.floor(repetitions * 0.95)].toFixed(2)),
      latest_achieved_marks: achievedUnits / 100,
    }));
  }
}
