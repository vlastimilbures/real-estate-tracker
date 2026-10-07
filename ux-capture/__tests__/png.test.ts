// `pnpm ux:diff` decoder and pixel diff on synthetic PNGs (#137).
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { decode, diffShare, type Png } from "../png.ts";

const dir = mkdtempSync(join(tmpdir(), "ux-png-"));

/** Raw pixels of a width×height image with `channels` 3 (RGB) or 4 (RGBA). */
function image(width: number, height: number, channels: 3 | 4): Png {
  const pixels = Buffer.alloc(width * height * channels);
  for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 37 + 11) % 256;
  return { width, height, channels, pixels };
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

interface Header {
  bitDepth: number;
  colorType: number;
  interlace: number;
  /** Filter byte on every row; by default `y % 5`, so every filter is used. */
  filter: number;
}

/** Encodes `png`; `header` overrides the IHDR fields or the filter byte. */
function encode(png: Png, header: Partial<Header> = {}): string {
  const { width, height, channels, pixels } = png;
  const stride = width * channels;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    const filter = header.filter ?? y % 5;
    raw[y * (stride + 1)] = filter;
    for (let x = 0; x < stride; x++) {
      const px = (yy: number, xx: number) =>
        yy >= 0 && xx >= 0 ? pixels[yy * stride + xx]! : 0;
      const a = px(y, x - channels);
      const up = px(y - 1, x);
      const c = px(y - 1, x - channels);
      const p = a + up - c;
      const paeth =
        Math.abs(p - a) <= Math.abs(p - up) &&
        Math.abs(p - a) <= Math.abs(p - c)
          ? a
          : Math.abs(p - up) <= Math.abs(p - c)
            ? up
            : c;
      const predictor =
        [0, a, up, Math.floor((a + up) / 2), paeth][filter] ?? 0;
      raw[y * (stride + 1) + 1 + x] = (px(y, x) - predictor + 256) & 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = header.bitDepth ?? 8;
  ihdr[9] = header.colorType ?? (channels === 4 ? 6 : 2);
  ihdr[12] = header.interlace ?? 0;
  const file = join(dir, `${width}x${height}x${channels}-${Math.random()}.png`);
  writeFileSync(
    file,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
  return file;
}

/** A copy of `png` with one channel (0 = R … 3 = A) of each listed pixel moved by `delta`. */
function shifted(png: Png, at: number[], delta: number, channel = 0): Png {
  const pixels = Buffer.from(png.pixels);
  for (const i of at) {
    const o = i * png.channels + channel;
    pixels[o] = pixels[o]! < 128 ? pixels[o]! + delta : pixels[o]! - delta;
  }
  return { ...png, pixels };
}

describe("decode", () => {
  it.each([3, 4] as const)(
    "round-trips every filter type with %i channels",
    (channels) => {
      const png = image(7, 10, channels);
      expect(decode(encode(png))).toEqual(png);
    },
  );

  it.each([
    ["a 16-bit image", { bitDepth: 16 }],
    ["a palette image", { colorType: 3 }],
    ["a grey image", { colorType: 0 }],
    ["an interlaced image", { interlace: 1 }],
  ] as const)("refuses %s", (_, header) => {
    expect(() => decode(encode(image(4, 4, 3), header))).toThrow(
      "only 8-bit RGB/RGBA non-interlaced PNGs are supported",
    );
  });

  it("refuses a filter byte above 4", () => {
    expect(() => decode(encode(image(4, 4, 3), { filter: 5 }))).toThrow(
      "bad filter 5 on row 0",
    );
  });
});

describe("diffShare", () => {
  const a = image(40, 40, 4);

  it("finds no change between identical images", () => {
    expect(diffShare(decode(encode(a)), decode(encode(a)), 0)).toEqual({
      changed: 0,
      share: 0,
    });
  });

  it("counts every pixel of the larger image when the sizes differ", () => {
    expect(diffShare(a, image(40, 41, 4), 8)).toEqual({
      changed: 40 * 41,
      share: 1,
    });
  });

  it("ignores the alpha channel and compares RGB against RGBA", () => {
    const rgb = image(5, 5, 3);
    const rgba: Png = {
      ...rgb,
      channels: 4,
      pixels: Buffer.alloc(5 * 5 * 4, 7),
    };
    for (let i = 0; i < 25; i++)
      rgb.pixels.copy(rgba.pixels, i * 4, i * 3, i * 3 + 3);
    expect(diffShare(rgb, rgba, 0).changed).toBe(0);
  });

  // Anti-aliasing noise moves a channel by a few levels (D15).
  it("ignores a channel move of 8 (#137)", () => {
    expect(diffShare(a, shifted(a, [0, 1, 2], 8), 8).changed).toBe(0);
  });

  // Channels 0, 1, 2 = R, G, B.
  it.each([0, 1, 2] as const)("counts a move of channel %i", (channel) => {
    expect(diffShare(a, shifted(a, [5, 6], 9, channel), 8).changed).toBe(2);
  });

  it("ignores a change in alpha only", () => {
    expect(diffShare(a, shifted(a, [5, 6], 100, 3), 0).changed).toBe(0);
  });

  it("counts a channel move of 9, and any move at tolerance 0", () => {
    expect(diffShare(a, shifted(a, [0, 1, 2], 9), 8).changed).toBe(3);
    expect(diffShare(a, shifted(a, [0, 1, 2], 1), 0).changed).toBe(3);
  });

  // The #137 probe: one changed KPI digit is a 21×30 px box on a 1280×2854 page. The
  // full-page encode in plain JS takes about 8 s on the CI runner, past vitest's 5 s
  // default (#269), so this test alone gets a longer limit; the assertions are unchanged.
  it(
    "counts a changed 21×30 box on a full page above the 50 px budget",
    { timeout: 30_000 },
    () => {
      const page = image(1280, 2854, 4);
      const box = Array.from({ length: 30 }, (_, y) =>
        Array.from({ length: 21 }, (_, x) => (400 + y) * 1280 + 600 + x),
      ).flat();
      const diff = diffShare(decode(encode(page)), shifted(page, box, 60), 8);
      expect(diff.changed).toBe(630);
      expect(diff.changed).toBeGreaterThan(50);
      expect(diff.share).toBeLessThan(0.01);
    },
  );
});
