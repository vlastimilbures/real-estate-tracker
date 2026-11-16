// Function length and complexity limits (#456), one source for eslint.config.js and
// scripts/check-size-baseline.mjs. Functions over a limit today are listed in
// function-size-baseline.json (CONTRIBUTING.md "Function size and complexity").
// Lines skip blanks and comments; tests are out of scope.

const TESTS = ["src/**/__tests__/**", "src/**/*.test.{ts,tsx}"];

// Components: JSX is long by nature.
const COMPONENTS = { lines: 150, complexity: 15 };
const OTHER = { lines: 80, complexity: 12 };
// P4a limits (P04a-engine-refactor.md §6): keep engine functions small.
export const ENGINE_LIMITS = { lines: 60, complexity: 10 };

/** The ESLint rules for one set of limits. */
export function sizeRules(limits) {
  return {
    complexity: ["error", limits.complexity],
    "max-lines-per-function": [
      "error",
      { max: limits.lines, skipBlankLines: true, skipComments: true },
    ],
  };
}

/** Flat-config blocks for all of src. The engine block in eslint.config.js comes after
 * these, so its tighter limits win. */
export const sizeLimitBlocks = [
  { files: ["src/**/*.tsx"], ignores: TESTS, rules: sizeRules(COMPONENTS) },
  { files: ["src/**/*.ts"], ignores: TESTS, rules: sizeRules(OTHER) },
];
