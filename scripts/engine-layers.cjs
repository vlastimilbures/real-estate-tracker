// What the engine may not import (CLAUDE.md §4, ADR 0072), one list for both tools:
// .dependency-cruiser.cjs (`engine-pure-layers`) and the engine import hint in
// eslint.config.js. CommonJS, so the dependency-cruiser config can require it.
//
// The two are kept because each covers something the other does not:
// - ESLint also lints the engine tests (except the reference models, which have their own
//   block) and bans a direct decimal.js import: only src/lib/money.ts configures Decimal.
// - dependency-cruiser bans every npm package and Node built-in but decimal.js
//   (`engine-pure-packages`); ESLint names only react, react-dom and Tauri.

/** App layers under src/ the engine never imports. */
const LAYERS = ["data", "state", "ui", "import", "i18n"];
/** The only src/lib modules the engine imports (lib/rules: ADR 0244). */
const LIB_ALLOWED = ["money", "rules"];
/** Packages ESLint names; dependency-cruiser bans every package but decimal.js. */
const PACKAGES = ["react", "react-dom", "@tauri-apps/*"];

/** The `to` of dependency-cruiser's `engine-pure-layers` rule: paths from the root. */
function depcruiseTo() {
  return {
    path: `^src/(${LAYERS.join("|")})/|^src/lib/`,
    pathNot: `^src/lib/(${LIB_ALLOWED.join("|")})\\.ts$`,
  };
}

/** The `group` of ESLint's engine import hint: gitignore-style globs on the specifier. */
function eslintGroup() {
  return [
    ...LAYERS.flatMap((layer) => [`**/${layer}`, `**/${layer}/**`]),
    "**/lib/**",
    ...LIB_ALLOWED.map((name) => `!**/lib/${name}`),
    ...PACKAGES,
  ];
}

module.exports = { depcruiseTo, eslintGroup };
