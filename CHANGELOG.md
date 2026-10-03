# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Scenarios say which loans a rate shock hits. The list summary and the compare column
  header (as a tooltip) add "hits N of M loans (refix 2029, 2031)", or say that no loan
  refixes inside the shock window, so the shock has no effect. Each property's mortgage
  chain counts as one loan. The rate-shock help says the shock starts at each loan's
  fixation end. No computed figure changes (ADR 0100, #47).

- Adding a valuation or a lease after one that has no end date asks whether to end that
  record on the day before the new one starts. **End previous** saves both in one write;
  **Keep as is** adds only the new record; closing the dialog adds nothing and keeps your
  input. Editing a record never asks. No computed figure changes (ADR 0099).

- The mortgage form starts with a **Loan type** switch: **Standard** or **Development
  (construction)**. Standard hides the development draws and the interest-only completion
  date; an existing block opens in the type its data shows, and switching a development
  block back to Standard asks before clearing those fields. When the property already has a
  block, the Add form says a new block replaces the current one from its start date (refix or
  refinance) and links to the Guide. No stored data or computed figure changes (ADR 0098,
  #20).

- Settings → Assumptions keeps **Discard changes** and **Save changes** in a row that stays in
  view at the bottom of the window. The row says whether there are unsaved changes, all
  changes are saved, or a save failed (your input is kept); both buttons are disabled while
  nothing changed. A save with invalid fields lists them above the row as links that jump to
  each field. Property record forms say "Unsaved changes" next to their buttons. Saving stays
  explicit — there is no autosave (ADR 0095, #19).

- The first-run sample portfolio is labelled as fictional. A banner on Dashboard and
  Properties offers **Clear sample and start my own** and **Keep exploring** (which hides it
  for good); while the sample is in place, Settings → Backup offers the same action. Clearing
  saves a safety backup first, then deletes the three sample apartments and everything under
  them in one step. Properties you added, assumptions and scenarios are kept, and the sample
  is never reseeded. The empty Properties page now offers Add property and Import CSV, and the
  empty Dashboard lists the first steps (ADR 0094, #18).

- CSV import previews what it will do before writing anything: per file, the records it will
  add, update (with each changed column as before → after) and leave unchanged. Overwriting
  existing records needs a confirmation, an import whose data changed since the preview
  writes nothing, and the import report stays on the page with links to each property
  (ADR 0096, #34).

### Changed

- Scenarios keep the compare selection, the Base toggle and the price-crash timing when you
  leave the page and come back, for as long as the app is open. Deleting a ticked scenario
  removes it from the compare (ADR 0101, #50).

- Scenario compare can show every key figure as the difference to Base. A "Values | Δ vs
  Base" switch in the Key figures header (shown when Base is ticked) turns each scenario cell
  into its value minus Base's: M Kč for money, percentage points for CAGR and IRR, the
  multiple, and years for the first cash-flow-positive and debt-free years (ADR 0097, #53).
- Scenarios: clicking a stress preset that is already saved no longer adds a second row with
  the same name; it ticks the saved one and says "Already saved". A scenario added from a
  preset, the "New scenario" form or Duplicate is ticked for compare straight away while fewer
  than 3 are ticked; at the limit the selection stays and the message says why (ADR 0093,
  #48, #49).

- Scenario compare shows what a scenario does to your wealth, not only its returns. Two new
  rows lead the key figures: starting equity and Δ net worth vs Base (in the chosen lens). A
  price crash at Today lowers starting equity, so its multiple, CAGR and IRR can read higher
  than Base's while net worth ends lower; those cells are marked and a footnote explains it.
  The Guide's value-crash entry says the same (ADR 0089, #14).

### Fixed

- Guide and About explain the figures the way the model computes them. The net-worth
  multiple and IRR start from equity at the projection start, and the IRR ends with projected
  equity at the horizon (no selling costs or tax), not "the money you put in" and "the sale
  at the end". The principal check holds when every loan is repaid within the horizon and
  includes later draws. Net cash flow is a modelled estimate, not a bank-account record.
  Projected rent follows leases: gaps earn nothing and the last lease is treated as renewed.
  IRR and net cash flow say what they do not mean, and the Guide and the deactivate dialog
  say deactivating does not record a sale. About states the ±1 Kč test tolerance in every
  language instead of "to the cent" (ADR 0091, #16).
- Scenarios wording matches the model. The stress-preset hint says rate and inflation shocks
  revert after 3 years while a price crash is permanent. Shock inputs and the scenario list
  use percentage points ("pp", "p. b.", "п. п.") with a worked example (+2 pp turns 4.5 % into
  6.5 %). Crash timing 0 reads "Start" with the projection start date, and the form says
  "0 = projection start (date)". The compare hint says Base does not count toward the 3
  scenarios. The Nominal/Real lens toggle is now on the Scenarios page (ADR 0090, #15).
- Dashboard and Property detail labels say what the tiles show. With a future As-of date
  they name the projection year and its period ("Monthly equivalent — projection year
  Y5 · 2031 (Jul 2030 – Jun 2031)") instead of "current" or "today's lease". The As-of picker
  explains how the date maps to a projection year, or that past the horizon it shows the
  records in force on that date. The horizon tile names its end year ("Net worth in 2056
  (30-yr horizon)") (ADR 0088, #13).
- Real lens: the net-worth multiple and the cumulative net cash flow are now computed in real
  terms (base-date Kč) on the Dashboard and in Scenario compare, instead of staying nominal.
  The cumulative cash flow deflates each year by its own CPI. The hero tile reads "×N from
  projection start", Σ principal repaid is labelled "(nominal)" in the Real lens, and the
  Guide explains why a later Today snapshot reads slightly below nominal (ADR 0087, #11).
- Labels that depend on the projection horizon (Dashboard trajectory heading, cumulative net
  cash flow and principal-repaid KPI rows, Property detail projection title) show the
  configured horizon instead of a fixed 30 years; Czech and Russian year counts use the right
  plural form (ADR 0084, #12).
- Properties list: long property names are cut with an ellipsis (full name on hover and for
  screen readers). LTV, Net cash flow and DSCR now come right after the name. In narrow windows,
  Edit and Delete show as icons. Pinned columns show an edge shadow when the table scrolls
  sideways (ADR 0085, #17).
- Backup restore refuses a projection horizon, fixation, loan term or property size outside
  the range the forms and CSV import allow (1–100, 0–50, 1–50 years, 1–10 000 m²). Nothing is
  changed, and the issue table names the record, column and allowed range (ADR 0086, #38).

## [1.4.0] - 2026-10-03

First public release. Versions before 1.4.0 were developed in a private repository, so their
headings below have no tag links.

### Added

- The macOS release workflow attaches the signed `.dmg` to the GitHub release of each `v*` tag.

### Changed

- The built-in sample portfolio is fictional: new property names, addresses and sizes, and
  every money figure re-based. A fresh install seeds the new sample; existing databases are
  untouched (ADR 0081).
- Documentation, roadmap and contribution guide prepared for the public repository.
- The About dialog shows where to give feedback (GitHub issues) instead of an e-mail
  address (ADR 0082).

## [1.3.0] - 2026-10-02

### Added

- Every chart has a Table button that shows its values as a table, readable with the
  keyboard and a screen reader (ADR 0078).
- CI fails on any accessibility (axe) violation in the captured screens (ADR 0078).

### Changed

- Projected rent follows the leases month by month: a new lease's rent applies from its
  start, a gap between two leases earns no rent, and the last lease is treated as renewed
  (ADR 0080). Seed portfolio: cumulative cash flow 14,330,330 → 14,705,700 Kč, levered IRR
  6.15 % → 6.18 %.
- The Excel export's sheet names follow the UI language (ADR 0080).
- The database, its backups and the window-state file are private to your user: the app
  folder is `0700` and its files `0600`, fixed at every start (ADR 0080).

- The app's own menu items (About, Settings…, New Property…, View pages) follow the UI
  language (ADR 0078).

- CSV import refuses a fixation outside 0–50 years, a loan term above 50 years or a size
  outside 1–10 000 m², the same bounds as the forms (ADR 0076).
- The window title and the About page read "Real Estate Tracker", the app's name in the Dock
  and menu bar (ADR 0076).

- ⌘, (Settings) does nothing while a dialog is open, like ⌘N and ⌘1–⌘5 (ADR 0077).

- A loan draw dated on or after the loan's final payment date (start + term) is refused
  instead of being repaid in one go in the last month (ADR 0079).
- A scenario rate shock changes only payments due after the base date; a loan's past
  payments and today's balance stay as they are (ADR 0079).
- Levered IRR is found up to 1000 %, and shows "n/a" with the reason when the cash flows
  have no unique IRR, instead of a blank (ADR 0079).

### Fixed

- With the base date on a month end (e.g. 29 February), real-terms values count months on
  the same month-end grid as the projection, so the real snapshot matches the real
  projection row (ADR 0080).
- The Compare page's key figures are a real table with row and column headers for screen
  readers (ADR 0080).
- Scenarios created on the same day keep their creation order (ADR 0080).
- With the base date or a valuation on a month end (e.g. 29 February), the market value at a
  later date counts the clamped month end as a whole month, so it matches the projection
  (ADR 0079).
- At a refinance, a construction draw dated after the new loan's start is no longer paid
  off by the new loan (ADR 0079).
- Leaving a property page with an edited valuation, lease, mortgage or holding-costs form
  asks "Keep editing / Discard" instead of dropping the edit (ADR 0077).
- The About dialog can be scrolled with the keyboard (ADR 0077).
- The property form's required fields are announced as required to screen readers
  (ADR 0077).
- The Garage checkbox in the property form is visible and tickable in the app (ADR 0071).
- Adding a property saves its address and garage (ADR 0071).
- Editing an inactive property no longer re-activates it (ADR 0071).

## [1.2.0] - 2026-10-02

Hardening release from the 2026 refactor programme. Decisions are recorded in `docs/adr/`;
calculation changes are listed in the target change log (`.claude/rules/engine-parity.md`).

### Added

- **Contract maturity date** (optional) on a mortgage block, in the form and as a
  `contract_maturity_date` CSV column; the loan panel warns when the instalment implies a
  maturity more than a month away, when a fixation ended with no follow-on block, and checks
  every block of a refinance chain (ADR 0029, ADR 0030).
- **Year labels** show the projection year with its calendar year, "Y5 · 2031", in the grid and
  chart tooltips; the projection Excel export gains a Period column and localized headers
  (ADR 0022).
- **Startup error screen** with a translated explanation, the records involved, the log
  location, "Try again" and what to do next.
- **Pre-migration backups** — a verified copy of the database is written to the `backups`
  folder before every schema upgrade; a rotating error log (`~/Library/Logs/…/app.log`) with
  error codes and record ids, no financial values.
- **Menu shortcuts** — File ▸ New Property… (⌘N); View ▸ Dashboard / Properties / Projections /
  Scenarios / Import (⌘1–⌘5). ⌘W and the close button hide the window; the Dock icon shows it
  again; ⌘Q quits.
- **Window position remembered** — the window reopens at its last size and position.
- Glossary tooltips on LTV, DSCR, NOI and Effective income that open the Guide at that entry.
- "Discard unsaved changes?" when leaving Assumptions or closing a form modal with unsaved input.

### Changed

- **Mortgage calendar** — the fixed rate applies to the payment due on the fixation-end date
  and the reset applies from the next payment, keyed on each loan's own due dates; the final
  payment clears the balance (ADR 0021). The sample portfolio's cumulative net cash flow moves
  from 14,321,938.00 to 14,330,329.67 Kč.
- **Real terms** use a cumulative CPI index everywhere, so a temporary inflation shock deflates
  correctly — also in Scenario compare, which now honours the Nominal/Real toggle (ADR 0023).
- **Property value** grows by whole months from its latest valuation or purchase date, the
  same way in the snapshot and the projection (ADR 0032).
- **Development loans** — the instalment is derived from the required loan term (the field is
  read-only); tranches re-amortize in the month they land (ADR 0024, ADR 0031).
- **Refinancing** — a later mortgage block replaces its predecessor from its start date; net
  refinance cash counts in cumulative cash flow and IRR (ADR 0027).
- **As-of picker** offers only dates from the Projection start to the end of the horizon; a
  future as-of date shows the matching projection year on both Dashboard and Property detail
  (ADR 0019).
- Equity CAGR shows "—" when starting equity is zero or negative (ADR 0034); DSCR above 99×
  shows as ">99,00x" (ADR 0035).
- The Settings → Currency tab is removed; amounts always show in Kč (ADR 0058).
- Excel export cells hold the values the app displays (ADR 0010); exports and CSV templates use
  a native save dialog with saved / cancelled / failed outcomes.
- Backup files carry the database schema version; older backups still restore. The backup file
  name uses the local date.
- Amounts are coloured only where the sign carries meaning; LTV and DSCR pills show the band
  word next to the number; charts no longer plot year-0 flows as 0.
- About shows the source and e-mail addresses as plain text.
- The app targets Apple Silicon Macs with macOS 13 or later (ADR 0063).

### Fixed

- **Invalid inputs are rejected everywhere** — forms, CSV import and restore refuse rows the
  engine cannot compute (negative amounts, rates out of range, an instalment below the monthly
  interest, a draw on or before the loan start, two loans starting the same day…) with a
  translated message naming the field, instead of producing NaN or hanging (ADR 0017,
  ADR 0036–0038).
- **Database rules** — duplicate names, overlapping records, negative amounts and broken
  references are refused by the database itself, with a translated message instead of
  SQLite's raw text; an upgrade aborts, leaving the database unchanged, if existing data breaks
  the new rules.
- **Writes are transactional** — CSV import, restore and other multi-step writes either fully
  happen or not at all (ADR 0014).
- **Restore** checks the whole file first (size ≤ 20 MB, schema version, every row, unknown
  columns) and changes nothing on failure; the confirm step shows the backup date and row
  counts; a verified safety backup is written first and the restore aborts if it fails
  (ADR 0052). A crafted backup can no longer run SQL.
- **CSV import** is all-or-nothing, rejects files over 2 MB / 5,000 rows, Czech-Excel files
  (`;`, decimal comma, Windows-1250) and malformed values with messages naming row and column;
  property names match case-insensitively (ADR 0049, ADR 0053). After a successful import the
  files are cleared.
- **Exports are atomic** — a file is written to a temporary name and moved into place, so a
  failed save never leaves a partial file. Cancelling the backup save dialog no longer reports
  "Backup downloaded".
- **Sample portfolio only on first run** — deleting every property or restoring an empty
  backup no longer brings the sample flats back (ADR 0016).
- Saving holding costs for a property without a holding-costs row now saves them.
- Form dates reject impossible dates and years before 1900.
- Renaming a scenario updates Scenario compare at once.
- A value that rounds to zero shows without a minus sign.

### Accessibility

- Every form field has a programmatic label, `aria-invalid` and linked error text; required
  fields are marked and messages state the expected format.
- Modals trap focus and return it on close; Return saves a form; scrolling tables are
  keyboard-focusable regions; property names are buttons.
- Text colours meet 4.5:1 contrast; charts skip their entry animation with "Reduce motion".
- Translation sweep across en/cs/ru, including plural forms.

### Security

- Least-privilege permissions (file dialogs and writes moved into Rust; no fs/dialog access from
  the webview), strict Content Security Policy, a navigation guard, and an ad-hoc-signed Apple
  Silicon build with the hardened runtime (ADR 0009, ADR 0063, ADR 0064). See
  `docs/release.md`.
- `exceljs` dependency advisories resolved by pinned overrides (ADR 0015).

## [1.1.0] - 2026-07-02

### Added

- **Drag-and-drop CSV import** — drop a CSV file directly onto the Import page pickers.

### Changed

- Consolidated dialog UI into a shared `Modal` component, used by `PropertyFormModal` and
  `ScenarioForm`.
- Internal refactor: extracted pure form/validation logic to `src/ui/model`, Tauri IO
  orchestration to `src/data/backup.ts`, and split oversized page/engine functions into named
  helpers. No behavior change — verified byte-identical against the parity suite.

### Fixed

- Scroll position now retained across route/property changes.
- Dashboard `+1y`/`+5y` presets step from today instead of a stale base date.

## [1.0.0] - 2026-06-30

First stable release. A local-first, offline macOS desktop app: a rental-apartment portfolio
tracker with 30-year nominal/real projections, charts, KPIs, and what-if scenarios.

### Added

- **Financial engine** — pure, deterministic amortization, projections, metrics, growth, and
  scenario logic, with parity tests to the cent (±1 Kč / ±0.0001).\*
- **Data layer** — SQLite persistence with migrations, mappers, seed data, effective-dated
  valuations and leases, and dynamic 1..N properties.
- **CSV importer** for four entity types (canonical import path).
- **JSON backup / restore** — full database export and versioned restore.
- **Excel export.**
- **Dashboard** — KPI tiles, charts, and an as-of-date lens.
- **Properties** — list and per-property detail views.
- **Projections** — dense 30-year projection tables.
- **Scenarios** — scenario table, compare view, and stress presets (override Assumptions only).
- **Settings** — Assumptions, Currency, and Backup/Restore tabs.
- **Guide** — built-in domain glossary.
- **Multi-language UI** — English, Czech, and Russian.
- **Theming** — light, dark, and system themes.

### Notes

- The macOS `.dmg` is **unsigned / not notarized**. On first launch, right-click the app and
  choose **Open** to bypass Gatekeeper.
- Offline only — no network calls, analytics, or cloud services.

\* _"To the cent" meant within the ±1 Kč parity tolerance (±0.0001 for ratios), not to the
haléř. Note added 2026-10 (#30)._

[Unreleased]: https://github.com/vlastimilbures/real-estate-tracker/compare/v1.4.0...HEAD
[1.4.0]: https://github.com/vlastimilbures/real-estate-tracker/releases/tag/v1.4.0
