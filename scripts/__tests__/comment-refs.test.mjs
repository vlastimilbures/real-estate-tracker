// `pnpm lint` comment-reference check (#457) on synthetic sources: comments cite
// decisions as `ADR nnnn` only, never an id from the retired refactor archive or a
// closed issue.
import { describe, expect, it } from "vitest";
import {
  check,
  commentsOf,
  inScope,
  problemsIn,
} from "../check-comment-refs.mjs";

const ADRS = new Set(["0017", "0049", "0226"]);
const OPEN = new Set([476, 611]);
const problems = (text, path = "src/x.ts") =>
  problemsIn(text, path, ADRS, OPEN).map((p) => p.message);

describe("comment references", () => {
  it.each([
    ["DR-", "// the payoff guard (DR-044)"],
    ["UX-", "/** Opens the Add form (UX-066). */"],
    ["J-", "// calendar (J-03 a′)"],
    ["Q-", "// Kč only (Q-04)"],
    ["D-nn", "// raise on an invalid loan (D-17)"],
    ["a phase id", "// out of the startup bundle (P9)"],
    ["a phase id with a letter", "// failure (P5a)"],
    ["an issue not on the open list", "// the caller reuses it (#291)"],
    ["an issue ref in a stylesheet comment", "/* the chip shape (#495) */"],
  ])("rejects %s in a comment", (_, line) => {
    expect(problems(line)).toHaveLength(1);
  });

  it("rejects an ADR with no file", () => {
    expect(problems("// see ADR 0999")).toEqual([
      "ADR 0999 has no file in docs/adr",
    ]);
  });

  it("names the line and the id", () => {
    expect(
      problemsIn("const a = 1;\n\n// DR-071 one row", "src/y.ts", ADRS, OPEN),
    ).toEqual([
      { path: "src/y.ts", line: 3, message: "retired archive id DR-071" },
    ]);
  });

  it.each([
    [
      "an ADR cite with a section",
      "// two refinancings (ADR 0226 §2, ADR 0049 §5)",
    ],
    ["a P&L-style word", "// the P&L view and a PDF export"],
    ["an open issue on the list", "// a known gap (debt #611, #476)"],
    ["an HTML entity or a format", "// &#123; and the `#,##0` pattern, row #1"],
    ["a digit-only hex colour", "/* the dark surface #202427 */"],
    [
      "a word ending in an id-like part",
      "// an ADR-backed rule, 3D-12 and SKU-12",
    ],
    ["a CSS hex colour", "/* a #d0a tone, #DD1 and #1d2 */"],
  ])("accepts %s", (_, line) => {
    expect(problems(line)).toEqual([]);
  });

  it("scans comments only, not strings, templates or JSX text", () => {
    const code = [
      'const code = "D-17 DR-044 UX-066";',
      "const t = `P9 ${x} // DR-1`;",
      "const url = 'https://example.com/DR-1';",
      "const el = <p>UX-1 // DR-2</p>;",
    ].join("\n");
    expect(problems(code, "src/x.tsx")).toEqual([]);
  });

  it("finds block, line, trailing and JSX comments", () => {
    const code = [
      "/** DR-1 */",
      "const a = 1; // DR-2",
      "const b = <div>{/* DR-3 */}</div>;",
      "const c = `${a}`; /* DR-4 */",
    ].join("\n");
    expect(commentsOf(code, "src/x.tsx").map((c) => c.line)).toEqual([
      1, 2, 3, 4,
    ]);
    expect(problems(code, "src/x.tsx")).toHaveLength(4);
  });

  it("scans stylesheet comments, not selectors or values", () => {
    const css = `.dr-1 { color: #d1a; content: "DR-9"; }\n/* the chip (UX-049) */`;
    expect(problemsIn(css, "src/ui/x.css", ADRS, OPEN)).toEqual([
      { path: "src/ui/x.css", line: 2, message: "retired archive id UX-049" },
    ]);
  });

  it("covers source under src and leaves tests out", () => {
    expect(inScope("src/engine/loan/pay.ts")).toBe(true);
    expect(inScope("src/ui/components/components.css")).toBe(true);
    expect(inScope("src/ui/App.tsx")).toBe(true);
    expect(inScope("src/engine/__tests__/support/seed.ts")).toBe(false);
    expect(inScope("src/ui/model/format.test.ts")).toBe(false);
    expect(inScope("src/vite-env.d.ts")).toBe(true);
    expect(inScope("scripts/gates.mjs")).toBe(false);
  });

  it("passes on the repository's own source", () => {
    const r = check();
    expect(r.files).toBeGreaterThan(100);
    expect(r.problems).toEqual([]);
  });
});
