// CI gate on the capture's axe scans (F-08, UX-077): print every violation and exit 1 if
// there is any. The capture itself only records them; this decides. Node built-ins only.
//
//   pnpm ux:axe-check <run>        # folder under ux-screens/, or an absolute path
//
// A run captured with UX_AXE=0 has no scans to judge: it fails (exit 2), never passes.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { axeSkipped, readAxeScans } from "./axeFiles.ts";
import { runDir } from "./runPath.ts";

const run = process.argv[2];
if (!run) {
  console.error("usage: pnpm ux:axe-check <run>");
  process.exit(2);
}
const root = runDir(run);
if (!existsSync(root)) {
  console.error(`no capture at ${root}`);
  process.exit(2);
}

const variants = readdirSync(root)
  .filter((v) => !v.startsWith("."))
  .sort();
const skipped = variants.filter((v) => axeSkipped(join(root, v)));
if (skipped.length > 0) {
  console.error(
    `AXE SKIPPED: ${root} was captured with UX_AXE=0 (${skipped.join(", ")}), so it ` +
      `holds no accessibility results to check. Capture without UX_AXE=0 into a new ` +
      `folder and check that one.`,
  );
  process.exit(2);
}

let scans = 0;
let failures = 0;
for (const variant of variants) {
  for (const scan of readAxeScans(join(root, variant))) {
    scans += 1;
    for (const v of scan.violations) {
      failures += 1;
      console.log(
        `${variant}/${scan.screen}: ${v.id} (${v.impact ?? "?"}, ${v.nodes} nodes) — ${v.help}`,
      );
      for (const t of v.targets) console.log(`    ${t.target}`);
    }
  }
}

if (scans === 0) {
  console.error(`no axe scans under ${root}`);
  process.exit(2);
}
console.log(`${scans} axe scans, ${failures} violation(s).`);
process.exit(failures > 0 ? 1 : 0);
