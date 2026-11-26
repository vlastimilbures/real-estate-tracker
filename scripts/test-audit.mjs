// Test audit (#458): proves a test refactor dropped no test and weakened no assertion count.
// Run the suite on the base and on the head with the audit setup on, then compare:
//   TEST_AUDIT=1 pnpm exec vitest run --includeTaskLocation --reporter=json \
//     --outputFile=<base|head>.json                        (in each checkout)
//   node scripts/test-audit.mjs base.json head.json --base-dir <base checkout>
// It fails unless the head has every base test (by file and full name), every head test
// passes, and each test makes as many assertions as on the base. A test added in a file the
// base does not have is listed, not failed; one added to an existing file fails.
//
// A refactor that merges or renames suites (#497) passes `--moves <map.json>`: an object
// from a base key (`file › suite › … › title`, as the summary prints it) to the key the
// same test has on the head. A moved test is compared under its head key and still re-run
// from its base file; a map entry that names no base test fails the audit.
//
// A `waitFor(() => expect(…))` counts every retry, so its count can move with timing.
// Every test that calls waitFor (retry-counted, on either side) is re-run alone RERUNS
// times in each checkout, whether or not its count differs, and the two sides compare by
// their lowest count over the full run and the reruns: an extra retry cannot hide a
// removed assertion. Any other test compares its full-run count, with no reruns, and
// fails on any difference. Without --base-dir there are no reruns, so any difference fails.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const RERUNS = 3;

/** The deepest folder holding every test file of a report: the checkout it ran in. */
function rootOf(report) {
  const dirs = report.testResults.map((f) => dirname(f.name).split("/"));
  if (dirs.length === 0) return "/";
  let n = 0;
  while (n < dirs[0].length && dirs.every((d) => d[n] === dirs[0][n])) n += 1;
  return dirs[0].slice(0, n).join("/") || "/";
}

/** One row per test: `file › suite › … › title`, its status, its assertion count and its
 *  line. The file is relative to the checkout the report ran in, so base and head compare.
 *  `moves` renames a key (a base test that moved); its file and full name stay the base's,
 *  where a rerun finds it. */
export function rows(report, root = rootOf(report), moves = new Map()) {
  const out = [];
  for (const file of report.testResults) {
    const name = relative(root, file.name).split("\\").join("/");
    for (const t of file.assertionResults) {
      const key = [name, ...t.ancestorTitles, t.title].join(" › ");
      out.push({
        file: name,
        key: moves.get(key) ?? key,
        // Vitest's own full name, what `-t` matches.
        fullName: [...t.ancestorTitles, t.title].join(" "),
        status: t.status,
        assertions: t.meta?.assertionCalls ?? null,
        line: t.location?.line ?? null,
      });
    }
  }
  return out;
}

/** The `moves` entries that name no test of the base report. */
export function staleMoves(base, moves) {
  const keys = new Set(rows(base).map((r) => r.key));
  return [...moves.keys()].filter((k) => !keys.has(k));
}

const WAIT_FOR = /\bwaitFor\(/;

/** Keys of the tests in `list` that call waitFor, given each file's source. A test's body
 *  runs from its line to the next test's; a waitFor above the first test (in a helper)
 *  marks every test of that file. */
export function retryCounted(list, sourceOf) {
  const out = new Set();
  const byFile = new Map();
  for (const r of list) byFile.set(r.file, [...(byFile.get(r.file) ?? []), r]);
  for (const [file, tests] of byFile) {
    const source = sourceOf(file);
    if (!source || !WAIT_FOR.test(source)) continue;
    const lines = source.split("\n");
    const starts = [...new Set(tests.map((t) => t.line))]
      .filter((l) => l !== null)
      .sort((a, b) => a - b);
    if (starts.length === 0) {
      for (const t of tests) out.add(t.key);
      continue;
    }
    const bodyOf = (line) => {
      const next = starts.find((l) => l > line) ?? lines.length + 1;
      return lines.slice(line - 1, next - 1).join("\n");
    };
    const helper = WAIT_FOR.test(lines.slice(0, starts[0] - 1).join("\n"));
    for (const t of tests)
      if (helper || (t.line !== null && WAIT_FOR.test(bodyOf(t.line))))
        out.add(t.key);
  }
  return out;
}

function byKey(list) {
  const map = new Map();
  for (const r of list) map.set(r.key, [...(map.get(r.key) ?? []), r]);
  return map;
}

const lowest = (counts) =>
  counts.length === 0 ? null : Math.min(...counts.filter((c) => c !== null));

/** The differences between a base and a head report; `ok` when there are none.
 *  `retry` is the set of retry-counted keys; `reruns` maps such a key to the counts of its
 *  passing isolated reruns, `{ base, head }`. Only a retry-counted test with reruns is
 *  compared by its lowest count; every other test by its full-run count. */
export function audit(
  base,
  head,
  { reruns = new Map(), retry = new Set(), moves = new Map() } = {},
) {
  const b = rows(base, undefined, moves);
  const stale = staleMoves(base, moves);
  const h = rows(head);
  const bMap = byKey(b);
  const hMap = byKey(h);
  const baseFiles = new Set(b.map((r) => r.file));
  const missing = [];
  const added = [];
  const addedInNewFiles = [];
  const notPassing = h.filter((r) => r.status !== "passed").map((r) => r.key);
  const unaudited = h.filter((r) => r.assertions === null).map((r) => r.key);
  const assertionDiffs = [];
  const settledByRerun = [];
  let rerunChecked = 0;
  for (const [key, bs] of bMap) {
    const hs = hMap.get(key) ?? [];
    if (hs.length < bs.length) missing.push(key);
    bs.forEach((r, i) => {
      const other = hs[i];
      if (!other) return;
      const single = bs.length === 1 && hs.length === 1;
      const again = single && retry.has(key) ? reruns.get(key) : null;
      if (again) {
        rerunChecked += 1;
        const lb = lowest([r.assertions, ...again.base]);
        const lh = lowest([other.assertions, ...again.head]);
        if (lb !== lh) {
          assertionDiffs.push({ key, base: lb, head: lh, rerun: true });
          return;
        }
        if (other.assertions !== r.assertions)
          settledByRerun.push({
            key,
            base: r.assertions,
            head: other.assertions,
            lowest: lb,
          });
        return;
      }
      if (other.assertions === r.assertions) return;
      assertionDiffs.push({
        key,
        base: r.assertions,
        head: other.assertions,
        rerun: false,
      });
    });
  }
  for (const [key, hs] of hMap) {
    const extra = hs.length - (bMap.get(key)?.length ?? 0);
    if (extra <= 0) continue;
    (baseFiles.has(hs[0].file) ? added : addedInNewFiles).push(key);
  }
  return {
    ok:
      stale.length === 0 &&
      missing.length === 0 &&
      added.length === 0 &&
      notPassing.length === 0 &&
      unaudited.length === 0 &&
      assertionDiffs.length === 0,
    base: { tests: b.length, files: baseFiles.size },
    head: { tests: h.length, files: new Set(h.map((r) => r.file)).size },
    baseAssertions: b.reduce((n, r) => n + (r.assertions ?? 0), 0),
    headAssertions: h.reduce((n, r) => n + (r.assertions ?? 0), 0),
    retryCounted: h.filter((r) => retry.has(r.key)).length,
    rerunChecked,
    moved: moves.size,
    stale,
    missing,
    added,
    addedInNewFiles,
    notPassing,
    unaudited,
    assertionDiffs,
    settledByRerun,
  };
}

/** The tests to re-run: every retry-counted test that both sides have once, whether or
 *  not its count differs. */
export function toRerun(base, head, retry, moves = new Map()) {
  const hMap = byKey(rows(head));
  const out = [];
  for (const [key, bs] of byKey(rows(base, undefined, moves))) {
    const hs = hMap.get(key) ?? [];
    if (retry.has(key) && bs.length === 1 && hs.length === 1)
      out.push({ key, file: bs[0].file, fullName: bs[0].fullName });
  }
  return out;
}

/** The summary printed for a pull request. */
export function summary(result) {
  const lines = [
    `base: ${result.base.tests} tests in ${result.base.files} files, ${result.baseAssertions} assertions`,
    `head: ${result.head.tests} tests in ${result.head.files} files, ${result.headAssertions} assertions`,
    `missing: ${result.missing.length}, added to existing files: ${result.added.length}, ` +
      `not passing: ${result.notPassing.length}, without a count: ${result.unaudited.length}, ` +
      `assertion-count diffs: ${result.assertionDiffs.length}`,
    `added in new files: ${result.addedInNewFiles.length}`,
    `moved by the map: ${result.moved}, map entries naming no base test: ${result.stale.length}`,
    `retry-counted (call waitFor): ${result.retryCounted}, compared by lowest count after ` +
      `${RERUNS} isolated reruns each side: ${result.rerunChecked}; ` +
      `full-run count differed, lowest count the same: ${result.settledByRerun.length}`,
  ];
  const list = (title, items) => {
    if (items.length === 0) return;
    lines.push(`${title}:`);
    for (const item of items) lines.push(`  ${item}`);
  };
  list("map entries naming no base test", result.stale);
  list("missing", result.missing);
  list("added to existing files", result.added);
  list("added in new files", result.addedInNewFiles);
  list("not passing", result.notPassing);
  list("without a count", result.unaudited);
  list(
    "settled by rerun",
    result.settledByRerun.map(
      (d) => `${d.key}: ${d.base} -> ${d.head}, lowest ${d.lowest} both`,
    ),
  );
  list(
    "assertion-count diffs",
    result.assertionDiffs.map(
      (d) =>
        `${d.key}: ${d.base} -> ${d.head}${d.rerun ? " (lowest after reruns)" : ""}`,
    ),
  );
  lines.push(result.ok ? "audit: OK" : "audit: FAILED");
  return lines.join("\n");
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Counts of `times` passing runs of one test alone in checkout `dir`. */
function rerunAlone(dir, { file, fullName, key }, times) {
  const counts = [];
  const tmp = mkdtempSync(join(tmpdir(), "test-audit-"));
  try {
    for (let i = 0; i < times; i++) {
      const out = join(tmp, `${i}.json`);
      spawnSync(
        "pnpm",
        [
          "exec",
          "vitest",
          "run",
          file,
          "--maxWorkers=1",
          "-t",
          `^${escape(fullName)}$`,
          "--reporter=json",
          `--outputFile=${out}`,
        ],
        { cwd: dir, env: { ...process.env, TEST_AUDIT: "1" }, stdio: "ignore" },
      );
      if (!existsSync(out)) continue;
      const report = JSON.parse(readFileSync(out, "utf8"));
      const row = rows(report, dir).find((r) => r.key === key);
      if (row?.status === "passed" && row.assertions !== null)
        counts.push(row.assertions);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return counts;
}

function option(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [basePath, headPath] = process.argv.slice(2);
  if (!basePath || !headPath || basePath.startsWith("--")) {
    console.error(
      "usage: node scripts/test-audit.mjs <base.json> <head.json> [--base-dir <dir>] [--head-dir <dir>] [--moves <map.json>]",
    );
    process.exit(2);
  }
  const read = (p) => JSON.parse(readFileSync(p, "utf8"));
  const base = read(basePath);
  const head = read(headPath);
  const baseDir = option("--base-dir");
  const headDir = resolve(option("--head-dir") ?? ".");
  const movesPath = option("--moves");
  const moves = new Map(Object.entries(movesPath ? read(movesPath) : {}));
  const sourceIn = (root) => (file) => {
    const p = join(root, file);
    return existsSync(p) ? readFileSync(p, "utf8") : null;
  };
  // Retry-counted on either side: a waitFor dropped on the head is still re-run.
  const retry = new Set([
    ...retryCounted(rows(base, undefined, moves), sourceIn(rootOf(base))),
    ...retryCounted(rows(head), sourceIn(rootOf(head))),
  ]);
  const reruns = new Map();
  if (baseDir)
    for (const test of toRerun(base, head, retry, moves))
      reruns.set(test.key, {
        base: rerunAlone(resolve(baseDir), test, RERUNS),
        head: rerunAlone(headDir, test, RERUNS),
      });
  const result = audit(base, head, { reruns, retry, moves });
  console.log(summary(result));
  process.exit(result.ok ? 0 : 1);
}
