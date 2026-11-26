// ADR 0268 (#495 part 6): one chip shape. `.chip` holds the shape the title's review
// pill, the Data check's counts and its fix links share; `.chip.warn` is the one look for
// "findings to review", warn border included. `.pill` (a toggle) stays apart.
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, it, expect } from "vitest";

const src = join(__dirname, "..", "..", "..");

// Every stylesheet under src, in a fixed order.
function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => {
      const p = join(dir, e.name);
      if (e.isDirectory()) return cssFiles(p);
      return e.name.endsWith(".css") ? [p] : [];
    })
    .sort();
}

type Rule = { file: string; selector: string; decls: string[] };

/** Every innermost CSS rule, comments stripped, its declarations in order. */
const rules: Rule[] = cssFiles(src).flatMap((f) => {
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

function only(selector: string): Rule {
  const found = rules.filter((r) => r.selector === selector);
  expect(found).toHaveLength(1);
  return found[0]!;
}

const SHAPE = [
  "display: inline-flex",
  "align-items: center",
  "gap: var(--s1)",
  "border: 1px solid var(--hairline)",
  "border-radius: var(--r-pill)",
];
const shapeProps = ["display", "align-items", "gap", "border", "border-radius"];

describe("one chip shape (ADR 0268)", () => {
  it("puts the shape in .chip", () => {
    expect(only(".chip").decls).toEqual(SHAPE);
  });

  it.each([".title-pill", ".dc-pill", ".dc-chip"])(
    "%s does not repeat the shape",
    (selector) => {
      const props = only(selector).decls.map((d) => d.split(":")[0]);
      expect(props.filter((p) => shapeProps.includes(p!))).toEqual([]);
    },
  );

  it("gives .chip.warn the warn look, border included", () => {
    expect(only(".chip.warn").decls).toEqual([
      "background: var(--chip-bg)",
      "color: var(--warn)",
      "border-color: var(--warn)",
      "font-weight: 600",
    ]);
  });

  it("has no .dc-pill.warn rule left", () => {
    expect(
      rules
        .filter((r) => /\.dc-pill\.warn\b/.test(r.selector))
        .map((r) => `${r.file}: ${r.selector}`),
    ).toEqual([]);
  });
});
