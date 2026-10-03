// CI gate on the capture's axe scans (F-08, UX-077): print every violation and exit 1 if
// there is any. The capture itself only records them; this decides. Node built-ins only.
//
//   pnpm ux:axe-check <run>        # folder under ux-screens/
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

interface AxeFile {
  screen: string;
  violations: {
    id: string;
    impact: string | null;
    help: string;
    nodes: number;
    targets: { target: string }[];
  }[];
}

const run = process.argv[2];
if (!run) {
  console.error("usage: pnpm ux:axe-check <run>");
  process.exit(2);
}
const root = join("ux-screens", run);
if (!existsSync(root)) {
  console.error(`no capture at ${root}`);
  process.exit(2);
}

let scans = 0;
let failures = 0;
for (const variant of readdirSync(root).sort()) {
  const axeDir = join(root, variant, "axe");
  if (variant.startsWith(".") || !existsSync(axeDir)) continue;
  for (const f of readdirSync(axeDir).sort()) {
    if (!f.endsWith(".json")) continue;
    scans += 1;
    const scan = JSON.parse(readFileSync(join(axeDir, f), "utf8")) as AxeFile;
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
