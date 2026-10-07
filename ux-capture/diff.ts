// Compare two capture runs screen by screen (DR-147, D15). A pixel counts as changed when
// its R, G or B moves by more than UX_DIFF_TOLERANCE levels (default 8), which ignores
// anti-aliasing noise; a screen fails when more than UX_DIFF_MAX_PX pixels (default 50)
// changed. One changed KPI digit is about 300 px, so it fails (#137). Screens that exist
// in only one run are listed as MISSING (run A only) or NEW (run B only) and fail too.
// Node built-ins only.
//
//   pnpm ux:diff <runA> <runB>        # folders under ux-screens/
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { decode, diffShare } from "./png.ts";

const [runA, runB] = process.argv.slice(2);
if (!runA || !runB) {
  console.error("usage: pnpm ux:diff <runA> <runB>");
  process.exit(2);
}
const tolerance = Number(process.env.UX_DIFF_TOLERANCE ?? "8");
const maxPx = Number(process.env.UX_DIFF_MAX_PX ?? "50");
const dirA = join("ux-screens", runA);
const dirB = join("ux-screens", runB);
for (const dir of [dirA, dirB]) {
  if (!existsSync(dir)) {
    console.error(`no capture at ${dir}`);
    process.exit(2);
  }
}

/** `<variant>/<screen>.png` for every screenshot in a run. */
function screens(root: string): Set<string> {
  const found = new Set<string>();
  for (const variant of readdirSync(root)) {
    const dir = join(root, variant);
    if (variant.startsWith(".") || !statSync(dir).isDirectory()) continue;
    for (const png of readdirSync(dir).filter((f) => f.endsWith(".png")))
      found.add(`${variant}/${png}`);
  }
  return found;
}

const inA = screens(dirA);
const inB = screens(dirB);
let failed = 0;
let compared = 0;
let largest = { changed: 0, screen: "" };
for (const screen of [...inA].sort()) {
  if (!inB.has(screen)) {
    console.log(`MISSING  ${screen}`);
    failed++;
    continue;
  }
  compared++;
  const { changed, share } = diffShare(
    decode(join(dirA, screen)),
    decode(join(dirB, screen)),
    tolerance,
  );
  if (changed > largest.changed) largest = { changed, screen };
  if (changed > maxPx) {
    console.log(
      `CHANGED  ${screen}  ${changed} px (${(share * 100).toFixed(3)} %)`,
    );
    failed++;
  }
}
for (const screen of [...inB].sort()) {
  if (inA.has(screen)) continue;
  console.log(`NEW      ${screen}`);
  failed++;
}
console.log(
  `${compared} screens compared (channel delta > ${tolerance} counts), ` +
    `${failed} failed (over ${maxPx} px, missing or new); largest: ` +
    (largest.changed ? `${largest.changed} px in ${largest.screen}` : "0 px"),
);
process.exit(failed > 0 ? 1 : 0);
