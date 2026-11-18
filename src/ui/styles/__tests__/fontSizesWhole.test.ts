// ADR 0256 (#495): font sizes are whole pixels. The half sizes 11.5, 12.5 and 13.5 px
// rounded up to 12, 13 and 14 px, and their tokens are gone.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

// Every stylesheet under src, in a fixed order, comments stripped (as contrast.test.ts).
function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => {
      const p = join(dir, e.name);
      if (e.isDirectory()) return cssFiles(p);
      return e.name.endsWith(".css") ? [p] : [];
    })
    .sort();
}
const files = cssFiles(join(__dirname, "..", "..", ".."));
const sheets = files.map((f) => ({
  file: f,
  css: readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, ""),
}));

/** Every `property: value` whose property is `font-size` or a `--fs-*` token. */
function fontSizeDeclarations(): string[] {
  return sheets.flatMap(({ file, css }) =>
    [...css.matchAll(/(font-size|--fs-[\w-]+)\s*:\s*([^;{}]+)/g)].map(
      (m) => `${file}: ${m[1]}: ${m[2]!.trim()}`,
    ),
  );
}

describe("font sizes are whole pixels (ADR 0256)", () => {
  it("reads the stylesheets and finds the font-size tokens", () => {
    expect(files.length).toBeGreaterThan(1);
    expect(fontSizeDeclarations().some((d) => d.includes("--fs-12:"))).toBe(
      true,
    );
  });

  it("has no fractional px font-size token or declaration", () => {
    const fractional = fontSizeDeclarations().filter((d) =>
      /\d\.\d+px/.test(d),
    );
    expect(fractional).toEqual([]);
  });

  it("no longer defines or uses the half-size tokens", () => {
    const left = sheets.flatMap(({ file, css }) =>
      [...css.matchAll(/--fs-1[123]-5\b/g)].map((m) => `${file}: ${m[0]}`),
    );
    expect(left).toEqual([]);
  });
});
