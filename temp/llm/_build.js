const fs = require('fs');
const base = 'D:/quaestio/temp/llm/mathematics-advanced';

// id: [code, confidence, why]
const P1 = {
  ma202001: [null,'low','MCQ placeholder only; no question content'],
  ma202002: [null,'low','MCQ placeholder only; no question content'],
  ma202003: [null,'low','MCQ placeholder only; no question content'],
  ma202004: [null,'low','MCQ placeholder only; no question content'],
  ma202005: [null,'low','MCQ placeholder only; no question content'],
  ma202006: [null,'low','MCQ placeholder only; no question content'],
  ma202007: [null,'low','MCQ placeholder only; no question content'],
  ma202008: [null,'low','MCQ placeholder only; no question content'],
  ma202009: [null,'low','MCQ placeholder only; no question content'],
  ma202010: [null,'low','MCQ placeholder only; no question content'],
  ma2020q11: ['PRE-M1-T6-D3','medium','Two linear tank models; equal-volume intersection'],
  ma2020q12: ['HSC-M2-T2-D4','high','Sum of arithmetic series'],
  ma2020q13: ['HSC-M4-T7-D1','high','Definite integral of secant squared'],
  ma2020q14: ['PRE-M7-T3-D4','medium','Venn diagram then conditional probability of two selections'],
  ma2020q15: ['PRE-M2-T2-D10','high','Bearings solved with cosine and sine rules'],
  ma2020q16: ['HSC-M5-T1-D9','high','Sketch cubic labelling stationary points and inflection'],
  ma2020q17: ['HSC-M4-T6-D3','high','Integrand x over 4 plus x squared'],
  ma2020q18: ['HSC-M3-T4-D1','medium','Product rule with exponential then reverse integration'],
  ma2020q19: ['PRE-M3-D12','high','Prove identity using sec and tan'],
  ma2020q20: ['HSC-M4-T8-D11','high','Trapezoidal rule on velocity table'],
  ma2020q21: ['HSC-M5-T3-D1','medium','Exponential cooling model; rate of change'],
  ma2020q22: ['PRE-M2-T2-D10','medium','Triangle area by sine formula in regular decagon'],
  ma2020q23: ['HSC-M6-T2-D7','medium','Find k and probability from sine density'],
  ma2020q24: ['PRE-M6-D8','medium','Complete square then reflect circle'],
  ma2020q25: ['HSC-M5-T2-D4','high','Minimise perimeter using calculus'],
  ma2020q26: ['HSC-M7-T1-D3','high','Reducing balance loan recurrence and balance'],
  ma2020q27: ['null','low','Regression line and box plot; no matching dot'],
  ma2020q28: [ 'HSC-M6-T3-D13','medium','Normal probabilities with z-scores; two adults'],
  ma2020q29: ['HSC-M3-T4-D2','high','Tangent to log curve with gradient condition'],
  ma2020q30: ['HSC-M4-T8-D1','medium','Parabola intersections then enclosed area integral'],
  ma2020q31: ['HSC-M1-T2-D1','high','Sinusoidal population model; increasing intervals'],
  ma202101: [null,'low','MCQ placeholder only; no question content'],
  ma202102: [null,'low','MCQ placeholder only; no question content'],
  ma202103: [null,'low','MCQ placeholder only; no question content'],
  ma202104: [null,'low','MCQ placeholder only; no question content'],
  ma202105: [null,'low','MCQ placeholder only; no question content'],
  ma202106: [null,'low','MCQ placeholder only; no question content'],
  ma202107: [null,'low','MCQ placeholder only; no question content'],
  ma202108: [null,'low','MCQ placeholder only; no question content'],
  ma202109: [null,'low','MCQ placeholder only; no question content'],
  ma202110: [null,'low','MCQ placeholder only; no question content'],
  ma2021q11: ['PRE-M1-T1-D3','low','Solve linear equation containing algebraic fraction'],
  ma2021q12: ['PRE-M2-T1-D2','medium','Right-angled triangle trig then shaded area'],
  ma2021q13: ['HSC-M3-T4-D1','medium','Product rule gradient of x tan x'],
  ma2021q14: ['HSC-M2-T2-D4','high','Arithmetic series sum to find common difference'],
  ma2021q15: ['HSC-M4-T8-D1','medium','Evaluate definite integral'],
  ma2021q16: ['PRE-M4-T4-D1','medium','Values where cubic derivative is positive'],
  ma2021q17: [null,'low','Regression line interpretation; no matching dot'],
  ma2021q18: ['PRE-M2-T2-D10','medium','Sine rule selecting obtuse angle'],
  ma2021q19: ['PRE-M1-T5-D1','medium','Sketch translated reciprocal with asymptotes'],
  ma2021q20: ['PRE-M3-D10','medium','Solve trig equation for line intersection'],
  ma2021q21: ['PRE-M6-D6','high','Sketch 4f(2x) applying dilations'],
  ma2021q22: ['HSC-M6-T3-D13','high','Standard normal probabilities from table'],
  ma2021q23: ['HSC-M5-T3-D1','medium','Exponential decay; time for given rate'],
  ma2021q24: ['HSC-M4-T8-D5','medium','Area bounded by hyperbola, line and axis'],
  ma2021q25: ['HSC-M7-T2-D4','high','Future value of annuity using table'],
  ma2021q26: ['HSC-M5-T3-D9','high','Vertical motion maximum height and velocity'],
  ma2021q27: ['HSC-M1-T2-D1','high','Trig model of power; integrate for energy'],
  ma2021q28: ['HSC-M4-T8-D5','medium','Exponential area then transformed graph integral'],
  ma2021q29: ['HSC-M7-T2-D4','high','Annuity deposits on birthdays'],
  ma2021q30: ['HSC-M6-T2-D3','medium','Use CDF to find 99th percentile'],
  ma2021q31: ['HSC-M3-T4-D2','medium','Tangents to parabola through external point'],
  ma2021q32: ['HSC-M6-T3-D14','high','Find normal mean and sd from percentages'],
  ma2021q33: ['HSC-M6-T2-D7','medium','PDF constant, mode and probability'],
  ma2021q34: ['HSC-M6-T1-D5','medium','Expected value of discrete distribution'],
  ma202201: [null,'low','MCQ placeholder only; no question content'],
  ma202202: [null,'low','MCQ placeholder only; no question content'],
  ma202203: [null,'low','MCQ placeholder only; no question content'],
  ma202204: [null,'low','MCQ placeholder only; no question content'],
  ma202205: [null,'low','MCQ placeholder only; no question content'],
  ma202206: [null,'low','MCQ placeholder only; no question content'],
  ma202207: [null,'low','MCQ placeholder only; no question content'],
  ma202208: [null,'low','MCQ placeholder only; no question content'],
  ma202209: [null,'low','MCQ placeholder only; no question content'],
  ma202210: [null,'low','MCQ placeholder only; no question content'],
  ma2022q11: ['PRE-M7-T4-D3','medium','Cumulative frequency table and Pareto chart'],
  ma2022q12: ['PRE-M1-T7-D2','high','Inverse variation model for melting time'],
  ma2022q13: ['HSC-M4-T8-D11','high','Trapezoidal rule approximation'],
  ma2022q14: ['HSC-M1-T1-D2','high','Amplitude and period from sine graph'],
  ma2022q15: [null,'low','Question text unavailable'],
  ma2022q16: [null,'low','Question text truncated'],
  ma2022q17: ['HSC-M2-T2-D4','high','Arithmetic series sum for house of cards'],
  ma2022q18: ['HSC-M3-T4-D1','medium','Chain rule then reverse integration'],
  ma2022q19: ['PRE-M6-D6','medium','Transformations of parabola to find parameters'],
  ma2022q20: ['HSC-M5-T3-D8','medium','Exponential growth model and rate'],
  ma2022q21: ['HSC-M7-T2-D4','medium','Compare annuity against compound interest'],
  ma2022q22: ['HSC-M5-T2-D4','high','Global maximum and minimum on interval'],
  ma2022q23: ['HSC-M1-T1-D3','medium','Cosine model of tides; solve equation'],
  ma2022q24: [null,'low','Correlation and line of best fit; no matching dot'],
  ma2022q25: ['HSC-M3-T3-D4','medium','Differentiate sin 2x and meet conditions'],
  ma2022q26: ['HSC-M6-T3-D13','medium','Normal probabilities using z-scores'],
  ma2022q27: ['HSC-M5-T1-D9','medium','Second derivative, stationary points and sketch'],
  ma2022q28: ['PRE-M2-T3-D8','medium','Sector area in circle then hyperbola'],
  ma2022q29: ['HSC-M2-T3-D7','low','Limiting sum of geometric series'],
  ma2022q30: ['HSC-M6-T2-D3','medium','CDF used to find exact probability point'],
  ma2022q31: ['HSC-M5-T2-D4','medium','Minimise triangle area by calculus'],
  ma2022q32: ['HSC-M7-T1-D3','high','Reducing balance loan after rate change'],
  ma202301: [null,'low','MCQ placeholder only; no question content'],
  ma202302: [null,'low','MCQ placeholder only; no question content'],
  ma202303: [null,'low','MCQ placeholder only; no question content'],
  ma202304: [null,'low','MCQ placeholder only; no question content'],
  ma202305: [null,'low','MCQ placeholder only; no question content'],
  ma202306: [null,'low','MCQ placeholder only; no question content'],
  ma202307: [null,'low','MCQ placeholder only; no question content'],
  ma202308: [null,'low','MCQ placeholder only; no question content'],
  ma202309: [null,'low','MCQ placeholder only; no question content'],
  ma202310: [null,'low','MCQ placeholder only; no question content'],
  ma2023q11: ['HSC-M2-T2-D2','high','Fifteenth term of arithmetic sequence'],
  ma2023q12: ['HSC-M6-T1-D6','medium','Expected value and standard deviation'],
  ma2023q13: ['HSC-M4-T1-D9','medium','Integrate given rate with initial condition'],
  ma2023q14: ['HSC-M3-T4-D2','high','Tangent to chain-ruled cubic'],
  ma2023q15: ['HSC-M7-T2-D4','high','Annuity future value and contributions'],
  ma2023q16: ['PRE-M2-T3-D6','medium','Arc length in shape perimeter'],
  ma2023q17: ['HSC-M4-T4-D5','high','Integrate x times root of x squared plus one'],
  ma2023q18: [null,'low','Regression line from summary statistics; no matching dot'],
  ma2023q19: ['PRE-M1-T4-D10','high','Sketch then solve quadratic inequality'],
  ma2023q20: ['PRE-M3-D10','high','Solve trig equation over 0 to 360'],
  ma2023q21: ['HSC-M2-T3-D2','high','GP terms to find ratio and first term'],
  ma2023q22: ['PRE-M2-T1-D2','low','Right-triangle trig within rectangular prism'],
  ma2023q23: ['HSC-M6-T3-D13','high','Normal probability and expected count'],
  ma2023q24: ['HSC-M5-T2-D4','high','Minimise path area by calculus'],
  ma2023q25: ['HSC-M7-T1-D3','high','Reducing balance loan with withdrawals'],
  ma2023q26: ['HSC-M4-T7-D2','medium','Integrate trig rate to find displacement'],
  ma2023q27: ['PRE-M1-T11-D5','medium','Absolute value parameters and intersections'],
  ma2023q28: ['HSC-M4-T3-D6','high','Find point where tangent has given gradient'],
  ma2023q29: ['HSC-M6-T2-D8','medium','Mode, CDF and median of given density'],
  ma2023q30: ['HSC-M5-T1-D4','medium','Stationary points of exponential times sine'],
  ma2023q31: ['PRE-M7-T3-D7','medium','Test independence then use conditional probability'],
  ma2023q32: ['HSC-M4-T8-D1','medium','Area between exponential curves then intersections'],
  ma202401: [null,'low','MCQ placeholder only; no question content'],
  ma202402: [null,'low','MCQ placeholder only; no question content'],
  ma202403: [null,'low','MCQ placeholder only; no question content'],
  ma202404: [null,'low','MCQ placeholder only; no question content'],
  ma202405: [null,'low','MCQ placeholder only; no question content'],
  ma202406: [null,'low','MCQ placeholder only; no question content'],
  ma202407: [null,'low','MCQ placeholder only; no question content'],
  ma202408: [null,'low','MCQ placeholder only; no question content'],
  ma202409: [null,'low','MCQ placeholder only; no question content'],
  ma202410: [null,'low','MCQ placeholder only; no question content'],
  ma2024q11: ['HSC-M5-T1-D5','medium','Signs of first and second derivatives from graph'],
  ma2024q12: ['HSC-M2-T2-D4','high','Sum of arithmetic series'],
  ma2024q13: ['HSC-M5-T3-D8','medium','Exponential growth and decay models table'],
  ma2024q14: ['HSC-M4-T8-D1','medium','Intersections then area between curves'],
  ma2024q15: ['HSC-M5-T3-D2','high','Integrate rate of change of volume'],
  ma2024q16: [null,'low','Compare box plots; no matching dot'],
  ma2024q17: ['HSC-M5-T3-D1','medium','Exponential approach model; rate of increase'],
  ma2024q18: ['PRE-M7-T3-D8','medium','Independent repeated attempts probability'],
  ma2024q19: ['HSC-M5-T1-D9','high','Sketch quartic with stationary and inflection points'],
  ma2024q20: ['PRE-M2-T1-D2','high','Angles of elevation and bearing'],
  ma2024q21: [null,'low','Scatterplot observations; no matching dot'],
  ma2024q22: ['HSC-M5-T1-D5','medium','Concavity proof via second derivative'],
  ma2024q23: ['HSC-M6-T3-D13','high','z-scores and normal percentages'],
  ma2024q24: ['HSC-M7-T2-D4','high','Future value of annuity deposits'],
  ma2024q25: ['HSC-M6-T2-D11','medium','PDF constant, CDF and median'],
  ma2024q26: ['HSC-M7-T2-D1','low','Present value factors for regular withdrawals'],
  ma2024q27: ['HSC-M3-T4-D1','medium','Product rule for x squared tan x'],
  ma2024q28: ['HSC-M1-T2-D1','high','Ferris wheel trig model parameters'],
  ma2024q29: ['HSC-M3-T4-D2','medium','Tangent and normal to find coefficients'],
  ma2024q30: ['HSC-M2-T3-D7','high','Range of limiting sum'],
  ma2024q31: ['HSC-M5-T2-D4','high','Minimise perimeter with sector area'],
};

const P2 = {
  ma202501: [null,'low','MCQ placeholder only; no question content'],
  ma202502: [null,'low','MCQ placeholder only; no question content'],
  ma202503: [null,'low','MCQ placeholder only; no question content'],
  ma202504: [null,'low','MCQ placeholder only; no question content'],
  ma202505: [null,'low','MCQ placeholder only; no question content'],
  ma202506: [null,'low','MCQ placeholder only; no question content'],
  ma202507: [null,'low','MCQ placeholder only; no question content'],
  ma202508: [null,'low','MCQ placeholder only; no question content'],
  ma202509: [null,'low','MCQ placeholder only; no question content'],
  ma202510: [null,'low','MCQ placeholder only; no question content'],
  ma2025q11: ['PRE-M1-T4-D4','medium','Turning point and symmetry of quadratic'],
  ma2025q12: ['HSC-M3-T4-D2','medium','Tangent to rational-polynomial curve'],
  ma2025q13: ['HSC-M2-T3-D2','high','Geometric sequence middle terms'],
  ma2025q14: [null,'low','Bivariate form and regression interpretation; no matching dot'],
  ma2025q15: ['HSC-M1-T1-D2','medium','Amplitude, period and sketching sine waves'],
  ma2025q16: ['HSC-M5-T1-D4','medium','Stationary points and nature of quotient'],
  ma2025q17: ['HSC-M7-T1-D3','high','Reducing balance loan balance and time'],
  ma2025q18: ['PRE-M1-T9-D3','medium','Range of a composite function'],
  ma2025q19: ['PRE-M7-T3-D4','medium','Conditional probability given team wins'],
  ma2025q20: ['HSC-M7-T2-D4','high','Annuity against lump sum future value'],
  ma2025q21: ['HSC-M6-T2-D11','medium','Mode and quartile from density'],
  ma2025q22: ['PRE-M3-D12','medium','Prove trigonometric identity'],
  ma2025q23: ['HSC-M6-T3-D13','medium','Normal tail probability to find weight'],
  ma2025q24: ['HSC-M3-T4-D2','high','Common tangent to log and parabola'],
  ma2025q25: ['HSC-M4-T8-D5','medium','Definite integral then total area of x sin x'],
  ma2025q26: ['PRE-M1-T6-D5','medium','Quadratic model maximising combined area'],
  ma2025q27: ['HSC-M4-T8-D11','medium','Trapezoidal rule then exact log area'],
  ma2025q28: ['PRE-M2-T3-D8','medium','Segment area and arc length with angle'],
  ma2025q29: ['PRE-M2-T1-D2','high','Bearings and angles of elevation'],
  ma2025q30: ['PRE-M6-D2','medium','Translation of parabola to find k'],
  ma2025q31: ['HSC-M1-T1-D3','medium','Number of solutions of cos px'],
};

function build(part, map) {
  const src = require(base + '.part' + part + '.json');
  const dotCodes = new Set(src.dots.map(d => d.code));
  const ids = src.questions.map(q => q.id);
  const out = {};
  const problems = [];

  for (const id of ids) {
    if (!(id in map)) { problems.push('missing classification: ' + id); continue; }
    const [code, conf, why] = map[id];
    if (code !== null && !dotCodes.has(code)) problems.push('unknown code ' + code + ' for ' + id);
    if (!['high','medium','low'].includes(conf)) problems.push('bad confidence ' + id);
    if (why.trim().split(/\s+/).length > 12) problems.push('why too long: ' + id);
    out[id] = { code, confidence: conf, why };
  }
  for (const id of Object.keys(map)) if (!ids.includes(id)) problems.push('extra id: ' + id);

  fs.writeFileSync(base + '.part' + part + '.out.json', JSON.stringify(out, null, 1));
  return { idCount: ids.length, outCount: Object.keys(out).length, problems, out };
}

for (const [part, map] of [['1', P1], ['2', P2]]) {
  const r = build(part, map);
  const vals = Object.values(r.out);
  const counts = { high: 0, medium: 0, low: 0, null: 0 };
  for (const v of vals) { counts[v.confidence]++; if (v.code === null) counts.null++; }
  console.log('part' + part, 'ids', r.idCount, 'written', r.outCount,
    'high', counts.high, 'medium', counts.medium, 'low', counts.low, 'null', counts.null,
    'problems', r.problems.length ? r.problems : 'none');
}

// combined dot usage
const all = { ...P1, ...P2 };
const dotPaths = new Map();
for (const p of ['1','2']) {
  const src = require(base + '.part' + p + '.json');
  for (const d of src.dots) dotPaths.set(d.code, d.path);
}
const tally = new Map();
for (const [id, v] of Object.entries(all)) if (v[0]) tally.set(v[0], (tally.get(v[0]) || 0) + 1);
console.log('\ntop paths:');
[...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
  .forEach(([c, n]) => console.log(String(n).padStart(3), c, '|', dotPaths.get(c)));
