// `pnpm lint:css` dead-class and custom-property check (#460) on synthetic sources.
import { describe, expect, it } from "vitest";
import {
  check,
  cssClasses,
  customProperties,
  deadClasses,
  deadProperties,
} from "../css-dead-classes.mjs";

describe("css dead classes", () => {
  it("reads class names from selectors only, not from comments or at-rules", () => {
    const css = `/* .gone */ .a .b-c:hover, .d > .e { background: url(x.svg); }
      @media (min-width: 1.5em) { .f { width: 0.5em; } }`;
    expect([...cssClasses(css)].sort()).toEqual(["a", "b-c", "d", "e", "f"]);
  });

  it("finds a class only as a whole token in the source", () => {
    const code = [`<div className="row-wide" />`, `const c = "tile compact";`];
    expect(deadClasses(new Set(["row", "tile", "compact"]), code)).toEqual([
      "row",
    ]);
  });

  it("skips classes built at run time from an allowed prefix", () => {
    expect(
      deadClasses(new Set(["tone-negative", "spread"]), [""], ["tone-"]),
    ).toEqual(["spread"]);
  });

  it("allows only the listed run-time fx- classes, not every fx- class", () => {
    const classes = new Set([
      "fx-leaseEnd",
      "fx-loanPayoff",
      "fx-gone",
      "fx-row",
    ]);
    const code = [
      `<li className="fx-row" />`,
      "className={`fx-mark fx-${kind}`}",
    ];
    expect(deadClasses(classes, code)).toEqual(["fx-gone"]);
  });

  it("treats a class named only in a comment as dead", () => {
    const code = [
      `// the old .legacy-row layout\n/* see also stale-tile */ const url = "https://x/y";`,
    ];
    expect(deadClasses(new Set(["legacy-row", "stale-tile"]), code)).toEqual([
      "legacy-row",
      "stale-tile",
    ]);
  });

  it("keeps code after a URL's `://`", () => {
    expect(
      deadClasses(new Set(["kept"]), [`const u = "https://x"; c = "kept";`]),
    ).toEqual([]);
  });

  it("reports custom properties used but undefined, and defined but unused", () => {
    const css = `:root { --a: 1px; --b: 2px; --rdp-x: red; } .x { margin: var(--a) var(--c); }`;
    const tsx = `style={{ "--d": "1px" }} /* var(--d) */`;
    expect(deadProperties([css, tsx], ["--rdp-"])).toEqual({
      undefined: ["--c"],
      unused: ["--b"],
    });
  });

  it("counts a TS style key as a definition", () => {
    expect([
      ...customProperties(`{ "--w": "4px", ["--h"]: 1 }`).defined,
    ]).toEqual(["--w", "--h"]);
  });

  it("passes on the repository's own stylesheets", () => {
    const r = check();
    expect(r.files).toBeGreaterThan(1);
    expect(r.problems).toEqual([]);
  });
});
