// The one list of gates (#461): what a change must pass, where each gate runs, and the
// command that runs it. `pnpm check` runs the local gates in order and stops at the first
// failure; `pnpm check:release` adds the two dependency audits (scripts/release-macos.sh).
// The gate tables in CONTRIBUTING.md and README.md are generated from this list
// (`pnpm gates:docs`), and scripts/__tests__/gates.test.mjs checks them, CLAUDE.md §6, the
// PR template, the release script and ci.yml against it.
//
// The ci.yml check (`ciDrift`) reads each step outside the docs fast path: its exact
// shell lines, its `env`, `continue-on-error`, its `if:` and its job's shard matrix. It
// does not see a `shell:` override, job- or workflow-level `env`, or an edit inside a
// multi-line script that keeps the gate's own line (an `exit 0` before it, say). #459,
// which owns the workflows, may revisit that.
//
//   node scripts/gates.mjs               run the check gates
//   node scripts/gates.mjs --release     … and the two dependency audits
//   node scripts/gates.mjs --list        print the gates it would run
//   node scripts/gates.mjs --write-docs  regenerate the CONTRIBUTING.md and README.md tables
import { spawnSync } from "node:child_process";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { format, resolveConfig } from "prettier";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

/**
 * One gate. `where`: `check` runs in `pnpm check` and CI; `release` also in
 * `pnpm check:release` and CI; `ci` in CI only (`why` says why it is not local);
 * `nightly` in the nightly workflow. `covers`: commands this gate already runs, so they
 * are not gates of their own. `ci`: the steps ci.yml runs for it, each `{ run, env }`
 * with the exact shell line and the step's variables, when not `{ run, env }` of the gate
 * itself. `env`: variables set for the command. `readme`: text for the README table.
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
const LAYOUT_SCREENS =
  "01-dashboard|03-dashboard-asof-5y|03b-dashboard-real-asof-5y|14-properties-long-name|20-property-detail|20b-property-detail-asof-5y|27-property-section-nav-focus|42-scenarios-compare";

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
    what: "ESLint with zero warnings (engine purity, function sizes #456); stylesheets (lint:css)",
    where: "check",
    readme:
      "ESLint with zero warnings, incl. engine-purity rules; function sizes; stylesheets",
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
    // CI runs the parity tests as a step of their own too, so a parity break reads at a glance.
    ci: [{ run: "pnpm test:coverage" }, { run: "pnpm test:parity" }],
    readme:
      "Vitest tests with per-folder coverage floors, incl. the parity targets (±1 Kč, ±0.0001)",
  },
  {
    id: "coverage-ratchet",
    run: "pnpm coverage:ratchet",
    what: "no floor more than 3 points below measured",
    where: "check",
    readme: "No coverage floor more than 3 points below measured",
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
    ci: [{ run: "cargo audit" }],
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
      { run: "pnpm ux:capture --shard ${{ matrix.shard }}/4", env: AXE_EN },
      { run: "pnpm ux:axe-check ci" },
    ],
    why: "slow (four CI shards); run it after UI work",
    readme:
      "axe scan of every screen: English, light and dark, two window sizes",
  },
  {
    id: "axe-i18n",
    run: `pnpm ux:capture --grep "${LAYOUT_SCREENS}" && pnpm ux:axe-check ci-i18n`,
    env: AXE_I18N,
    what: "the layout screens in Czech and Russian: nothing clipped or covered, axe clean (ADR 0158)",
    where: "ci",
    ci: [
      {
        run: `pnpm ux:capture --shard \${{ matrix.shard }}/4 --grep "${LAYOUT_SCREENS}"`,
        env: AXE_I18N,
      },
      { run: "pnpm ux:axe-check ci-i18n" },
    ],
    why: "slow (four CI shards); run it after UI work",
    readme: "The layout screens in Czech and Russian, three window sizes",
  },
  {
    id: "vendored-sqlx",
    run: "bash scripts/check-vendored-sqlx-sqlite.sh",
    what: "the vendored sqlx-sqlite is crates.io 0.8.6 plus one line (ADR 0196)",
    where: "ci",
    why: "downloads the published crate",
    readme: "The vendored sqlx-sqlite differs from crates.io by one line",
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
    id: "mutation",
    run: "pnpm mutation",
    what: "Stryker mutation score on the engine",
    where: "nightly",
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

// ci.yml lines that set a job up and are no gate. The docs fast path's subset of the suite
// goes when #459 removes the fast path.
export const CI_SETUP = [
  "pnpm install --frozen-lockfile",
  "pnpm exec playwright install --with-deps chromium",
  'bash "$RUNNER_TEMP/ci-changes.sh"',
];
// The docs fast path repeats some gate lines; a gate must run in the full jobs, so its
// lines count as setup, never as the gate (#459 decides its future).
export const CI_SETUP_JOBS = ["docs"];
// The one `if:` a gate step may carry: the baseline checks need a base branch.
export const CI_STEP_IFS = ["github.event_name == 'pull_request'"];

const indentOf = (line) => line.search(/\S/);
const unquote = (v) => v.trim().replace(/^(['"])(.*)\1$/, "$2");

/** One step's shell lines, `env`, `if` and keys, from its lines (the first starts "- "). */
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

/** The ci.yml steps a gate stands for: exact shell lines with their step `env`. */
export const ciSteps = (g) => g.ci ?? [{ run: g.run, env: g.env }];

const sameEnv = (a = {}, b = {}) =>
  JSON.stringify(Object.entries(a).sort()) ===
  JSON.stringify(Object.entries(b).sort());

/** What is wrong with how a step that runs a gate runs: `[]` when nothing. */
function howItRuns(step, line, ifs) {
  const problems = [];
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
 * Where a workflow and the list disagree, outside the setup jobs:
 * - a gate with no step that runs its exact line with exactly its variables;
 * - a gate step with continue-on-error, an unknown `if:`, or a shard list that does not
 *   match the `/N` of its `--shard`;
 * - a pnpm / cargo / node / bash / npx line that is no gate and no setup.
 */
export function ciDrift(
  yaml,
  {
    gates = GATES,
    setup = CI_SETUP,
    setupJobs = CI_SETUP_JOBS,
    ifs = CI_STEP_IFS,
  } = {},
) {
  const steps = workflowSteps(yaml).filter((s) => !setupJobs.includes(s.job));
  const listed = gates.filter((g) => g.where !== "nightly");
  const problems = [];
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
        for (const p of howItRuns(s, spec.run, ifs))
          problems.push(`${g.id}: the \`${spec.run}\` step ${p}`);
    }
  const known = new Set([
    ...listed.flatMap((g) => ciSteps(g).map((s) => s.run)),
    ...setup,
  ]);
  for (const s of steps)
    for (const l of s.lines)
      if (/^(pnpm|cargo|node|bash|npx) /.test(l) && !known.has(l))
        problems.push(`a step in ${s.job} runs \`${l}\`, which is no gate`);
  return problems;
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
