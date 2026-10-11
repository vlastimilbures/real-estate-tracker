// Coverage ratchet check (#141, ADR 0083): fails when a floor in coverage-floors.json sits
// more than MAX_SLACK points below what the suite measures, so a floor cannot stay behind
// after coverage rises. Run after `pnpm test:coverage` (CI does); locally:
// `pnpm coverage:ratchet [coverage/coverage-summary.json]`.
// Each glob's measure is the folder total, as Vitest computes it for its thresholds.
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { matchesGlob, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const MAX_SLACK = 3;
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const METRICS = ["lines", "branches"];

/** Percent covered per metric over the summary's files that match `glob`, or null. */
export function measure(summary, glob, root = ROOT) {
  const files = Object.entries(summary).filter(
    ([file]) =>
      file !== "total" &&
      matchesGlob(relative(root, file).split("\\").join("/"), glob),
  );
  if (files.length === 0) return null;
  const out = {};
  for (const metric of METRICS) {
    let covered = 0;
    let total = 0;
    for (const [, m] of files) {
      covered += m[metric].covered;
      total += m[metric].total;
    }
    out[metric] = total === 0 ? 100 : (100 * covered) / total;
  }
  return out;
}

/** One row per glob and metric; `ok` is false when the floor lags by > `maxSlack`. */
export function ratchet(summary, floors, root = ROOT, maxSlack = MAX_SLACK) {
  return Object.entries(floors).flatMap(([glob, floor]) => {
    const measured = measure(summary, glob, root);
    if (!measured) return [{ glob, metric: "files", ok: false, missing: true }];
    return METRICS.map((metric) => ({
      glob,
      metric,
      floor: floor[metric],
      measured: measured[metric],
      ok: measured[metric] - floor[metric] <= maxSlack,
    }));
  });
}

function main() {
  const file = process.argv[2] ?? "coverage/coverage-summary.json";
  if (!existsSync(file)) {
    console.error(`${file} not found: run pnpm test:coverage first`);
    process.exit(2);
  }
  const summary = JSON.parse(readFileSync(file, "utf8"));
  const floors = JSON.parse(
    readFileSync(new URL("../coverage-floors.json", import.meta.url), "utf8"),
  );
  let failed = false;
  for (const r of ratchet(summary, floors)) {
    if (r.missing) {
      console.error(`FAIL  ${r.glob}: matches no covered file`);
      failed = true;
      continue;
    }
    if (!r.ok) failed = true;
    console.log(
      `${r.ok ? "ok  " : "FAIL"}  ${r.glob} ${r.metric}: floor ${r.floor}, ` +
        `measured ${r.measured.toFixed(1)}` +
        (r.ok ? "" : ` (floor more than ${MAX_SLACK} points below: raise it)`),
    );
  }
  process.exit(failed ? 1 : 0);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
) {
  main();
}
