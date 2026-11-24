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
reached only through the `VITE_E2E` gate). A UI PR's before/after proof diffs one branch
capture against a shared, cached capture of main (`pnpm ux:baseline`, then `UX_AXE=0
pnpm ux:capture` and `pnpm ux:diff`; see [Proving a UI
change](ux-capture/README.md#proving-a-ui-change)).

## Checks

A change is done when `pnpm check` passes. It runs these gates in order and stops at the
first failure (the list is `scripts/gates.mjs`; `pnpm gates:docs` regenerates this table and
the [README](README.md#quality)'s). CI runs the same commands on Linux.

<!-- gates:start -->

| `pnpm check` runs                                                                | What it checks                                                                         |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `pnpm exec prettier --check .`                                                   | Prettier formatting                                                                    |
| `pnpm typecheck`                                                                 | TypeScript strict: the app, the strict config, ux-capture and the Node config          |
| `pnpm lint`                                                                      | ESLint with zero warnings (engine purity, function sizes #456); stylesheets (lint:css) |
| `pnpm depcruise`                                                                 | layer rules, no runtime cycles                                                         |
| `pnpm depcruise:baseline-check`                                                  | the layer-violation baseline never grows against origin/main                           |
| `pnpm lint:size:baseline-check`                                                  | the function-size baseline never grows against origin/main                             |
| `pnpm knip`                                                                      | no unused files, exports or dependencies                                               |
| `pnpm knip:prod`                                                                 | the shipped app only: an export only tests use is dead                                 |
| `pnpm adr:check`                                                                 | the ADR index is current, Amends / Supersedes links paired                             |
| `pnpm test:coverage`                                                             | full suite + per-folder coverage floors (includes test:parity)                         |
| `pnpm coverage:ratchet`                                                          | no floor more than 3 points below measured                                             |
| `cargo fmt --check --manifest-path src-tauri/Cargo.toml`                         | Rust formatting                                                                        |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` | Rust lints, warnings are errors                                                        |
| `cargo test --manifest-path src-tauri/Cargo.toml`                                | Rust integration tests                                                                 |

`pnpm check:release` adds the dependency audits, which CI runs too:

| Command                                | What it checks                                                              | Why not in `pnpm check`                                                    |
| -------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `pnpm audit --prod --audit-level=high` | production dependencies have no high advisory                               | needs the network, and a new advisory fails a change that did not cause it |
| `(cd src-tauri && cargo audit)`        | Rust dependencies have no advisory (ignores in src-tauri/.cargo/audit.toml) | needs the network, and a new advisory fails a change that did not cause it |

CI also runs:

| Command                                                                                                                                             | What it checks                                                                            | Why not in `pnpm check`                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `pnpm exec vite build`                                                                                                                              | the production frontend build                                                             | slow; the release builds the app anyway                         |
| `status=0; grep -rlE 'sql-wasm\|initSqlJs' dist/assets \|\| status=$?; [ $status = 1 ]`                                                             | sql.js stays out of the bundle (no match passes; a match or no dist/assets fails)         | needs the build; scripts/release-macos.sh checks its own bundle |
| `TZ=Pacific/Pago_Pago pnpm test`                                                                                                                    | the suite in UTC−11                                                                       | a second full run of the suite                                  |
| `TZ=Pacific/Kiritimati pnpm vitest run src/lib src/ui src/state`                                                                                    | the layers that read local time, in UTC+14                                                | a second run of those tests                                     |
| `UX_RUN_ID=ci UX_LANG=en UX_THEME=both UX_VIEWPORT=1280x800,min pnpm ux:capture && pnpm ux:axe-check ci`                                            | axe scan of every captured screen: English, light and dark, two window sizes (ADR 0078)   | slow (four CI shards); run it after UI work                     |
| `UX_RUN_ID=ci-i18n UX_LANG=cs,ru UX_THEME=light UX_VIEWPORT=1280x800,1200x800,min pnpm ux:capture --grep @layout-i18n && pnpm ux:axe-check ci-i18n` | the layout screens in Czech and Russian: nothing clipped or covered, axe clean (ADR 0158) | slow (four CI shards); run it after UI work                     |
| `bash scripts/check-vendored-sqlx-sqlite.sh`                                                                                                        | Cargo.lock uses the vendored sqlx-sqlite, crates.io 0.8.6 plus one line (ADR 0196)        | downloads the published crate                                   |
| `cargo build --manifest-path src-tauri/Cargo.toml`                                                                                                  | the Rust shell builds                                                                     | the release builds the app anyway                               |

<!-- gates:end -->

The release (`scripts/release-macos.sh`) runs `pnpm check:release`.

It is also done only when the **docs impact** is checked: if the change touches formulas,
presets, limits, data formats or UI text, SPEC, the Guide strings, README, the user docs
(`docs/model-limitations.md`, `docs/data-safety.md`, `docs/csv-import.md`) and the roadmap
still describe it. Which document owns what is listed in
[docs/release.md](docs/release.md#who-owns-what).

- **Git hooks** (husky + lint-staged): on commit, staged files are formatted (`.mjs`, `.cjs`
  and `.html` included), linted (`.mjs` and `.cjs` included, not `.html`) and their related
  Vitest tests run; on push, the full typecheck, `pnpm depcruise`, `pnpm knip`,
  `pnpm knip:prod` and `pnpm adr:check` run. A green CI run is required to merge — do not
  bypass the hooks.
- **Stylesheets** (#460): `pnpm lint:css` runs stylelint (`stylelint.config.mjs`: no
  selector defined twice in one context, no duplicate property except a consecutive
  fallback, no `!important`, no hex colour outside `tokens.css`, `z-index` only from a
  `--z-*` token, `font-size` only from an `--fs-*` token, `font` only `inherit`) and
  `scripts/css-dead-classes.mjs` (every class in a `src/ui` stylesheet occurs in a `.ts` /
  `.tsx` file, and every custom property is both defined and used). A class built at run
  time goes in its `RUNTIME_PREFIXES` (a prefix whose classes are all built) or
  `RUNTIME_CLASSES` (one built class), with the file that builds it; never add one to
  silence a dead class. Text in comments does not count as a use. The `--rdp-*`
  properties are exempt from "used": we only set them, and react-day-picker's own
  stylesheet reads them. A needed `!important` gets a
  `stylelint-disable-next-line … -- reason` comment.
- **Coverage floors** live in `coverage-floors.json` (per folder, lines and branches). Never
  lower one to pass. CI runs `pnpm coverage:ratchet` after `pnpm test:coverage` and fails when
  a floor sits more than the slack (`MAX_SLACK` in `scripts/check-coverage-ratchet.mjs`, 3
  points) below measured. Raise it then, to measured minus 1-2 points of headroom, so the
  next small dip in coverage does not fail the floor.
- **Test refactors** (#458) prove that no test was dropped or weakened. Run the suite in
  each checkout (base and head), then compare from the head:

  ```bash
  TEST_AUDIT=1 pnpm exec vitest run --maxWorkers=2 --includeTaskLocation --reporter=json --outputFile=<base|head>.json
  node scripts/test-audit.mjs base.json head.json --base-dir <base checkout>
  ```

  It requires every base test on the head, all passing, each with the same assertion count
  (`src/__tests__/setup/audit.ts` records it). A `waitFor(() => expect(…))` counts every
  retry, so its count can move with timing: every test that calls `waitFor`
  (retry-counted, on either side) is re-run alone three times in each checkout, whether
  or not its count differs, and the two sides compare by their lowest count. Any other
  test compares its full-run count with no reruns, so any difference fails. Paste the
  summary into the PR.

- **UI and state tests** (#458) start with both stores in their initial state
  (`src/__tests__/setup/stores.ts`) and with `errorLog` and Tauri core replaced by spies
  over the real functions (`setup/mocks.ts`); set only what differs, and change a spy's
  behaviour with `vi.mocked(…)` rather than a file-level mock (lint rejects one).
  `mockReset()` on a shared spy brings back the real pass-through, not a no-op. Render a
  page on a portfolio with `renderWithPortfolio` (`src/__tests__/support/world.tsx`).
  Engine tests import neither (depcruise).
- **The test clock** (#458): every test outside `src/engine` starts at local noon of
  `PINNED_DAY` (2026-10-01, `src/__tests__/setup/clock.ts`), so no test depends on the day
  the suite runs; engine tests keep the real `Date` (the engine never reads it), and the
  setup restores it for them even when an earlier file's pin lingers (`--no-isolate`). A test
  whose expectations need a given day names it with `setClock("YYYY-MM-DD")`
  (`src/__tests__/support/clock.ts`) in its `beforeEach` or in the test; lint rejects a
  file-level mock of `lib/day`. The pin replaces `Date` only and timers stay real, and the
  clock stands still: move it with `setClock` between two writes that must differ in time.
  A test that needs an exact instant or fake timers still uses `vi.setSystemTime` /
  `vi.useFakeTimers`; `vi.useRealTimers()` brings back the real clock, so a test that
  calls it mid-test calls `setClock(PINNED_DAY)` right after.
- **Mutation testing** (ADR 0026, ADR 0239, ADR 0249): `pnpm mutation` runs Stryker on `src/engine`.
  Runs are incremental: only mutants in changed code or tests are retested against the last
  result (`reports/mutation/stryker-incremental.json`); `pnpm mutation --force` retests every
  mutant. `thresholds.break` in `stryker.config.json` is the floored baseline score; raise it,
  never lower it. CI runs it weekly (Sunday 03:47 UTC) when main changed in the last 7 days,
  and on a manual run of `nightly.yml`, in seven shards
  (`scripts/mutation-shards.mjs`): `schedule-a`/`schedule-b` share the `loan/*` files
  and split `loan/opening.ts` and `loan/pay.ts` at a named top-level function each,
  `validate-a`/`validate-b` take the `validate/` files in two halves, and `projections`,
  `kpis` and `rest` (every other engine file) take whole files. Each shard has its own
  cached result file and no break of its own; the `mutation-score` job merges the shards'
  reports and fails when the combined score is below break or a shard's report is missing.
  Reproduce one shard with `STRYKER_SHARD=<name> pnpm mutation:shard`; a manual run with
  `mutation_cold` skips the cache.
- **Performance budgets** (ADR 0066, ADR 0073, ADR 0172): `pnpm bench` times the engine; 20
  properties p99 ≤ 150 ms for one recompute, ≤ 450 ms for a 3-scenario compare and ≤ 80 ms for
  a schedule build with a recast or a prepayment on every loan. The nightly run fails when a p99
  exceeds twice its budget or the recast build's median exceeds 1.40 × the plain build's
  (`pnpm bench:check`); check the budgets themselves locally after an engine change.
- **Property tests** (#232, #167): every fast-check test takes its seed and run count from
  `fcRuns` (`src/engine/__tests__/support/fcRuns.ts`), so PR CI runs a fixed seed per file
  (for example `loan-event-invariants.test.ts` 200 runs). A new property file gets its own
  `fcRuns(<seed>, <runs>)`; nothing else to register.
  The nightly run repeats the whole suite with them all at 2000 runs, every night, with the
  run's UTC date (`YYYYMMDD`) as the seed, and prints that seed; "Re-run failed jobs" replays
  it. Reproduce a failure with `FC_SEED=<seed> FC_RUNS=2000 pnpm exec vitest run <file>`. A
  failure there is an engine or harness bug: fix it, or file it and exclude its shape with
  the issue ID (`fc.pre`). Never lower the runs to pass.
- **Nightly failures** (#443): a nightly run with a failed, timed-out or cancelled job opens
  one issue labelled `nightly-failure`, or comments on the open one, with the run link, each
  job's result and, when the property job failed or timed out, the seed and the reproduce
  line. The body always names the ref; a new issue opened by a run on another branch also
  names it in the title, and later runs, from any branch, comment on the open issue. Close
  the issue once the cause is fixed.
- **Accessibility** (ADR 0078): CI's `axe` job runs `pnpm ux:capture` (English, light + dark,
  1280×800 + minimum window) and `pnpm ux:axe-check ci`, which fails on any axe violation.
  It also captures the layout screens (`ux-capture/layoutScreens.ts`, tag `@layout-i18n`)
  in Czech and Russian, which fail when a string is clipped or covered (ADR 0158). On CI a
  failed capture is retried once: one that fails twice fails the job; one that passes on the
  retry is flaky, shown as a warning and in the job summary (#496). Run the same locally
  after UI work; a new screen or state gets a `defineScreen` entry in its area's file under
  `ux-capture/screens/`.
- **E2E** (`pnpm test:e2e`, Playwright) is optional (ADR 0006): keep the existing tests green;
  CI runs them nightly and on manual dispatch, never as a merge check. They start their own
  Vite server on port 1440 (`E2E_PORT`), so a running `pnpm tauri dev` does not interfere.
- **Rust integration tests** (`cargo test`) run in CI, locally and in
  `scripts/release-macos.sh` when run without `--skip-checks`. One timing-dependent H-14 probe
  is `#[ignore]`d (ADR 0068, G-4); `cargo test -- --ignored` runs it.

### Architecture rules and the baseline

`.dependency-cruiser.cjs` encodes the layer map (ADR 0072, amended by ADR 0171 and ADR 0244): the engine may import
only `decimal.js`, `src/lib/money.ts` and `src/lib/rules.ts` (which imports only lib/money); Tauri calls live in `src/platform`; the UI reaches data,
import and platform only through `src/state` (the facade modules there); no runtime import
cycles. State and UI may import _types_ from any layer.

`.dependency-cruiser-known-violations.json` is empty. A **new** violation fails CI. Fix it;
do not regenerate the baseline to make it pass — on a pull request,
`pnpm depcruise:baseline-check` fails when the baseline gained an entry against the base
branch.

### Function size and complexity

ESLint caps every function in `src` (tests excluded) by length (`max-lines-per-function`,
blank lines and comments not counted) and `complexity`. The limits live in
`scripts/size-limits.mjs`:

| Zone                          | Lines | Complexity |
| ----------------------------- | ----- | ---------- |
| Components (`src/**/*.tsx`)   | 150   | 15         |
| Other code (`src/**/*.ts`)    | 80    | 12         |
| Engine (`src/engine/**/*.ts`) | 60    | 10         |

Functions over a limit when the rules arrived (#456) are baselined in two files:

- `function-size-baseline.json` records each function's measured lines and complexity,
  keyed by ESLint's name for it (`Function 'Import'`). An unnamed function is keyed by the
  nearest enclosing named function and what it is bound to
  (`Arrow function (useUiStore: create)`, `Arrow function (ScenarioForm > [initialDraft]: useState)`),
  never by line. Functions that still share a key in a file (two `Method 'render'`, two
  `useEffect` callbacks in one component) form a bag, stored as a list from the largest
  down. A bag is checked as a whole: no more entries than the baseline, and no value higher
  than the baseline's at the same rank. So inside one bag a new function can take the place
  of one that was fixed, but never with a higher value or as an extra entry.
- `eslint-suppressions.json` (ESLint's own bulk suppressions) keeps `eslint .` green for
  them, with no inline disables. It counts per file and rule only, and must hold exactly the
  size-rule counts the baseline implies: an entry for any other rule fails the check.

`pnpm lint` runs `pnpm lint:size` after ESLint. It fails when a function is new over a limit,
when a listed one grew, and when one shrank or is gone; then run `pnpm lint:size --update`,
which only lowers or removes baseline entries and rewrites the suppressions from them. Use it
rather than the `--prune-suppressions` that ESLint suggests. On a pull request,
`pnpm lint:size:baseline-check` fails when the baseline gained an entry or a number against
the base branch.

Never add to either file to get a change through: split the function. A decomposition PR runs
`pnpm lint:size --update` and commits both files. A pure move or rename of a baselined file
needs one hand edit: move its entries to the new path in `function-size-baseline.json`, then
run `pnpm lint:size --update`. The base check accepts the move only when the old file is gone
and the new one did not exist on the base branch, with the same keys and no higher values.
Renaming a baselined function needs the same hand edit (rename its key), and the base check
reports it as an added entry: say so in the PR so the reviewer can confirm it is a rename.

## Engine and parity

- Write engine tests first. Engine changes keep the parity tests green: money within ±1 Kč,
  ratios within ±0.0001 of the targets in `.claude/rules/engine-parity.md`. A mismatch is an
  engine bug, not a target to adjust.
- Three regression layers (ADR 0174): the independent reference models in
  `src/engine/__tests__/reference/` (engine-free, written from `SPEC.md`; they check
  correctness), the parity targets (engine values since ADR 0081 for money; they pin the
  sample) and the golden master (detects change, proves nothing correct).
- A new engine output field shows in the golden master's v2 snapshot as added lines only:
  update it in the field's own commit (`vitest -u`) and check the diff has no changed or
  removed line (no tool checks this; the reviewer does). A changed line is a moved number and needs an approved behaviour change
  (ADR 0001).
- A target changes only through an accepted ADR under the Czech-practice rule (ADR 0003): add
  an old → new row to the target change log, update `src/engine/__tests__/support/seed.ts` and
  the golden-master snapshot (`vitest -u` for that change only, ADR 0039) in the same commit.
- Never use `.only` / `.skip` / `.todo`, and never weaken an assertion or widen a tolerance to
  pass. Where today's behaviour is known to be wrong, assert today's output with a comment
  citing the debt ID (the issue or roadmap item that tracks it); `it.fails` only with such an
  ID.

## Decisions

Decisions are Architecture Decision Records in [`docs/adr/`](docs/adr/README.md). Write one
(status **Proposed**) and get it accepted by the maintainer before shipping. When the maintainer
delegates a run's decisions, recorded on its tracking issue, its ADRs ship as **Accepted
(delegated, owner review pending)** and the maintainer reviews them afterwards:

- any change to a computed number or other user-visible behaviour — limits, rejections,
  exports, stored data, layout, UI (ADR 0001), together with a failing test written first;
- a new **runtime** dependency, with a written justification (ADR 0002). Dev-only tools are
  fine without one.

A copy-only change (the text of existing dictionary entries, except text used as an
accessible name or a live-region announcement) needs no ADR: the maintainer approves it in the
PR, a failing test is written first, and it gets a dated entry in
[`docs/decisions/wording.md`](docs/decisions/wording.md) (ADR 0152). ADRs and the log cite
dictionary keys, not translated strings.

Dependabot opens grouped weekly updates. Patch and minor upgrades of runtime dependencies
pass on green CI; a major runtime upgrade gets the maintainer's review in its PR (ADR 0152).

The ADR index in `docs/adr/README.md` is generated: run `pnpm adr:index` after adding or
changing an ADR header. `pnpm adr:check` (in CI) fails on a stale index or a one-sided
Amends / Amended-by link.

Refactors are behaviour-neutral and need no ADR.

## Where a result is shown

Each outcome is shown once, in one place (ADR 0141, ADR 0154, ADR 0261):

1. **On the field.** An input-rule refusal that names a field the form shows marks that
   field.
2. **Where it was started.** Any other failure of an edit shows in the control that started
   it: the form's line above its buttons, the confirm row, or next to Activate. In
   Assumptions, only an input-rule error that names no field shown there goes to its
   error summary; its other failures follow rule 3. The store puts nothing in the page
   banner.
3. **The banner when there is no such place.** An action with no place of its own (Keep
   exploring, a preset, Duplicate, an Assumptions save failing on no input rule) puts its
   failure in the AppShell banner with `showError`.
4. **The failure area for whole-database actions.** Import, restore, Load sample, Clear
   sample and backup export show their failure in the failure area under the banner
   (`OutcomeRegions`). Exceptions: the Clear sample dialog shows its own failure in the
   dialog, the CSV preview and a refused plan show in the import page, and a failure at
   start-up shows on the start-up screen.
5. **Success as a toast, notice or report.** An edit whose result is already on screen
   needs nothing; one that is not says so in a toast (an Assumptions save, a scenario
   added from a preset or deleted). A restore leaves a notice, an import its report.
6. **Store actions never throw.** Every store action that returns a promise resolves with a
   result (`Result<T, E>`, `MutationResult`); the caller branches on `ok` and needs no
   `catch` (`src/state/__tests__/noActionRejects.test.ts`).

## Commits and pull requests

- [Conventional Commits](https://www.conventionalcommits.org/): `feat`, `fix`, `refactor`,
  `test`, `docs`, `ci`, `build`, `chore`, `style`, `perf`, with a scope
  (`fix(engine): …`).
- One logical change per commit. A refactor and a behaviour change never share a commit.
- Reference the decision in a footer: `Refs: ADR 0023` (programme-era commits use `D-nn`,
  `DR-nnn`, `UX-nnn`).
- Add user-visible changes to the `[Unreleased]` section of [CHANGELOG.md](CHANGELOG.md).
  The "Changelog (ADR entries)" check on pull requests (`scripts/check-changelog.mjs`,
  run from the base branch's copy, so a PR that edits the script is still checked by the
  base copy) fails when:
  - the PR adds an accepted ADR, or changes an ADR's Status to Accepted, and
    `[Unreleased]` does not cite it. Each number is cited on its own as `ADR NNNN`
    ("ADR 0201, ADR 0202"); a range ("ADR 0201–0205") or a list after one "ADR"
    ("ADR 0201, 0202") does not count for the numbers after the first. A renamed ADR
    counts as added under its new number;
  - the PR adds lines to `docs/decisions/wording.md` without changing `[Unreleased]`.

  A PR with nothing user-visible to record (say, an ADR about CI, or a wording entry that
  only fixes a typo in the log) opts out of both rules with a line
  `Changelog: none (reason)` in its body; the reason is required. Locally:
  `PR_BODY="…" pnpm changelog:check --base origin/main`.

- Open a PR against `main`; merge only when CI is green.
- Open it as a **draft** (`gh pr create --draft`): CI skips draft PRs. Run the checks above
  locally, push review fixes, settle the ADR number and merge `main` while it is a draft, then
  mark it ready (`gh pr ready`) for one full CI run.
- Every ready PR gets the full CI run, a documentation-only one too: the gate tests
  (`scripts/__tests__/gates.test.mjs`) read CONTRIBUTING.md, README.md, CLAUDE.md, the PR
  template and `docs/release.md`, so a docs change can break them (#459).

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
