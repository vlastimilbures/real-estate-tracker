// ADR 0267 (#495 part 5): one banner box with three tones. `.banner` is the box; warn,
// info and error set only colour, layout and margin; `.error-banner` is gone. Each tone
// still adds up to the declarations it had before the merge, so nothing moves.
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

function only(selector: string): Rule {
  const found = rules.filter(
    (r) => r.file === "feedback.css" && r.selector === selector,
  );
  expect(found).toHaveLength(1);
  return found[0]!;
}

const props = (r: Rule) => r.decls.map((d) => d.split(":")[0]);

/** A tone as it renders: the box, then the tone; `border-color` folds into `border`. */
function rendered(tone: string): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const d of [...only(".banner").decls, ...only(tone).decls]) {
    const at = d.indexOf(": ");
    merged[d.slice(0, at)] = d.slice(at + 2);
  }
  const color = merged["border-color"];
  if (color !== undefined) {
    merged.border = `${merged.border} ${color}`;
    delete merged["border-color"];
  }
  return merged;
}

const BOX = ["padding", "border-radius", "border", "font-size"];

describe("one banner box with three tones (ADR 0267)", () => {
  it("puts the box in .banner alone", () => {
    expect(only(".banner").decls).toEqual([
      "padding: var(--s3) var(--s4)",
      "border-radius: var(--r-sm)",
      "border: 1px solid",
      "font-size: var(--fs-13)",
    ]);
  });

  it.each([".banner.warn", ".banner.info", ".banner.error"])(
    "%s sets no box property of its own",
    (tone) => {
      expect(props(only(tone)).filter((p) => BOX.includes(p!))).toEqual([]);
    },
  );

  it("keeps the warn banner's declarations", () => {
    expect(rendered(".banner.warn")).toEqual({
      padding: "var(--s3) var(--s4)",
      "margin-bottom": "var(--s4)",
      "border-radius": "var(--r-sm)",
      background: "var(--chip-bg)",
      color: "var(--warn)",
      border: "1px solid var(--warn)",
      "font-size": "var(--fs-13)",
    });
  });

  it("keeps the info banner's declarations", () => {
    expect(rendered(".banner.info")).toEqual({
      display: "flex",
      "flex-wrap": "wrap",
      "align-items": "center",
      "justify-content": "space-between",
      gap: "var(--s3) var(--s4)",
      padding: "var(--s3) var(--s4)",
      "margin-bottom": "var(--s4)",
      "border-radius": "var(--r-sm)",
      background: "var(--accent-wash)",
      color: "var(--ink)",
      border: "1px solid var(--hairline-strong)",
      "font-size": "var(--fs-13)",
    });
  });

  it("keeps the error banner's declarations, with no bottom margin", () => {
    expect(rendered(".banner.error")).toEqual({
      display: "flex",
      "align-items": "center",
      "justify-content": "space-between",
      gap: "var(--s4)",
      padding: "var(--s3) var(--s4)",
      "border-radius": "var(--r-sm)",
      background: "var(--negative-wash)",
      color: "var(--negative)",
      border: "1px solid var(--negative)",
      "font-size": "var(--fs-13)",
    });
  });

  it("has no .error-banner rule or class name left", () => {
    expect(
      rules
        .filter((r) => /\.error-banner\b/.test(r.selector))
        .map((r) => `${r.file}: ${r.selector}`),
    ).toEqual([]);
    const sources = filesUnder(src, /\.tsx?$/).filter(
      (f) => !f.endsWith("bannerBox.test.ts"),
    );
    expect(
      sources
        .filter((f) => /\berror-banner\b/.test(readFileSync(f, "utf8")))
        .map((f) => basename(f)),
    ).toEqual([]);
  });
});
