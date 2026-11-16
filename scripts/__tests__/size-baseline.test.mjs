// `pnpm lint:size` (#456) on synthetic sources linted in memory with the repo's ESLint config.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as prettier from "prettier";
import { describe, expect, it } from "vitest";
import {
  baseDiff,
  compare,
  createLinter,
  measure,
  serialize,
  suppressionProblems,
  suppressionsFor,
  tighten,
} from "../check-size-baseline.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const linter = createLinter(ROOT);

/** A body of exactly `lines` lines with its braces (ESLint's count: no blanks/comments). */
const body = (lines) =>
  [
    "{",
    ...Array.from({ length: lines - 3 }, (_, i) => `  const v${i} = ${i};`),
    "  return null;",
    "}",
  ].join("\n");
const fn = (name, lines) => `export function ${name}() ${body(lines)}`;
const arrow = (lines) => `() => ${body(lines)}`;
/** A component calling useEffect once per given length. */
const effects = (...lines) =>
  `export function Page() {\n${lines
    .map((n) => `  useEffect(${arrow(n)});`)
    .join("\n")}\n  return null;\n}`;

const sizes = async (code, filePath) =>
  measure(await linter.lintText(code, { filePath }), ROOT);
const EFFECT = "Arrow function (Page > useEffect)";
/** Only the useEffect callbacks' bag (`Page` itself is over the limit too). */
const effectSizes = async (...lines) => {
  const measured = await sizes(effects(...lines), MODEL);
  return { [MODEL]: { lines: { [EFFECT]: measured[MODEL].lines[EFFECT] } } };
};

const COMPONENT = "src/ui/components/Fake.tsx";
const MODEL = "src/ui/model/fake.ts";
const big = (lines) => ({
  [COMPONENT]: { lines: { "Function 'Big'": lines } },
});

describe("function size baseline", () => {
  it("fails a new 200-line component", async () => {
    const measured = await sizes(fn("Big", 200), COMPONENT);
    expect(measured).toEqual(big(200));
    expect(compare(measured, {})).toEqual([
      {
        file: COMPONENT,
        metric: "lines",
        fn: "Function 'Big'",
        values: [200],
        kind: "new",
      },
    ]);
  });

  it("passes a component baselined at its size", async () => {
    const measured = await sizes(fn("Big", 200), COMPONENT);
    expect(compare(measured, big(200))).toEqual([]);
  });

  it("fails a baselined component that grew", async () => {
    const measured = await sizes(fn("Big", 205), COMPONENT);
    expect(compare(measured, big(200))).toMatchObject([
      { kind: "grew", base: [200], values: [205] },
    ]);
  });

  it("fails a component that shrank until the baseline is tightened", async () => {
    const measured = await sizes(fn("Big", 190), COMPONENT);
    expect(compare(measured, big(200))).toMatchObject([
      { kind: "shrunk", base: [200], values: [190] },
    ]);
    expect(tighten(big(200), measured)).toEqual(big(190));
    expect(compare(measured, tighten(big(200), measured))).toEqual([]);
  });

  it("drops a function that is now under the limit, and never adds one", async () => {
    const measured = await sizes(fn("Big", 120), COMPONENT);
    expect(measured).toEqual({});
    expect(compare(measured, big(200))).toMatchObject([{ kind: "gone" }]);
    expect(tighten(big(200), measured)).toEqual({});
    expect(tighten({}, big(300))).toEqual({});
  });

  it("limits other code to 80 lines and the engine to 60", async () => {
    expect(await sizes(fn("Mid", 100), MODEL)).toEqual({
      [MODEL]: { lines: { "Function 'Mid'": 100 } },
    });
    expect(await sizes(fn("Mid", 70), MODEL)).toEqual({});
    expect(await sizes(fn("Eng", 70), "src/engine/fake.ts")).toEqual({
      "src/engine/fake.ts": { lines: { "Function 'Eng'": 70 } },
    });
    // Tests are out of scope.
    expect(
      await sizes(fn("T", 300), "src/ui/model/__tests__/fake.test.ts"),
    ).toEqual({});
  });

  it("keys an unnamed function by enclosing function and binding, under both rules", async () => {
    const branches = Array.from(
      { length: 13 },
      (_, i) => `  if (x === ${i}) return ${i};`,
    ).join("\n");
    const code = [
      `export const useStore = create<S>()((set) => ${body(90)});`,
      `export const pick = (x: number) => {\n${branches}\n${body(85).slice(1)};`,
      // ESLint names a property's function itself.
      `export const obj = { run: ${arrow(81)} };`,
      `handlers.onDrop = ${arrow(83)};`,
      `export function Form() {\n  const [first] = useState(${arrow(82)});\n  return first;\n}`,
    ].join("\n");
    expect(await sizes(code, MODEL)).toEqual({
      [MODEL]: {
        complexity: { "Arrow function (pick)": 14 },
        lines: {
          "Arrow function (useStore: create)": 90,
          "Arrow function (pick)": 98,
          "Method 'run'": 81,
          "Arrow function (handlers.onDrop)": 83,
          "Arrow function (Form > [first]: useState)": 82,
          "Function 'Form'": 85,
        },
      },
    });
  });

  it("never collapses two functions that share a key", async () => {
    const methods = (a, b) =>
      `export const x = {\n  render() ${body(a)},\n};\nexport const y = {\n  render() ${body(b)},\n};`;
    const baseline = await sizes(methods(100, 90), MODEL);
    expect(baseline).toEqual({
      [MODEL]: { lines: { "Method 'render'": [100, 90] } },
    });
    // The first grows: caught although the second is smaller.
    expect(
      compare(await sizes(methods(105, 90), MODEL), baseline),
    ).toMatchObject([{ kind: "grew", base: [100, 90], values: [105, 90] }]);
    // The second grows past the first: caught as well.
    expect(
      compare(await sizes(methods(100, 101), MODEL), baseline),
    ).toMatchObject([{ kind: "grew" }]);
    expect(compare(await sizes(methods(100, 90), MODEL), baseline)).toEqual([]);
  });

  it("recovers with --update when the first of a repeated binding is fixed", async () => {
    const baseline = await effectSizes(90, 95);
    expect(baseline).toEqual({ [MODEL]: { lines: { [EFFECT]: [95, 90] } } });
    const fixed = await effectSizes(20, 95);
    expect(compare(fixed, baseline)).toMatchObject([{ kind: "shrunk" }]);
    const updated = tighten(baseline, fixed);
    expect(updated).toEqual({ [MODEL]: { lines: { [EFFECT]: 95 } } });
    expect(compare(fixed, updated)).toEqual([]);
  });

  it("fails a new offender with a repeated binding, added above or below", async () => {
    const baseline = await effectSizes(90, 95);
    for (const lines of [
      [85, 90, 95],
      [90, 95, 85],
    ]) {
      expect(compare(await effectSizes(...lines), baseline)).toMatchObject([
        { kind: "more", values: [95, 90, 85] },
      ]);
    }
    // Inside one bag a new function can take a freed place, but no more entries and
    // no higher values than the baseline (CONTRIBUTING.md "Function size and complexity").
    expect(compare(await effectSizes(20, 90, 95), baseline)).toEqual([]);
    expect(tighten(baseline, await effectSizes(99, 98, 97))).toEqual(baseline);
  });

  it("does not let a new offender take the key an update freed", async () => {
    const before = await sizes(
      `export const useUi = create(() => ${body(138)});`,
      MODEL,
    );
    // The store callback shrinks under the limit, a new 128-line arrow appears.
    const after = await sizes(
      `export const useUi = create(() => ${body(60)});\nconst h = ${arrow(128)};\nvoid h;`,
      MODEL,
    );
    const updated = tighten(before, after);
    expect(updated).toEqual({});
    expect(compare(after, updated)).toMatchObject([
      { fn: "Arrow function (h)", values: [128], kind: "new" },
    ]);
  });

  it("finds functions with computed keys", async () => {
    const code = [
      `export const a = { [k]() ${body(90)} };`,
      `export class B { [Symbol.iterator]() ${body(91)} }`,
      `export const c = { [k]: ${arrow(92)} };`,
    ].join("\n");
    const measured = await sizes(code, MODEL);
    expect(Object.values(measured[MODEL].lines).flat().sort()).toEqual([
      90, 91, 92,
    ]);
  });

  it("counts ESLint's line terminators, U+2028 included", async () => {
    const ls = String.fromCharCode(0x2028);
    const code = `// a${ls}b\nexport const useUi = create(() => ${body(90)});`;
    expect(await sizes(code, MODEL)).toEqual({
      [MODEL]: { lines: { "Arrow function (useUi: create)": 90 } },
    });
  });

  it("throws on a size message it cannot read instead of skipping it", () => {
    const result = {
      filePath: `${ROOT}/${MODEL}`,
      source: "",
      messages: [{ ruleId: "complexity", message: "Odd.", line: 1, column: 1 }],
    };
    expect(() => measure([result], ROOT)).toThrow(/unexpected complexity/);
  });

  it("fails the base check on an added entry or a raised number only", () => {
    const base = {
      "a.ts": { lines: { f: 100, g: 90, b: [80, 70] }, complexity: { f: 20 } },
    };
    const current = {
      "a.ts": {
        lines: { f: 100, g: 95, b: [80, 70, 60] },
        complexity: { f: 18, h: 13 },
      },
    };
    expect(baseDiff(current, base)).toMatchObject([
      { fn: "g", kind: "raised", base: [90], values: [95] },
      { fn: "b", kind: "added", base: [80, 70], values: [80, 70, 60] },
      { fn: "h", kind: "added" },
    ]);
    expect(baseDiff(tighten(base, current), base)).toEqual([]);
  });

  it("accepts a file move only from a deleted file to a file new on the base", () => {
    const base = { "a.ts": { lines: { f: 100 } } };
    const moved = { "b.ts": { lines: { f: 100 } } };
    const files = (now, atBase) => ({
      existsNow: (f) => now.includes(f),
      existedAtBase: (f) => atBase.includes(f),
    });
    expect(baseDiff(moved, base, files(["b.ts"], ["a.ts"]))).toEqual([]);
    // The old file is still there, or the new one already existed on the base.
    expect(
      baseDiff(moved, base, files(["a.ts", "b.ts"], ["a.ts"])),
    ).toMatchObject([{ kind: "added" }]);
    expect(
      baseDiff(moved, base, files(["b.ts"], ["a.ts", "b.ts"])),
    ).toMatchObject([{ kind: "added" }]);
    // Not raised on the way, and matched once.
    expect(
      baseDiff(
        { "b.ts": { lines: { f: 101 } } },
        base,
        files(["b.ts"], ["a.ts"]),
      ),
    ).toMatchObject([{ kind: "added" }]);
    expect(
      baseDiff(
        { "b.ts": { lines: { f: 100 } }, "c.ts": { lines: { f: 100 } } },
        base,
        files(["b.ts", "c.ts"], ["a.ts"]),
      ),
    ).toMatchObject([{ file: "c.ts", kind: "added" }]);
  });

  it("derives one suppression per baselined function for the size rules only", () => {
    const baseline = {
      "a.ts": { lines: { f: 100, g: [90, 85] }, complexity: { f: 20 } },
    };
    const derived = {
      "a.ts": {
        complexity: { count: 1 },
        "max-lines-per-function": { count: 3 },
      },
    };
    expect(suppressionsFor(baseline)).toEqual(derived);
    expect(suppressionProblems(derived, baseline)).toEqual([]);
    // Another rule's entry fails, as does a count above what the baseline implies.
    expect(
      suppressionProblems(
        {
          ...derived,
          "src/engine/x.ts": { "no-restricted-syntax": { count: 1 } },
        },
        baseline,
      ),
    ).toEqual([
      {
        file: "src/engine/x.ts",
        rule: "no-restricted-syntax",
        actual: 1,
        expected: 0,
      },
    ]);
    expect(
      suppressionProblems(
        { "a.ts": { ...derived["a.ts"], complexity: { count: 2 } } },
        baseline,
      ),
    ).toEqual([{ file: "a.ts", rule: "complexity", actual: 2, expected: 1 }]);
  });

  it("writes a baseline with a bag that passes prettier --check", async () => {
    const baseline = tighten(
      { [MODEL]: { lines: { [EFFECT]: [99, 98, 97] }, complexity: { f: 20 } } },
      { [MODEL]: { lines: { [EFFECT]: [95, 90] }, complexity: { f: 18 } } },
    );
    for (const [name, value] of [
      ["function-size-baseline.json", baseline],
      ["eslint-suppressions.json", suppressionsFor(baseline)],
    ]) {
      const file = join(ROOT, name);
      const text = await serialize(value, file);
      const options = (await prettier.resolveConfig(file)) ?? {};
      expect(await prettier.check(text, { ...options, filepath: file })).toBe(
        true,
      );
      expect(JSON.parse(text)).toEqual(value);
    }
    expect(
      await serialize(baseline, join(ROOT, "function-size-baseline.json")),
    ).toContain("[95, 90]");
  });

  it("keeps eslint-suppressions.json exactly what the baseline implies", () => {
    const read = (f) =>
      JSON.parse(readFileSync(new URL(`../../${f}`, import.meta.url), "utf8"));
    expect(read("eslint-suppressions.json")).toEqual(
      suppressionsFor(read("function-size-baseline.json")),
    );
  });
});
