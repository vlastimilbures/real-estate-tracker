// Compare two capture runs screen by screen (DR-147). Chromium's rasterization is not
// bit-stable between runs: two runs of one commit differ by up to ~0.8 % of a screen's
// pixels (anti-aliasing on charts, tiles and focus rings), so a PNG hash cannot prove a
// no-op. This counts differing pixels and passes a screen when at most UX_DIFF_MAX
// (default 1 %) of them differ; look at any screen it lists. Node built-ins only.
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
const max = Number(process.env.UX_DIFF_MAX ?? "0.01");
const dirA = join("ux-screens", runA);
const dirB = join("ux-screens", runB);
let failed = 0;
let compared = 0;
for (const variant of readdirSync(dirA)) {
  const va = join(dirA, variant);
  const vb = join(dirB, variant);
  if (!statSync(va).isDirectory() || variant.startsWith(".")) continue;
  for (const png of readdirSync(va).filter((f) => f.endsWith(".png"))) {
    const fb = join(vb, png);
    compared++;
    if (!existsSync(fb)) {
      console.log(`MISSING  ${variant}/${png}`);
      failed++;
      continue;
    }
    const share = diffShare(decode(join(va, png)), decode(fb));
    if (share > max) {
      console.log(`CHANGED  ${variant}/${png}  ${(share * 100).toFixed(3)} %`);
      failed++;
    }
  }
}
console.log(
  `${compared} screens compared, ${failed} changed beyond ${(max * 100).toFixed(3)} %`,
);
process.exit(failed > 0 ? 1 : 0);
