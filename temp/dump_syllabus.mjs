import { readFileSync } from 'node:fs';

const raw = readFileSync('frontend/src/lib/syllabusDotPoints.ts', 'utf8');
const start = raw.indexOf('=', raw.indexOf('SYLLABUS_DOT_POINTS')) + 1;
const data = JSON.parse(raw.slice(start).trim().replace(/;\s*$/, ''));

for (const course of process.argv.slice(2)) {
  const groups = data[course] || [];
  console.log(`\n### ${course} (${groups.length} groups)`);
  const mods = {};
  for (const g of groups) {
    mods[g.module] = mods[g.module] || new Set();
    mods[g.module].add(g.topic);
  }
  for (const [m, ts] of Object.entries(mods)) {
    console.log(`  ${m}: ${[...ts].join(' | ')}`);
  }
}
