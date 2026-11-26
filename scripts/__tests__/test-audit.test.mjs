// `scripts/test-audit.mjs` (#458) on synthetic Vitest JSON reports.
import { describe, expect, it } from "vitest";
import {
  audit,
  retryCounted,
  rows,
  staleMoves,
  summary,
  toRerun,
} from "../test-audit.mjs";

const test = (title, assertionCalls, status = "passed", ancestors = ["s"]) => ({
  ancestorTitles: ancestors,
  title,
  status,
  meta: assertionCalls === undefined ? {} : { assertionCalls },
});
const report = (root, files) => ({
  testResults: Object.entries(files).map(([file, tests]) => ({
    name: `${root}/${file}`,
    assertionResults: tests,
  })),
});
const base = report("/base", {
  "src/a.test.ts": [test("one", 2), test("two", 1)],
  "scripts/b.test.mjs": [test("three", 4, "passed", [])],
});

describe("test audit", () => {
  it("keys each test by its file in the checkout and its full name", () => {
    expect(rows(base).map((r) => r.key)).toEqual([
      "src/a.test.ts › s › one",
      "src/a.test.ts › s › two",
      "scripts/b.test.mjs › three",
    ]);
  });

  it("passes the same tests with the same counts from another checkout", () => {
    const head = report("/elsewhere/head", {
      "scripts/b.test.mjs": [test("three", 4, "passed", [])],
      "src/a.test.ts": [test("two", 1), test("one", 2)],
    });
    const result = audit(base, head);
    expect(result.ok).toBe(true);
    expect(summary(result)).toContain("audit: OK");
  });

  it("fails a missing test, a changed count, a failure and a missing count", () => {
    const head = report("/head", {
      "src/a.test.ts": [test("one", 1), test("two", 1, "failed")],
      "scripts/b.test.mjs": [test("other", undefined, "passed", [])],
    });
    const result = audit(base, head);
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(["scripts/b.test.mjs › three"]);
    expect(result.assertionDiffs).toEqual([
      { key: "src/a.test.ts › s › one", base: 2, head: 1, rerun: false },
    ]);
    expect(result.notPassing).toEqual(["src/a.test.ts › s › two"]);
    expect(result.unaudited).toEqual(["scripts/b.test.mjs › other"]);
    expect(result.added).toEqual(["scripts/b.test.mjs › other"]);
    expect(summary(result)).toContain("audit: FAILED");
  });

  describe("suites merged or renamed (#497)", () => {
    const merged = report("/head", {
      "src/merged.test.ts": [
        test("one", 2, "passed", ["first behaviour"]),
        test("two", 1, "passed", ["second behaviour"]),
      ],
      "scripts/b.test.mjs": [test("three", 4, "passed", [])],
    });
    const moves = new Map([
      ["src/a.test.ts › s › one", "src/merged.test.ts › first behaviour › one"],
      [
        "src/a.test.ts › s › two",
        "src/merged.test.ts › second behaviour › two",
      ],
    ]);

    it("compares a moved test under its head key", () => {
      expect(audit(base, merged).ok).toBe(false);
      const result = audit(base, merged, { moves });
      expect(result.ok).toBe(true);
      expect(result.moved).toBe(2);
      expect(summary(result)).toContain("moved by the map: 2");
    });

    it("still fails a moved test that lost an assertion", () => {
      const weaker = report("/head", {
        "src/merged.test.ts": [
          test("one", 1, "passed", ["first behaviour"]),
          test("two", 1, "passed", ["second behaviour"]),
        ],
        "scripts/b.test.mjs": [test("three", 4, "passed", [])],
      });
      const result = audit(base, weaker, { moves });
      expect(result.ok).toBe(false);
      expect(result.assertionDiffs).toEqual([
        {
          key: "src/merged.test.ts › first behaviour › one",
          base: 2,
          head: 1,
          rerun: false,
        },
      ]);
    });

    it("fails a map entry that names no base test", () => {
      const stale = new Map([...moves, ["src/a.test.ts › s › gone", "x"]]);
      expect(staleMoves(base, stale)).toEqual(["src/a.test.ts › s › gone"]);
      const result = audit(base, merged, { moves: stale });
      expect(result.ok).toBe(false);
      expect(summary(result)).toContain("  src/a.test.ts › s › gone");
    });

    it("re-runs a moved test from its base file under its base name", () => {
      const retry = new Set(["src/merged.test.ts › first behaviour › one"]);
      expect(toRerun(base, merged, retry, moves)).toEqual([
        {
          key: "src/merged.test.ts › first behaviour › one",
          file: "src/a.test.ts",
          fullName: "s one",
        },
      ]);
    });
  });

  it("lists a test in a new file but fails one added to an existing file", () => {
    const head = report("/head", {
      "src/a.test.ts": [test("one", 2), test("two", 1), test("two", 1)],
      "scripts/b.test.mjs": [test("three", 4, "passed", [])],
      "scripts/new.test.mjs": [test("fresh", 1, "passed", [])],
    });
    const result = audit(base, head);
    expect(result.addedInNewFiles).toEqual(["scripts/new.test.mjs › fresh"]);
    expect(result.added).toEqual(["src/a.test.ts › s › two"]);
    expect(result.ok).toBe(false);
  });

  describe("a count that moved with timing", () => {
    const head = report("/head", {
      "src/a.test.ts": [test("one", 3), test("two", 1)],
      "scripts/b.test.mjs": [test("three", 4, "passed", [])],
    });
    const key = "src/a.test.ts › s › one";
    const retry = new Set([key]);

    it("re-runs every retry-counted test, with the name -t matches", () => {
      expect(toRerun(base, base, retry)).toEqual([
        { key, file: "src/a.test.ts", fullName: "s one" },
      ]);
      expect(toRerun(base, head, new Set())).toEqual([]);
    });

    it("passes a retry-counted test when both sides reach the same lowest count", () => {
      const reruns = new Map([[key, { base: [3, 2], head: [2, 3, 2] }]]);
      const result = audit(base, head, { reruns, retry });
      expect(result.ok).toBe(true);
      expect(result.rerunChecked).toBe(1);
      expect(result.settledByRerun).toEqual([
        { key, base: 2, head: 3, lowest: 2 },
      ]);
      expect(summary(result)).toContain("settled by rerun:");
    });

    it("still fails when the lowest counts differ", () => {
      const reruns = new Map([[key, { base: [2], head: [3, 3, 3] }]]);
      const result = audit(base, head, { reruns, retry });
      expect(result.ok).toBe(false);
      expect(result.assertionDiffs).toEqual([
        { key, base: 2, head: 3, rerun: true },
      ]);
    });

    it("fails without reruns", () => {
      expect(audit(base, head, { retry }).assertionDiffs).toEqual([
        { key, base: 2, head: 3, rerun: false },
      ]);
    });

    it("fails a lower head count at once for a test that does not call waitFor", () => {
      const lower = report("/head", {
        "src/a.test.ts": [test("one", 1), test("two", 1)],
        "scripts/b.test.mjs": [test("three", 4, "passed", [])],
      });
      // Reruns that would reach the same lowest count are ignored: not retry-counted.
      const reruns = new Map([[key, { base: [1], head: [1] }]]);
      const result = audit(base, lower, { reruns });
      expect(result.ok).toBe(false);
      expect(result.rerunChecked).toBe(0);
      expect(result.assertionDiffs).toEqual([
        { key, base: 2, head: 1, rerun: false },
      ]);
    });

    it("fails a retry-counted test whose full-run count matches but whose lowest drops", () => {
      // An extra retry on the head hides a removed assertion in the full run.
      const reruns = new Map([[key, { base: [2, 2, 2], head: [1, 1, 2] }]]);
      const result = audit(base, base, { reruns, retry });
      expect(result.ok).toBe(false);
      expect(result.assertionDiffs).toEqual([
        { key, base: 2, head: 1, rerun: true },
      ]);
    });
  });

  it("marks the tests that call waitFor, or all of a file whose helper does", () => {
    const list = [
      { file: "a.tsx", key: "a1", line: 3 },
      { file: "a.tsx", key: "a2", line: 6 },
      { file: "b.tsx", key: "b1", line: 4 },
      { file: "b.tsx", key: "b2", line: 7 },
      { file: "c.tsx", key: "c1", line: 1 },
    ];
    const sources = {
      "a.tsx":
        "x\ny\nit('a1', () => {\n  f();\n});\nit('a2', async () => {\n  await waitFor(() => g());\n});",
      "b.tsx":
        "const wait = () =>\n  waitFor(() => h());\n\nit('b1', () => {\n  wait();\n});\nit('b2', () => {});",
      "c.tsx": "it('c1', () => {});",
    };
    const marked = retryCounted(list, (file) => sources[file]);
    expect([...marked].sort()).toEqual(["a2", "b1", "b2"]);
    expect(
      audit(base, base, { retry: new Set(["src/a.test.ts › s › one"]) })
        .retryCounted,
    ).toBe(1);
  });
});
