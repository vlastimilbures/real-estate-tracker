// ADR 0266 (#495 part 4): one text-button class. `.link-button` is the reset; the
// always-underlined, 24 px-tall variant is `.link-button.underlined`; `.link-btn` is gone.
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, it, expect } from "vitest";

const src = join(__dirname, "..", "..", "..");

// Every file under src with one of the extensions, in a fixed order.
function filesUnder(dir: string, ext: RegExp): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => {
      const p = join(dir, e.name);
      if (e.isDirectory()) return filesUnder(p, ext);
      return ext.test(e.name) ? [p] : [];
    })
    .sort();
}

type Rule = { file: string; selector: string; decls: string[] };

/** Every innermost CSS rule, comments stripped, its declarations in order. */
const rules: Rule[] = filesUnder(src, /\.css$/).flatMap((f) => {
  const css = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    file: basename(f),
    selector: m[1]!.trim().replace(/\s+/g, " "),
    decls: m[2]!
      .split(";")
      .map((d) => d.trim().replace(/\s*:\s*/, ": "))
      .filter(Boolean),
  }));
});

/** Components and pages, not this test. */
const sources = filesUnder(src, /\.tsx?$/).filter(
  (f) => !f.includes("__tests__"),
);

function only(selector: string): Rule {
  const found = rules.filter((r) => r.selector === selector);
  expect(found).toHaveLength(1);
  return found[0]!;
}

describe("one text-button class (ADR 0266)", () => {
  it("has no .link-btn rule left", () => {
    expect(
      rules
        .filter((r) => /\.link-btn\b/.test(r.selector))
        .map((r) => `${r.file}: ${r.selector}`),
    ).toEqual([]);
  });

  it("has no .link-btn class name left in the sources", () => {
    expect(
      sources
        .filter((f) => /\blink-btn\b/.test(readFileSync(f, "utf8")))
        .map((f) => basename(f)),
    ).toEqual([]);
  });

  it("makes .link-button.underlined 24 px tall and always underlined", () => {
    expect(only(".link-button.underlined").decls).toEqual([
      "min-height: 24px",
      "text-decoration: underline",
    ]);
  });

  it("colours the error summary's links through .link-button", () => {
    expect(only(".error-summary .link-button").decls).toEqual([
      "color: var(--negative)",
    ]);
  });
});
