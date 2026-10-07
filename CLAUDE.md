# CLAUDE.md — Real Estate Portfolio App

Project conventions and guardrails for Claude Code. Read this first. Sections are numbered so
code comments can cite them (e.g. "CLAUDE.md §5").

**See also**

- Full product/engine spec → `SPEC.md`
- Setup, checks, commit style, decision process → `CONTRIBUTING.md`
- Architecture decisions → `docs/adr/` (index in `docs/adr/README.md`)
- Parity targets, sample-portfolio fixtures & target change log → `.claude/rules/engine-parity.md`
  (auto-loads for `src/engine/**`)
- Domain terms (NOI, DSCR, IRR, fixation…) → `domain-glossary` skill
- Release, signing, data locations → `docs/release.md`

## 1. What we're building

A local-first **macOS desktop app** (offline, single user): a rental-apartment portfolio tracker
with 30-year nominal/real projections, charts, KPIs, and what-if scenarios, modelled on Czech
mortgage practice. `SPEC.md` is the functional spec; the **parity targets** for the fictional
sample portfolio (`.claude/rules/engine-parity.md`), the golden master and the independent
mortgage reference model are the regression baseline (ADR 0081).

## 2. Stack (locked — do not substitute without asking)

- **Tauri 2** (Rust shell) + **React 18** + **TypeScript (strict)** + **Vite**
- **SQLite** via `@tauri-apps/plugin-sql` for local persistence
- Money: **decimal.js** (locked — not integer minor units); rules in §5
- **Vitest** unit tests; **Playwright** (optional, ADR 0006) UI smoke tests
- **Zustand** state; **Recharts** charts; **pnpm** package manager
- ESLint + Prettier; `tsc --noEmit` must pass
- Toolchains pinned: Node/pnpm via `package.json` `engines` + `packageManager`; Rust via
  `rust-toolchain.toml`

## 3. Project structure (non-obvious bits)

- `src/engine/` is PURE (§4); `__tests__/` = parity, invariant and property tests.
- `src/data/sql.ts` = SQL adapter: `tauriSql.ts` in the app, `browserSql.ts` = E2E fallback.
  Multi-step writes go through the Rust transaction command (ADR 0014).
- `src/import/`: CSV is canonical — there is no xlsx importer. `csv.ts` = pure parse/validate;
  `csvImport.ts` = DB write.
- `src/ui/model/` = pure presentation logic (chart/table shaping).
- `src/platform/` = Tauri command wrappers (file save, perf report, menu events); the UI
  reaches data, import and platform only through `src/state` facades (ADR 0072).
- `src-tauri/src/` = Rust commands: DB transactions (`db.rs`), file dialogs + atomic writes
  (`files.rs`, ADR 0064), menu, navigation guard, perf log.
- `ux-capture/` = permanent screenshot + axe harness (`pnpm ux:capture`, ADR 0057).

## 4. Architectural rules (hard)

- **The engine is pure.** Typed inputs in, typed outputs out: no side effects, no IO, and
  **NEVER** `Date.now()` / `new Date()` inside `src/engine` — `baseDate` is always an explicit
  parameter. This is what makes it testable and correct. Never let DB or React types leak in.
  The one exception is `src/engine/dates.ts`, which builds UTC dates from explicit parts
  (`new Date(Date.UTC(y, m, d))`) — never a clock read.
- **One-way data flow:** DB → map to engine inputs → engine → outputs → UI. The engine never
  reads the DB; the UI never does finance maths inline.
- **No business logic in components.** Components render engine output and dispatch edits; all
  formulas live in `src/engine`.
- **Effective-dating** for valuations and leases: "current" = the record in force at a date.
  Never assume one row per property.
- **Dynamic 1..N properties:** the engine maps over a property array — no fixed slots, no code
  changes to add a property.
- **Scenarios override only Assumptions**; a property's own growth override still wins over a
  scenario level (ADR 0102). Scenarios never mutate the underlying portfolio data.
- Enforced by tooling: `pnpm depcruise` (layer rules, no runtime cycles; the known-violations
  baseline is empty and `pnpm depcruise:baseline-check` fails a PR that grows it) and ESLint
  engine-purity rules. Never add to the baseline to get a change through.

## 5. Money & numeric rules (hard)

- **NEVER do floating-point arithmetic on currency.** Use `decimal.js` throughout the engine.
  Money persists as TEXT decimal strings in SQLite and is converted to/from `Decimal` only at the
  mapper boundary, where engine inputs get their brands (`money()`, `rate()`, `isoDate()`;
  ADR 0074). Never cast to a brand; ESLint rejects it outside the constructors.
- Percentages/rates use `decimal.js`. Powers like `(1+g)^t` and `FV/PMT/NPER`: implement with
  decimal-safe helpers and test them.
- **Round only for display** (`src/lib/format.ts`) — the engine returns full precision.
- Display uses Czech accounting conventions: `#,##0 "Kč"`, percentages `0.0%`, multiples `0.00x`,
  dates `dd.mm.yyyy`, negatives red in parentheses, millions as `M Kč` on hero tiles/chart axes.

## 6. Testing & definition of done

- Write engine tests **before** the engine (TDD).
- A change is done only when `pnpm test`, `pnpm typecheck`, `pnpm lint` (zero warnings),
  `pnpm depcruise` and `pnpm knip` are green, Prettier is clean, and (engine work) new logic has
  tests. CI also enforces per-folder coverage floors (`pnpm test:coverage`).
- Parity: engine output must match the parity targets within **±1 Kč** (money) and **±0.0001**
  (ratios/rates/multiples). Treat any mismatch as an engine bug, not the target. Exact targets +
  seed fixtures live in `.claude/rules/engine-parity.md`.
- Never use `.only` / `.skip` / `.todo`; never weaken an assertion or widen a tolerance to pass.
  Where today's behaviour is known-wrong, assert today's output with a comment citing the debt
  ID; `it.fails` only with such an ID.
- E2E (Playwright) is optional (ADR 0006): keep existing tests green, do not expand them.

## 7. Guardrails / gotchas

- **Don't reinvent.** When a formula is ambiguous, keep the parity targets and follow Czech
  banking practice (ADR 0003) rather than guessing a "better" formula; changing a target
  needs an ADR.
- **Key correctness invariant:** Σ principal repaid over the horizon (scheduled + prepaid) must
  equal the starting debt plus any draws (principal retires 100% of the balance; e.g.
  `recast-tranche.test.ts`). A classic spreadsheet bug computes principal as 0
  so the balance never amortizes — keep this as a tripwire test.
- **Offline only.** No network calls, analytics, or cloud anything — offline is a requirement
  (enforced by the CSP and capabilities, see `docs/release.md`).
- **Target changes.** Parity targets change only through an accepted ADR (ADR 0001, ADR 0003)
  plus an old → new row in the target change log; the golden-master snapshot is updated in
  the same commit (ADR 0039).

## 8. Change process (permanent)

- **Behaviour changes need an approved decision** (ADR 0001): any change to a computed number
  or other user-visible behaviour (limits, rejections, exports, stored data, layout, UI) needs
  an accepted ADR and a failing test written first. A copy-only change (the text of existing
  dictionary entries, except text used as an accessible name or a live-region announcement)
  needs the owner's OK and a failing test written first, but an entry in
  `docs/decisions/wording.md` instead of an ADR (ADR 0152). ADRs cite dictionary keys, not translated strings. Refactors are
  behaviour-neutral.
- **ADR index** is generated: run `pnpm adr:index`, never edit the table by hand; numbers are
  the next free on `origin/main` and open PRs (ADR 0152).
- **Dependencies** (ADR 0002): dev-only tools are fine; a new runtime dependency needs a
  written justification and owner approval. Patch/minor upgrades pass on green CI; a major
  runtime upgrade gets owner review in its PR (ADR 0152).
- **Commits:** Conventional Commits, one logical change each; a refactor and a behaviour change
  never share a commit. Reference the ADR in a footer (`Refs: ADR 0023`).
- **Protect the owner's data:** before launching the app (`pnpm tauri dev` / a built app) or
  running a migration, ask the owner to confirm their database backup is current. Never copy,
  read into the repo, or commit the real database, bank statements or screenshots. Tests use
  synthetic fixtures only.
- **Evidence:** every finding cites `file:line` or a command output.
- Backlog: `docs/roadmap.md` and GitHub issues. `DR-nnn` / `UX-nnn` / `J-nn` / `P-nn` in
  comments are legacy IDs from the retired refactor archive (ADR 0081); `D-nn` = ADR `00nn`.

## 9. Model routing

- Haiku-class subagents: search, formatting, file moves, mechanical edits.
- Sonnet/opus: reasoning — architecture, multi-file refactors, reviews.
- Gather context on the main model; delegate generation-from-brief to a haiku agent.
