// `pnpm lint` comment-reference check (#457) on synthetic sources: comments cite
// decisions as `ADR nnnn` only, never an id from the retired refactor archive or a
// closed issue.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { cleanGitEnv } from "./support/cleanGitEnv.mjs";
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
    ["an archive id quoted as code", "// the `DR-044` guard"],
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
    ["a hex value quoted as code", "// its `#666` default fill"],
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

  it.each([
    ["C-", "// the checklist (C-14)"],
    ["F-", "// the axe gate (F-08)"],
    ["H-", "// the pool finding (H-14)"],
  ])("rejects the %s finding family in a comment", (_, line) => {
    expect(problems(line)).toHaveLength(1);
  });

  it("passes on the repository's own source", () => {
    const r = check();
    expect(r.files).toBeGreaterThan(100);
    expect(r.problems).toEqual([]);
  });
});

describe("comment references in Rust", () => {
  const rs = (text) => problemsIn(text, "src-tauri/src/x.rs", ADRS, OPEN);

  it("finds line, doc, inner-doc, trailing and nested block comments", () => {
    const code = [
      "//! DR-1",
      "/// DR-2",
      "let a = 1; // DR-3",
      "/* outer /* DR-4 */ still a comment: DR-5 */",
      "fn f() {}",
    ].join("\n");
    expect(rs(code).map((p) => [p.line, p.message])).toEqual([
      [1, "retired archive id DR-1"],
      [2, "retired archive id DR-2"],
      [3, "retired archive id DR-3"],
      [4, "retired archive id DR-4"],
      [4, "retired archive id DR-5"],
    ]);
  });

  it("reads strings, raw strings, chars and lifetimes as code", () => {
    const code = [
      'let s = "DR-1 // DR-2";',
      'let r = r#"P9 /* DR-3 */ "quoted" "#;',
      "let q = '\"'; let c = '/'; // DR-4",
      "fn f<'a>(x: &'a str) -> &'a str { x } // UX-5",
      '#[ignore = "DR-169: a probe"]',
    ].join("\n");
    expect(rs(code).map((p) => p.message)).toEqual([
      "retired archive id DR-4",
      "retired archive id UX-5",
    ]);
  });

  it("applies the ADR and issue rules", () => {
    expect(
      rs("// ADR 0999, closed #291, open #476").map((p) => p.message),
    ).toEqual([
      "ADR 0999 has no file in docs/adr",
      "issue #291 is not on CITED_OPEN_ISSUES",
    ]);
  });
});

describe("comment references in the living docs", () => {
  const md = (text, path = "docs/roadmap.md") =>
    problemsIn(text, path, ADRS, OPEN).map((p) => [p.line, p.message]);

  it("reads the whole text, code spans included", () => {
    expect(md("# Title\n\nSee `DR-044` and (D-17).\n| P4a | x |")).toEqual([
      [3, "retired archive id DR-044"],
      [3, "retired archive id D-17"],
      [4, "retired archive id P4a"],
    ]);
  });

  it("checks ADR cites but leaves issue numbers alone", () => {
    expect(md("Decided in ADR 0049 and ADR 0999 (#158, #291).")).toEqual([
      [1, "ADR 0999 has no file in docs/adr"],
    ]);
  });
});

describe("the files the check reads", () => {
  it.each([
    "src-tauri/src/db.rs",
    "src-tauri/src/commands/backup.rs",
    "src-tauri/build.rs",
    "README.md",
    "CONTRIBUTING.md",
    "SPEC.md",
    "docs/roadmap.md",
    "docs/design/czech-mortgage-extensions.md",
    "ux-capture/README.md",
    "ux-capture/helpers.ts",
    "src/engine/__tests__/reference/mortgageReference.ts",
  ])("reads %s", (path) => {
    expect(inScope(path)).toBe(true);
  });

  it.each([
    ["Rust tests", "src-tauri/tests/menu.rs"],
    ["generated Rust", "src-tauri/target/debug/build/x.rs"],
    ["an ADR", "docs/adr/0014-rust-transaction-command.md"],
    ["the ADR index", "docs/adr/README.md"],
    ["the wording log", "docs/decisions/wording.md"],
    ["a review record", "docs/reviews/2026-10-claude-code-review.md"],
    ["the changelog", "CHANGELOG.md"],
    ["a capture test", "ux-capture/__tests__/png.test.ts"],
    ["a reference test", "src/engine/__tests__/reference/edgeCases.test.ts"],
    ["test support", "src/engine/__tests__/support/seed.ts"],
    ["the Claude rules", ".claude/rules/engine-parity.md"],
  ])("leaves out %s", (_, path) => {
    expect(inScope(path)).toBe(false);
  });

  it("applies the issue rule to app source only", () => {
    const closed = "// a shape (#291)";
    const issues = (path) => problemsIn(closed, path, ADRS, OPEN).length;
    expect(issues("src/x.ts")).toBe(1);
    expect(issues("src-tauri/src/x.rs")).toBe(1);
    expect(issues("src/engine/__tests__/reference/loanGen.ts")).toBe(0);
    expect(issues("ux-capture/helpers.ts")).toBe(0);
  });

  it("scans the Rust source and the living docs of the repository", () => {
    const { paths } = check();
    expect(paths).toEqual(
      expect.arrayContaining([
        "src-tauri/src/db.rs",
        "src-tauri/build.rs",
        "SPEC.md",
        "docs/roadmap.md",
        "ux-capture/README.md",
      ]),
    );
    expect(paths.filter((p) => p.startsWith("docs/adr/"))).toEqual([]);
  });
});

describe("files git ignores", () => {
  // The owner's local notes (docs/refactor/, ignored) cite retired ids; they never reach
  // CI, so a local `pnpm lint` or release run must not fail on them either.
  it("are not read", () => {
    const root = mkdtempSync(join(tmpdir(), "comment-refs-"));
    try {
      const files = {
        ".gitignore": "docs/local/\n",
        "docs/adr/0017-x.md": "# 0017\n",
        "docs/kept.md": "See ADR 0017.\n",
        "docs/local/notes.md": "The old check (DR-143).\n",
        "src/x.ts": "// ADR 0017\n",
        "src-tauri/src/x.rs": "// ADR 0017\n",
        "src-tauri/build.rs": "",
        "ux-capture/x.ts": "",
        "README.md": "",
        "CONTRIBUTING.md": "",
        "SPEC.md": "",
      };
      for (const [f, text] of Object.entries(files)) {
        mkdirSync(dirname(join(root, f)), { recursive: true });
        writeFileSync(join(root, f), text);
      }
      execFileSync("git", ["init", "-q"], { cwd: root, env: cleanGitEnv() });
      const r = check(root);
      expect(r.paths).toContain("docs/kept.md");
      expect(r.paths).not.toContain("docs/local/notes.md");
      expect(r.problems).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
