// The sharded nightly Stryker run (ADR 0239, #443): shard ranges, the merge and the score
// gate, on synthetic reports, plus the shard table against the real src/engine.
import { globSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ENGINE_GLOB,
  SHARDS,
  assignedFiles,
  mergeReports,
  mergeSummary,
  mutateFor,
  passes,
  score,
  shardSummary,
  splitRanges,
} from "../mutation-shards.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

let nextId = 0;
/** A synthetic mutant on `line` with `status`. */
const mutant = (line, status, extra = {}) => ({
  id: String(nextId++),
  mutatorName: "ConditionalExpression",
  replacement: "true",
  status,
  location: { start: { line, column: 1 }, end: { line, column: 9 } },
  ...extra,
});
/** A synthetic report: `{ file: [mutant, …] }`. */
const report = (files) => ({
  schemaVersion: "1.0",
  thresholds: { high: 90, low: 75 },
  files: Object.fromEntries(
    Object.entries(files).map(([f, mutants]) => [
      f,
      { language: "typescript", source: "", mutants },
    ]),
  ),
});
/** `n` mutants with `status`, from `line` on. */
const many = (n, status, line = 1) =>
  Array.from({ length: n }, (_, i) => mutant(line + i, status));

const SMALL = {
  "a-1": [{ file: "s.ts", anchor: "b", part: "a" }],
  "a-2": [{ file: "s.ts", anchor: "b", part: "b" }],
  rest: "rest",
};

describe("score", () => {
  it("counts Killed and Timeout as detected, over detected + Survived + NoCoverage", () => {
    const s = score(
      report({
        "x.ts": [
          ...many(5, "Killed"),
          ...many(2, "Timeout", 10),
          mutant(20, "Survived", { static: true }),
          mutant(21, "NoCoverage"),
          mutant(22, "CompileError"),
          mutant(23, "RuntimeError"),
          mutant(24, "Ignored"),
        ],
      }),
    );
    expect(s).toMatchObject({
      mutants: 12,
      detected: 7,
      valid: 9,
      static: 1,
      survived: 1,
      noCoverage: 1,
    });
    expect(s.score).toBeCloseTo((100 * 7) / 9, 10);
  });

  it("compares the unrounded score with break: 98 passes, 97.999 fails", () => {
    const at98 = score(
      report({ "x.ts": [...many(49, "Killed"), mutant(99, "Survived")] }),
    );
    expect(at98.score).toBe(98);
    expect(passes(at98.score, 98)).toBe(true);
    expect(passes(97.999, 98)).toBe(false);
    // 97.995 would round to 98.00 for display but is still below break.
    expect(passes(97.995, 98)).toBe(false);
    expect(passes(0, null)).toBe(true);
  });

  it("throws when no mutant is valid", () => {
    expect(() =>
      score(report({ "x.ts": [mutant(1, "CompileError")] })),
    ).toThrow(/no valid mutants/);
    expect(() => score(report({}))).toThrow(/no valid mutants/);
  });
});

describe("splitRanges and mutateFor", () => {
  const source = [
    "// header",
    "export function a() {}",
    "",
    "function b() {",
    "  return 1;",
    "}",
    "",
  ].join("\n");

  it("splits before the top-level anchor, to the end of the file", () => {
    expect(splitRanges(source, "b", "s.ts")).toEqual({
      a: "s.ts:1-3",
      b: "s.ts:4-7",
    });
    expect(splitRanges(source, "a", "s.ts")).toEqual({
      a: "s.ts:1-1",
      b: "s.ts:2-7",
    });
  });

  it("throws on a missing, nested, prefixed or repeated anchor", () => {
    expect(() => splitRanges(source, "c", "s.ts")).toThrow(
      's.ts: no top-level "function c" to split at',
    );
    // `bb` is not `b`, and an indented function is not top-level.
    expect(() =>
      splitRanges("x\nfunction bb() {}\n  function b() {}\n", "b"),
    ).toThrow(/no top-level/);
    expect(() =>
      splitRanges("x\nfunction b() {}\nexport function b() {}\n", "b", "s.ts"),
    ).toThrow('s.ts: "function b" appears 2 times (lines 2, 3)');
    expect(() => splitRanges("function b() {}\n", "b")).toThrow(
      /part a is empty/,
    );
  });

  it("throws on an unknown shard", () => {
    expect(() => mutateFor("nope")).toThrow(/unknown shard "nope"/);
  });

  it("gives rest the engine glob minus the tests and every assigned file", () => {
    const rest = mutateFor("rest");
    expect(rest.slice(0, 2)).toEqual([
      ENGINE_GLOB,
      "!src/engine/**/__tests__/**",
    ]);
    for (const f of assignedFiles()) expect(rest).toContain(`!${f}`);
    expect(assignedFiles()).toEqual([
      "src/engine/dates.ts",
      "src/engine/financing.ts",
      "src/engine/kpis.ts",
      "src/engine/metrics.ts",
      "src/engine/projections.ts",
      "src/engine/schedule.ts",
      "src/engine/validate.ts",
    ]);
  });
});

describe("the shard table against the real src/engine", () => {
  const engine = globSync(ENGINE_GLOB, {
    cwd: ROOT,
    exclude: ["**/__tests__/**"],
  });

  it("names only engine files that exist", () => {
    for (const f of assignedFiles()) expect(engine).toContain(f);
  });

  it("finds every split anchor exactly once", () => {
    for (const shard of Object.keys(SHARDS))
      expect(() => mutateFor(shard, ROOT)).not.toThrow();
  });

  it("covers every line of a split file once, parts a and b adjacent", () => {
    const split = Object.values(SHARDS)
      .filter(Array.isArray)
      .flat()
      .filter((e) => typeof e !== "string");
    for (const { file, anchor } of split) {
      const lines = readFileSync(`${ROOT}${file}`, "utf8").split("\n").length;
      const { a, b } = splitRanges(
        readFileSync(`${ROOT}${file}`, "utf8"),
        anchor,
        file,
      );
      const [, a1, a2] = a.match(/:(\d+)-(\d+)$/).map(Number);
      const [, b1, b2] = b.match(/:(\d+)-(\d+)$/).map(Number);
      expect([a1, b1 - a2, b2]).toEqual([1, 1, lines]);
    }
  });

  it("leaves rest at least one engine file", () => {
    expect(engine.length).toBeGreaterThan(assignedFiles().length);
  });
});

describe("mergeReports", () => {
  const full = () => ({
    "a-1": report({ "s.ts": many(3, "Killed", 1) }),
    "a-2": report({
      "s.ts": [...many(2, "Killed", 10), mutant(12, "Survived")],
    }),
    rest: report({ "t.ts": many(4, "Timeout", 1) }),
  });

  it("merges the shards' files, split parts into one file, ids kept unique", () => {
    const { report: merged, errors } = mergeReports(full(), SMALL);
    expect(errors).toEqual([]);
    expect(Object.keys(merged.files).sort()).toEqual(["s.ts", "t.ts"]);
    expect(merged.files["s.ts"].mutants).toHaveLength(6);
    const ids = Object.values(merged.files).flatMap((f) =>
      f.mutants.map((m) => m.id),
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(score(merged)).toMatchObject({ detected: 9, valid: 10 });
  });

  it("fails on a missing shard", () => {
    const r = full();
    delete r.rest;
    expect(mergeReports(r, SMALL).errors).toEqual(['shard "rest": no report']);
  });

  it("fails on a mutant found by two shards", () => {
    const r = full();
    r.rest.files["s.ts"] = { mutants: [mutant(1, "Killed")] };
    expect(mergeReports(r, SMALL).errors).toEqual([
      's.ts@1:1-1:9 ConditionalExpression true: in shards "a-1" and "rest" (overlapping mutate ranges)',
    ]);
  });

  it("fails on a split file with a part missing", () => {
    const r = full();
    r["a-2"] = report({});
    expect(mergeReports(r, SMALL).errors).toEqual([
      's.ts: shard "a-2" holds a part but reports no mutants',
    ]);
  });

  // Stryker numbers tests per run: id "0" in one shard is not id "0" in another.
  it("keeps the same raw test id in two shards as two tests, references following", () => {
    const r = {
      "a-1": report({
        "s.ts": [
          mutant(1, "Killed", { coveredBy: ["0", "1"], killedBy: ["0"] }),
        ],
      }),
      "a-2": report({
        "s.ts": [mutant(10, "Killed", { coveredBy: ["0"], killedBy: ["0"] })],
      }),
      rest: report({ "t.ts": [mutant(1, "Survived")] }),
    };
    r["a-1"].testFiles = {
      "x.test.ts": {
        tests: [
          { id: "0", name: "first" },
          { id: "1", name: "second" },
        ],
      },
    };
    r["a-2"].testFiles = {
      "x.test.ts": { tests: [{ id: "0", name: "third" }] },
    };
    const { report: merged, errors } = mergeReports(r, SMALL);
    expect(errors).toEqual([]);
    const tests = merged.testFiles["x.test.ts"].tests;
    expect(tests).toEqual([
      { id: "a-1-0", name: "first" },
      { id: "a-1-1", name: "second" },
      { id: "a-2-0", name: "third" },
    ]);
    const byId = new Map(tests.map((t) => [t.id, t.name]));
    const [m1, m2] = merged.files["s.ts"].mutants;
    expect(m1.coveredBy.map((t) => byId.get(t))).toEqual(["first", "second"]);
    expect(m1.killedBy.map((t) => byId.get(t))).toEqual(["first"]);
    expect(m2.coveredBy.map((t) => byId.get(t))).toEqual(["third"]);
    expect(m2.killedBy.map((t) => byId.get(t))).toEqual(["third"]);
  });
});

describe("summaries", () => {
  it("passes the combined score at break and lists shards, files and survivors", () => {
    const reports = {
      "a-1": report({ "s.ts": many(49, "Killed") }),
      "a-2": report({ "s.ts": [mutant(100, "Survived", { static: true })] }),
      rest: report({ "t.ts": many(50, "Killed") }),
    };
    const { report: merged, errors } = mergeReports(reports, SMALL);
    const { markdown, ok } = mergeSummary(reports, merged, 99, errors, SMALL);
    expect(ok).toBe(true);
    expect(markdown).toContain(
      "**99.00 %** (99 of 100 valid mutants detected; break 99 %): pass. 1 of 100 mutants static.",
    );
    expect(markdown).toContain("| a-2 | 1 | 0 | 1 | 0 | 0.00 % |");
    expect(markdown).toContain("| `s.ts` | 50 | 49 | 1 | 0 | 98.00 % |");
    expect(markdown).toContain(
      "- `s.ts:100:1` Survived ConditionalExpression → `true`",
    );
  });

  it("fails below break, and on a merge error even above it", () => {
    const reports = {
      "a-1": report({ "s.ts": many(9, "Killed") }),
      "a-2": report({ "s.ts": [mutant(100, "Survived")] }),
      rest: report({ "t.ts": many(1, "Killed", 1) }),
    };
    const { report: merged } = mergeReports(reports, SMALL);
    expect(mergeSummary(reports, merged, 98, [], SMALL).ok).toBe(false);
    expect(mergeSummary(reports, merged, 50, [], SMALL).ok).toBe(true);
    const broken = mergeSummary(reports, merged, 50, ["x"], SMALL);
    expect(broken.ok).toBe(false);
    expect(broken.markdown).toContain("FAIL");
  });

  it("fails with a missing shard row and no combined score when nothing is valid", () => {
    const { report: merged, errors } = mergeReports({}, SMALL);
    const { markdown, ok } = mergeSummary({}, merged, 98, errors, SMALL);
    expect(ok).toBe(false);
    expect(markdown).toContain("| rest | missing | | | | |");
    expect(markdown).toContain(
      "- combined: no valid mutants: nothing was tested",
    );
  });

  it("caps the survivors at 50", () => {
    const r = report({ "s.ts": many(60, "Survived") });
    const md = shardSummary("rest", r);
    expect(md).toContain("### Mutation score (rest)");
    expect(md).toContain("- … and 10 more");
    expect(md.match(/^- `s\.ts:/gm)).toHaveLength(50);
  });
});
