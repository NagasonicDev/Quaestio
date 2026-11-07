/**
 * Copy the 2020-25 HSC exam bundles out of the (private, uncommitted)
 * repo-root `imports/` folder into `public/templates/hsc/<template-id>/` so the
 * template installer can ship them with the app. Run after adding new bundles;
 * then run `build-template-bundles` to merge each template's `.qbx` files into
 * the single shipped `.qb` (the `.qbx` are deleted again). The output is
 * committed, so dev/build do not need these steps.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootImports = path.resolve(__dirname, "..", "..", "imports");
const target = path.resolve(__dirname, "..", "public", "templates", "hsc");
const namePattern = /^(2020|2021|2022|2023|2024|2025)-hsc-(.+)\.qbx$/i;

if (!fs.existsSync(rootImports)) {
  console.warn(`No imports folder at ${rootImports} — nothing to copy.`);
  process.exit(0);
}

let copied = 0;
const walk = (dir, insideHsc) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, insideHsc || entry.name === "hsc");
      continue;
    }
    if (!insideHsc) continue;
    const match = namePattern.exec(entry.name);
    if (!match) continue;
    const dest = path.join(target, match[2], entry.name);
    if (fs.existsSync(dest)) continue; // first subject folder wins on duplicates
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(full, dest);
    copied += 1;
  }
};

walk(rootImports, false);
console.log(`Copied ${copied} HSC bundles -> ${target}`);
