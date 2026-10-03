// Coarse performance gate for the nightly run (ADR 0073): reads the JSON report of
// `pnpm bench --outputJson <file>` and fails when a budgeted bench's p99 exceeds
// FACTOR × its budget. The budgets themselves (ADR 0066, ADR 0073) are checked on the
// owner's machine; the factor absorbs the slower, noisier CI runner.
// Usage: node scripts/check-bench.mjs <bench.json> [factor=2]
import { readFileSync } from "node:fs";

const [file, factorArg = "2"] = process.argv.slice(2);
if (!file) {
  console.error("usage: node scripts/check-bench.mjs <bench.json> [factor]");
  process.exit(2);
}
const factor = Number(factorArg);

/** Budgeted benches: group (suffix of the group's full name), bench name, p99 budget. */
const BUDGETS = [
  {
    group: "recompute (useEngine)",
    bench: "synthetic, 20 properties",
    ms: 150,
  },
  {
    group: "scenario compare (3 scenarios)",
    bench: "synthetic, 20 properties",
    ms: 450,
  },
];

const report = JSON.parse(readFileSync(file, "utf8"));
const groups = report.files.flatMap((f) => f.groups);

let failed = false;
for (const { group, bench, ms } of BUDGETS) {
  const limit = ms * factor;
  const found = groups
    .find((g) => g.fullName.endsWith(`> ${group}`))
    ?.benchmarks.find((b) => b.name === bench);
  if (!found) {
    console.error(`MISSING  ${group} / ${bench}: not in the report`);
    failed = true;
    continue;
  }
  const ok = found.p99 <= limit;
  if (!ok) failed = true;
  console.log(
    `${ok ? "ok  " : "FAIL"}  ${group} / ${bench}: p99 ${found.p99.toFixed(1)} ms ` +
      `(budget ${ms} ms, limit ${limit} ms)`,
  );
}
process.exit(failed ? 1 : 0);
