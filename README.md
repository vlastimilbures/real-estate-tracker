<div align="center">

<img src="src-tauri/icons/128x128@2x.png" alt="" width="96" height="96">

# Real Estate Tracker

**A private Mac app for owners of Czech rental apartments: track mortgages, leases, valuations
and costs, and see where the portfolio is heading over the next 30 years.**

[Who it's for](#who-its-for) · [Current limits](#current-limits) · [Install](#install) ·
[Start your own portfolio](#start-your-own-portfolio) · [Features](#features) ·
[Documentation](#documentation)

[![CI](https://img.shields.io/github/actions/workflow/status/vlastimilbures/real-estate-tracker/ci.yml?branch=main&style=flat-square&label=CI&logo=githubactions&logoColor=white)](https://github.com/vlastimilbures/real-estate-tracker/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/vlastimilbures/real-estate-tracker?style=flat-square&label=release&color=1f5f5b)](https://github.com/vlastimilbures/real-estate-tracker/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-1f5f5b?style=flat-square)](LICENSE)
![macOS 13+](https://img.shields.io/badge/macOS-13%2B%20·%20Apple%20Silicon-000000?style=flat-square&logo=apple&logoColor=white)
![Offline](https://img.shields.io/badge/offline-local--first-2e7d4f?style=flat-square)

</div>

<br>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/dashboard-dark.png">
  <img src="docs/screenshots/dashboard-light.png" alt="Dashboard: net worth, LTV, DSCR, yield and cash-flow tiles for a three-flat sample portfolio">
</picture>

<sub>All figures in the screenshots come from the built-in fictional sample portfolio.</sub>

## Who it's for

- **One owner of a few rental flats in Czechia**, financed with Czech annuity mortgages, who
  keeps the records on one Mac.
- **Comfortable with the numbers** — LTV, DSCR, yields, fixation and rate resets — and wants
  them computed correctly rather than in a fragile spreadsheet.
- **Planning, not bookkeeping** — projections and what-if scenarios, not a bank
  ledger, accounting or tax return.

## Current limits

- **Platform:** macOS 13 or later on Apple Silicon. Offline and single-user; no sync or sharing.
- **Currency:** Czech koruna (Kč) only, with Czech number, date and currency formatting. The
  interface is in English, Czech or Russian.
- **Mortgages:** Czech annuity practice — fixation periods and a rate reset at each refix. One
  active loan block per property at a time (refinancing is a successor block).
- **Estimates, not quotes:** figures are planning projections, not lender quotes or valuations.
  Returns are measured from the projection start, not from your purchase.
- **Not modelled:** income or capital-gains tax, selling costs, early repayments and a
  bank-account ledger.

[Model assumptions & limitations](docs/model-limitations.md) lists everything the model
simplifies or leaves out.

## Install

Download the latest `.dmg` from [Releases](https://github.com/vlastimilbures/real-estate-tracker/releases)
(Apple Silicon, macOS 13 or later) and drag the app to Applications.

The app is ad-hoc signed, not notarized, so macOS blocks the first launch. Allow this one app:

- **macOS 15+:** open the app once, then **System Settings → Privacy & Security → Open Anyway**.
- **macOS 13–14:** Control-click the app in Finder → **Open** → **Open**.

Do not turn Gatekeeper off globally; the steps above allow only this app. Details are in
[Gatekeeper on another Mac](docs/release.md#gatekeeper-on-another-mac).

Your data lives in `~/Library/Application Support/com.bures.realestate-tracker/` — see
[Privacy & security](#privacy--security).

**Before installing a new version,** export a backup (**Settings → Backup & Restore → Export
backup…**). [Data safety & recovery](docs/data-safety.md) covers backups, restore and what to do
if an upgrade fails.

### Build from source

The second way in, for developers. You need:

| Requirement              | Version                                                        |
| ------------------------ | -------------------------------------------------------------- |
| macOS                    | 13 or later, Apple Silicon                                     |
| Xcode Command Line Tools | `xcode-select --install`                                       |
| Rust                     | 1.96.0 via [rustup](https://rustup.rs) (`rust-toolchain.toml`) |
| Node.js                  | 24 or later (`package.json` `engines`)                         |
| pnpm                     | 11.5.0 (`packageManager`; `corepack enable` installs it)       |

```bash
git clone https://github.com/vlastimilbures/real-estate-tracker.git
cd real-estate-tracker
corepack enable              # pnpm at the pinned version
pnpm install                 # dependencies + git hooks
pnpm typecheck && pnpm test  # clean-run check: both must pass
pnpm tauri dev               # run the app with hot reload
scripts/release-macos.sh     # build, ad-hoc sign and verify a release bundle
```

> [!TIP]
> `pnpm tauri dev` opens your real database. To work on the UI without touching it, run
> `pnpm ux:capture` — it renders every screen in a browser on an in-memory copy of the sample
> portfolio.

## Start your own portfolio

On first launch the app fills in a **fictional sample portfolio** so every screen has data.
To switch to your own:

1. **Remove the sample.** In **Properties**, delete each sample property (**Delete property**).
   A one-step "clear sample" action is planned ([#18](https://github.com/vlastimilbures/real-estate-tracker/issues/18)).
2. **Set your assumptions.** In **Settings → Assumptions**, set the base date, horizon,
   appreciation, rent indexation, inflation, vacancy, post-fixation reset rate and
   holding-cost defaults.
3. **Add your properties.** Use **Properties → Add property**, or load several at once from CSV
   files on the **Import** page — see the [CSV import guide](docs/csv-import.md) for the
   columns, examples and matching rules.
4. **Add the details.** On each property, enter the mortgage, leases, valuations and holding
   costs.
5. **Review.** Check the **Dashboard**, **Projections** and **Scenarios** pages; the figures
   update as you edit.
6. **Export a backup.** **Settings → Backup & Restore → Export backup…** saves everything to
   one file. Keep it somewhere safe — see [Data safety & recovery](docs/data-safety.md).

## Why

Spreadsheets are a fine start for a few rental flats, but they get fragile once loans have
fixation periods, rents change mid-year and you want to ask "what if rates jump 2 points at the
next refix?". Real Estate Tracker is a desktop app with a **pure, tested financial engine**: it
amortizes Czech annuity mortgages month by month, follows leases and valuations by date, and
projects value, rent, cash flow and net worth for 30 years in **nominal and real** terms.
Everything runs and stays on your Mac.

## Features

**Portfolio & mortgages**

- 1…N properties, each with effective-dated valuations, leases and holding costs
- Czech annuity loans with **fixation and rate reset** on the loan's own due dates
- Refinancing by successor blocks, **development loans** (tranche draws, interest-only
  period), future-dated purchases with partial-year pro-rating
- Optional contract maturity date: the loan panel warns when the instalment implies a
  different maturity or a fixation ended without a follow-on block

**Analysis**

- **30-year projections** of value, debt, equity, rent, NOI and cash flow — nominal or real
  (cumulative CPI index, so inflation shocks deflate correctly)
- KPIs: LTV, DSCR, gross/net yield, net-worth multiple and CAGR, **levered IRR**,
  first cash-flow-positive year, debt-free year
- **As-of lens** — view the portfolio on any date in the projection window
- **Scenarios** — named assumption overrides, temporary rate and inflation shocks, value
  haircuts, one-click stress presets and side-by-side comparison

**Data**

- **CSV import** for properties, valuations, leases and mortgages — all-or-nothing, with
  per-row, per-column messages ([guide](docs/csv-import.md))
- **JSON backup & restore** with validation and an automatic safety backup
- **Excel export** of projection and amortization tables

**App**

- English, Czech and Russian UI; Czech number, date and currency formatting
- Light, dark and system themes; keyboard navigation and macOS menu shortcuts
- Accessibility checked with axe (WCAG 2.2 AA) on every screen in CI

## Screenshots

<table>
  <tr>
    <td width="50%">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/property-detail-dark.png">
        <img src="docs/screenshots/property-detail-light.png" alt="Property detail with value, debt, equity and DSCR tiles and projection charts">
      </picture>
      <p align="center"><b>Property detail</b> — value, debt and cash flow over time</p>
    </td>
    <td width="50%">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/scenarios-dark.png">
        <img src="docs/screenshots/scenarios-light.png" alt="Scenarios page comparing Base, a rate shock and a price crash">
      </picture>
      <p align="center"><b>Scenarios</b> — stress presets compared with Base</p>
    </td>
  </tr>
  <tr>
    <td colspan="2">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/projections-dark.png">
        <img src="docs/screenshots/projections-light.png" alt="Year-by-year projection grid for the portfolio">
      </picture>
      <p align="center"><b>Projections</b> — year-by-year grid for the portfolio or a single property</p>
    </td>
  </tr>
</table>

## Privacy & security

- **Offline by design** — no network calls, analytics or updater. A strict Content Security
  Policy and a navigation guard keep the webview on the app.
- **Least privilege** — the webview can use the SQL plugin, menu events and the app's own
  commands, nothing else. File dialogs and writes run in Rust; the webview never sees a path.
- **Your data stays on your Mac:**

  | What                           | Location                                                              |
  | ------------------------------ | --------------------------------------------------------------------- |
  | Database                       | `~/Library/Application Support/com.bures.realestate-tracker/`         |
  | Automatic backups              | `~/Library/Application Support/com.bures.realestate-tracker/backups/` |
  | Error log (rotating, 5 × 1 MB) | `~/Library/Logs/com.bures.realestate-tracker/app.log`                 |

  Files are readable only by your user (`0600`); they are not encrypted beyond FileVault.
  How to back up and recover: [Data safety & recovery](docs/data-safety.md).

Found a vulnerability? Please report it privately — see [SECURITY.md](SECURITY.md).

## Quality

Every check CI runs has a local command; the full list is in [CONTRIBUTING.md](CONTRIBUTING.md#checks).

| Command                        | Checks                                                                   |
| ------------------------------ | ------------------------------------------------------------------------ |
| `pnpm typecheck` · `pnpm lint` | TypeScript strict; ESLint with zero warnings, incl. engine-purity rules  |
| `pnpm test:coverage`           | ~1,500 Vitest tests with per-folder coverage floors                      |
| `pnpm test:parity`             | Engine and SQLite round trip against the parity targets (±1 Kč, ±0.0001) |
| `pnpm depcruise` · `pnpm knip` | Layer map and cycles; unused files, exports and dependencies             |
| `cargo clippy` · `cargo test`  | Rust lints and integration tests                                         |
| `pnpm ux:axe-check ci`         | axe scan of every screen, light and dark                                 |
| `pnpm mutation` · `pnpm bench` | Nightly: Stryker mutation score on the engine; performance budgets       |

## Architecture

```mermaid
flowchart LR
  subgraph Rust["Tauri shell · src-tauri"]
    DB[(SQLite)]
    CMD["Rust commands<br/>transactions · file dialogs · atomic writes"]
  end
  subgraph Web["Webview · src"]
    DATA["data<br/>repositories · migrations · mappers"]
    IMPORT["import<br/>CSV parse → DB write"]
    STATE["state<br/>Zustand stores · useEngine"]
    ENGINE["engine (pure)<br/>schedule · snapshot · projection · KPIs · scenarios"]
    MODEL["ui/model (pure)<br/>chart & table shaping"]
    UI["ui<br/>pages · components"]
    PLATFORM["platform<br/>Tauri command wrappers"]
  end
  DB <--> CMD
  CMD <--> DATA
  IMPORT --> DATA
  DATA -- "engine inputs" --> STATE
  STATE -- "inputs" --> ENGINE
  ENGINE -- "outputs" --> STATE
  STATE --> MODEL --> UI
  UI -- "edits" --> STATE
  STATE --> PLATFORM
  PLATFORM <--> CMD
```

- **The engine is pure** — typed inputs in, typed outputs out; no IO and no clock reads
  (the base date is always a parameter). It may import only `decimal.js` and the money helpers.
- **Money is never a float** — `decimal.js` everywhere, stored as decimal text in SQLite and
  rounded only for display.
- **One-way data flow** — DB → mappers → engine → UI. Components never do financial arithmetic.
- **Enforced by tooling** — dependency-cruiser checks the layer map and import cycles; ESLint
  bans clocks, randomness and float parsing inside the engine.

### Project layout

| Path                                            | What lives there                                                                                |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [`src/engine/`](src/engine)                     | Pure financial engine: amortization, snapshot, projections, KPIs, scenarios, validation         |
| [`src/engine/__tests__/`](src/engine/__tests__) | Parity, invariant, property-based and golden-master tests; independent mortgage reference model |
| [`src/data/`](src/data)                         | SQLite repositories, migrations, runtime guards, mappers, seed, backup                          |
| [`src/import/`](src/import)                     | CSV importer — pure parse/validate plus the DB write                                            |
| [`src/state/`](src/state)                       | Zustand stores, memoised engine recompute, facades the UI uses                                  |
| [`src/ui/`](src/ui)                             | Pages, components and pure view models (`ui/model`)                                             |
| [`src/i18n/`](src/i18n)                         | Typed English, Czech and Russian dictionaries                                                   |
| [`src/lib/`](src/lib)                           | Decimal money maths (PMT/FV/NPER) and display formatting                                        |
| [`src/platform/`](src/platform)                 | Wrappers around the app's Tauri commands                                                        |
| [`src-tauri/`](src-tauri)                       | Rust shell: DB transactions, file dialogs, atomic writes, menu, navigation guard                |
| [`ux-capture/`](ux-capture)                     | Screenshot + axe harness for every screen                                                       |
| [`docs/`](docs)                                 | Architecture decision records, release guide, design notes, roadmap                             |

## Documentation

| Document                                               | Contents                                                          |
| ------------------------------------------------------ | ----------------------------------------------------------------- |
| [SPEC.md](SPEC.md)                                     | Product and engine specification: domain model, formulas, screens |
| [docs/adr/](docs/adr/README.md)                        | Architecture decision records                                     |
| [docs/model-limitations.md](docs/model-limitations.md) | What the figures mean and what the model leaves out               |
| [docs/data-safety.md](docs/data-safety.md)             | Backup, restore and recovery after a failed upgrade               |
| [docs/csv-import.md](docs/csv-import.md)               | CSV import: columns, examples, matching and all-or-nothing rules  |
| [docs/roadmap.md](docs/roadmap.md)                     | Planned work and engineering backlog                              |
| [docs/release.md](docs/release.md)                     | Building, signing, Gatekeeper, data locations                     |
| [CONTRIBUTING.md](CONTRIBUTING.md)                     | Setup, checks, commit style, decision process                     |
| [CHANGELOG.md](CHANGELOG.md)                           | User-visible changes per release                                  |
| [CLAUDE.md](CLAUDE.md)                                 | Engineering rules, also used for AI-assisted work                 |

## License

[MIT](LICENSE) © 2026 Vlastimil Bureš
