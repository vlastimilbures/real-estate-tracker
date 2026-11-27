// The one list of gates (#461): what a change must pass, where each gate runs, and the
// command that runs it. `pnpm check` runs the local gates in order and stops at the first
// failure; `pnpm check:release` adds the two dependency audits (scripts/release-macos.sh).
// The gate tables in CONTRIBUTING.md and README.md are generated from this list
// (`pnpm gates:docs`), and scripts/__tests__/gates.test.mjs checks them, CLAUDE.md §6, the
// PR template, the release script and ci.yml against it.
//
// The ci.yml check (`ciDrift`) reads each step: its exact shell lines; its `env` merged
// with the job's and the workflow's, a `${{ matrix.x }}` value read once per matrix value;
// its `continue-on-error`, `if:`, `shell:` and `working-directory` (with the job's and
// the workflow's `defaults.run`); and its job's shard list. It reads each job's `if:`
// (by role: work job or aggregate) and `continue-on-error`, each aggregate's result check
// for every job it needs, and fails a matrix `include` / `exclude`, which it does not
// expand. It requires pnpm, cargo, node, bash, npx, sh, npm and yarn lines to be gates or
// setup. It does not see an edit inside a multi-line script that keeps the gate's own line
// (an `exit 0` before it, say), nor an aggregate that stops waiting for a job: the
// `needs` list itself is not compared with the jobs.
//
//   node scripts/gates.mjs               run the check gates
//   node scripts/gates.mjs --release     … and the two dependency audits
//   node scripts/gates.mjs --list        print the gates it would run
//   node scripts/gates.mjs --write-docs  regenerate the CONTRIBUTING.md and README.md tables
import { spawnSync } from "node:child_process";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { format, resolveConfig } from "prettier";
import { MAX_SLACK } from "./check-coverage-ratchet.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

/**
 * One gate. `where`: `check` runs in `pnpm check` and CI; `release` also in
 * `pnpm check:release` and CI; `ci` in CI only (`why` says why it is not local);
 * `nightly` in the nightly workflow, `weekly` in its weekly schedule. `covers`: commands
 * this gate already runs, so they are not gates of their own. `ci`: the steps ci.yml runs
 * for it, each `{ run, env }` with the exact shell line and the step's variables, when not
 * `{ run, env }` of the gate itself, and `dir` its `working-directory` when not the
 * repository root. `env`: variables set for the command. `readme`: text for the README
 * table.
 */
// The axe runs as ci.yml sets them up: the run id names the folder axe-check reads.
const AXE_EN = {
  UX_RUN_ID: "ci",
  UX_LANG: "en",
  UX_THEME: "both",
  UX_VIEWPORT: "1280x800,min",
};
const AXE_I18N = {
  UX_RUN_ID: "ci-i18n",
  UX_LANG: "cs,ru",
  UX_THEME: "light",
  UX_VIEWPORT: "1280x800,1200x800,min",
};
// The layout screens' tag: ux-capture/layoutScreens.ts lists them and fails the run when
// one is missing (#496).
export const LAYOUT_TAG = "@layout-i18n";

export const GATES = [
  {
    id: "format",
    run: "pnpm exec prettier --check .",
    what: "Prettier formatting",
    where: "check",
    readme: "Prettier formatting",
  },
  {
    id: "typecheck",
    run: "pnpm typecheck",
    what: "TypeScript strict: the app, the strict config, ux-capture and the Node config",
    where: "check",
    readme: "TypeScript strict",
  },
  {
    id: "lint",
    run: "pnpm lint",
    what: "ESLint with zero warnings (engine purity, function sizes #456); comment references (#457); stylesheets (lint:css)",
    where: "check",
    readme:
      "ESLint with zero warnings, incl. engine-purity rules; function sizes; comment references; stylesheets",
  },
  {
    id: "depcruise",
    run: "pnpm depcruise",
    what: "layer rules, no runtime cycles",
    where: "check",
    readme: "Layer map and cycles",
  },
  {
    id: "depcruise-baseline",
    run: "pnpm depcruise:baseline-check",
    what: "the layer-violation baseline never grows against origin/main",
    where: "check",
    readme: "The layer-violation baseline never grows",
  },
  {
    id: "size-baseline",
    run: "pnpm lint:size:baseline-check",
    what: "the function-size baseline never grows against origin/main",
    where: "check",
    readme: "The function-size baseline never grows",
  },
  {
    id: "knip",
    run: "pnpm knip",
    what: "no unused files, exports or dependencies",
    where: "check",
    readme: "Unused files, exports and dependencies",
  },
  {
    id: "knip-prod",
    run: "pnpm knip:prod",
    what: "the shipped app only: an export only tests use is dead",
    where: "check",
    readme: "The same for the shipped app: an export only tests use is dead",
  },
  {
    id: "adr",
    run: "pnpm adr:check",
    what: "the ADR index is current, Amends / Supersedes links paired",
    where: "check",
    readme: "ADR index current, links paired",
  },
  {
    id: "test",
    run: "pnpm test:coverage",
    what: "full suite + per-folder coverage floors (includes test:parity)",
    where: "check",
    covers: ["pnpm test", "pnpm test:parity"],
    readme:
      "Vitest tests with per-folder coverage floors, incl. the parity targets (±1 Kč, ±0.0001)",
  },
  {
    id: "coverage-ratchet",
    run: "pnpm coverage:ratchet",
    what: `no floor more than ${MAX_SLACK} points below measured`,
    where: "check",
    readme: `No coverage floor more than ${MAX_SLACK} points below measured`,
  },
  {
    id: "cargo-fmt",
    run: "cargo fmt --check --manifest-path src-tauri/Cargo.toml",
    what: "Rust formatting",
    where: "check",
    readme: "Rust formatting",
  },
  {
    id: "clippy",
    run: "cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings",
    what: "Rust lints, warnings are errors",
    where: "check",
    readme: "Rust lints, warnings are errors",
  },
  {
    id: "cargo-test",
    run: "cargo test --manifest-path src-tauri/Cargo.toml",
    what: "Rust integration tests",
    where: "check",
    readme: "Rust integration tests",
  },
  {
    id: "audit",
    run: "pnpm audit --prod --audit-level=high",
    what: "production dependencies have no high advisory",
    where: "release",
    why: "needs the network, and a new advisory fails a change that did not cause it",
    readme: "Production npm dependencies have no high advisory",
  },
  {
    id: "cargo-audit",
    run: "(cd src-tauri && cargo audit)",
    what: "Rust dependencies have no advisory (ignores in src-tauri/.cargo/audit.toml)",
    where: "release",
    ci: [{ run: "cargo audit", dir: "src-tauri" }],
    why: "needs the network, and a new advisory fails a change that did not cause it",
    readme: "Rust dependencies have no advisory",
  },
  {
    id: "build",
    run: "pnpm exec vite build",
    what: "the production frontend build",
    where: "ci",
    why: "slow; the release builds the app anyway",
    readme: "The production frontend build",
  },
  {
    id: "no-sql-js",
    // As ci.yml: grep's 1 (no match) passes; 0 (a match) and 2 (no dist/assets) fail.
    run: "status=0; grep -rlE 'sql-wasm|initSqlJs' dist/assets || status=$?; [ $status = 1 ]",
    what: "sql.js stays out of the bundle (no match passes; a match or no dist/assets fails)",
    ci: [
      { run: "grep -rlE 'sql-wasm|initSqlJs' dist/assets || status=$?" },
      { run: "[[ $status == 1 ]]" },
    ],
    where: "ci",
    why: "needs the build; scripts/release-macos.sh checks its own bundle",
    readme: "sql.js (E2E only) stays out of the app bundle",
  },
  {
    id: "tz-negative",
    run: "pnpm test",
    env: { TZ: "Pacific/Pago_Pago" },
    what: "the suite in UTC−11",
    where: "ci",
    why: "a second full run of the suite",
    readme: "The suite in a negative time zone",
  },
  {
    id: "tz-positive",
    run: "pnpm vitest run src/lib src/ui src/state",
    env: { TZ: "Pacific/Kiritimati" },
    what: "the layers that read local time, in UTC+14",
    where: "ci",
    why: "a second run of those tests",
    readme: "The layers that read local time, in a positive time zone",
  },
  {
    id: "axe",
    run: "pnpm ux:capture && pnpm ux:axe-check ci",
    env: AXE_EN,
    what: "axe scan of every captured screen: English, light and dark, two window sizes (ADR 0078)",
    where: "ci",
    ci: [
      { run: "pnpm ux:capture --shard ${{ matrix.shard }}/6", env: AXE_EN },
      { run: "pnpm ux:axe-check ci" },
    ],
    why: "slow (six CI shards); run it after UI work",
    readme:
      "axe scan of every screen: English, light and dark, two window sizes",
  },
  {
    id: "axe-i18n",
    run: `pnpm ux:capture --grep ${LAYOUT_TAG} && pnpm ux:axe-check ci-i18n`,
    env: AXE_I18N,
    what: "the layout screens in Czech and Russian: nothing clipped or covered, axe clean (ADR 0158)",
    where: "ci",
    ci: [
      {
        run: `pnpm ux:capture --shard \${{ matrix.shard }}/6 --grep ${LAYOUT_TAG}`,
        env: AXE_I18N,
      },
      { run: "pnpm ux:axe-check ci-i18n" },
    ],
    why: "slow (six CI shards); run it after UI work",
    readme: "The layout screens in Czech and Russian, three window sizes",
  },
  {
    id: "vendored-sqlx",
    run: "bash scripts/check-vendored-sqlx-sqlite.sh",
    what: "Cargo.lock uses the vendored sqlx-sqlite, crates.io 0.8.6 plus one line (ADR 0196)",
    where: "ci",
    why: "downloads the published crate",
    readme:
      "Cargo.lock uses the vendored sqlx-sqlite, which differs from crates.io by one line",
  },
  {
    id: "cargo-build",
    run: "cargo build --manifest-path src-tauri/Cargo.toml",
    what: "the Rust shell builds",
    where: "ci",
    why: "the release builds the app anyway",
    readme: "The Rust shell builds",
  },
  {
    id: "menu-macos",
    run: "cargo test --manifest-path src-tauri/Cargo.toml --test menu_built",
    what: "the AppKit menu as built matches src-tauri/tests/menu_built.txt, on a macOS runner (fails if it skips)",
    where: "ci",
    ci: [
      {
        run: 'cargo test --manifest-path src-tauri/Cargo.toml --test menu_built | tee "$log"',
      },
      {
        run: "if ! grep -qE '^menu_built: [0-9]+ lines match$' \"$log\"; then",
      },
    ],
    why: "`pnpm check` runs it on a Mac (cargo test); the Linux CI runner skips it",
    readme: "The AppKit menu as built matches its pin, on macOS",
  },
  {
    id: "mutation",
    run: "pnpm mutation",
    what: "Stryker mutation score on the engine",
    where: "weekly",
    readme: "Stryker mutation score on the engine",
  },
  {
    id: "bench",
    run: "pnpm bench --outputJson bench.json && pnpm bench:check bench.json",
    what: "engine performance budgets (`pnpm bench:check`)",
    where: "nightly",
    readme: "Engine performance budgets, checked by `pnpm bench:check`",
  },
  {
    id: "properties",
    run: "pnpm exec vitest run",
    env: { FC_RUNS: "2000" },
    what: "every fast-check property test with a new seed",
    where: "nightly",
    readme: "Every fast-check property test with a new seed each night",
  },
  {
    id: "e2e",
    run: "pnpm test:e2e",
    what: "Playwright smoke tests (optional, ADR 0006; e2e.yml)",
    where: "nightly",
    readme: "Playwright smoke tests (optional, ADR 0006; `e2e.yml`)",
  },
];

/** The gates `pnpm check` runs, in order; `release` appends the dependency audits. */
export function select({ release = false } = {}, gates = GATES) {
  return gates.filter(
    (g) => g.where === "check" || (release && g.where === "release"),
  );
}

/** The command as typed in a shell, its variables first. */
export function command(gate) {
  const env = Object.entries(gate.env ?? {}).map(([k, v]) => `${k}=${v}`);
  return [...env, gate.run].join(" ");
}

function shell(gate) {
  const r = spawnSync(gate.run, {
    shell: true,
    stdio: "inherit",
    cwd: ROOT,
    env: { ...process.env, ...gate.env },
  });
  return r.status ?? 1;
}

/** Runs `gates` in order and stops at the first failure: `{ ok, failed? }`. */
export function runGates(gates, { exec = shell, log = console.log } = {}) {
  for (const [i, gate] of gates.entries()) {
    log(`\n==> [${i + 1}/${gates.length}] ${gate.id}: ${command(gate)}`);
    const status = exec(gate);
    if (status !== 0) {
      log(`\ngate "${gate.id}" failed (exit ${status}): ${command(gate)}`);
      return { ok: false, failed: gate.id };
    }
  }
  log(`\nall ${gates.length} gates passed`);
  return { ok: true };
}

// ci.yml lines that set a job up and are no gate (the install is in .github/actions/setup).
// The Playwright browser comes from the cache when it can (#496): a miss downloads it with
// its system libraries, a hit installs only the libraries.
export const CI_SETUP = [
  "pnpm exec playwright install --with-deps chromium",
  "pnpm exec playwright install-deps chromium",
];
// The `if:` a gate step may carry, by gate: only the baseline checks, which need a base
// branch, run on pull requests alone.
const PR_ONLY = "github.event_name == 'pull_request'";
export const CI_STEP_IFS = {
  "depcruise-baseline": [PR_ONLY],
  "size-baseline": [PR_ONLY],
};
// The `if:` a job carries, by role. A work job: the draft guard (a draft PR runs
// nothing), or none. An aggregate (a job with `needs`): exactly the same behind
// `!cancelled()`, so a failed job fails the required check instead of skipping it (a
// skipped required check counts as passed).
const DRAFT_GUARD =
  "github.event_name == 'push' || !github.event.pull_request.draft";
export const CI_JOB_IFS = {
  work: DRAFT_GUARD,
  aggregate: `!cancelled() && (${DRAFT_GUARD})`,
};
/** The line an aggregate runs for each job it needs. */
export const resultCheck = (job) =>
  `[[ "\${{ needs.${job}.result }}" == success ]]`;

const indentOf = (line) => line.search(/\S/);
const unquote = (v) => v.trim().replace(/^(['"])(.*)\1$/, "$2");

/**
 * One step's shell lines, `env`, `if` and keys, from its lines (the first starts "- "),
 * and its `shell` and `working-directory` (`dir`) when it sets them.
 */
function parseStep(lines) {
  const keyIndent = indentOf(lines[0]) + 2;
  const body = [lines[0].replace("- ", "  "), ...lines.slice(1)];
  const step = { lines: [], env: {}, keys: [] };
  for (let i = 0; i < body.length; i++) {
    const m = body[i].match(/^(\s*)([A-Za-z-]+):\s*(.*)$/);
    if (!m || m[1].length !== keyIndent) continue;
    step.keys.push(m[2]);
    const nested = [];
    while (
      i + 1 < body.length &&
      (body[i + 1].trim() === "" || indentOf(body[i + 1]) > keyIndent)
    )
      nested.push(body[++i]);
    const block = nested.map((l) => l.trim()).filter(Boolean);
    const scalar = m[3] && !/^[|>]/.test(m[3]) ? [unquote(m[3])] : block;
    if (m[2] === "run") step.lines = scalar;
    if (m[2] === "if") step.if = scalar.join(" ");
    if (m[2] === "shell") step.shell = scalar.join(" ");
    if (m[2] === "working-directory") step.dir = scalar.join(" ");
    if (m[2] === "env")
      for (const l of nested) {
        const kv = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
        if (kv && !l.trim().startsWith("#")) step.env[kv[1]] = unquote(kv[2]);
      }
  }
  return step;
}

/**
 * Every step of a workflow: `{ job, shards, lines, env, if, keys }`, block scalars and
 * step `env` included. `shards`: the job's `matrix.shard` list, or null.
 */
export function workflowSteps(yaml) {
  const steps = [];
  let job = null;
  let shards = null;
  let stepIndent = -1;
  let current = null;
  const flush = () => {
    if (current) steps.push({ job, shards, ...parseStep(current) });
    current = null;
  };
  for (const line of yaml.split("\n")) {
    const jobHead = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if (jobHead) {
      flush();
      [job, shards, stepIndent] = [jobHead[1], null, -1];
      continue;
    }
    const matrix = line.match(/^\s+shard:\s*\[([^\]]*)\]/);
    if (matrix && stepIndent < 0)
      shards = matrix[1].split(",").map((s) => s.trim());
    const m = line.match(/^(\s*)steps:\s*$/);
    if (m) {
      flush();
      stepIndent = m[1].length + 2;
      continue;
    }
    if (stepIndent < 0) continue;
    const text = line.trim();
    const indent = indentOf(line);
    if (text === "" || text.startsWith("#")) {
      // A comment at the steps' own indent sits between steps.
      if (current && (text === "" || indent > stepIndent)) current.push(line);
      continue;
    }
    if (indent < stepIndent) {
      flush();
      stepIndent = -1;
    } else if (indent === stepIndent && text.startsWith("- ")) {
      flush();
      current = [line];
    } else if (current) current.push(line);
  }
  flush();
  return steps;
}

// A small YAML reader for the workflow subset: maps, `- ` lists, `[a, b]` flow lists,
// `|` / `>` block scalars, quoted scalars and comments. No anchors, no flow maps.
const KEY = /^\s*([A-Za-z0-9_-]+):(?:\s+(.*))?$/;
const isListItem = (line) => /^\s*-(\s|$)/.test(line);
const skipNoise = (lines, i) => {
  while (i < lines.length && /^\s*(#.*)?$/.test(lines[i])) i++;
  return i;
};

/** A plain scalar: unquoted, its trailing comment dropped, a `[a, b]` flow list split. */
function scalar(text) {
  const quoted = text.trim().match(/^(['"])(.*?)\1(\s+#.*)?$/);
  if (quoted) return quoted[2];
  const t = text.replace(/\s+#.*$/, "").trim();
  const flow = t.match(/^\[(.*)\]$/);
  if (flow)
    return flow[1]
      .split(",")
      .map(unquote)
      .filter((v) => v !== "");
  return t === "{}" ? {} : unquote(t);
}

/** The value of a key with nothing after its colon: the block below it, or null. */
function nested(lines, i, at) {
  const j = skipNoise(lines, i);
  const below =
    j < lines.length &&
    (indentOf(lines[j]) > at ||
      (indentOf(lines[j]) === at && isListItem(lines[j])));
  if (!below) return [null, i];
  const indent = indentOf(lines[j]);
  return isListItem(lines[j]) ? list(lines, j, indent) : map(lines, j, indent);
}

/** The map whose keys sit at indent `at`, from line `i`: `[value, next line]`. */
function map(lines, i, at) {
  const out = {};
  for (i = skipNoise(lines, i); i < lines.length; i = skipNoise(lines, i)) {
    const indent = indentOf(lines[i]);
    if (indent < at || (indent === at && isListItem(lines[i]))) break;
    const m = indent === at && lines[i].match(KEY);
    i++;
    if (!m) continue;
    const [, key, rest = ""] = m;
    if (/^[|>]/.test(rest)) {
      const body = [];
      while (
        i < lines.length &&
        (lines[i].trim() === "" || indentOf(lines[i]) > at)
      )
        body.push(lines[i++].trim());
      out[key] = body.filter(Boolean).join(rest[0] === "|" ? "\n" : " ");
    } else if (rest !== "") out[key] = scalar(rest);
    else [out[key], i] = nested(lines, i, at);
  }
  return [out, i];
}

/** The list whose `- ` items sit at indent `at`, from line `i`: `[value, next line]`. */
function list(lines, i, at) {
  const out = [];
  for (i = skipNoise(lines, i); i < lines.length; i = skipNoise(lines, i)) {
    const indent = indentOf(lines[i]);
    if (indent < at || (indent === at && !isListItem(lines[i]))) break;
    if (indent > at) {
      i++;
      continue;
    }
    const item = lines[i].trim().slice(1).trim();
    if (KEY.test(item)) {
      // `- key: v` opens a map whose keys sit two columns in.
      const line = lines[i];
      lines[i] = line.replace("-", " ");
      const [value, next] = map(lines, i, at + 2);
      lines[i] = line;
      out.push(value);
      i = next;
    } else {
      out.push(item === "" ? null : scalar(item));
      i++;
    }
  }
  return [out, i];
}

/** A workflow as nested maps, lists and strings (the subset above). */
export function yamlTree(yaml) {
  const lines = yaml.split("\n");
  return map(lines, skipNoise(lines, 0), 0)[0];
}

const asMap = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

/**
 * A workflow's job-level settings: `{ env, defaults, jobs }`, `env` and `defaults` the
 * workflow's own; per job `{ keys, if, needs, env, defaults, matrix }`, `needs` a list,
 * `matrix` or null.
 */
export function workflowJobs(yaml) {
  const tree = asMap(yamlTree(yaml));
  const jobs = Object.entries(asMap(tree.jobs)).map(([id, raw]) => {
    const job = asMap(raw);
    return [
      id,
      {
        keys: Object.keys(job),
        if: job.if,
        needs: [job.needs ?? []].flat(),
        env: asMap(job.env),
        defaults: asMap(job.defaults),
        matrix: asMap(job.strategy).matrix ?? null,
      },
    ];
  });
  return {
    env: asMap(tree.env),
    defaults: asMap(tree.defaults),
    jobs: Object.fromEntries(jobs),
  };
}

/** Every combination of a matrix's values, `include` / `exclude` aside; `[{}]` for none. */
function matrixRuns(matrix) {
  let runs = [{}];
  if (!matrix || typeof matrix !== "object") return runs;
  for (const [key, values] of Object.entries(matrix))
    if (key !== "include" && key !== "exclude" && Array.isArray(values))
      runs = runs.flatMap((r) => values.map((v) => ({ ...r, [key]: v })));
  return runs;
}

const MATRIX_REF = /\$\{\{\s*matrix\.([A-Za-z0-9_-]+)\s*\}\}/g;

/** A step once per matrix combination when its env reads `${{ matrix.* }}`, else once. */
function perMatrixRun(step, matrix) {
  if (!Object.values(step.env).some((v) => /\$\{\{\s*matrix\./.test(v)))
    return [step];
  return matrixRuns(matrix).map((run) => ({
    ...step,
    env: Object.fromEntries(
      Object.entries(step.env).map(([k, v]) => [
        k,
        String(v).replace(MATRIX_REF, (ref, key) => run[key] ?? ref),
      ]),
    ),
  }));
}

/**
 * The ci.yml steps a gate stands for: exact shell lines with their step `env` and, when
 * not the repository root, their `dir`.
 */
export const ciSteps = (g) => g.ci ?? [{ run: g.run, env: g.env }];

const sameEnv = (a = {}, b = {}) =>
  JSON.stringify(Object.entries(a).sort()) ===
  JSON.stringify(Object.entries(b).sort());

/** A step as it runs: `env`, `shell` and `dir` with the job's and the workflow's. */
function asRun(step, workflow) {
  const job = workflow.jobs[step.job] ?? { env: {}, defaults: {} };
  const run = (key) =>
    asMap(job.defaults.run)[key] ?? asMap(workflow.defaults.run)[key];
  const shell = step.shell ?? run("shell");
  const dir = step.dir ?? run("working-directory");
  return {
    ...step,
    env: { ...workflow.env, ...job.env, ...step.env },
    ...(shell === undefined ? {} : { shell }),
    ...(dir === undefined ? {} : { dir }),
  };
}

/**
 * What is wrong with an aggregate's own steps: each job it needs must have its
 * `resultCheck` line, in a step with no `if:` and no continue-on-error.
 */
function aggregateProblems(id, job, steps) {
  const own = steps.filter(
    (s) =>
      s.job === id &&
      s.if === undefined &&
      !s.keys.includes("continue-on-error"),
  );
  return job.needs
    .filter((n) => !own.some((s) => s.lines.includes(resultCheck(n))))
    .map((n) => `job ${id} does not check \`${resultCheck(n)}\``);
}

/** What is wrong with the jobs themselves: `[]` when nothing. */
function jobProblems(workflow, steps, jobIfs) {
  const problems = [];
  for (const [id, job] of Object.entries(workflow.jobs)) {
    const aggregate = job.needs.length > 0;
    if (job.keys.includes("continue-on-error"))
      problems.push(`job ${id} has continue-on-error`);
    if (
      aggregate
        ? job.if !== jobIfs.aggregate
        : ![undefined, jobIfs.work].includes(job.if)
    )
      problems.push(
        `job ${id} runs only if \`${job.if ?? "success()"}\`, not \`${aggregate ? jobIfs.aggregate : jobIfs.work}\``,
      );
    if (aggregate) problems.push(...aggregateProblems(id, job, steps));
    for (const key of ["include", "exclude"])
      if (asMap(job.matrix)[key] !== undefined)
        problems.push(
          `job ${id} has a matrix ${key}, which this check cannot read`,
        );
  }
  return problems;
}

/** What is wrong with how a step that runs a gate runs: `[]` when nothing. */
function howItRuns(step, spec, ifs) {
  const line = spec.run;
  const problems = [];
  if (step.shell !== undefined)
    problems.push(`runs in shell \`${step.shell}\``);
  if (step.dir !== spec.dir)
    problems.push(
      `runs in ${step.dir === undefined ? "the repository root" : `\`${step.dir}\``}, not ${spec.dir === undefined ? "the repository root" : `\`${spec.dir}\``}`,
    );
  if (step.keys.includes("continue-on-error"))
    problems.push("has continue-on-error");
  if (step.if !== undefined && !ifs.includes(step.if))
    problems.push(`runs only if \`${step.if}\``);
  const n = line.match(/--shard \$\{\{ matrix\.shard \}\}\/(\d+)/)?.[1];
  const all = Array.from({ length: Number(n) }, (_, i) => String(i + 1));
  if (n && JSON.stringify(step.shards) !== JSON.stringify(all))
    problems.push(
      `runs shards [${step.shards ?? ""}] of ${n}, not [${all.join(", ")}]`,
    );
  return problems;
}

/**
 * Where a workflow and the list disagree:
 * - a gate with no step that runs its exact line with exactly its variables (a step env
 *   value that reads `${{ matrix.x }}` counts once per matrix value);
 * - a gate step with continue-on-error, an unknown `if:`, a `shell:`, a
 *   `working-directory` other than its `dir`, or a shard list that does not match the
 *   `/N` of its `--shard`; `env`, `shell` and `working-directory` as the job and the
 *   workflow set them too;
 * - a job with continue-on-error, an `if:` other than its role's in `jobIfs`, or a
 *   matrix `include` / `exclude`;
 * - an aggregate (a job with `needs`) that does not check `needs.<job>.result` is
 *   `success` for every job it needs;
 * - a pnpm / cargo / node / bash / npx / sh / npm / yarn line that is no gate and no setup.
 */
export function ciDrift(
  yaml,
  {
    gates = GATES,
    setup = CI_SETUP,
    ifs = CI_STEP_IFS,
    jobIfs = CI_JOB_IFS,
  } = {},
) {
  const workflow = workflowJobs(yaml);
  const raw = workflowSteps(yaml);
  const steps = raw.flatMap((s) =>
    perMatrixRun(asRun(s, workflow), workflow.jobs[s.job]?.matrix),
  );
  const listed = gates.filter(
    (g) => g.where !== "nightly" && g.where !== "weekly",
  );
  const problems = jobProblems(workflow, raw, jobIfs);
  for (const g of listed)
    for (const spec of ciSteps(g)) {
      const found = steps.filter((s) => s.lines.includes(spec.run));
      const same = found.filter((s) => sameEnv(s.env, spec.env));
      if (found.length === 0)
        problems.push(`${g.id}: no step runs \`${spec.run}\``);
      else if (same.length === 0)
        problems.push(
          `${g.id}: \`${spec.run}\` runs with env ${JSON.stringify(found[0].env)}, expected ${JSON.stringify(spec.env ?? {})}`,
        );
      for (const s of same)
        for (const p of howItRuns(s, spec, ifs[g.id] ?? []))
          problems.push(`${g.id}: the \`${spec.run}\` step ${p}`);
    }
  const known = new Set([
    ...listed.flatMap((g) => ciSteps(g).map((s) => s.run)),
    ...setup,
  ]);
  for (const s of steps)
    for (const l of s.lines)
      if (/^(pnpm|cargo|node|bash|npx|sh|npm|yarn) /.test(l) && !known.has(l))
        problems.push(`a step in ${s.job} runs \`${l}\`, which is no gate`);
  // A matrix job's step counts once per matrix value: one message each.
  return [...new Set(problems)];
}

const code = (s) => `\`${s.replaceAll("|", "\\|")}\``;

/** The CONTRIBUTING.md block: the local gates, the release extras, what only CI runs. */
export function renderContributing(gates = GATES) {
  const table = (rows) => [
    "| Command | What it checks | Why not in `pnpm check` |",
    "| --- | --- | --- |",
    ...rows.map((g) => `| ${code(command(g))} | ${g.what} | ${g.why} |`),
  ];
  return [
    "| `pnpm check` runs | What it checks |",
    "| --- | --- |",
    ...select({}, gates).map((g) => `| ${code(command(g))} | ${g.what} |`),
    "",
    "`pnpm check:release` adds the dependency audits, which CI runs too:",
    "",
    ...table(gates.filter((g) => g.where === "release")),
    "",
    "CI also runs:",
    "",
    ...table(gates.filter((g) => g.where === "ci")),
  ].join("\n");
}

const RUNS = {
  check: "`pnpm check`, CI",
  release: "`pnpm check:release`, CI",
  ci: "CI",
  nightly: "Nightly",
  weekly: "Weekly",
};

/** The README.md table: every gate, with where it runs. */
export function renderReadme(gates = GATES) {
  return [
    "| Command | Checks | Runs in |",
    "| --- | --- | --- |",
    ...gates.map(
      (g) =>
        `| ${code(command(g))} | ${g.readme ?? g.what} | ${RUNS[g.where]} |`,
    ),
  ].join("\n");
}

/** `text` with the lines between `<!-- name:start -->` and `<!-- name:end -->` replaced. */
export function replaceBlock(text, body, name = "gates") {
  const start = `<!-- ${name}:start -->`;
  const end = `<!-- ${name}:end -->`;
  const i = text.indexOf(start);
  const j = text.indexOf(end);
  if (i < 0 || j < i) throw new Error(`needs ${start} … ${end}`);
  return `${text.slice(0, i + start.length)}\n\n${body}\n\n${text.slice(j)}`;
}

/** The two documents as they are and as the list says they should be (formatted). */
export async function generateDocs(root = ROOT, gates = GATES) {
  const docs = [
    ["CONTRIBUTING.md", renderContributing(gates)],
    ["README.md", renderReadme(gates)],
  ];
  return Promise.all(
    docs.map(async ([file, body]) => {
      const path = `${root}${file}`;
      const current = readFileSync(path, "utf8");
      const expected = await format(replaceBlock(current, body), {
        ...(await resolveConfig(path)),
        filepath: path,
      });
      return { file, path, current, expected };
    }),
  );
}

async function main(args) {
  if (args.includes("--write-docs")) {
    for (const d of await generateDocs())
      if (d.current !== d.expected) {
        writeFileSync(d.path, d.expected);
        console.log(`${d.file}: gate table written`);
      } else console.log(`${d.file}: gate table is current`);
    return 0;
  }
  const gates = select({ release: args.includes("--release") });
  if (args.includes("--list")) {
    for (const g of gates) console.log(`${g.id.padEnd(20)}${command(g)}`);
    return 0;
  }
  return runGates(gates).ok ? 0 : 1;
}

// realpath: a symlinked checkout must still run the CLI, not silently do nothing.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
)
  process.exit(await main(process.argv.slice(2)));
