// Sharded nightly Stryker (ADR 0239, #443): the shard table, the merge of the shards'
// mutation.json reports and the combined score, which is gated on thresholds.break.
// `stryker.shard.config.mjs` reads `mutateFor`; CI's mutation-score job runs
// `node scripts/mutation-shards.mjs merge <dir>` (exits 1 below break or on a bad merge);
// a shard leg runs `node scripts/mutation-shards.mjs score <file>` (no gate).
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** The engine glob of stryker.config.json; the `rest` shard is this minus every assigned file. */
export const ENGINE_GLOB = "src/engine/**/*.ts";
const ENGINE_TESTS = "src/engine/**/__tests__/**";

/**
 * One entry per CI leg. A string is a whole file; `{ file, anchor, part }` is the part of the
 * file before (`a`) or from (`b`) the top-level `function <anchor>`. `rest: "rest"` takes every
 * other engine file, so a new file needs no change here.
 */
export const SHARDS = {
  "schedule-a": [
    { file: "src/engine/schedule.ts", anchor: "undrawnMonthStep", part: "a" },
  ],
  "schedule-b": [
    { file: "src/engine/schedule.ts", anchor: "undrawnMonthStep", part: "b" },
  ],
  "validate-a": [
    { file: "src/engine/validate.ts", anchor: "checkMortgage", part: "a" },
  ],
  "validate-b": [
    { file: "src/engine/validate.ts", anchor: "checkMortgage", part: "b" },
  ],
  projections: ["src/engine/projections.ts", "src/engine/financing.ts"],
  kpis: ["src/engine/kpis.ts", "src/engine/dates.ts", "src/engine/metrics.ts"],
  rest: "rest",
};

const fileOf = (entry) => (typeof entry === "string" ? entry : entry.file);

/** Every file a named shard takes, whole or in part (the `rest` shard excluded). */
export function assignedFiles(shards = SHARDS) {
  return [
    ...new Set(
      Object.values(shards)
        .filter(Array.isArray)
        .flatMap((entries) => entries.map(fileOf)),
    ),
  ].sort();
}

/** Files split across shards, each with the shards that hold a part. */
export function splitFiles(shards = SHARDS) {
  const out = {};
  for (const [name, entries] of Object.entries(shards))
    if (Array.isArray(entries))
      for (const e of entries)
        if (typeof e !== "string") (out[e.file] ??= []).push(name);
  return out;
}

/**
 * Stryker line ranges for the two parts of `source` split at the top-level
 * `function <anchor>` (optionally exported). Throws when the anchor is missing or repeated.
 */
export function splitRanges(source, anchor, file = "source") {
  const lines = source.split("\n");
  const re = new RegExp(`^(export )?function ${anchor}\\b`);
  const hits = lines.flatMap((l, i) => (re.test(l) ? [i + 1] : []));
  if (hits.length === 0)
    throw new Error(`${file}: no top-level "function ${anchor}" to split at`);
  if (hits.length > 1)
    throw new Error(
      `${file}: "function ${anchor}" appears ${hits.length} times (lines ${hits.join(", ")})`,
    );
  const n = hits[0];
  if (n === 1)
    throw new Error(
      `${file}: "function ${anchor}" is on line 1; part a is empty`,
    );
  return { a: `${file}:1-${n - 1}`, b: `${file}:${n}-${lines.length}` };
}

/** The `mutate` list for one shard. Throws on an unknown shard or a bad anchor. */
export function mutateFor(shard, root = ROOT, shards = SHARDS) {
  const entries = shards[shard];
  if (entries === undefined)
    throw new Error(
      `unknown shard "${shard}"; expected one of ${Object.keys(shards).join(", ")}`,
    );
  if (entries === "rest")
    return [
      ENGINE_GLOB,
      `!${ENGINE_TESTS}`,
      ...assignedFiles(shards).map((f) => `!${f}`),
    ];
  return entries.map((e) => {
    if (typeof e === "string") return e;
    const source = readFileSync(join(root, e.file), "utf8");
    return splitRanges(source, e.anchor, e.file)[e.part];
  });
}

const UNDETECTED = new Set(["Survived", "NoCoverage"]);

/**
 * Stryker's mutation score over a report: detected (Killed + Timeout) over valid (detected +
 * Survived + NoCoverage). Compile and runtime errors and ignored mutants do not count.
 * Throws when no mutant is valid: a score of nothing is not a pass.
 */
export function score(report) {
  const counts = {
    mutants: 0,
    killed: 0,
    timeout: 0,
    survived: 0,
    noCoverage: 0,
    static: 0,
  };
  for (const f of Object.values(report.files))
    for (const m of f.mutants) {
      counts.mutants++;
      if (m.static) counts.static++;
      if (m.status === "Killed") counts.killed++;
      else if (m.status === "Timeout") counts.timeout++;
      else if (m.status === "Survived") counts.survived++;
      else if (m.status === "NoCoverage") counts.noCoverage++;
    }
  const detected = counts.killed + counts.timeout;
  const valid = detected + counts.survived + counts.noCoverage;
  if (valid === 0) throw new Error("no valid mutants: nothing was tested");
  return { ...counts, detected, valid, score: (100 * detected) / valid };
}

/** True when `s` (unrounded) meets the break threshold, as Stryker compares it. */
export const passes = (s, brk) => brk === null || s >= brk;

const mutantKey = (file, m) => {
  const { start, end } = m.location;
  return `${file}@${start.line}:${start.column}-${end.line}:${end.column} ${m.mutatorName} ${m.replacement ?? ""}`;
};

/** One test across shards: its file, name and, when present, location. */
const testKey = (file, t) => {
  const loc = t.location?.start;
  return JSON.stringify([file, t.name, loc ? [loc.line, loc.column] : null]);
};

/**
 * Merges the shards' reports (`{ shard: report | undefined }`) into one. `errors` lists a
 * missing shard, a mutant found by two shards (overlapping ranges) and a split file with a
 * part missing; the merge still returns what it could combine.
 */
export function mergeReports(reports, shards = SHARDS) {
  const errors = [];
  const files = {};
  const testFiles = {};
  const seen = new Map();
  const canonicalTests = new Map();
  let base;
  for (const shard of Object.keys(shards)) {
    const r = reports[shard];
    if (!r) {
      errors.push(`shard "${shard}": no report`);
      continue;
    }
    base ??= r;
    // Stryker numbers mutants and tests per run, so a raw id means something only within its
    // shard. A mutant id takes the shard as prefix; a test maps to one id per test file,
    // name and location, so a test that every shard ran appears once.
    const testId = new Map();
    for (const [file, t] of Object.entries(r.testFiles ?? {})) {
      const into = (testFiles[file] ??= { ...t, tests: [] });
      for (const test of t.tests ?? []) {
        const key = testKey(file, test);
        let canonical = canonicalTests.get(key);
        if (canonical === undefined) {
          canonical = String(canonicalTests.size);
          canonicalTests.set(key, canonical);
          into.tests.push({ ...test, id: canonical });
        }
        testId.set(test.id, canonical);
      }
    }
    const tests = (xs) =>
      xs === undefined
        ? undefined
        : xs.map((x) => testId.get(x) ?? `${shard}-${x}`);
    for (const [file, f] of Object.entries(r.files)) {
      const into = (files[file] ??= { ...f, mutants: [] });
      for (const m of f.mutants) {
        const key = mutantKey(file, m);
        const other = seen.get(key);
        if (other) {
          errors.push(
            `${key}: in shards "${other}" and "${shard}" (overlapping mutate ranges)`,
          );
          continue;
        }
        seen.set(key, shard);
        into.mutants.push({
          ...m,
          id: `${shard}-${m.id}`,
          coveredBy: tests(m.coveredBy),
          killedBy: tests(m.killedBy),
        });
      }
    }
  }
  for (const [file, parts] of Object.entries(splitFiles(shards)))
    for (const shard of parts)
      if (reports[shard] && !reports[shard].files[file])
        errors.push(
          `${file}: shard "${shard}" holds a part but reports no mutants`,
        );
  const report = {
    ...(base ?? { schemaVersion: "1.0" }),
    files,
    testFiles,
  };
  return { report, errors };
}

const pct = (s) => `${s.toFixed(2)} %`;
const row = (name, s) =>
  `| ${name} | ${s.mutants} | ${s.detected} | ${s.survived} | ${s.noCoverage} | ${pct(s.score)} |`;
const HEAD = [
  "| Mutants | Detected | Survived | No coverage | Score |",
  "| ---: | ---: | ---: | ---: | ---: |",
];

const MAX_SURVIVORS = 50;

/** The undetected mutants, one line each, capped at `MAX_SURVIVORS`. */
function survivors(report) {
  const all = Object.entries(report.files).flatMap(([file, f]) =>
    f.mutants
      .filter((m) => UNDETECTED.has(m.status))
      .map(
        (m) =>
          `- \`${file}:${m.location.start.line}:${m.location.start.column}\` ${m.status} ${m.mutatorName}${m.replacement === undefined ? "" : ` → \`${String(m.replacement).replaceAll("`", "'").replaceAll("\n", " ").slice(0, 60)}\``}`,
      ),
  );
  const shown = all.slice(0, MAX_SURVIVORS);
  if (all.length > MAX_SURVIVORS)
    shown.push(`- … and ${all.length - MAX_SURVIVORS} more`);
  return shown;
}

/** Per-file rows of a report, files with no valid mutant skipped. */
function fileRows(report) {
  return Object.keys(report.files)
    .sort()
    .flatMap((file) => {
      try {
        return [
          row(`\`${file}\``, score({ files: { [file]: report.files[file] } })),
        ];
      } catch {
        return [];
      }
    });
}

/** Markdown for one report (a shard leg): its score, per file, and its survivors. */
export function shardSummary(name, report) {
  const s = score(report);
  return [
    `### Mutation score (${name})`,
    "",
    `${pct(s.score)}: ${s.detected} of ${s.valid} valid mutants detected; ${s.static} of ${s.mutants} mutants static. The break applies to the combined score (mutation-score job).`,
    "",
    `| File ${HEAD[0]}`,
    `| --- ${HEAD[1]}`,
    ...fileRows(report),
    "",
    ...(s.survived + s.noCoverage > 0
      ? ["Undetected:", "", ...survivors(report), ""]
      : []),
  ].join("\n");
}

/** Markdown for the merged run: combined vs break, per shard, per file, survivors, errors. */
export function mergeSummary(reports, merged, brk, errors, shards = SHARDS) {
  const lines = ["### Mutation score (combined)", ""];
  let combined;
  try {
    combined = score(merged);
  } catch (e) {
    errors = [...errors, `combined: ${e.message}`];
  }
  if (combined)
    lines.push(
      `**${pct(combined.score)}** (${combined.detected} of ${combined.valid} valid mutants detected; break ${brk} %): ${passes(combined.score, brk) && errors.length === 0 ? "pass" : "FAIL"}. ${combined.static} of ${combined.mutants} mutants static.`,
      "",
    );
  if (errors.length > 0)
    lines.push("Errors:", "", ...errors.map((e) => `- ${e}`), "");
  lines.push(`| Shard ${HEAD[0]}`, `| --- ${HEAD[1]}`);
  for (const shard of Object.keys(shards)) {
    const r = reports[shard];
    if (!r) {
      lines.push(`| ${shard} | missing | | | | |`);
      continue;
    }
    try {
      lines.push(row(shard, score(r)));
    } catch (e) {
      lines.push(`| ${shard} | ${e.message} | | | | |`);
    }
  }
  lines.push(
    "",
    `| File ${HEAD[0]}`,
    `| --- ${HEAD[1]}`,
    ...fileRows(merged),
    "",
  );
  if (combined && combined.survived + combined.noCoverage > 0)
    lines.push("Undetected:", "", ...survivors(merged), "");
  return {
    markdown: lines.join("\n"),
    ok:
      errors.length === 0 &&
      combined !== undefined &&
      passes(combined.score, brk),
  };
}

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

function main() {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === "score" && arg) {
    console.log(shardSummary(process.env.STRYKER_SHARD ?? arg, readJson(arg)));
    return;
  }
  if (cmd === "merge" && arg) {
    const brk = readJson(join(ROOT, "stryker.config.json")).thresholds.break;
    const reports = {};
    for (const shard of Object.keys(SHARDS)) {
      const path = join(arg, `mutation-report-${shard}`, "mutation.json");
      if (existsSync(path)) reports[shard] = readJson(path);
    }
    const { report, errors } = mergeReports(reports);
    const { markdown, ok } = mergeSummary(reports, report, brk, errors);
    const out = join(ROOT, "reports/mutation/mutation.json");
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(report));
    console.log(markdown);
    process.exit(ok ? 0 : 1);
  }
  console.error(
    "usage: node scripts/mutation-shards.mjs merge <dir> | score <mutation.json>",
  );
  process.exit(2);
}

// realpath: a symlinked checkout must still run the CLI, not silently do nothing.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
)
  main();
