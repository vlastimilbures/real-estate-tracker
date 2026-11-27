// `pnpm coverage:ratchet` (#141, #499) on a synthetic coverage summary: the PR gate fails
// only on a broken floor; the nightly `--raise` mode lists the floors to raise.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MAX_SLACK,
  NONE,
  floorsJson,
  headroom,
  issueBody,
  measure,
  raise,
  ratchet,
} from "../check-coverage-ratchet.mjs";
import { yamlTree } from "../gates.mjs";

const ROOT = "/repo";
const m = (lc, lt, bc, bt) => ({
  lines: { covered: lc, total: lt },
  branches: { covered: bc, total: bt },
});
const summary = {
  total: m(0, 0, 0, 0),
  "/repo/src/engine/a.ts": m(90, 100, 40, 50),
  "/repo/src/engine/deep/b.ts": m(10, 100, 0, 0),
  "/repo/src/ui/App.tsx": m(8, 10, 3, 4),
  "/repo/src/ui/pages/Page.tsx": m(1, 10, 0, 4),
};

describe("coverage ratchet", () => {
  it("measures a glob over the files it matches, as a folder total", () => {
    expect(measure(summary, "src/engine/**", ROOT)).toEqual({
      lines: 50,
      branches: 80,
    });
    // `src/ui/*.{ts,tsx}` takes the top-level UI files only, not the subfolders.
    expect(measure(summary, "src/ui/*.{ts,tsx}", ROOT)).toEqual({
      lines: 80,
      branches: 75,
    });
    expect(measure(summary, "src/nothing/**", ROOT)).toBeNull();
  });

  it("counts a metric with nothing to cover as fully covered", () => {
    expect(
      measure({ "/repo/src/x.ts": m(0, 0, 0, 0) }, "src/**", ROOT),
    ).toEqual({ lines: 100, branches: 100 });
  });

  it("allows a slack of 3 points (CONTRIBUTING.md, the gate list)", () => {
    expect(MAX_SLACK).toBe(3);
  });

  it("fails a floor only when measured drops below it", () => {
    const rows = ratchet(
      summary,
      { "src/engine/**": { lines: 50, branches: 80.1 } },
      ROOT,
    );
    expect(rows.map((r) => [r.metric, r.ok])).toEqual([
      ["lines", true],
      ["branches", false],
    ]);
  });

  // #499: a PR that raises coverage no longer fails until coverage-floors.json is edited.
  it("passes a floor far below measured", () => {
    const rows = ratchet(
      summary,
      { "src/engine/**": { lines: 1, branches: 1 } },
      ROOT,
    );
    expect(rows.every((r) => r.ok)).toBe(true);
  });

  it("fails a floor whose glob matches no file", () => {
    expect(
      ratchet(summary, { "src/gone/**": { lines: 1, branches: 1 } }, ROOT),
    ).toEqual([
      { glob: "src/gone/**", metric: "files", ok: false, missing: true },
    ]);
  });

  it("has a floor of lines and branches for every glob in coverage-floors.json", () => {
    const floors = JSON.parse(
      readFileSync(
        new URL("../../coverage-floors.json", import.meta.url),
        "utf8",
      ),
    );
    for (const floor of Object.values(floors)) {
      expect(Object.keys(floor).sort()).toEqual(["branches", "lines"]);
    }
  });
});

describe("coverage ratchet --raise (nightly)", () => {
  it("leaves 2 points of headroom under src/ui and 1 elsewhere", () => {
    expect(headroom("src/ui/pages/**")).toBe(2);
    expect(headroom("src/ui/*.{ts,tsx}")).toBe(2);
    expect(headroom("src/engine/**")).toBe(1);
    expect(headroom("src/uix/**")).toBe(1);
  });

  it("raises a floor more than MAX_SLACK below measured to measured minus headroom", () => {
    // engine: lines 50, branches 80; ui top level: lines 80, branches 75.
    const floors = {
      "src/engine/**": { lines: 47, branches: 76.9 },
      "src/ui/*.{ts,tsx}": { lines: 70, branches: 75 },
    };
    const { raised, floors: next } = raise(
      ratchet(summary, floors, ROOT),
      floors,
    );
    expect(raised).toEqual([
      {
        glob: "src/engine/**",
        metric: "branches",
        floor: 76.9,
        measured: 80,
        next: 79,
      },
      {
        glob: "src/ui/*.{ts,tsx}",
        metric: "lines",
        floor: 70,
        measured: 80,
        next: 78,
      },
    ]);
    expect(next).toEqual({
      "src/engine/**": { lines: 47, branches: 79 },
      "src/ui/*.{ts,tsx}": { lines: 78, branches: 75 },
    });
    // The input is not changed.
    expect(floors["src/engine/**"].branches).toBe(76.9);
  });

  it("rounds a raised floor down to a whole point", () => {
    const s = { "/repo/src/x.ts": m(9969, 10000, 0, 0) };
    const floors = { "src/**": { lines: 90, branches: 100 } };
    const { raised } = raise(ratchet(s, floors, ROOT), floors);
    expect(raised.map((r) => r.next)).toEqual([98]);
  });

  it("raises nothing when every floor is within MAX_SLACK", () => {
    const floors = { "src/engine/**": { lines: 47, branches: 77 } };
    const out = raise(ratchet(summary, floors, ROOT), floors);
    expect(out.raised).toEqual([]);
    expect(out.floors).toEqual(floors);
    // A sentinel, not an empty file: upload-artifact never sees a 0-byte file.
    expect(NONE).toBe("<!-- coverage-floors: none -->");
    expect(issueBody(out)).toBe(`${NONE}\n`);
  });

  it("writes coverage-floors.json in its own layout, one line per glob", () => {
    const file = readFileSync(
      new URL("../../coverage-floors.json", import.meta.url),
      "utf8",
    );
    expect(floorsJson(JSON.parse(file))).toBe(file);
  });

  it("lists each floor to raise and the whole new file in the issue body", () => {
    const floors = { "src/engine/**": { lines: 47, branches: 76 } };
    const body = issueBody(raise(ratchet(summary, floors, ROOT), floors));
    expect(body).toContain(
      "| `src/engine/**` | branches | 76 | 80.0 | **79** |",
    );
    expect(body).not.toContain("| lines |");
    expect(body).toContain(
      '```json\n{\n  "src/engine/**": { "lines": 47, "branches": 79 }\n}\n```',
    );
    expect(body).toContain(`more than ${MAX_SLACK} points`);
    expect(body.split("\n")[0]).not.toBe(NONE);
  });
});

// The nightly job (#499, owner decision 2026-11-27): only the job that writes the issue
// may write, and it runs no repository code.
describe("nightly.yml coverage floors jobs", () => {
  const nightly = yamlTree(
    readFileSync(
      new URL("../../.github/workflows/nightly.yml", import.meta.url),
      "utf8",
    ),
  );
  const { coverage, "coverage-floors": issue } = nightly.jobs;

  it("measures on main with the workflow's read-only token", () => {
    expect(nightly.permissions).toEqual({ contents: "read" });
    expect(coverage.permissions).toBeUndefined();
    const runs = coverage.steps.map((s) => s.run).filter(Boolean);
    expect(runs).toContain("pnpm test:coverage");
    expect(runs).toContain(
      "pnpm coverage:ratchet --raise --out coverage-floors.md",
    );
  });

  it("gives issues: write to the issue job alone, which checks nothing out", () => {
    expect(issue.permissions).toEqual({ issues: "write" });
    expect(issue.needs).toBe("coverage");
    expect(issue.steps.some((s) => String(s.uses).includes("checkout"))).toBe(
      false,
    );
    const writers = Object.entries(nightly.jobs)
      .filter(([, j]) => j.permissions && j.permissions.issues === "write")
      .map(([id]) => id);
    expect(writers.sort()).toEqual(["coverage-floors", "report"]);
    for (const job of Object.values(nightly.jobs))
      for (const [scope, level] of Object.entries(job.permissions ?? {}))
        if (scope !== "issues") expect(level).toBe("read");
  });

  it("finds the one issue by its label and closes it when nothing is left", () => {
    const run = issue.steps.map((s) => s.run ?? "").join("\n");
    expect(run).toContain("label=coverage-floors");
    expect(run).toContain('gh issue list --label "$label" --state open');
    expect(run).toContain("gh issue edit");
    expect(run).toContain("gh issue close");
  });

  it("tells nothing to raise by the script's sentinel line, not by file size", () => {
    const run = issue.steps.map((s) => s.run ?? "").join("\n");
    expect(run).toContain(
      `if [[ "$(head -n 1 coverage-floors.md)" == "${NONE}" ]]; then`,
    );
    expect(run).not.toContain("-s coverage-floors.md");
  });

  it("updates the issue on main only", () => {
    expect(issue.if).toBe("github.ref == 'refs/heads/main'");
  });

  // The list comes from a file the coverage job wrote: it reaches gh as a file, never
  // as a shell or expression interpolation.
  it("passes the issue body with --body-file only", () => {
    const run = issue.steps.map((s) => s.run ?? "").join("\n");
    const writes = run
      .split("\n")
      .filter((l) => /gh issue (create|edit)\b/.test(l));
    expect(writes).toHaveLength(2);
    for (const l of writes) expect(l).toMatch(/--body-file body\.md$/);
    expect(run).not.toMatch(/--body[ =]/);
    expect(run).not.toContain("$(cat");
    expect(run).not.toContain("${{");
  });

  it("reports a failed coverage job like the other nightly jobs", () => {
    expect(nightly.jobs.report.needs).toEqual(
      expect.arrayContaining(["coverage", "coverage-floors"]),
    );
  });
});
