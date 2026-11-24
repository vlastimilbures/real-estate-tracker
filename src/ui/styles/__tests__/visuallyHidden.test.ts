// ADR 0260 (#495): one visually-hidden block. `.sr-only` is the rule; the narrow top-bar
// label copies it inside its media query, and the row-action tooltip's reveal undoes it.
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
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

type Rule = { file: string; selector: string; decls: string[] };

/** Every innermost rule (inside an @media or @container too), its declarations in order. */
const rules: Rule[] = files.flatMap((f) => {
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

const SR_ONLY = [
  "position: absolute",
  "width: 1px",
  "height: 1px",
  "padding: 0",
  "margin: -1px",
  "overflow: hidden",
  "clip: rect(0 0 0 0)",
  "white-space: nowrap",
  "border: 0",
];

/** Rules with the hidden shape: a 1 × 1 px box that hides its overflow, or clips itself. */
const hidden = rules.filter(
  (r) =>
    r.decls.includes("width: 1px") &&
    r.decls.includes("height: 1px") &&
    (r.decls.includes("overflow: hidden") ||
      r.decls.includes("overflow: clip") ||
      r.decls.some((d) => /^clip(-path)?: /.test(d))),
);

function only(file: string, selector: string): Rule {
  const found = rules.filter((r) => r.file === file && r.selector === selector);
  expect(found).toHaveLength(1);
  return found[0]!;
}

describe("one visually-hidden block (ADR 0260)", () => {
  it("has the hidden shape only in .sr-only and the narrow top-bar label", () => {
    expect(hidden.map((r) => `${r.file}: ${r.selector}`).sort()).toEqual([
      "layout.css: .sr-only",
      "shell.css: .topbar .narrow-hide",
    ]);
  });

  it("keeps .sr-only's nine declarations", () => {
    expect(only("layout.css", ".sr-only").decls).toEqual(SR_ONLY);
  });

  it("gives the narrow top-bar label the same block as .sr-only", () => {
    expect(only("shell.css", ".topbar .narrow-hide").decls).toEqual(
      only("layout.css", ".sr-only").decls,
    );
  });

  it("reveals the row-action tooltip by resetting every hiding property", () => {
    const reveal = only(
      "table.css",
      ".row-action:not(.tip-off):hover > .row-action-tip, .row-action:not(.tip-off):focus-visible > .row-action-tip",
    );
    const value = (p: string) =>
      reveal.decls.find((d) => d.startsWith(`${p}: `))?.slice(p.length + 2);
    expect(value("width")).toBe("auto");
    expect(value("height")).toBe("auto");
    expect(value("margin")).toBe("0");
    expect(value("overflow")).toBe("visible");
    expect(value("clip")).toBe("auto");
    const padding = value("padding");
    expect(padding).toBeDefined();
    expect(padding).not.toBe("0");
  });
});
