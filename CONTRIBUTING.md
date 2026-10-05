# Contributing

Thanks for your interest! Bug reports, ideas and pull requests are welcome — please open an
[issue](https://github.com/vlastimilbures/real-estate-tracker/issues) first for anything larger
than a small fix, so we can agree on the approach. The project is maintained by one person,
so reviews may take a few days.

These notes cover setting up, the checks every change must pass, how commits are written and
how decisions are made. The hard engineering
rules (pure engine, decimal money, one-way data flow) are in [CLAUDE.md](CLAUDE.md) §4–§5 and
apply to human and AI-assisted changes alike.

## Setup

1. Install the Xcode Command Line Tools (`xcode-select --install`) and Rust via
   [rustup](https://rustup.rs). `rust-toolchain.toml` pins the Rust version and installs
   `rustfmt` and `clippy` on first use.
2. Use Node ≥ 24 and pnpm ≥ 11.5 (`package.json` → `engines`, `packageManager`;
   `corepack enable` provides the pinned pnpm).
3. `pnpm install --frozen-lockfile` — the lockfile is authoritative; `prepare` installs the
   husky git hooks.
4. `pnpm tauri dev` runs the app. It opens the real database in
   `~/Library/Application Support/com.bures.realestate-tracker/`: if you keep real data there,
   **export a backup first** (Settings → Backup & Restore). There is no separate development database (ADR 0012).

For UI work without touching the real database, `pnpm ux:capture` renders every screen in
a plain browser against an in-memory, synthetic seed (sql.js, frozen clock) and runs an axe
scan; the Playwright smoke tests use the same in-memory adapter (`src/data/browserSql.ts`,
reached only through the `VITE_E2E` gate).

## Checks

A change is done when all of these pass (CI runs the same commands on Linux; see the table in
the [README](README.md#quality)):

```bash
pnpm typecheck
pnpm lint                       # zero warnings
pnpm exec prettier --check .
pnpm depcruise                  # layer rules, no runtime cycles
pnpm knip                       # no unused files, exports or dependencies
pnpm test:coverage              # full suite + per-folder coverage floors
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

It is also done only when the **docs impact** is checked: if the change touches formulas,
presets, limits, data formats or UI text, SPEC, the Guide strings, README, the user docs
(`docs/model-limitations.md`, `docs/data-safety.md`, `docs/csv-import.md`) and the roadmap
still describe it. Which document owns what is listed in
[docs/release.md](docs/release.md#who-owns-what).

- **Git hooks** (husky + lint-staged): on commit, staged files are formatted, linted and their
  related Vitest tests run; on push, the full typecheck runs. A green CI run is required to
  merge — do not bypass the hooks.
- **Coverage floors** live in `vite.config.ts` (`src/engine` 95 % lines, `src/ui/model` 94 %,
  and so on). Raise a floor when coverage rises; never lower one to pass.
- **Mutation testing** (ADR 0026): `pnpm mutation` runs Stryker on `src/engine`. CI runs it
  nightly when main changed. Runs are incremental: only mutants in changed code or tests are
  retested against the last result (`reports/mutation/stryker-incremental.json`, cached in
  CI); `pnpm mutation --force` retests every mutant. `thresholds.break` in
  `stryker.config.json` is the floored baseline score; raise it, never lower it.
- **Performance budgets** (ADR 0066, ADR 0073): `pnpm bench` times the engine; 20 properties
  p99 ≤ 150 ms for one recompute and ≤ 450 ms for a 3-scenario compare. The nightly run fails
  when a p99 exceeds twice its budget (`pnpm bench:check`); check the budgets themselves
  locally after an engine change.
- **Property tests** (#232): the random loan-event tests run at a fixed seed in PR CI
  (`loan-event-invariants.test.ts` 200 runs, `reference/loanEvents.property.test.ts` 80).
  The nightly run repeats both at 2000 runs with the UTC date as the seed and prints that
  seed. Reproduce a failure with
  `FC_SEED=<seed> FC_RUNS=2000 pnpm exec vitest run <file>`. A failure there is an engine
  or harness bug: fix it, or file it and exclude its shape with the issue ID (`fc.pre`).
  Never lower the runs to pass.
- **Accessibility** (ADR 0078): CI's `axe` job runs `pnpm ux:capture` (English, light + dark,
  1280×800 + minimum window) and `pnpm ux:axe-check ci`, which fails on any axe violation.
  Run the same locally after UI work; a new screen or state gets a capture entry.
- **E2E** (`pnpm test:e2e`, Playwright) is optional (ADR 0006): keep the existing tests green;
  they run in CI only on manual dispatch.
- **Rust integration tests** (`cargo test`) run in CI, locally and in
  `scripts/release-macos.sh` when run without `--skip-checks`. One timing-dependent H-14 probe
  is `#[ignore]`d (DR-169); `cargo test -- --ignored` runs it.

### Architecture rules and the baseline

`.dependency-cruiser.cjs` encodes the layer map (ADR 0072): the engine may import only
`decimal.js` and `src/lib/money.ts`; Tauri calls live in `src/platform`; the UI reaches data,
import and platform only through `src/state` (the facade modules there); no runtime import
cycles. State and UI may import _types_ from any layer.

`.dependency-cruiser-known-violations.json` is empty. A **new** violation fails CI. Fix it;
do not regenerate the baseline to make it pass — on a pull request,
`pnpm depcruise:baseline-check` fails when the baseline gained an entry against the base
branch.

## Engine and parity

- Write engine tests first. Engine changes keep the parity tests green: money within ±1 Kč,
  ratios within ±0.0001 of the targets in `.claude/rules/engine-parity.md`. A mismatch is an
  engine bug, not a target to adjust.
- A target changes only through an accepted ADR under the Czech-practice rule (ADR 0003): add
  an old → new row to the target change log, update `src/engine/__tests__/support/seed.ts` and
  the golden-master snapshot (`vitest -u` for that change only, ADR 0039) in the same commit.
- Never use `.only` / `.skip` / `.todo`, and never weaken an assertion or widen a tolerance to
  pass. Where today's behaviour is known to be wrong, assert today's output with a comment
  citing the issue or roadmap item; `it.fails` is allowed only with such a reference.

## Decisions

Decisions are Architecture Decision Records in [`docs/adr/`](docs/adr/README.md). Write one
(status **Proposed**) and get it accepted by the maintainer before shipping:

- any change to a computed number or other user-visible behaviour — messages, limits,
  rejections, exports, UI (ADR 0001), together with a failing test written first;
- a new or upgraded **runtime** dependency, with a written justification (ADR 0002). Dev-only
  tools are fine without one. Dependabot opens grouped weekly updates; review a runtime bump
  as a decision.

Refactors are behaviour-neutral and need no ADR.

## Commits and pull requests

- [Conventional Commits](https://www.conventionalcommits.org/): `feat`, `fix`, `refactor`,
  `test`, `docs`, `ci`, `build`, `chore`, `style`, `perf`, with a scope
  (`fix(engine): …`).
- One logical change per commit. A refactor and a behaviour change never share a commit.
- Reference the decision in a footer: `Refs: ADR 0023` (programme-era commits use `D-nn`,
  `DR-nnn`, `UX-nnn`).
- Add user-visible changes to the `[Unreleased]` section of [CHANGELOG.md](CHANGELOG.md).
- Open a PR against `main`; merge only when CI is green.

## Protecting real data

- Tests use synthetic fixtures only. Never copy the real database, bank statements or
  screenshots of real data into the repository.
- Before launching the app against the real database or running a migration, make sure a
  current backup exists. Migrations write a verified pre-migration copy automatically, but
  that is a safety net, not a substitute.

## Technical debt

Known limitations and planned work are summarised in [docs/roadmap.md](docs/roadmap.md); new
findings go to GitHub issues with `file:line` evidence and a one-line fix idea.

## Releasing

See [docs/release.md](docs/release.md).
