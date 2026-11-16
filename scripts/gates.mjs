// The one list of gates (#461): what a change must pass, where each gate runs, and the
// command that runs it. `pnpm check` runs the local gates in order and stops at the first
// failure; `pnpm check:release` adds the two dependency audits (scripts/release-macos.sh).
// The gate tables in CONTRIBUTING.md and README.md are generated from this list
// (`pnpm gates:docs`), and scripts/__tests__/gates.test.mjs checks them, CLAUDE.md §6, the
// PR template, the release script and ci.yml against it.
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
 * are not gates of their own. `ci`: the commands ci.yml runs for it, when not `run`.
 * `env`: variables set for the command. `readme`: shorter text for the README table.
 */
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
    ci: ["cargo audit"],
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
    run: "grep -rlE 'sql-wasm|initSqlJs' dist/assets",
    what: "sql.js stays out of the bundle (fails on a match)",
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
    what: "axe scan of every captured screen (ADR 0078)",
    where: "ci",
    ci: [
      "pnpm ux:capture --shard",
      "pnpm ux:axe-check ci",
      "pnpm ux:axe-check ci-i18n",
    ],
    why: "slow (four CI shards); run it after UI work",
    readme:
      "axe scan of every screen: English, light and dark, two window sizes; layout screens in Czech and Russian",
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
    run: "pnpm bench",
    what: "engine performance budgets (`pnpm bench:check`)",
    where: "nightly",
    readme: "Performance budgets",
  },
  {
    id: "properties",
    run: "pnpm exec vitest run",
    env: { FC_RUNS: "2000" },
    what: "every fast-check property test with a new seed",
    where: "nightly",
    readme: "Every fast-check property test with a new seed each night",
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
