import fs from "node:fs";
const src = fs.readFileSync("frontend/src/lib/syllabusDotPoints.ts", "utf8");
const m = src.match(/export const SYLLABUS_DOT_POINTS[^=]*=\s*(\{[\s\S]*\});?\s*$/);
const data = JSON.parse(m[1]);
const ids = process.argv.slice(2);
for (const id of ids) {
  const groups = data[id] || [];
  console.log(`\n##### ${id} (${groups.length} groups)`);
  for (const g of groups) {
    console.log(`  [${g.year}] ${g.module} :: ${g.topic} (${g.points.length} pts)`);
    for (const p of g.points) console.log(`      - ${p}`);
  }
}
