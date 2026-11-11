const fs = require('fs');
const base = 'D:/quaestio/temp/llm/';
const n = process.argv[2];
const chunk = JSON.parse(fs.readFileSync(base + `industrial-technology.part${n}.json`, 'utf8'));
const codes = new Set(chunk.dots.map(d => d.code));
const ids = chunk.questions.map(q => q.id);
const lines = fs.readFileSync(base + `p${n}.txt`, 'utf8').split(/\r?\n/).filter(l => l.trim());
const out = {};
const problems = [];
for (const l of lines) {
  const [id, code, conf, ...why] = l.split('|');
  if (!ids.includes(id)) problems.push('unknown id ' + id);
  if (out[id]) problems.push('dup id ' + id);
  if (code !== 'null' && !codes.has(code)) problems.push('bad code ' + code + ' for ' + id);
  if (!['high', 'medium', 'low'].includes(conf)) problems.push('bad conf ' + id);
  const w = why.join('|').trim();
  if (w.split(/\s+/).length > 12) problems.push('why too long ' + id);
  out[id] = { code: code === 'null' ? null : code, confidence: conf, why: w };
}
for (const id of ids) if (!out[id]) problems.push('missing id ' + id);
fs.writeFileSync(base + `industrial-technology.part${n}.out.json`, JSON.stringify(out, null, 1));
console.log('part' + n, 'ids', ids.length, 'entries', Object.keys(out).length, 'problems', problems.length);
problems.slice(0, 20).forEach(p => console.log(' ', p));
