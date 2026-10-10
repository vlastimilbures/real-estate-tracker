import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettier from "eslint-config-prettier";

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
// Rate), engine/dates.ts (IsoDate) and `mortgageBlock` in engine/amortization.ts.
const BRAND_TYPES =
  "/^(Money|Rate|IsoDate|MortgageBlock|PlainLoan|DevelopmentLoan)$/";
const brandCastBans = [
  {
    selector: `TSAsExpression > TSTypeReference.typeAnnotation[typeName.name=${BRAND_TYPES}]`,
    message:
      "No brand casts (ADR 0074): build the value with money()/rate()/utc()/isoDate()/mortgageBlock().",
  },
  {
    selector: `TSAsExpression > TSUnionType.typeAnnotation > TSTypeReference[typeName.name=${BRAND_TYPES}]`,
    message:
      "No brand casts (ADR 0074): build the value with money()/rate()/utc()/isoDate()/mortgageBlock().",
  },
];

// Only src/lib/money.ts touches decimal.js directly (DR-075): one Decimal configuration.
const decimalPath = {
  name: "decimal.js",
  message:
    "Import Decimal helpers from src/lib/money.ts, not decimal.js directly (DR-075).",
};
const engineLayerPattern = {
  group: [
    "**/data",
    "**/data/**",
    "**/state",
    "**/state/**",
    "**/ui",
    "**/ui/**",
    "**/import/**",
    "**/i18n/**",
    "**/lib/**",
    "!**/lib/money",
    "react",
    "react-dom",
    "@tauri-apps/*",
  ],
  message:
    "The engine is pure (CLAUDE.md §4, PLAN §4.1): no imports from data/state/ui/import/i18n/react/tauri; from lib only money.",
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
    rules: { "no-restricted-syntax": ["error", ...testBans] },
  },
  // Production code: no brand casts and no non-null assertions (ADR 0074); a missing
  // value gets a real guard or the checked `at()` from lib/arrays.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/**/__tests__/**", "src/**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", ...testBans, ...brandCastBans],
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
  // Layering boundaries (CLAUDE.md §4) enforced by lint, not just review/convention.
  // The engine is PURE: it may import only other engine modules + lib/money. It must never
  // reach out to data/state/ui/react/tauri. dependency-cruiser enforces the full map in CI.
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
  {
    files: ["src/engine/**/*.ts"],
    ignores: ["src/engine/**/__tests__/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...testBans,
        ...brandCastBans,
        ...engineClockBans,
        ...engineNumberBans,
        engineDateBan,
      ],
      // P4a limits (P04a-engine-refactor.md §6): keep engine functions small.
      complexity: ["error", 10],
      "max-lines-per-function": [
        "error",
        { max: 60, skipBlankLines: true, skipComments: true },
      ],
    },
  },
  // The brand constructors themselves (ADR 0074): no brand-cast ban here.
  {
    files: ["src/engine/brands.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...testBans,
        ...engineClockBans,
        ...engineNumberBans,
        engineDateBan,
      ],
    },
  },
  {
    files: ["src/engine/dates.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...testBans,
        ...engineClockBans,
        ...engineNumberBans,
      ],
    },
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
