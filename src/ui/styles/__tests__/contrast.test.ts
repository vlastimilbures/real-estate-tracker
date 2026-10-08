// #128 G2-3-10 (ADR 0157): text colours keep WCAG AA (4.5:1) on the layered table
// backgrounds axe cannot see in a screenshot run: a hovered row (translucent
// --hover-wash), a milestone row (--accent-wash), a totals row (--paper-2), and a red
// badge on its own translucent wash over a hovered row. Colours come from tokens.css and
// components.css, composited over the opaque surface below them.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const dir = join(__dirname, "..");
const tokensCss = readFileSync(join(dir, "tokens.css"), "utf8");
const componentsCss = readFileSync(
  join(dir, "..", "components", "components.css"),
  "utf8",
);

type Rgba = [number, number, number, number];

function block(selector: string): string {
  const start = tokensCss.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no ${selector} block`);
  return tokensCss.slice(start, tokensCss.indexOf("\n}", start));
}

function vars(css: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g))
    out.set(m[1]!, m[2]!.trim());
  return out;
}

const light = vars(block(":root"));
const dark = new Map([...light, ...vars(block('[data-theme="dark"]'))]);

function parse(value: string): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgba = /^rgba?\(([^)]+)\)$/.exec(value);
  if (rgba) {
    const [r, g, b, a = "1"] = rgba[1]!.split(",").map((s) => s.trim());
    return [Number(r), Number(g), Number(b), Number(a)];
  }
  throw new Error(`unparsed colour ${value}`);
}

function token(theme: Map<string, string>, name: string): Rgba {
  const v = theme.get(name);
  if (!v) throw new Error(`no token ${name}`);
  const ref = /^var\((--[\w-]+)\)$/.exec(v);
  return ref ? token(theme, ref[1]!) : parse(v);
}

/** Paint the layers bottom-up; the first must be opaque. */
function over(...layers: Rgba[]): Rgba {
  return layers.reduce((below, top) => {
    const a = top[3];
    return [
      top[0] * a + below[0] * (1 - a),
      top[1] * a + below[1] * (1 - a),
      top[2] * a + below[2] * (1 - a),
      1,
    ];
  });
}

function luminance([r, g, b]: Rgba): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function ratio(fg: Rgba, bg: Rgba): number {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (a! + 0.05) / (b! + 0.05);
}

/** The token a components.css rule colours its text with. */
function ruleColour(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // `color:` as a declaration of its own, not the tail of `background-color:`.
  const m = new RegExp(
    `${esc}\\s*\\{(?:[^}]*;)?\\s*color:\\s*var\\((--[\\w-]+)\\)`,
  ).exec(componentsCss);
  if (!m) throw new Error(`no colour for ${selector}`);
  return m[1]!;
}

const AA = 4.5;

describe.each([
  ["light", light],
  ["dark", dark],
] as const)("text contrast on table rows, %s (#128 G2-3-10)", (_n, theme) => {
  const t = (name: string) => token(theme, name);
  const surface = t("--surface");
  const hovered = over(surface, t("--hover-wash"));
  const milestone = over(surface, t("--accent-wash"));
  const strong = t("--paper-2");

  it("N/A cells on a totals row and a plain row", () => {
    const na = t(ruleColour(".proj-na"));
    expect(ratio(na, strong)).toBeGreaterThanOrEqual(AA);
    expect(ratio(na, surface)).toBeGreaterThanOrEqual(AA);
  });

  it("negative figures on plain, hovered, milestone and totals rows", () => {
    const neg = t("--negative");
    for (const bg of [surface, hovered, milestone, strong])
      expect(ratio(neg, bg)).toBeGreaterThanOrEqual(AA);
  });

  it("a red badge on a plain and a hovered row", () => {
    const neg = t("--negative");
    const wash = t("--negative-wash");
    expect(ratio(neg, over(surface, wash))).toBeGreaterThanOrEqual(AA);
    expect(ratio(neg, over(hovered, wash))).toBeGreaterThanOrEqual(AA);
  });

  it("faint text on the surface", () => {
    expect(ratio(t("--ink-faint"), surface)).toBeGreaterThanOrEqual(AA);
  });
});
