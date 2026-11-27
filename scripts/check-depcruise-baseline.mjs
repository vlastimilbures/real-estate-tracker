// Fails when the dependency-cruiser baseline gained an entry against the base branch
// (ADR 0072): the known-violations file may only shrink. Run in CI on pull requests;
// locally: `pnpm depcruise:baseline-check [base-ref]` (default origin/main).
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

const FILE = ".dependency-cruiser-known-violations.json";

/** The ref to compare against: the argument, else the pull request's base branch on
 * GitHub, else origin/main. */
export function baseRef(argv, env) {
  return (
    argv[0] ??
    (env.GITHUB_BASE_REF ? `origin/${env.GITHUB_BASE_REF}` : "origin/main")
  );
}

/** One known violation as a comparable line: rule, from and to. */
export const key = (v) => `${v.rule.name}: ${v.from} → ${v.to}`;

/** The keys of `current` entries that `base` does not have. */
export function addedEntries(base, current) {
  const before = new Set(base.map(key));
  return current.map(key).filter((k) => !before.has(k));
}

function baseEntries(base) {
  try {
    return JSON.parse(
      execFileSync("git", ["show", `${base}:${FILE}`], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
  } catch (e) {
    console.error(`Cannot read ${FILE} at ${base}: ${e.message}`);
    process.exit(2);
  }
}

function main() {
  const base = baseRef(process.argv.slice(2), process.env);
  const added = addedEntries(
    baseEntries(base),
    JSON.parse(readFileSync(FILE, "utf8")),
  );
  if (added.length > 0) {
    console.error(
      `${FILE} grew against ${base}. Fix these instead of baselining them:`,
    );
    for (const k of added) console.error(`  + ${k}`);
    process.exit(1);
  }
  console.log(`${FILE}: no new entries against ${base}.`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
) {
  main();
}
