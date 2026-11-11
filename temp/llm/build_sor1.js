const fs = require('fs');
const task = JSON.parse(fs.readFileSync('D:/quaestio/temp/llm/studies-of-religion-1.task.json', 'utf8'));
const codes = new Set(task.dots.map(d => d.code));

const N = null;
// [code, confidence, why]
const m = {
  // ---- 2020 ----
  sor1_2020_q1: ['HSC-M1-T3-D23', 'high', 'New Age commonalities with major traditions'],
  sor1_2020_q2: ['HSC-M1-T3-D5', 'high', 'ecumenical dialogue between Protestant denominations'],
  sor1_2020_q3: ['HSC-M1-T3-D24', 'high', 'civil celebrants as evidence of secularism'],
  sor1_2020_q4: ['HSC-M1-T3-D18', 'medium', 'census affiliation data by state'],
  sor1_2020_q5: ['HSC-M1-T3-D11', 'high', 'obligations to land and people, Anangu'],
  sor1_2020_q6: ['HSC-M1-T3-D3', 'medium', 'Land Rights movement issue'],
  sor1_2020_q7: ['HSC-M1-T3-D22', 'high', 'Pentecostal denominational switching data'],
  sor1_2020_q8: ['HSC-M1-T3-D14', 'high', 'Native Title Amendment Act 1998'],
  sor1_2020_q9: ['HSC-M1-T3-D18', 'medium', 'changing Christian adherence patterns'],
  sor1_2020_q10: ['HSC-M1-T3-D7', 'medium', 'constitutional reform and reconciliation'],
  sor1_2020_q11: ['HSC-M1-T3-D21', 'high', 'mass migration shaping religious landscape'],
  sor1_2020_q12: ['HSC-M1-T1-D16', 'medium', 'ethics area part of Buddhism response'],
  sor1_2020_q13: ['HSC-M1-T1-D47', 'medium', 'person impact part of Christianity response'],
  sor1_2020_q14: ['HSC-M1-T1-D65', 'medium', 'ethics area part of Hinduism response'],
  sor1_2020_q15: ['HSC-M1-T1-D89', 'medium', 'ethics area part of Islam response'],
  sor1_2020_q16: ['HSC-M1-T1-D121', 'medium', 'practice expressing Jewish beliefs'],
  sor1_2020_q17: ['HSC-M1-T1-D23', 'high', 'impact of Buddhist significant person'],
  sor1_2020_q18: ['HSC-M1-T1-D41', 'medium', 'Christian ethical behaviour guidance'],
  sor1_2020_q19: [N, 'low', 'whole-tradition essence essay; no single dot'],
  sor1_2020_q20: ['HSC-M1-T1-D95', 'high', 'impact of Muslim significant person'],
  sor1_2020_q21: [N, 'low', 'covenant belief; no Year 12 Judaism belief dot'],
  // ---- 2021 ----
  sor1_2021_q1: ['HSC-M1-T3-D14', 'high', 'Native Title Act 1993 recognition'],
  sor1_2021_q2: ['HSC-M1-T3-D11', 'medium', 'land as sacred link to identity'],
  sor1_2021_q3: [N, 'low', 'stem missing; cannot determine'],
  sor1_2021_q4: [N, 'low', 'source missing; cannot determine'],
  sor1_2021_q5: ['HSC-M1-T3-D20', 'medium', 'recognising Christian denominations'],
  sor1_2021_q6: ['HSC-M1-T3-D27', 'high', 'NSW Ecumenical Council objective'],
  sor1_2021_q7: ['HSC-M1-T3-D26', 'medium', 'Uniting Church membership of NCC'],
  sor1_2021_q8: ['HSC-M1-T3-D18', 'medium', 'census 2016 adherence facts'],
  sor1_2021_q9: ['HSC-M1-T3-D5', 'medium', 'example of ecumenism'],
  sor1_2021_q10: ['HSC-M1-T3-D14', 'medium', 'Native Title Amendment Act 1998 powers'],
  sor1_2021_q11: ['HSC-M1-T3-D29', 'high', 'religious traditions engaging reconciliation'],
  sor1_2021_q12: ['HSC-M1-T1-D16', 'medium', 'ethics part of Buddhism 15-mark'],
  sor1_2021_q13: ['HSC-M1-T1-D51', 'medium', 'practice significance, final part'],
  sor1_2021_q14: ['HSC-M1-T1-D74', 'medium', 'practice guidance for Hindu community'],
  sor1_2021_q15: ['HSC-M1-T1-D95', 'medium', 'person guidance, final part'],
  sor1_2021_q16: ['HSC-M1-T1-D114', 'medium', 'ethics guidance, final part'],
  sor1_2021_q17: ['HSC-M1-T1-D15', 'low', 'whole-tradition guidance essay'],
  sor1_2021_q18: ['HSC-M1-T1-D41', 'low', 'Christian guidance essay, broad'],
  sor1_2021_q19: ['HSC-M1-T1-D65', 'low', 'Hindu guidance essay, broad'],
  sor1_2021_q20: ['HSC-M1-T1-D89', 'medium', 'Islam guiding right action'],
  sor1_2021_q21: ['HSC-M1-T1-D114', 'medium', 'Judaism guiding right living'],
  // ---- 2022 ----
  sor1_2022_q1: ['HSC-M1-T3-D9', 'high', 'kinship as system of relationships'],
  sor1_2022_q2: ['HSC-M1-T3-D12', 'high', 'loss of identity from dispossession'],
  sor1_2022_q3: ['HSC-M1-T3-D18', 'high', 'census No Religion percentage'],
  sor1_2022_q4: ['HSC-M1-T3-D18', 'medium', 'largest Christian denomination by census'],
  sor1_2022_q5: ['HSC-M1-T3-D12', 'high', 'Sorry Day and Stolen Generations'],
  sor1_2022_q6: [N, 'low', 'stimulus missing; cannot determine'],
  sor1_2022_q7: ['HSC-M1-T3-D5', 'medium', 'role of ecumenical movement'],
  sor1_2022_q8: [N, 'low', 'statements missing; cannot determine'],
  sor1_2022_q9: ['HSC-M1-T3-D24', 'high', 'cause of increasing secularism'],
  sor1_2022_q10: ['HSC-M1-T3-D16', 'high', 'Wik decision outcome'],
  sor1_2022_q11: ['HSC-M1-T3-D28', 'high', 'importance of interfaith dialogue'],
  sor1_2022_q12: ['HSC-M1-T1-D22', 'medium', 'Buddhist person contribution, final part'],
  sor1_2022_q13: ['HSC-M1-T1-D46', 'medium', 'Christian person contribution, final part'],
  sor1_2022_q14: ['HSC-M1-T1-D69', 'medium', 'Hindu person contribution, final part'],
  sor1_2022_q15: ['HSC-M1-T1-D94', 'medium', 'Muslim person contribution, final part'],
  sor1_2022_q16: ['HSC-M1-T1-D117', 'medium', 'Jewish person contribution, final part'],
  sor1_2022_q17: ['HSC-M1-T3-D33', 'low', 'diversity and unity within Buddhism'],
  sor1_2022_q18: ['HSC-M1-T3-D33', 'low', 'diversity and unity within Christianity'],
  sor1_2022_q19: ['HSC-M1-T3-D33', 'low', 'diversity and unity within Hinduism'],
  sor1_2022_q20: ['HSC-M1-T3-D33', 'low', 'diversity and unity within Islam'],
  sor1_2022_q21: ['HSC-M1-T3-D33', 'low', 'diversity and unity within Judaism'],
  // ---- 2023 ----
  sor1_2023_q1: ['HSC-M1-T3-D18', 'medium', 'fastest growing tradition, 2021 census'],
  sor1_2023_q2: ['HSC-M1-T3-D18', 'high', 'No Religion growth in census'],
  sor1_2023_q3: ['HSC-M1-T3-D24', 'high', 'definition of secularism'],
  sor1_2023_q4: ['HSC-M1-T3-D22', 'high', 'denominational switching example'],
  sor1_2023_q5: ['HSC-M1-T3-D10', 'high', 'ceremonial life expressing Dreaming'],
  sor1_2023_q6: ['HSC-M1-T3-D28', 'medium', 'purpose of interfaith dialogue'],
  sor1_2023_q7: ['HSC-M1-T3-D5', 'medium', 'objective of ecumenism'],
  sor1_2023_q8: ['HSC-M1-T3-D9', 'high', 'kinship definition statements'],
  sor1_2023_q9: ['HSC-M1-T3-D29', 'medium', 'religious leaders supporting reconciliation'],
  sor1_2023_q10: ['HSC-M1-T3-D12', 'high', 'Stolen Generations and spirituality'],
  sor1_2023_q11: ['HSC-M1-T3-D17', 'high', 'Dreaming and Land Rights movement'],
  sor1_2023_q12: ['HSC-M1-T1-D22', 'medium', 'Buddhist person contribution today'],
  sor1_2023_q13: ['HSC-M1-T1-D46', 'medium', 'Christian person contribution today'],
  sor1_2023_q14: ['HSC-M1-T1-D69', 'medium', 'Hindu person contribution today'],
  sor1_2023_q15: ['HSC-M1-T1-D94', 'medium', 'Muslim person contribution today'],
  sor1_2023_q16: ['HSC-M1-T1-D117', 'medium', 'Jewish person contribution today'],
  sor1_2023_q17: [N, 'low', 'explicitly multi-strand; no single dot'],
  sor1_2023_q18: [N, 'low', 'explicitly multi-strand; no single dot'],
  sor1_2023_q19: [N, 'low', 'explicitly multi-strand; no single dot'],
  sor1_2023_q20: [N, 'low', 'explicitly multi-strand; no single dot'],
  sor1_2023_q21: [N, 'low', 'explicitly multi-strand; no single dot'],
  // ---- 2024 ----
  sor1_2024_q1: ['HSC-M1-T3-D8', 'medium', 'aspects determined by the Dreaming'],
  sor1_2024_q2: ['HSC-M1-T3-D17', 'high', 'Dreaming importance for Land Rights'],
  sor1_2024_q3: ['HSC-M1-T3-D12', 'high', 'ongoing effect of dispossession'],
  sor1_2024_q4: ['HSC-M1-T3-D24', 'high', 'secularism eroding religious influence'],
  sor1_2024_q5: ['HSC-M1-T3-D22', 'high', 'reason for denominational switching'],
  sor1_2024_q6: ['HSC-M1-T3-D23', 'high', 'New Age religion components'],
  sor1_2024_q7: ['HSC-M1-T3-D18', 'medium', '2021 census adherence accuracy'],
  sor1_2024_q8: ['HSC-M1-T3-D28', 'high', 'importance of interfaith dialogue'],
  sor1_2024_q9: ['HSC-M1-T3-D18', 'medium', 'census percentage identifying Islam'],
  sor1_2024_q10: ['HSC-M1-T3-D14', 'medium', 'Wik and Native Title Act statements'],
  sor1_2024_q11: ['HSC-M1-T3-D25', 'high', 'impact of Christian ecumenical movement'],
  sor1_2024_q12: ['HSC-M1-T1-D26', 'high', 'practice expressing Buddhist beliefs'],
  sor1_2024_q13: ['HSC-M1-T1-D50', 'high', 'practice expressing Christian beliefs'],
  sor1_2024_q14: ['HSC-M1-T1-D73', 'high', 'practice expressing Hindu beliefs'],
  sor1_2024_q15: ['HSC-M1-T1-D98', 'high', 'practice expressing Islamic beliefs'],
  sor1_2024_q16: ['HSC-M1-T1-D121', 'high', 'practice expressing Jewish beliefs'],
  sor1_2024_q17: ['HSC-M1-T1-D23', 'high', 'impact of significant Buddhist person'],
  sor1_2024_q18: ['HSC-M1-T1-D47', 'high', 'impact of significant Christian person'],
  sor1_2024_q19: ['HSC-M1-T1-D70', 'high', 'impact of significant Hindu person'],
  sor1_2024_q20: ['HSC-M1-T1-D95', 'high', 'impact of significant Muslim person'],
  sor1_2024_q21: ['HSC-M1-T1-D118', 'high', 'impact of significant Jewish person'],
  // ---- 2025 ----
  sor1_2025_q1: ['HSC-M1-T3-D22', 'high', 'Catholic to Pentecostal switching'],
  sor1_2025_q2: ['HSC-M1-T3-D21', 'high', 'post-war immigration, many faiths'],
  sor1_2025_q3: ['HSC-M1-T3-D12', 'high', 'continuing effect of dispossession'],
  sor1_2025_q4: ['HSC-M1-T3-D26', 'high', 'NCC aim of ecumenical gatherings'],
  sor1_2025_q5: ['HSC-M1-T3-D7', 'medium', 'definition of reconciliation'],
  sor1_2025_q6: ['HSC-M1-T3-D24', 'high', 'secular activity example'],
  sor1_2025_q7: ['HSC-M1-T3-D10', 'high', 'importance of ceremonial life'],
  sor1_2025_q8: ['HSC-M1-T3-D23', 'high', 'New Age adherent survey response'],
  sor1_2025_q9: ['HSC-M1-T3-D16', 'high', 'outcome of Wik decision'],
  sor1_2025_q10: ['HSC-M1-T3-D18', 'medium', '2021 census adherence statements'],
  sor1_2025_q11: ['HSC-M1-T3-D28', 'high', 'importance of religious dialogue'],
  sor1_2025_q12: ['HSC-M1-T1-D23', 'medium', 'person direction, final part'],
  sor1_2025_q13: ['HSC-M1-T1-D47', 'medium', 'person direction, final part'],
  sor1_2025_q14: ['HSC-M1-T1-D70', 'medium', 'person direction, final part'],
  sor1_2025_q15: ['HSC-M1-T1-D95', 'medium', 'person direction, final part'],
  sor1_2025_q16: ['HSC-M1-T1-D118', 'medium', 'person direction, final part'],
  sor1_2025_q17: ['HSC-M1-T1-D16', 'high', 'Buddhist ethics in chosen area'],
  sor1_2025_q18: ['HSC-M1-T1-D41', 'high', 'Christian ethics in chosen area'],
  sor1_2025_q19: ['HSC-M1-T1-D65', 'high', 'Hindu ethics in chosen area'],
  sor1_2025_q20: ['HSC-M1-T1-D89', 'high', 'Islamic ethics in chosen area'],
  sor1_2025_q21: ['HSC-M1-T1-D114', 'high', 'Jewish ethics in chosen area'],
};

// build + validate
const ids = task.questions.map(q => q.id);
const missing = ids.filter(id => !(id in m));
const extra = Object.keys(m).filter(id => !ids.includes(id));
const badCodes = Object.entries(m).filter(([, v]) => v[0] !== null && !codes.has(v[0]));
const badConf = Object.entries(m).filter(([, v]) => !['high', 'medium', 'low'].includes(v[1]));
const longWhy = Object.entries(m).filter(([, v]) => v[2].split(/\s+/).length > 12);

if (missing.length || extra.length || badCodes.length || badConf.length || longWhy.length) {
  console.log({ missing, extra, badCodes, badConf, longWhy });
  process.exit(1);
}

const out = {};
for (const id of ids) out[id] = { code: m[id][0], confidence: m[id][1], why: m[id][2] };
fs.writeFileSync('D:/quaestio/temp/llm/studies-of-religion-1.out.json', JSON.stringify(out, null, 1) + '\n', 'utf8');

const counts = {};
for (const v of Object.values(out)) counts[v.code || 'null'] = (counts[v.code || 'null'] || 0) + 1;
const pathOf = Object.fromEntries(task.dots.map(d => [d.code, d.path]));
const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
console.log('entries', Object.keys(out).length, 'of', ids.length);
console.log('conf', out && Object.values(out).reduce((a, v) => (a[v.confidence] = (a[v.confidence] || 0) + 1, a), {}));
console.log('nulls', counts['null'] || 0);
for (const [c, n] of top) console.log(n, c, c === 'null' ? '' : pathOf[c]);
