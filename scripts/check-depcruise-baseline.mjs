// Fails when the dependency-cruiser baseline gained an entry against the base branch
// (ADR 0072): the known-violations file may only shrink. Run in CI on pull requests;
// locally: `pnpm depcruise:baseline-check [base-ref]` (default origin/main).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const FILE = ".dependency-cruiser-known-violations.json";
const base =
  process.argv[2] ??
  (process.env.GITHUB_BASE_REF
    ? `origin/${process.env.GITHUB_BASE_REF}`
    : "origin/main");

const key = (v) => `${v.rule.name}: ${v.from} → ${v.to}`;

function baseEntries() {
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

const before = new Set(baseEntries().map(key));
const added = JSON.parse(readFileSync(FILE, "utf8"))
  .map(key)
  .filter((k) => !before.has(k));

if (added.length > 0) {
  console.error(
    `${FILE} grew against ${base}. Fix these instead of baselining them:`,
  );
  for (const k of added) console.error(`  + ${k}`);
  process.exit(1);
}
console.log(`${FILE}: no new entries against ${base}.`);
