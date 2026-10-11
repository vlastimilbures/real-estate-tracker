// `pnpm coverage:ratchet` (#141) on a synthetic coverage summary.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { measure, ratchet } from "../check-coverage-ratchet.mjs";

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

  it("passes a floor up to 3 points below measured and fails beyond", () => {
    const rows = ratchet(
      summary,
      { "src/engine/**": { lines: 47, branches: 76.9 } },
      ROOT,
    );
    expect(rows.map((r) => [r.metric, r.ok])).toEqual([
      ["lines", true],
      ["branches", false],
    ]);
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
