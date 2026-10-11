// Coarse performance gate for the nightly run (ADR 0073): reads the JSON report of
// `pnpm bench --outputJson <file>` and fails when a budgeted bench's p99 exceeds
// FACTOR × its budget. The budgets themselves (ADR 0066, ADR 0073) are checked on the
// owner's machine; the factor absorbs the slower, noisier CI runner. A ratio check compares
// two benches of the same run, so it holds on any machine and the factor does not scale it
// (ADR 0172).
// Usage: node scripts/check-bench.mjs <bench.json> [factor=2]
import { readFileSync } from "node:fs";

const [file, factorArg = "2"] = process.argv.slice(2);
if (!file) {
  console.error("usage: node scripts/check-bench.mjs <bench.json> [factor]");
  process.exit(2);
}
const factor = Number(factorArg);
if (!Number.isFinite(factor) || factor <= 0) {
  console.error(`factor must be a positive number, got "${factorArg}"`);
  console.error("usage: node scripts/check-bench.mjs <bench.json> [factor]");
  process.exit(2);
}

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
  {
    group: "recasts, synthetic 20 properties",
    bench: "schedulesByProperty, an instalment recast on every loan",
    ms: 80,
  },
  {
    group: "prepayments, synthetic 20 properties",
    bench: "schedulesByProperty, a prepayment on every loan",
    ms: 80,
  },
];

/**
 * Same-run ratios of medians: `bench` / `base` must stay at or below `max`. The recast
 * case runs ~1.25 × the plain build; building all 600 months again (the ADR 0116 fix
 * undone) makes it ~1.45 ×, which an absolute budget does not see.
 */
const RATIOS = [
  {
    group: "recasts, synthetic 20 properties",
    bench: "schedulesByProperty, an instalment recast on every loan",
    base: {
      group: "pieces, synthetic 20 properties",
      bench: "schedulesByProperty",
    },
    max: 1.4,
  },
];

const report = JSON.parse(readFileSync(file, "utf8"));
const groups = report.files.flatMap((f) => f.groups);

const find = ({ group, bench }) =>
  groups
    .find((g) => g.fullName.endsWith(`> ${group}`))
    ?.benchmarks.find((b) => b.name === bench);

let failed = false;
for (const { group, bench, ms } of BUDGETS) {
  const limit = ms * factor;
  const found = find({ group, bench });
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
for (const { group, bench, base, max } of RATIOS) {
  const found = find({ group, bench });
  const against = find(base);
  if (!found || !against) {
    console.error(
      `MISSING  ${group} / ${bench} ÷ ${base.group} / ${base.bench}: not in the report`,
    );
    failed = true;
    continue;
  }
  const ratio = found.median / against.median;
  const ok = ratio <= max;
  if (!ok) failed = true;
  console.log(
    `${ok ? "ok  " : "FAIL"}  ${group} / ${bench}: median ${ratio.toFixed(2)} × ` +
      `${base.bench} (limit ${max} ×)`,
  );
}
process.exit(failed ? 1 : 0);
