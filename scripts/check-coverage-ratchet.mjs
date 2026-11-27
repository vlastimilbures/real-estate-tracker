// Coverage ratchet (#141, ADR 0083, #499). Run after `pnpm test:coverage`.
//
//   pnpm coverage:ratchet [summary]           the PR gate: fails when measured coverage
//                                             drops below a floor in coverage-floors.json,
//                                             or a floor's glob matches no covered file
//   pnpm coverage:ratchet --raise [--out f]   the nightly run: the same, and lists every
//                                             floor more than MAX_SLACK points below
//                                             measured with its raised value, as an issue
//                                             body in `f` (the NONE line alone when
//                                             nothing is left to raise)
//
// A PR that raises coverage never fails here (owner decision on #499, 2026-11-27): the
// nightly run keeps one issue with the floors to raise. Each glob's measure is the folder
// total, as Vitest computes it for its thresholds.
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { matchesGlob, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** How far a floor may lag measured before the nightly run asks to raise it. */
export const MAX_SLACK = 3;
/** The `--raise` file's only line when nothing is left to raise: never a 0-byte file. */
export const NONE = "<!-- coverage-floors: none -->";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const METRICS = ["lines", "branches"];

/** Points a raised floor stays below measured: 2 under src/ui, where new code lands less covered. */
export const headroom = (glob) => (glob.startsWith("src/ui/") ? 2 : 1);

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

/** One row per glob and metric; `ok` is false when measured is below the floor. */
export function ratchet(summary, floors, root = ROOT) {
  return Object.entries(floors).flatMap(([glob, floor]) => {
    const measured = measure(summary, glob, root);
    if (!measured) return [{ glob, metric: "files", ok: false, missing: true }];
    return METRICS.map((metric) => ({
      glob,
      metric,
      floor: floor[metric],
      measured: measured[metric],
      ok: measured[metric] >= floor[metric],
    }));
  });
}

/**
 * The floors to raise: every row more than `maxSlack` below measured, raised to measured
 * minus its headroom, rounded down. `floors` is the whole new file; the input is kept.
 */
export function raise(rows, floors, maxSlack = MAX_SLACK) {
  const next = structuredClone(floors);
  const raised = rows
    .filter((r) => !r.missing && r.measured - r.floor > maxSlack)
    .map(({ glob, metric, floor, measured }) => ({
      glob,
      metric,
      floor,
      measured,
      next: Math.max(floor, Math.floor(measured - headroom(glob))),
    }));
  for (const r of raised) next[r.glob][r.metric] = r.next;
  return {
    raised,
    floors: next,
  };
}

/** coverage-floors.json as Prettier lays it out: one line per glob. */
export function floorsJson(floors) {
  const rows = Object.entries(floors).map(
    ([glob, floor]) =>
      `  ${JSON.stringify(glob)}: { ${Object.entries(floor)
        .map(([k, v]) => `${JSON.stringify(k)}: ${v}`)
        .join(", ")} }`,
  );
  return `{\n${rows.join(",\n")}\n}\n`;
}

/** The nightly issue's body, or the NONE line when there is nothing to raise. */
export function issueBody({ raised, floors }) {
  if (raised.length === 0) return `${NONE}\n`;
  return [
    `These coverage floors sit more than ${MAX_SLACK} points below what the suite measures on main.`,
    "Raise them in `coverage-floors.json` to measured minus the headroom (2 points under",
    "`src/ui`, 1 elsewhere), rounded down:",
    "",
    "| Folder | Metric | Floor | Measured | New floor |",
    "| --- | --- | --- | --- | --- |",
    ...raised.map(
      (r) =>
        `| \`${r.glob}\` | ${r.metric} | ${r.floor} | ${r.measured.toFixed(1)} | **${r.next}** |`,
    ),
    "",
    "The whole new `coverage-floors.json`:",
    "",
    "```json",
    floorsJson(floors).trimEnd(),
    "```",
    "",
  ].join("\n");
}

function report(rows) {
  let failed = false;
  for (const r of rows) {
    if (r.missing) {
      console.error(`FAIL  ${r.glob}: matches no covered file`);
      failed = true;
      continue;
    }
    if (!r.ok) failed = true;
    console.log(
      `${r.ok ? "ok  " : "FAIL"}  ${r.glob} ${r.metric}: floor ${r.floor}, ` +
        `measured ${r.measured.toFixed(1)}` +
        (r.ok ? "" : " (below the floor)"),
    );
  }
  return failed;
}

function main(args) {
  const out = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;
  const file =
    args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--out") ??
    "coverage/coverage-summary.json";
  if (!existsSync(file)) {
    console.error(`${file} not found: run pnpm test:coverage first`);
    return 2;
  }
  const summary = JSON.parse(readFileSync(file, "utf8"));
  const floors = JSON.parse(
    readFileSync(new URL("../coverage-floors.json", import.meta.url), "utf8"),
  );
  const rows = ratchet(summary, floors);
  if (report(rows)) return 1;
  if (!args.includes("--raise")) return 0;
  const body = issueBody(raise(rows, floors));
  console.log(body === `${NONE}\n` ? "\nNo floor to raise." : `\n${body}`);
  if (out) writeFileSync(out, body);
  return 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
) {
  process.exit(main(process.argv.slice(2)));
}
