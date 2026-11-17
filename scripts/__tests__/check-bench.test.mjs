// `pnpm bench:check` (ADR 0073, ADR 0172) on synthetic bench reports: the budgets, the
// exact limit, the factor, a missing bench, the same-run ratio and bad arguments.
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const DIR = mkdtempSync(join(tmpdir(), "check-bench-"));

const RECOMPUTE = "recompute (useEngine)";
const COMPARE = "scenario compare (3 scenarios)";
const RECASTS = "recasts, synthetic 20 properties";
const PREPAY = "prepayments, synthetic 20 properties";
const PIECES = "pieces, synthetic 20 properties";
const TWENTY = "synthetic, 20 properties";
const RECAST_BENCH = "schedulesByProperty, an instalment recast on every loan";
const PREPAY_BENCH = "schedulesByProperty, a prepayment on every loan";

/** A passing report: every budget at half its limit, the recast ratio 1.25. */
function benches() {
  return {
    [RECOMPUTE]: { [TWENTY]: { p99: 100, median: 50 } },
    [COMPARE]: { [TWENTY]: { p99: 300, median: 150 } },
    [RECASTS]: { [RECAST_BENCH]: { p99: 40, median: 12.5 } },
    [PREPAY]: { [PREPAY_BENCH]: { p99: 40, median: 10 } },
    [PIECES]: { schedulesByProperty: { p99: 30, median: 10 } },
  };
}

/** The report shape `vitest bench --outputJson` writes. */
function report(groups, prefix = "src/engine/x.bench.ts > ") {
  return {
    files: [
      {
        groups: Object.entries(groups).map(([group, byName]) => ({
          fullName: `${prefix}${group}`,
          benchmarks: Object.entries(byName).map(([name, stats]) => ({
            name,
            ...stats,
          })),
        })),
      },
    ],
  };
}

let n = 0;
function run(content, ...args) {
  const file = join(DIR, `report-${n++}.json`);
  writeFileSync(file, JSON.stringify(content));
  return check(file, ...args);
}
function check(...args) {
  const r = spawnSync(process.execPath, ["scripts/check-bench.mjs", ...args], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return { status: r.status, out: r.stdout, err: r.stderr };
}

describe("check-bench budgets", () => {
  it("passes a report with every bench in budget and the ratio at 1.25", () => {
    const r = run(report(benches()));
    expect(r.status).toBe(0);
    expect(r.out).toContain(
      `ok    ${RECOMPUTE} / ${TWENTY}: p99 100.0 ms (budget 150 ms, limit 300 ms)`,
    );
    expect(r.out).toContain("median 1.25 ×");
    expect(r.out).not.toContain("FAIL");
  });

  it("passes a p99 exactly at the limit (factor 2) and fails just over it", () => {
    const at = benches();
    at[RECOMPUTE][TWENTY].p99 = 300;
    expect(run(report(at)).status).toBe(0);

    const over = benches();
    over[RECOMPUTE][TWENTY].p99 = 300.1;
    const r = run(report(over));
    expect(r.status).toBe(1);
    expect(r.out).toContain(`FAIL  ${RECOMPUTE} / ${TWENTY}: p99 300.1 ms`);
  });

  it("scales the limit by the factor argument", () => {
    const over = benches();
    over[RECOMPUTE][TWENTY].p99 = 300.1;
    const r = run(report(over), "3");
    expect(r.status).toBe(0);
    expect(r.out).toContain("(budget 150 ms, limit 450 ms)");
  });

  it("fails a budgeted bench missing from the report", () => {
    const groups = benches();
    delete groups[PREPAY];
    const r = run(report(groups));
    expect(r.status).toBe(1);
    expect(r.err).toContain(
      `MISSING  ${PREPAY} / ${PREPAY_BENCH}: not in the report`,
    );
  });

  it("matches a group only after `> `, so a bare group name is missing", () => {
    const r = run(report(benches(), ""));
    expect(r.status).toBe(1);
    expect(r.err).toContain(`MISSING  ${RECOMPUTE} / ${TWENTY}`);
    expect(r.err).toContain(`MISSING  ${RECASTS} / ${RECAST_BENCH} ÷`);
  });
});

describe("check-bench ratio", () => {
  it("passes a median ratio of exactly 1.4 and fails 1.45", () => {
    const at = benches();
    at[RECASTS][RECAST_BENCH].median = 14;
    expect(run(report(at)).status).toBe(0);

    const over = benches();
    over[RECASTS][RECAST_BENCH].median = 14.5;
    const r = run(report(over));
    expect(r.status).toBe(1);
    expect(r.out).toContain(
      `FAIL  ${RECASTS} / ${RECAST_BENCH}: median 1.45 × schedulesByProperty (limit 1.4 ×)`,
    );
  });

  it("is not scaled by the factor", () => {
    const over = benches();
    over[RECASTS][RECAST_BENCH].median = 14.5;
    expect(run(report(over), "10").status).toBe(1);
  });

  it("fails when the base bench is missing", () => {
    const groups = benches();
    delete groups[PIECES];
    const r = run(report(groups));
    expect(r.status).toBe(1);
    expect(r.err).toContain(`÷ ${PIECES} / schedulesByProperty`);
  });
});

describe("check-bench arguments", () => {
  it("exits 2 with the usage line and no report", () => {
    const r = check();
    expect(r.status).toBe(2);
    expect(r.err).toContain("usage: node scripts/check-bench.mjs");
  });

  it.each(["0", "abc", "-1"])("exits 2 for factor %s", (factor) => {
    const r = run(report(benches()), factor);
    expect(r.status).toBe(2);
    expect(r.err).toContain(
      `factor must be a positive number, got "${factor}"`,
    );
  });
});
