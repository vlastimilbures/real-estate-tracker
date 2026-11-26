// Dead CSS check (#460, `pnpm lint:css`): every class a stylesheet in src/ui styles must
// appear in a .ts/.tsx file under src, and every custom property must be both defined and
// used. Stylelint and knip do not see across CSS and TSX, so this script does.
// A class counts as used when its name occurs as a whole token (not part of a longer
// class name) in the source text outside comments. Classes the app builds at run time
// (`tone-${t}`) cannot be found that way: RUNTIME_PREFIXES lists the prefixes whose every
// class is built, RUNTIME_CLASSES single built classes of a prefix that also has static
// ones, each with the file that builds it. Never add an entry to silence a dead class.
import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** Custom properties a library's own stylesheet reads; ours only set them. */
export const LIBRARY_PROPERTIES = [
  "--rdp-", // react-day-picker/style.css (DateCalendar.tsx)
];

/** Class prefixes completed at run time, and the third-party class names styled. */
export const RUNTIME_PREFIXES = [
  "tone-", // components/figures.tsx: `num tone-${tone}`
  "cells-", // components/Kpi.tsx: `kpi-band-group cells-${cells}`
  "rdp-", // react-day-picker's own class names (DateCalendar.tsx)
  "recharts-", // Recharts' own class names
];

/** Classes built at run time under a prefix that also has static classes. */
export const RUNTIME_CLASSES = [
  // DashboardFinancing.tsx: `fx-mark fx-${kind}` for the timeline's marker kinds.
  "fx-devCompletion",
  "fx-leaseEnd",
  "fx-loanPayoff",
];

function walk(dir, ext) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walk(p, ext);
    return ext.some((x) => e.name.endsWith(x)) ? [p] : [];
  });
}

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** TS/TSX text without block and line comments (`://` in a URL is not a comment). */
export const stripCodeComments = (code) =>
  stripComments(code).replace(/(?<!:)\/\/.*$/gm, "");

/** Class names in the selectors of a stylesheet (not in values such as url()). */
export function cssClasses(css) {
  const out = new Set();
  // Only the text before each `{` is a selector (or an at-rule prelude).
  for (const m of stripComments(css).matchAll(/([^{};]*)\{/g)) {
    const prelude = m[1].trim();
    if (prelude.startsWith("@")) continue;
    for (const c of prelude.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) out.add(c[1]);
  }
  return out;
}

/** Custom properties a text defines (`--x:`, or a "--x" key in TS) and uses (`var(--x)`). */
export function customProperties(text) {
  const defined = new Set();
  const used = new Set();
  for (const m of text.matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1]);
  for (const m of text.matchAll(/["'](--[\w-]+)["']\s*[:\],]/g))
    defined.add(m[1]);
  for (const m of text.matchAll(/var\(\s*(--[\w-]+)/g)) used.add(m[1]);
  return { defined, used };
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Classes no source text names outside comments, apart from the run-time ones. */
export function deadClasses(
  classes,
  sources,
  prefixes = RUNTIME_PREFIXES,
  built = RUNTIME_CLASSES,
) {
  const text = sources.map(stripCodeComments).join("\n");
  return [...classes]
    .filter((c) => !prefixes.some((p) => c.startsWith(p)) && !built.includes(c))
    .filter((c) => !new RegExp(`(?<![\\w-])${escape(c)}(?![\\w-])`).test(text))
    .sort();
}

/** Custom properties used but never defined, and defined but never used. */
export function deadProperties(texts, library = LIBRARY_PROPERTIES) {
  const defined = new Set();
  const used = new Set();
  for (const t of texts) {
    const r = customProperties(t);
    r.defined.forEach((p) => defined.add(p));
    r.used.forEach((p) => used.add(p));
  }
  return {
    undefined: [...used].filter((p) => !defined.has(p)).sort(),
    unused: [...defined]
      .filter((p) => !used.has(p) && !library.some((l) => p.startsWith(l)))
      .sort(),
  };
}

export function check(root = ROOT) {
  const src = join(root, "src");
  const cssFiles = walk(join(src, "ui"), [".css"]).sort();
  const css = cssFiles.map((f) => readFileSync(f, "utf8"));
  const code = walk(src, [".ts", ".tsx"])
    .filter((f) => !/[\\/]__tests__[\\/]|\.test\.tsx?$/.test(f))
    .map((f) => readFileSync(f, "utf8"));
  const problems = [];
  cssFiles.forEach((f, i) => {
    for (const c of deadClasses(cssClasses(css[i]), code))
      problems.push(`${relative(root, f)}: class .${c} is used in no .ts/.tsx`);
  });
  const props = deadProperties([
    ...css.map(stripComments),
    ...code.map(stripCodeComments),
  ]);
  for (const p of props.undefined)
    problems.push(`custom property ${p} is used but never defined`);
  for (const p of props.unused)
    problems.push(`custom property ${p} is defined but never used`);
  return { files: cssFiles.length, problems };
}

function main() {
  const { files, problems } = check();
  for (const p of problems) console.error(p);
  if (files === 0) {
    console.error("no stylesheet found under src/ui");
    process.exit(1);
  }
  process.exit(problems.length ? 1 : 0);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
) {
  main();
}
