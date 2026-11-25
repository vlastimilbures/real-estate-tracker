import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettier from "eslint-config-prettier";
import {
  ENGINE_LIMITS,
  sizeLimitBlocks,
  sizeRules,
} from "./scripts/size-limits.mjs";
import { eslintGroup } from "./scripts/engine-layers.cjs";

// Focused or disabled tests never reach main (CLAUDE.md §6). `it.fails` stays allowed —
// it needs a DR-/J- ID by convention.
const testBans = [
  {
    selector:
      "MemberExpression[object.name=/^(it|test|describe|suite|bench)$/][property.name=/^(only|skip|skipIf|todo)$/]",
    message:
      "No .only/.skip/.todo (CLAUDE.md §6): pin today's output with a DR comment, or use it.fails with a DR-/J- ID.",
  },
  {
    selector:
      "MemberExpression[object.type='MemberExpression'][object.property.name=/^(describe|concurrent|sequential|each)$/][property.name=/^(only|skip|skipIf|todo)$/]",
    message: "No .only/.skip/.todo (CLAUDE.md §6).",
  },
  {
    selector:
      "CallExpression[callee.name=/^(xit|xtest|xdescribe|fit|fdescribe)$/]",
    message: "No disabled or focused tests (CLAUDE.md §6).",
  },
];

// Flat config replaces a rule's options per key, so each block that sets
// `no-restricted-syntax` sets the whole list: this puts the test bans first in every one
// (scripts/__tests__/eslint-config.test.mjs checks that none leaves them out).
const restrictedSyntax = (...groups) => ({
  "no-restricted-syntax": ["error", ...testBans, ...groups.flat()],
});

// Modules a setup file mocks once for ui/state tests (#458): no file-level mock of them.
// Both forms: `vi.mock("…/data/errorLog")` and `vi.mock(import("…/data/errorLog"))`.
const SHARED_MOCKED =
  "/(^@tauri-apps\\u002Fapi\\u002Fcore$|\\u002Fdata\\u002FerrorLog$)/";
const VI_MOCK =
  "CallExpression[callee.object.name='vi'][callee.property.name=/^(mock|doMock)$/]";
const sharedMockMessage =
  "errorLog and Tauri core are mocked for every ui/state test (src/__tests__/setup/mocks.ts, #458): set behaviour on the mock with vi.mocked(…).";
const sharedMockBans = [
  {
    selector: `${VI_MOCK}[arguments.0.value=${SHARED_MOCKED}]`,
    message: sharedMockMessage,
  },
  {
    selector: `${VI_MOCK}[arguments.0.type='ImportExpression'][arguments.0.source.value=${SHARED_MOCKED}]`,
    message: sharedMockMessage,
  },
];

// Every test starts on a pinned day (src/__tests__/setup/clock.ts, #458): no file-level
// mock of lib/day; a test moves the day with setClock (src/__tests__/support/clock.ts).
// `vi.mock("…/lib/day")`, with or without `.ts` / `.js`; inside src/lib a relative path
// names the module without `lib/` (`./day`, `../day`, `./../day`), so src/lib tests also
// ban that form. The `/` before `day` keeps `today` / `holiday` out.
const DAY_MODULE = "/\\u002Flib\\u002Fday(\\.(ts|js))?$/";
const LIB_DAY_MODULE =
  "/(\\u002Flib\\u002F|^(\\.\\.?\\u002F)+)day(\\.(ts|js))?$/";
const dayMockMessage =
  "The test clock is pinned for every test (src/__tests__/setup/clock.ts, #458): call setClock(…) instead of mocking lib/day.";
const dayMockBansFor = (module) => [
  {
    selector: `${VI_MOCK}[arguments.0.value=${module}]`,
    message: dayMockMessage,
  },
  {
    selector: `${VI_MOCK}[arguments.0.type='TemplateLiteral'][arguments.0.quasis.0.value.raw=${module}]`,
    message: dayMockMessage,
  },
  {
    selector: `${VI_MOCK}[arguments.0.type='ImportExpression'][arguments.0.source.value=${module}]`,
    message: dayMockMessage,
  },
];
const dayMockBans = dayMockBansFor(DAY_MODULE);
const TEST_FILES = ["src/**/__tests__/**/*.{ts,tsx}", "src/**/*.test.{ts,tsx}"];
const SETUP_FILES = ["src/__tests__/setup/**"];

// Engine purity (CLAUDE.md "The engine is pure"; money as decimal.js). The money-safety
// bans are a proxy: converting to a JS number is where float maths on currency starts.
const engineClockBans = [
  {
    selector: "MemberExpression[object.name='Date'][property.name='now']",
    message:
      "No clock in the engine: baseDate is always an explicit parameter.",
  },
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message:
      "No clock in the engine: baseDate is always an explicit parameter.",
  },
  {
    selector: "MemberExpression[object.name='Math'][property.name='random']",
    message: "The engine is deterministic: no Math.random.",
  },
];
const engineNumberBans = [
  {
    selector: "CallExpression[callee.name=/^(parseFloat|parseInt|Number)$/]",
    message:
      "No float conversion in the engine: money and rates stay decimal.js (CLAUDE.md money rules).",
  },
  {
    selector:
      "CallExpression[callee.object.name='Number'][callee.property.name=/^(parseFloat|parseInt)$/]",
    message:
      "No float conversion in the engine: money and rates stay decimal.js (CLAUDE.md money rules).",
  },
  {
    selector: "CallExpression[callee.property.name='toNumber']",
    message:
      "No .toNumber() in the engine: money and rates stay decimal.js (CLAUDE.md money rules).",
  },
];
// Dates are built only in src/engine/dates.ts (utc/isoDate/edate).
const engineDateBan = {
  selector: "NewExpression[callee.name='Date']",
  message:
    "Build engine dates with utc/isoDate/edate from ./dates, not new Date().",
};

// Brands get values only through their constructors (ADR 0074): engine/brands.ts (Money,
// Rate), engine/dates.ts (IsoDate), `mortgageBlock` in engine/loanBlock.ts and the
// asserts in engine/validate/entry.ts (ValidInputs, ValidAssumptions).
const BRAND_TYPES =
  "/^(Money|Rate|IsoDate|MortgageBlock|PlainLoan|DevelopmentLoan|ValidInputs|ValidAssumptions)$/";
const brandCastBans = [
  {
    selector: `TSAsExpression > TSTypeReference.typeAnnotation[typeName.name=${BRAND_TYPES}]`,
    message:
      "No brand casts (ADR 0074): build the value with money()/rate()/utc()/isoDate()/mortgageBlock()/assertInputs()/assertAssumptions().",
  },
  {
    selector: `TSAsExpression > TSUnionType.typeAnnotation > TSTypeReference[typeName.name=${BRAND_TYPES}]`,
    message:
      "No brand casts (ADR 0074): build the value with money()/rate()/utc()/isoDate()/mortgageBlock()/assertInputs()/assertAssumptions().",
  },
];

// Only src/lib/money.ts touches decimal.js directly (DR-075): one Decimal configuration.
const decimalPath = {
  name: "decimal.js",
  message:
    "Import Decimal helpers from src/lib/money.ts, not decimal.js directly (DR-075).",
};
// The layer list is shared with dependency-cruiser (scripts/engine-layers.cjs says what
// each tool covers that the other does not).
const engineLayerPattern = {
  group: eslintGroup(),
  message:
    "The engine is pure (CLAUDE.md §4, PLAN §4.1): no imports from data/state/ui/import/i18n/react/tauri; from lib only money and rules (ADR 0244).",
};
const engineBarrelPattern = {
  regex: "(^|/)engine/(?!__tests__/)",
  message:
    "Import the engine through its public API (src/engine/index.ts), not its internal modules.",
};

export default tseslint.config(
  { ignores: ["dist", "src-tauri/target", "node_modules"] },
  // Config files and the CI gate scripts run in Node.
  {
    files: ["**/*.{js,mjs,cjs}"],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  // The script tests (scripts/__tests__/*.test.mjs) get the same test bans (#499).
  {
    files: ["**/*.{js,mjs,cjs}"],
    rules: restrictedSyntax(),
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: restrictedSyntax(),
  },
  // Every test gets the pinned clock from a setup file (src/__tests__/setup/clock.ts,
  // #458); a test sets another day with setClock.
  {
    files: TEST_FILES,
    ignores: SETUP_FILES,
    rules: restrictedSyntax(dayMockBans),
  },
  // src/lib tests also reach lib/day by a relative path (`../day`).
  {
    files: ["src/lib/**/__tests__/**/*.{ts,tsx}", "src/lib/**/*.test.{ts,tsx}"],
    rules: restrictedSyntax(dayMockBansFor(LIB_DAY_MODULE)),
  },
  // ui/state tests get the errorLog and Tauri core mocks from a setup file
  // (src/__tests__/setup/mocks.ts, #458); a test changes their behaviour on the mock.
  {
    files: ["src/{ui,state}/**/__tests__/**/*.{ts,tsx}"],
    rules: restrictedSyntax(sharedMockBans, dayMockBans),
  },
  // Production code: no brand casts and no non-null assertions (ADR 0074); a missing
  // value gets a real guard or the checked `at()` from lib/arrays.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/**/__tests__/**", "src/**/*.test.{ts,tsx}"],
    rules: {
      ...restrictedSyntax(brandCastBans),
      "@typescript-eslint/no-non-null-assertion": "error",
      // Shipped code runs in the WebView: no Node globals. tsconfig cannot hide them,
      // since @types/papaparse pulls in @types/node (#154).
      "no-restricted-globals": [
        "error",
        ...[
          "process",
          "Buffer",
          "global",
          "require",
          "__dirname",
          "__filename",
        ].map((name) => ({
          name,
          message: "Node global: shipped code runs in the WebView.",
        })),
      ],
    },
  },
  // Layering boundaries (CLAUDE.md §4) in the editor. The engine is PURE: other engine
  // modules and lib/money + lib/rules only. This block also covers the engine tests and
  // bans a direct decimal.js import; dependency-cruiser holds the full layer map and bans
  // every npm package but decimal.js (scripts/engine-layers.cjs).
  {
    files: ["src/engine/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [decimalPath], patterns: [engineLayerPattern] },
      ],
    },
  },
  // The independent reference model (P2) is deliberately written on decimal.js directly.
  {
    files: ["src/engine/__tests__/reference/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [engineLayerPattern] }],
    },
  },
  // The reference models import only each other (ADR 0174): no engine, lib or support
  // code, and not the adapters beside them (eventHarness.ts, loanGen.ts), which bridge to
  // the engine. So they cannot inherit an engine mistake.
  {
    files: [
      "src/engine/__tests__/reference/mortgageReference.ts",
      "src/engine/__tests__/reference/kpiReference.ts",
      "src/engine/__tests__/reference/seedLoans.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex:
                "^\\.{1,2}/(?!(mortgageReference|kpiReference|seedLoans)$)",
              message: "Reference model is engine-free (ADR 0174, #160).",
            },
          ],
        },
      ],
    },
  },
  // Function length and complexity across src (#456); today's offenders are baselined
  // (function-size-baseline.json, eslint-suppressions.json). Before the engine block.
  ...sizeLimitBlocks,
  {
    files: ["src/engine/**/*.ts"],
    ignores: ["src/engine/**/__tests__/**"],
    rules: {
      ...restrictedSyntax(
        brandCastBans,
        engineClockBans,
        engineNumberBans,
        engineDateBan,
      ),
      // P4a limits (P04a-engine-refactor.md §6): keep engine functions small.
      ...sizeRules(ENGINE_LIMITS),
      // At most four positional parameters; more travel as one object (#480).
      "max-params": ["error", 4],
    },
  },
  // The brand constructors themselves (ADR 0074): no brand-cast ban here.
  {
    files: ["src/engine/brands.ts"],
    rules: restrictedSyntax(engineClockBans, engineNumberBans, engineDateBan),
  },
  {
    files: ["src/engine/dates.ts"],
    rules: restrictedSyntax(engineClockBans, engineNumberBans),
  },
  // One-way data flow: DB → data/mappers → engine. The data layer maps rows to engine
  // INPUTS; it imports engine TYPES (and boundary-safe date helpers) only, never engine
  // finance functions, and never reaches into state/ui/react. (It legitimately uses the
  // Tauri SQL plugin — that is the persistence driver.)
  {
    files: ["src/data/**/*.{ts,tsx}"],
    ignores: ["src/data/**/__tests__/**"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/state",
                "**/state/**",
                "**/ui",
                "**/ui/**",
                "react",
                "react-dom",
              ],
              message:
                "The data layer must not import state/ui/react (one-way data flow, CLAUDE.md §4).",
            },
            {
              regex: "(^|/)engine$",
              allowImportNames: [
                "addYears",
                "calendarDay",
                "edate",
                "isoDate",
                "money",
                "monthsBetween",
                "mortgageBlock",
                "rate",
                "utc",
              ],
              allowTypeImports: true,
              message:
                "The data layer imports engine TYPES and the boundary constructors (dates, rate, money, mortgageBlock) only, never engine finance functions (DB → mappers → engine).",
            },
          ],
        },
      ],
    },
  },
  // Single public engine API (P4a, DR-073): outside src/engine, import the engine only
  // through its barrel (src/engine/index.ts). Engine test fixtures stay importable.
  {
    files: ["src/**/*.{ts,tsx}", "e2e/**/*.{ts,tsx}"],
    ignores: ["src/engine/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [decimalPath], patterns: [engineBarrelPattern] },
      ],
    },
  },
  {
    files: ["src/lib/money.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [engineBarrelPattern] }],
    },
  },
  prettier,
);
