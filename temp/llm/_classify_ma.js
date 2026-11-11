const fs = require('fs');

const P = 'D:/quaestio/temp/llm/mathematics-advanced.';
const C = 'H'; // confidence constants not needed
const m = {};

function set(id, code, confidence, why) { m[id] = { code, confidence, why }; }
function nul(id, why) { m[id] = { code: null, confidence: 'high', why }; }

// ---- part 1: 2020 ----
for (let i = 1; i <= 10; i++) nul('ma2020' + String(i).padStart(2, '0'), 'MCQ placeholder, no question content');
set('ma2020q11', 'PRE-M1-T6-D3', 'medium', 'Linear models intersect; graphical simultaneous equations');
set('ma2020q12', 'HSC-M2-T2-D4', 'high', 'Sum of arithmetic series');
set('ma2020q13', 'HSC-M4-T7-D1', 'high', 'Definite integral of sec squared');
set('ma2020q14', 'PRE-M7-T3-D4', 'medium', 'Conditional probability with Venn diagram');
set('ma2020q15', 'PRE-M2-T2-D10', 'high', 'Bearings with cosine rule');
set('ma2020q16', 'HSC-M5-T1-D9', 'high', 'Sketch cubic using stationary points, inflection');
set('ma2020q17', 'HSC-M4-T6-D3', 'high', "Integral f'/f gives logarithm");
set('ma2020q18', 'HSC-M3-T4-D1', 'high', 'Product rule then reverse differentiation');
set('ma2020q19', 'PRE-M3-D12', 'high', 'Prove trigonometric identity');
set('ma2020q20', 'HSC-M4-T8-D11', 'high', 'Trapezoidal rule from velocity table');
set('ma2020q21', 'HSC-M5-T3-D8', 'medium', 'Exponential decay model and cooling rate');
set('ma2020q22', 'PRE-M2-T2-D10', 'high', 'Triangle area formula in regular polygon');
set('ma2020q23', 'HSC-M6-T2-D7', 'high', 'Find k and probability from PDF');
set('ma2020q24', 'PRE-M6-D8', 'medium', 'Complete square, reflect circle');
set('ma2020q25', 'HSC-M5-T2-D4', 'high', 'Minimise perimeter using calculus');
set('ma2020q26', 'HSC-M7-T2-D4', 'high', 'Annuity recurrence and future value');
nul('ma2020q27', 'Regression prediction; no matching dot');
set('ma2020q28', 'HSC-M6-T3-D13', 'high', 'Normal distribution z-score probabilities');
set('ma2020q29', 'HSC-M3-T4-D2', 'high', 'Tangent to logarithmic curve');
set('ma2020q30', 'HSC-M4-T8-D5', 'medium', 'Area between parabolas by integration');
set('ma2020q31', 'HSC-M5-T3-D1', 'medium', 'Trig model, increasing intervals, rate');

// ---- part 1: 2021 ----
for (let i = 1; i <= 10; i++) nul('ma2021' + String(i).padStart(2, '0'), 'MCQ placeholder, no question content');
nul('ma2021q11', 'Linear equation; no matching dot');
set('ma2021q12', 'PRE-M2-T1-D2', 'high', 'Right-triangle trigonometry and area');
set('ma2021q13', 'HSC-M3-T4-D2', 'medium', 'Tangent gradient using product rule');
set('ma2021q14', 'HSC-M2-T2-D4', 'high', 'Arithmetic series sum to find d');
set('ma2021q15', 'HSC-M4-T8-D1', 'high', 'Evaluate definite integral');
set('ma2021q16', 'PRE-M4-T4-D5', 'high', 'Increasing interval of cubic');
nul('ma2021q17', 'Regression/correlation; no matching dot');
set('ma2021q18', 'PRE-M2-T2-D10', 'high', 'Sine rule with obtuse angle');
set('ma2021q19', 'PRE-M6-D6', 'high', 'Sketch translated reciprocal function');
set('ma2021q20', 'HSC-M1-T1-D3', 'high', 'Solve trig equation by graph');
set('ma2021q21', 'PRE-M6-D6', 'high', 'Sketch transformed function f(2x)');
set('ma2021q22', 'HSC-M6-T3-D13', 'high', 'Normal distribution z-scores');
set('ma2021q23', 'HSC-M5-T3-D8', 'medium', 'Exponential decay and instantaneous rate');
set('ma2021q24', 'HSC-M4-T8-D5', 'high', 'Area bounded by curve and line');
set('ma2021q25', 'HSC-M7-T2-D4', 'high', 'Annuity future value factors');
set('ma2021q26', 'HSC-M5-T3-D10', 'medium', 'Particle motion maximum and velocity');
set('ma2021q27', 'HSC-M5-T3-D2', 'high', 'Integrate rate to find energy');
set('ma2021q28', 'HSC-M4-T8-D7', 'medium', 'Area under exponential, transform graph');
set('ma2021q29', 'HSC-M7-T2-D4', 'high', 'Annuity deposits and withdrawals');
set('ma2021q30', 'HSC-M6-T2-D11', 'medium', 'CDF to find 99th percentile');
set('ma2021q31', 'PRE-M4-T3-D5', 'medium', 'Tangents through external point');
set('ma2021q32', 'HSC-M6-T3-D14', 'high', 'Find normal mean/sd from probabilities');
set('ma2021q33', 'HSC-M6-T2-D7', 'medium', 'PDF total area, mode, probability');
set('ma2021q34', 'HSC-M6-T1-D5', 'high', 'Expected value of discrete distribution');

// ---- part 1: 2022 ----
for (let i = 1; i <= 10; i++) nul('ma2022' + String(i).padStart(2, '0'), 'MCQ placeholder, no question content');
set('ma2022q11', 'PRE-M7-T4-D3', 'medium', 'Cumulative frequency table and chart');
set('ma2022q12', 'PRE-M1-T7-D2', 'high', 'Inverse variation model and graph');
set('ma2022q13', 'HSC-M4-T8-D11', 'high', 'Trapezoidal rule approximation');
set('ma2022q14', 'HSC-M1-T1-D2', 'high', 'Amplitude and period from graph');
nul('ma2022q15', 'Question text missing');
nul('ma2022q16', 'Question text incomplete');
set('ma2022q17', 'HSC-M2-T2-D4', 'high', 'Arithmetic series sum application');
set('ma2022q18', 'HSC-M3-T4-D1', 'high', 'Chain rule then reverse differentiation');
set('ma2022q19', 'PRE-M6-D6', 'high', 'Translation and dilation of parabola');
set('ma2022q20', 'HSC-M5-T3-D8', 'high', 'Exponential growth model and rate');
set('ma2022q21', 'HSC-M7-T2-D4', 'high', 'Annuity future value comparison');
set('ma2022q22', 'HSC-M5-T2-D4', 'high', 'Global extrema on closed interval');
set('ma2022q23', 'HSC-M1-T2-D1', 'high', 'Trigonometric tide model and inequality');
nul('ma2022q24', 'Correlation/scatterplot; no matching dot');
set('ma2022q25', 'HSC-M3-T3-D4', 'medium', 'Differentiate trig and solve conditions');
set('ma2022q26', 'HSC-M6-T3-D13', 'high', 'Normal distribution percentage between values');
set('ma2022q27', 'HSC-M5-T1-D9', 'high', 'Stationary points and curve sketch');
set('ma2022q28', 'HSC-M4-T8-D5', 'medium', 'Sector area and area by integration');
set('ma2022q29', 'HSC-M2-T3-D7', 'medium', 'Geometric limiting sum');
set('ma2022q30', 'HSC-M6-T2-D11', 'medium', 'CDF to find quantile');
set('ma2022q31', 'HSC-M5-T2-D4', 'high', 'Minimise triangle area by calculus');
set('ma2022q32', 'HSC-M7-T1-D3', 'high', 'Reducing balance loan repayments');

// ---- part 1: 2023 ----
for (let i = 1; i <= 10; i++) nul('ma2023' + String(i).padStart(2, '0'), 'MCQ placeholder, no question content');
set('ma2023q11', 'HSC-M2-T2-D2', 'high', 'Arithmetic sequence nth term');
set('ma2023q12', 'HSC-M6-T1-D6', 'high', 'Expected value and standard deviation');
set('ma2023q13', 'HSC-M4-T1-D9', 'high', 'Primitive from derivative with initial condition');
set('ma2023q14', 'HSC-M3-T4-D2', 'high', 'Tangent to cubic curve');
set('ma2023q15', 'HSC-M7-T2-D4', 'high', 'Annuity future value problems');
set('ma2023q16', 'PRE-M2-T3-D6', 'high', 'Arc length and perimeter');
set('ma2023q17', 'HSC-M4-T4-D5', 'high', "Integrate f'(x)f(x)^n form");
nul('ma2023q18', 'Regression line; no matching dot');
set('ma2023q19', 'PRE-M1-T4-D10', 'medium', 'Absolute value and quadratic inequality');
set('ma2023q20', 'PRE-M3-D10', 'high', 'Solve trig equation in degrees');
set('ma2023q21', 'HSC-M2-T3-D2', 'high', 'Geometric sequence terms');
set('ma2023q22', 'PRE-M2-T1-D2', 'medium', 'Three-dimensional right-triangle trigonometry');
set('ma2023q23', 'HSC-M6-T3-D13', 'high', 'Normal distribution expected count');
set('ma2023q24', 'HSC-M5-T2-D4', 'high', 'Minimise path area by calculus');
set('ma2023q25', 'HSC-M7-T2-D4', 'high', 'Annuity withdrawals and recurrence');
set('ma2023q26', 'HSC-M5-T3-D2', 'high', 'Integrate rate of change for position');
set('ma2023q27', 'PRE-M1-T11-D5', 'medium', 'Absolute value function from graph');
set('ma2023q28', 'PRE-M4-T3-D6', 'high', 'Point where tangent has given gradient');
set('ma2023q29', 'HSC-M6-T2-D9', 'medium', 'PDF mode, CDF and median comparison');
set('ma2023q30', 'HSC-M5-T1-D9', 'high', 'Stationary points and sketch product');
set('ma2023q31', 'PRE-M7-T3-D7', 'high', 'Conditional probability and independence test');
set('ma2023q32', 'HSC-M4-T8-D5', 'medium', 'Area between exponential curves');

// ---- part 1: 2024 ----
for (let i = 1; i <= 10; i++) nul('ma2024' + String(i).padStart(2, '0'), 'MCQ placeholder, no question content');
set('ma2024q11', 'HSC-M5-T1-D10', 'medium', 'Signs of first and second derivatives');
set('ma2024q12', 'HSC-M2-T2-D4', 'high', 'Sum of arithmetic series');
set('ma2024q13', 'HSC-M5-T3-D8', 'medium', 'Exponential population growth models');
set('ma2024q14', 'HSC-M4-T8-D5', 'high', 'Area enclosed by two parabolas');
set('ma2024q15', 'HSC-M5-T3-D2', 'high', 'Integrate rate to find volume');
nul('ma2024q16', 'Box-plot comparison; no matching dot');
set('ma2024q17', 'HSC-M5-T3-D1', 'medium', 'Exponential model, solve and differentiate');
set('ma2024q18', 'PRE-M7-T3-D8', 'high', 'Independent events and complement');
set('ma2024q19', 'HSC-M5-T1-D9', 'high', 'Stationary points, inflection, curve sketch');
set('ma2024q20', 'PRE-M2-T1-D2', 'high', 'Bearings and angles of elevation');
nul('ma2024q21', 'Scatterplot observations; no matching dot');
set('ma2024q22', 'HSC-M4-T8-D11', 'medium', 'Trapezoidal rule estimate area');
set('ma2024q23', 'HSC-M6-T3-D13', 'high', 'Normal distribution z-scores and tables');
set('ma2024q24', 'HSC-M7-T2-D4', 'high', 'Annuity future value');
set('ma2024q25', 'HSC-M6-T2-D9', 'medium', 'PDF, CDF and median');
set('ma2024q26', 'HSC-M7-T2-D4', 'medium', 'Present value annuity withdrawals');
set('ma2024q27', 'HSC-M3-T4-D1', 'high', 'Product rule then integrate');
set('ma2024q28', 'HSC-M1-T2-D1', 'high', 'Trigonometric model of Ferris wheel');
set('ma2024q29', 'HSC-M3-T4-D2', 'medium', 'Tangent, normal and minimum conditions');
set('ma2024q30', 'HSC-M2-T3-D7', 'high', 'Limiting sum range');
set('ma2024q31', 'HSC-M5-T2-D4', 'medium', 'Sector formulas and optimisation');

// ---- part 2: 2025 ----
for (let i = 1; i <= 10; i++) nul('ma2025' + String(i).padStart(2, '0'), 'MCQ placeholder, no question content');
set('ma2025q11', 'PRE-M1-T4-D4', 'high', 'Quadratic turning point');
set('ma2025q12', 'HSC-M3-T4-D2', 'high', 'Tangent to rational function');
set('ma2025q13', 'HSC-M2-T3-D2', 'high', 'Geometric sequence terms');
nul('ma2025q14', 'Regression interpretation; no matching dot');
set('ma2025q15', 'HSC-M1-T1-D2', 'high', 'Trig amplitude, period and comparison');
set('ma2025q16', 'HSC-M5-T1-D9', 'high', 'Stationary points and nature');
set('ma2025q17', 'HSC-M7-T1-D3', 'high', 'Reducing balance loan');
set('ma2025q18', 'PRE-M1-T9-D7', 'medium', 'Composite function range');
set('ma2025q19', 'PRE-M7-T3-D4', 'high', 'Conditional probability Bayes');
set('ma2025q20', 'HSC-M7-T2-D4', 'high', 'Annuity future value from table');
set('ma2025q21', 'HSC-M6-T2-D11', 'high', 'PDF mode and quartile');
set('ma2025q22', 'PRE-M3-D12', 'high', 'Prove trigonometric identity');
set('ma2025q23', 'HSC-M6-T3-D13', 'medium', 'Normal distribution inverse z');
set('ma2025q24', 'HSC-M3-T4-D2', 'high', 'Common tangent to log and parabola');
set('ma2025q25', 'HSC-M4-T8-D5', 'medium', 'Integrate and find total area');
set('ma2025q26', 'HSC-M5-T2-D4', 'medium', 'Optimise area using quadratic');
set('ma2025q27', 'HSC-M4-T8-D11', 'high', 'Trapezoidal rule and exact area');
set('ma2025q28', 'PRE-M2-T3-D8', 'high', 'Sector segment area and arc length');
set('ma2025q29', 'PRE-M2-T1-D2', 'high', 'Bearings and angles of elevation');
set('ma2025q30', 'PRE-M6-D6', 'high', 'Translate parabola, find k');
set('ma2025q31', 'HSC-M1-T1-D3', 'high', 'Trig equation solution count');

// ---- validate + write ----
const dotMap = {};
for (const d of JSON.parse(fs.readFileSync(P + 'part1.json', 'utf8')).dots) dotMap[d.code] = d.path;

let failed = false;
for (const part of ['part1', 'part2']) {
  const input = JSON.parse(fs.readFileSync(P + part + '.json', 'utf8'));
  const ids = input.questions.map(q => q.id);
  const out = {};
  const seen = new Set();
  for (const id of ids) {
    if (!m[id]) { console.error('MISSING', id); failed = true; continue; }
    if (seen.has(id)) { console.error('DUPLICATE', id); failed = true; }
    seen.add(id);
    const e = m[id];
    if (e.code !== null && !dotMap[e.code]) { console.error('BAD CODE', id, e.code); failed = true; }
    if (!['high', 'medium', 'low'].includes(e.confidence)) { console.error('BAD CONF', id); failed = true; }
    if (e.why.split(/\s+/).length > 12) { console.error('WHY TOO LONG', id, e.why); failed = true; }
    out[id] = e;
  }
  fs.writeFileSync(P + part + '.out.json', JSON.stringify(out, null, 2) + '\n');
  console.log(part, 'ids', ids.length, 'written', Object.keys(out).length);
}

// union check
const outIds = [
  ...Object.keys(JSON.parse(fs.readFileSync(P + 'part1.out.json', 'utf8'))),
  ...Object.keys(JSON.parse(fs.readFileSync(P + 'part2.out.json', 'utf8'))),
];
const extra = Object.keys(m).filter(id => !outIds.includes(id));
if (extra.length) { console.error('EXTRA keys', extra); failed = true; }

if (failed) process.exit(1);

// summary
const all = { ...JSON.parse(fs.readFileSync(P + 'part1.out.json', 'utf8')), ...JSON.parse(fs.readFileSync(P + 'part2.out.json', 'utf8')) };
const counts = { high: 0, medium: 0, low: 0, null: 0 };
const pathCount = {};
for (const e of Object.values(all)) {
  if (e.code === null) counts.null++; else { counts[e.confidence]++; pathCount[e.code] = (pathCount[e.code] || 0) + 1; }
}
console.log('confidence', counts);
console.log('non-null', Object.values(all).filter(e => e.code).length, 'null', counts.null);
console.log('TOP PATHS');
Object.entries(pathCount).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([c, n]) => console.log(n, c, dotMap[c]));
