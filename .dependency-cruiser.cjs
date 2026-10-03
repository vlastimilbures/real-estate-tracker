// Architecture rules as code: the layer map in docs/adr/0072 (first written in P10 from
// ADR 0072, CLAUDE.md §3–§4). ESLint mirrors the engine rules
// for editor feedback; this file is the full map and runs in CI (`pnpm depcruise`).
//
// .dependency-cruiser-known-violations.json is empty since P12 (ADR 0072). A new violation
// fails CI; `pnpm depcruise:baseline-check` fails a PR whose baseline grows. Never grow it
// to get a PR green.

const TESTS = "(^|/)__tests__/|\\.(test|spec|bench)\\.tsx?$";
const APP_LAYERS = "^src/(engine|data|state|ui|import|i18n|platform)/";

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment:
        "Runtime import cycles make load order and layering ambiguous. Cycles closed only by `import type` edges are erased at compile time and allowed.",
      from: {},
      to: {
        circular: true,
        viaOnly: { dependencyTypesNot: ["type-only"] },
      },
    },
    {
      name: "engine-pure-layers",
      severity: "error",
      comment:
        "The engine is pure (CLAUDE.md): only engine modules and the named pure lib files (allow-list: lib/money.ts).",
      from: { path: "^src/engine/", pathNot: TESTS },
      to: {
        path: "^src/(data|state|ui|import|i18n)/|^src/lib/",
        pathNot: "^src/lib/money\\.ts$",
      },
    },
    {
      name: "engine-pure-packages",
      severity: "error",
      comment: "The engine may use decimal.js only: no react, no Tauri, no IO.",
      from: { path: "^src/engine/", pathNot: TESTS },
      to: {
        dependencyTypes: ["npm", "npm-dev", "npm-peer", "npm-optional", "core"],
        pathNot: "node_modules/decimal\\.js/",
      },
    },
    {
      name: "lib-no-app-layers",
      severity: "error",
      comment: "lib is the bottom layer: it never imports the app layers.",
      from: { path: "^src/lib/", pathNot: TESTS },
      to: { path: APP_LAYERS },
    },
    {
      name: "lib-no-tauri",
      severity: "error",
      comment: "PLAN §4.1: lib may import decimal.js only (no Tauri runtime).",
      from: { path: "^src/lib/", pathNot: TESTS },
      to: { path: "node_modules/@tauri-apps/" },
    },
    {
      name: "platform-low-layer",
      severity: "error",
      comment:
        "platform wraps Tauri commands (ADR 0072): lib and @tauri-apps only, never the app layers.",
      from: { path: "^src/platform/", pathNot: TESTS },
      to: { path: "^src/(engine|data|state|ui|import|i18n)/" },
    },
    {
      name: "data-no-upper-layers",
      severity: "error",
      comment: "One-way data flow: data never reaches state/ui/import/react.",
      from: { path: "^src/data/", pathNot: TESTS },
      to: {
        path: "^src/(state|ui|import)/|node_modules/(react|react-dom)/",
      },
    },
    {
      name: "data-no-ui-lib",
      severity: "error",
      comment:
        "data may use the decimal/finance lib, not the clock, display or file-save helpers (DR-046 zones); the store injects them (ADR 0072).",
      from: { path: "^src/data/", pathNot: TESTS },
      to: {
        path: "^src/lib/(today|format)\\.ts$|^src/platform/saveFile\\.ts$",
      },
    },
    {
      name: "import-no-upper-layers",
      severity: "error",
      comment: "import (CSV) sits under state: never state/ui/react.",
      from: { path: "^src/import/", pathNot: TESTS },
      to: { path: "^src/(state|ui)/|node_modules/(react|react-dom)/" },
    },
    {
      name: "state-no-ui",
      severity: "error",
      comment:
        "state feeds the UI; it never imports it at runtime (type-only edges allowed, ADR 0072).",
      from: { path: "^src/state/", pathNot: TESTS },
      to: {
        path: "^src/ui/",
        dependencyTypesNot: ["type-only"],
      },
    },
    {
      name: "ui-model-pure",
      severity: "error",
      comment:
        "ui/model is pure presentation logic: engine, lib and i18n only — no react, Tauri, or runtime state/data/import (type-only edges allowed, ADR 0072).",
      from: { path: "^src/ui/model/", pathNot: TESTS },
      to: {
        path: "^src/(state|data|import)/|node_modules/(react|react-dom|@tauri-apps)/",
        dependencyTypesNot: ["type-only"],
      },
    },
    {
      name: "ui-no-data",
      severity: "error",
      comment:
        "The UI renders state and dispatches edits; it reaches data, import and Tauri only through state (type-only edges allowed, ADR 0072).",
      from: { path: "^src/ui/", pathNot: TESTS },
      to: {
        path: "^src/(data|import|platform)/|node_modules/@tauri-apps/",
        dependencyTypesNot: ["type-only"],
      },
    },
    {
      name: "i18n-leaf",
      severity: "error",
      comment:
        "i18n dictionaries depend on nothing but themselves (and engine types).",
      from: { path: "^src/i18n/", pathNot: TESTS },
      to: { path: "^src/(data|state|ui|import|lib)/" },
    },
    {
      name: "no-prod-to-tests",
      severity: "error",
      comment: "Production code never imports test code.",
      from: { path: "^src/", pathNot: TESTS },
      to: { path: TESTS },
    },
    {
      name: "no-prod-to-dev-deps",
      severity: "error",
      comment:
        "Shipped code may not import devDependencies (DR-011/DR-153): it hides runtime packages from `pnpm audit --prod`.",
      from: { path: "^src/", pathNot: `${TESTS}|^src/data/browserSql\\.ts$` },
      to: { dependencyTypes: ["npm-dev"], dependencyTypesNot: ["type-only"] },
    },
    {
      name: "not-to-unresolvable",
      severity: "error",
      comment: "Every import resolves.",
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "^src/vite-env\\.d\\.ts$" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      mainFields: ["module", "main", "types", "typings"],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
