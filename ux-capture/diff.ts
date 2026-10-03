// Compare two capture runs screen by screen (DR-147). Chromium's rasterization is not
// bit-stable between runs: two runs of one commit differ by up to ~0.8 % of a screen's
// pixels (anti-aliasing on charts, tiles and focus rings), so a PNG hash cannot prove a
// no-op. This counts differing pixels and passes a screen when at most UX_DIFF_MAX
// (default 1 %) of them differ; look at any screen it lists. Node built-ins only.
//
//   pnpm ux:diff <runA> <runB>        # folders under ux-screens/
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";

interface Png {
  width: number;
  height: number;
  channels: number;
  pixels: Buffer;
}

/** 8-bit RGB/RGBA, non-interlaced PNG (what Playwright writes). */
function decode(file: string): Png {
  const b = readFileSync(file);
  let o = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  while (o < b.length) {
    const len = b.readUInt32BE(o);
    const type = b.toString("ascii", o + 4, o + 8);
    const data = b.subarray(o + 8, o + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9]!;
    } else if (type === "IDAT") idat.push(data);
    o += 12 + len;
  }
  const channels = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const row = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? pixels[y * stride + x - channels]! : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x]! : 0;
      const c =
        x >= channels && y > 0 ? pixels[(y - 1) * stride + x - channels]! : 0;
      let v = raw[row + x]!;
      if (filter === 1) v += a;
      else if (filter === 2) v += up;
      else if (filter === 3) v += Math.floor((a + up) / 2);
      else if (filter === 4) {
        const p = a + up - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c;
      }
      pixels[y * stride + x] = v & 255;
    }
  }
  return { width, height, channels, pixels };
}

/** Share of pixels whose RGB differs; 1 when the sizes differ. */
function diffShare(a: Png, b: Png): number {
  if (a.width !== b.width || a.height !== b.height) return 1;
  let n = 0;
  for (let i = 0; i < a.width * a.height; i++) {
    const ia = i * a.channels;
    const ib = i * b.channels;
    if (
      a.pixels[ia] !== b.pixels[ib] ||
      a.pixels[ia + 1] !== b.pixels[ib + 1] ||
      a.pixels[ia + 2] !== b.pixels[ib + 2]
    )
      n++;
  }
  return n / (a.width * a.height);
}

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
