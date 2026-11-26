// The test bans (CLAUDE.md §6) in eslint.config.js: flat config replaces a rule's options
// per key, so a block that sets `no-restricted-syntax` without them would let `.only`
// through for its files. Checked on the config objects, then by linting one file per block.
import { ESLint } from "eslint";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import config from "../../eslint.config.js";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const RULE = "no-restricted-syntax";
const eslint = new ESLint({ cwd: ROOT });

/** The test bans alone: the options of a file only the all-TypeScript block reaches. */
async function testBans() {
  const { rules } = await eslint.calculateConfigForFile("e2e/x.spec.ts");
  return rules[RULE].slice(1);
}

/** Indexes of the config objects whose `no-restricted-syntax` does not start with `bans`. */
function missingTestBans(configs, bans) {
  return configs.flatMap((c, i) => {
    const options = c.rules?.[RULE];
    if (!options) return [];
    const head = JSON.stringify(options.slice(1, 1 + bans.length));
    return head === JSON.stringify(bans) ? [] : [i];
  });
}

describe("test bans in eslint.config.js", () => {
  it("are the three .only/.skip/.todo and focused-test selectors", async () => {
    const bans = await testBans();
    expect(bans).toHaveLength(3);
    expect(bans.map((b) => b.selector).join("\n")).toMatch(/only\|skip/);
    expect(bans[2].selector).toContain("xit");
  });

  it("start every block that sets no-restricted-syntax", async () => {
    const bans = await testBans();
    const blocks = config.filter((c) => c.rules?.[RULE]);
    expect(blocks.length).toBeGreaterThanOrEqual(8);
    expect(missingTestBans(config, bans)).toEqual([]);
  });

  it("are reported missing from a block that leaves them out", async () => {
    const bans = await testBans();
    const synthetic = [
      ...config,
      { files: ["src/x/**"], rules: { [RULE]: ["error", { selector: "X" }] } },
    ];
    expect(missingTestBans(synthetic, bans)).toEqual([config.length]);
  });

  // One file per block that sets the rule (and the files only the first block reaches).
  const FILES = [
    "src/engine/x.ts",
    "src/engine/brands.ts",
    "src/engine/dates.ts",
    "src/engine/__tests__/x.test.ts",
    "src/lib/__tests__/x.test.ts",
    "src/ui/__tests__/x.test.tsx",
    "src/state/__tests__/x.test.ts",
    "src/__tests__/setup/x.ts",
    "src/ui/x.tsx",
    "src/data/x.ts",
    "e2e/x.spec.ts",
    "ux-capture/x.ts",
    "scripts/__tests__/x.test.mjs",
    "scripts/x.cjs",
    "x.config.js",
  ];
  const FOCUSED = [
    'it.only("a", () => {});',
    'xit("b", () => {});',
    'describe.concurrent.only("c", () => {});',
    "",
  ].join("\n");

  it.each(FILES)("reject focused and disabled tests in %s", async (file) => {
    const [result] = await eslint.lintText(FOCUSED, { filePath: file });
    const errors = result.messages.filter((m) => m.ruleId === RULE);
    expect(errors.map((m) => m.line)).toEqual([1, 2, 3]);
  });

  it("keep each block's own bans: a clock in the engine", async () => {
    const [result] = await eslint.lintText("export const t = Date.now();\n", {
      filePath: "src/engine/x.ts",
    });
    expect(result.messages.map((m) => m.message)).toContain(
      "No clock in the engine: baseDate is always an explicit parameter.",
    );
  });

  it.each(["../import", "../i18n", "../i18n/en", "../ui"])(
    "keep the engine off the app layers: %s",
    async (source) => {
      const [result] = await eslint.lintText(
        `import { x } from "${source}";\nexport const y = x;\n`,
        { filePath: "src/engine/x.ts" },
      );
      expect(
        result.messages.filter((m) => m.ruleId === "no-restricted-imports"),
      ).toHaveLength(1);
    },
  );

  // #480: tests build loan blocks with mortgageBlock(), never a cast.
  const BLOCK_CAST = [
    "const a = {} as MortgageBlock;",
    "const b = {} as unknown as DevelopmentLoan;",
    "const c = {} as PlainLoan | undefined;",
    "const d = mortgageBlock({});",
    "",
  ].join("\n");
  it.each([
    "src/engine/__tests__/x.test.ts",
    "src/engine/__tests__/support/x.ts",
    "src/lib/__tests__/x.test.ts",
    "src/ui/__tests__/x.test.tsx",
    "src/state/__tests__/x.test.ts",
    "src/data/__tests__/x.test.ts",
  ])("reject loan-block casts in %s", async (file) => {
    const [result] = await eslint.lintText(BLOCK_CAST, { filePath: file });
    const casts = result.messages.filter((m) =>
      m.message.startsWith("No loan-block casts"),
    );
    expect(casts.map((m) => m.line)).toEqual([1, 2, 3]);
  });

  // Array and generic casts make blocks just as well (#480 review).
  const ARRAY_CASTS = [
    "const a = [] as MortgageBlock[];",
    "const b = [] as Array<DevelopmentLoan>;",
    "const c = [] as ReadonlyArray<PlainLoan>;",
    "const d = [] as readonly MortgageBlock[];",
    "const e = [] as unknown as (MortgageBlock | undefined)[];",
    "const f = [] as Money[];",
    "const g = [] as string[];",
    "",
  ].join("\n");
  it.each([
    ["src/engine/__tests__/x.test.ts", "No loan-block casts", [1, 2, 3, 4, 5]],
    ["src/state/__tests__/x.test.ts", "No loan-block casts", [1, 2, 3, 4, 5]],
    ["src/engine/x.ts", "No brand casts", [1, 2, 3, 4, 5, 6]],
    ["src/ui/x.tsx", "No brand casts", [1, 2, 3, 4, 5, 6]],
  ])("reject array casts in %s", async (file, prefix, lines) => {
    const [result] = await eslint.lintText(ARRAY_CASTS, { filePath: file });
    const casts = result.messages.filter((m) => m.message.startsWith(prefix));
    expect(casts.map((m) => m.line)).toEqual(lines);
  });

  // #458: one ResizeObserver stub (src/__tests__/support/dom.ts), none written by hand.
  const RESIZE_OBSERVERS = [
    'import { vi } from "vitest";',
    "globalThis.ResizeObserver ??= class {} as unknown as typeof ResizeObserver;",
    "window.ResizeObserver = X;",
    'vi.stubGlobal("ResizeObserver", X);',
    'Object.defineProperty(globalThis, "ResizeObserver", { value: X });',
    'Object.defineProperty(window, "ResizeObserver", { value: X });',
    "",
  ].join("\n");
  it.each([
    "src/engine/__tests__/x.test.ts",
    "src/lib/__tests__/x.test.ts",
    "src/ui/__tests__/x.test.tsx",
    "src/state/__tests__/x.test.ts",
  ])("reject a hand-written ResizeObserver in %s", async (file) => {
    const [result] = await eslint.lintText(RESIZE_OBSERVERS, {
      filePath: file,
    });
    const stubs = result.messages.filter((m) =>
      m.message.startsWith("Use stubResizeObserver()"),
    );
    expect(stubs.map((m) => m.line)).toEqual([2, 3, 4, 5, 6]);
  });

  it("let the shared stub in src/__tests__/support/dom.ts lint clean", async () => {
    const [result] = await eslint.lintFiles(["src/__tests__/support/dom.ts"]);
    expect(result.messages).toEqual([]);
  });

  it("keep each block's own bans: a lib/day mock in a state test", async () => {
    const [result] = await eslint.lintText(
      'import { vi } from "vitest";\nvi.mock("../../lib/day");\n',
      { filePath: "src/state/__tests__/x.test.ts" },
    );
    expect(
      result.messages.filter((m) => m.ruleId === RULE).map((m) => m.message),
    ).toEqual([
      "The test clock is pinned for every test (src/__tests__/setup/clock.ts, #458): call setClock(…) instead of mocking lib/day.",
    ]);
  });
});
