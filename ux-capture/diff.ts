// Compare two capture runs screen by screen (DR-147, D15). A pixel counts as changed when
// its R, G or B moves by more than UX_DIFF_TOLERANCE levels (default 8), which ignores
// anti-aliasing noise; a screen fails when more than UX_DIFF_MAX_PX pixels (default 50)
// changed. One changed KPI digit (a 21×30 px box) is about 300 changed px, so it fails
// (#137). Screens in only one run are listed as MISSING (run A only) or NEW (run B only)
// and fail too. A bad setting or an empty run stops it with exit 2. Node built-ins only.
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
/** A whole number ≥ 0 from the environment; anything else stops the diff (exit 2). */
function setting(name: string, fallback: number): number {
  const text = process.env[name];
  if (text === undefined) return fallback;
  const value = Number(text);
  if (text.trim() === "" || !Number.isInteger(value) || value < 0) {
    console.error(`${name} must be a whole number ≥ 0, got "${text}"`);
    process.exit(2);
  }
  return value;
}
if (process.env.UX_DIFF_MAX !== undefined) {
  console.error("UX_DIFF_MAX is gone: use UX_DIFF_MAX_PX (pixels, default 50)");
  process.exit(2);
}
const tolerance = setting("UX_DIFF_TOLERANCE", 8);
const maxPx = setting("UX_DIFF_MAX_PX", 50);
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
if (inA.size === 0 && inB.size === 0) {
  console.error(`no screenshots under ${dirA} or ${dirB}`);
  process.exit(2);
}
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
  let pair;
  try {
    pair = [decode(join(dirA, screen)), decode(join(dirB, screen))] as const;
  } catch (e) {
    console.log(`UNREADABLE ${screen}  ${(e as Error).message}`);
    failed++;
    continue;
  }
  const { changed, share } = diffShare(pair[0], pair[1], tolerance);
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
