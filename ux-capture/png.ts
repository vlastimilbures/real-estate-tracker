// PNG decode and pixel diff for `pnpm ux:diff` (diff.ts). Node built-ins only.
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

export interface Png {
  width: number;
  height: number;
  channels: number;
  pixels: Buffer;
}

/** 8-bit RGB/RGBA, non-interlaced PNG (what Playwright writes). */
export function decode(file: string): Png {
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
export function diffShare(a: Png, b: Png): number {
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
