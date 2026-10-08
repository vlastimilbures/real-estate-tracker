# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- The property form has an optional **Acquisition** section to record how a purchase was
  funded: own cash, transaction costs, initial works and a note (ADR 0119, #33). A blank
  amount is unknown; clearing every field clears the record. Each property page gets an
  **Acquisition** section with the purchase's sources and uses (price, costs and works
  against own cash and the loan that funded it) and a warning when they differ by 1 Kč or
  more, never a blocker. The Dashboard KPI list shows **Cash invested**, the total own
  cash, once every active property has it.

- `properties.csv` takes three optional columns for how a purchase was funded: `own_cash`,
  `transaction_costs` and `initial_works`, in the same money format as `purchase_price`
  (ADR 0119, #33). An empty cell means unknown. A re-import keeps an amount already stored,
  so a CSV never erases a recorded figure; clear one in the property form. The template
  and the CSV guide show them.

- A **Data check** shows which inputs behind the numbers are stale, missing or left at a
  default, at the snapshot date (ADR 0118, #35). A panel on the Dashboard and a section on
  each property list, with their effect:
  - under **Needs attention**: a valuation more than 12 months old, no valuation (the
    purchase price stands in), a lease that ended with no next lease (no rent in the
    snapshot; the projection assumes it is renewed), no lease in force (rent counts as 0),
    a lease ending within 3 months with no next lease, and a fixation that ended with no
    follow-on block;
  - under **Using portfolio defaults**: the portfolio appreciation and rent indexation, and
    blank holding-cost fields.
  - Each row links to the section that fixes it, or to the property form. The Dashboard
    panel opens when something needs attention. No figure changes.

- The Data check lists a property whose **own cash at purchase is not recorded** under
  "Using portfolio defaults" (ADR 0118, #178): Cash invested is then unknown, and for a
  property bought after the projection start the down payment is derived. A future purchase
  shows it before its purchase date too. Its link, **Record funding**, opens the property
  form with the Acquisition section open.

- The property page's **Loan outlook** shows the loan's remaining term ("24 yrs 8 months")
  and lists every loan block, oldest first, with its fixation end, the balance that moves
  to the new rate (nominal) and a status: next rate reset, upcoming, passed, replaced by a later
  loan, repaid before the reset, or floating rate. The dates are modelled, not deadlines
  from your lender (ADR 0117, #31).

- Settings → Backup can load the sample portfolio again. While the portfolio has no
  properties, a **Load sample portfolio** button adds the three fictional apartments with
  their mortgages, valuations, leases and costs in one step, and the sample banner shows
  again. It never adds to existing properties, and your assumptions and scenarios stay as
  they are (ADR 0112, #74).

- Loans can carry **one-off prepayments** and **maturity changes**, entered in a row
  editor in each mortgage block's form (#32b). A prepayment either lowers the instalment or shortens the
  term; a maturity change sets a new last-payment date or a new instalment, up to 50 years
  from the loan start. Prepayments and their fees count in cumulative cash flow and the IRR,
  not in net cash flow or DSCR. Existing figures do not change (ADR 0109, #32).
  - The property page shows the loan's modelled payoff date and the interest its
    prepayments save over the loan's remaining life; the Dashboard financing panel shows
    the total and each property's figure.
  - A prepayment larger than the balance, or one that falls after payoff, shows as a loan
    warning. Saving is never refused for it.
  - The amortization table, the projection grid and their Excel exports add Prepaid,
    Prepayment fee and Drawn columns when a row has a value.
  - The Guide explains prepayments and maturity changes (ADR 0116).

- Settings → Backup says when the last backup was exported ("Last backup: 12.09.2026
  (3 weeks ago)" or "No backup exported yet") and to keep a copy somewhere other than this
  Mac. When the data changed and there is no backup or the last one is over 30 days old,
  a quiet reminder in the sidebar footer opens Settings → Backup; it can be hidden for the
  session. Only exports count, not the automatic safety backups, and a restore never
  brings back the restored file's backup date (ADR 0110, #36).

- Properties and Projections say what their amounts are. The Properties subtitle reads
  "3 apartments · as of 03.10.2026 · amounts in Kč, flows per year"; the Projections
  subtitle adds "flows per year, balances at year end", and in Real mode names the base
  date ("real terms (Kč at projection start 07.06.2026)"). Column headers are unchanged.
  The Excel export button now shows "Export to Excel" next to its icon, everywhere it
  appears. No figure changes (ADR 0111, #21).

- Scenario compare exports to Excel. The button in the Key figures header saves one
  workbook in the current lens: the key figures (one column per scenario, always the
  values, money in whole Kč) and one sheet each for net worth, net cash flow and LTV by
  year. The lens, the rebased-returns footnote and the reason for an n/a IRR are notes
  under the key figures. No computed figure changes (ADR 0108, #56).

- Property detail has a section nav in its header: Overview · Records · Financing ·
  Holding costs · Projection · Amortization. A link jumps to the section and moves focus
  to its heading; the section in view is marked. The amortization schedule is collapsed
  by default behind "Show amortization schedule (N payments)" and stays open for the app
  session once opened; its Excel export works while collapsed. The loan warnings now sit
  under the mortgage blocks. No figure changes (ADR 0107, #23).

- About and the Guide say what the language setting changes: the interface text only.
  Amounts are always in Czech crowns (Kč) with Czech number and date formats (ADR 0105,
  #22).

- Stress presets have a **Combined** group. **Mild** saves rates +2 pp for 3 years and a
  −10 % price crash in one scenario; **Severe** saves rates +4 pp and inflation +3 pp for
  3 years and a −20 % price crash. The crash uses the "When" timing, the scenario name
  lists the parts, and a preset that is already saved is not added twice. No computed
  figure changes (ADR 0104, #55).

- The Dashboard has a **Financing & upcoming** panel. It shows the next modelled rate reset
  (date, property and the debt that moves to the reset rate), the debt resetting within 1,
  3 or 5 years, the total interest over the horizon (real or nominal, by lens) and the
  next 12 months' fixation ends, modelled loan payoffs, development completions and lease
  ends with no next lease entered, each linking to its property. The dates are modelled
  from your data, not lender deadlines. No existing figure changes (ADR 0103, #31).

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

- After a restore, the name of the safety backup (your undo copy) now stays on screen until
  you dismiss it, as it does after Clear sample (ADR 0154, #136). Before, it went away
  after 2.4 seconds. The outcome of a restore, Load sample, import or export now shows
  at the top of whichever page you are on, so it is not lost when you leave
  Settings → Backup while the action runs. A refused backup still lists its records.
  Restoring, clearing or loading the sample clears the old "Sample cleared" notice and
  the last import report, which described the old data. While a restore runs, the other
  Backup buttons wait. Short confirmations use one toast duration, 4 seconds. A restore
  from the startup error screen keeps naming the safety copy after Continue.

- Every form now uses the same messages for a blank or mistyped field (ADR 0140, #125). The
  property and scenario forms used their own short messages ("Invalid number", "Invalid %",
  "≥ 1"); they now say what to type, e.g. "Enter a percentage, e.g. 4,5". The property form
  refuses a negative purchase price or funding amount itself instead of passing it to the
  engine. A scenario shock lasts 1–100 years and the price crash lands at year 0–100, the
  longest horizon; a scenario stored with more must have its years lowered to save.
- A money field refuses an amount written with an English thousands separator, such as
  `450,000`, `450.000` or `1,250` (ADR 0140, #125). Before, it was read as a decimal and saved
  as 450 Kč or 1.25 Kč. Group thousands with a space: `450 000`. Amounts like `1 250 000`,
  `25 000,50` and `1000.005` are unaffected, and so are percentages. An amount saved that way
  earlier (e.g. `850.125`) must be retyped before its form saves.

- Properties are listed by name in Czech alphabetical order, with numbers by value ("Byt 2"
  before "Byt 10"), wherever the app lists them (ADR 0127). Before, the order followed an
  internal id, which only roughly matched the names.

- The down payment of a property bought after the projection start now starts from its
  **purchase price**, not its valuation, and subtracts the whole loan that funded the
  purchase, every development tranche included. Before, a development loan's later
  tranches were charged to the owner as own cash. The loan that funded the purchase is the
  property's first loan, when it starts no later than 90 days after the purchase; a first
  loan that starts later counts as cash paid to the owner in the year it is drawn. A
  property can now store how its purchase was funded (own cash, transaction costs, initial
  works and a note; the form follows in a later release); recorded own cash replaces the
  derived down payment. This changes levered IRR and cumulative cash flow only for
  properties bought after the projection start, so the sample portfolio's figures do not
  change. The database upgrades to version 10 (ADR 0119, #33, #103, #140).

- Stored loan prepayments and maturity changes are checked more strictly. An entry with an
  unknown field (for example a misspelt `fees`) makes the loan invalid instead of losing
  the value silently, so a hand-edited backup with extra fields no longer restores. A
  maturity change on a development loan must fall after the payment its completion lands
  on (ADR 0116, #32).

- The CSV import error for a yes/no column now lists every accepted value: `true`/`false`,
  `yes`/`no` or `1`/`0`. SPEC §6 now matches the importer: header rules, all-or-nothing
  import across the whole batch of files, and which empty cells keep or clear a stored
  value on re-import (ADR 0113, #61).

- Accessibility: the first Tab on any page shows **Skip to content**, which moves focus
  past the sidebar and topbar to the page. Each chart is announced by its title, with a
  pointer to its Table button. Chart axis labels take the intended 11 px size and a
  colour with at least 4.5:1 contrast, and the value axis fits its labels, so "−300 k"
  no longer breaks onto two lines. Tooltip labels are text-coloured with a line swatch,
  as in the legend. On the scenario compare charts each line also has its own dash
  pattern (ADR 0114, #24, #25).

- The app uses one name, "Real Estate Tracker", everywhere. The sidebar brand, the logo
  title and the loading screen said "Real Estate Portfolio"; the name is not translated
  (ADR 0105, #22).

- Scenarios: the **Stress presets** panel opens collapsed when at least one scenario is
  saved, so the compare starts higher on the page. A **Show presets / Hide presets** button
  opens and closes it; your choice lasts until the app closes. Saving your first preset
  does not close the panel; it opens collapsed on your next visit (ADR 0106, #54).

- The scenario form groups its fields under **Permanent levels**, **Temporary shocks** and
  **One-off price crash**, each with one line of help, so an absolute level (reset rate 6 %)
  no longer sits next to a temporary delta (+2 pp) without a visible difference. The levels
  help says a property with its own growth rate keeps it; SPEC no longer claims scenarios
  have per-property growth overrides. No computed figure changes (ADR 0102, #52).

- Scenarios keep the compare selection, the Base toggle and the price-crash timing when you
  leave the page and come back, for as long as the app is open. Deleting a ticked scenario
  removes it from the compare (ADR 0101, #50).

- The price-crash timing in Stress presets is a labelled **When** toggle (Start · +5y ·
  +10y) instead of action-style buttons, and each level button shows the timing it uses,
  for example "−20% @ +5y". Preset names are unchanged (ADR 0101, #51).

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

- Keyboard and screen-reader gaps (ADR 0157, #128):
  - With more than five properties, the property selector on the Dashboard and Projections
    now moves focus into its list when opened. Arrow keys, Home, End, Space and Enter work,
    the list is one Tab stop, and Escape puts focus back on the selector. A multiple
    selection is named in the interface language.
  - One Escape closes only the top-most dialog, and About no longer opens over another
    dialog from the app menu.
  - Every page has one level-one heading (its title), and the headings below it no longer
    skip a level. The Settings tabs follow the tab pattern: arrow keys move between them,
    Enter or Space switches.
  - The edit/delete columns have a name for screen readers, and the loan warnings on a
    property's page are no longer announced as alerts on each visit.
  - Dark-mode red text and badges, and the N/A dash in totals rows, now meet 4.5:1 contrast
    on every row background, including a row under the pointer.
  - The accessibility scan now also checks axe's best-practice rules.

- A property not yet purchased no longer shows figures as if it were owned (ADR 0156,
  #126). Before, Properties and its page showed its whole value as equity, an LTV of 0 %
  "Conservative" and a negative NOI. Its Properties row now shows "—" with the purchase
  date under the name, and its page shows a **Not owned yet** panel (purchase date, price,
  acquisition loan) in place of the tiles until the as-of date, or the projection year it
  reads, reaches the purchase.

- Deactivated properties no longer mislead (ADR 0155, #127):
  - With every property deactivated, the Dashboard and Projections say "All N properties
    are deactivated" with a link to Properties. Before, the Dashboard said "No portfolio
    yet" and offered the first-run steps, and Projections showed a table of zeros.
    Scenarios shows the same note in place of the comparison; saved scenarios stay
    editable. Projections and Scenarios with no property at all show the empty-portfolio
    note instead of zeros.
  - A deactivated property's page no longer asks for refix terms or shows a Data check,
    and its note says the figures on the page show it as if it were still active.
  - A Dashboard filter that keeps every active property no longer reads "1 of 1
    properties" or "n of n properties".

- The **Could not open the database** screen says what happened and offers a step that works
  (ADR 0153, #115):
  - An upgrade that stops after some of its steps were saved says which version the database
    reached and names the pre-migration copy. Before, it said nothing was changed and that
    the previous app version still opens the database, but that version refuses it.
  - **Try again** appears only where a retry can succeed.
  - **Show data folder** opens the app folder in Finder.
  - For an unreadable record, **Restore a backup…** restores a JSON backup from the screen,
    after a safety copy, as in Settings.
  - Details are listed as "Records involved" only when they are records.
  - [docs/data-safety.md](docs/data-safety.md) explains how to start with a new database and
    restore a backup.
- The **As of** field, the **Today** button and the page subtitles show the date the figures
  are computed for (ADR 0150, #113). With a projection start in the future, the field showed
  today and Today was selected while every figure was for the projection start; a date
  picked before a change of the projection start or the horizon kept showing although the
  figures had moved to the nearest date in the window.
- **Properties** shows the same figures as **Property detail** at Today (ADR 0150, #113).
  Once the projection start is six months or more in the past, Property detail shows
  projection year Y1, while the Properties table showed the records in force today: the
  same flat had a different value, debt and LTV on the two screens. The Properties context
  line now names the projection year and its period, e.g. "as of 15.01.2027 (projection
  year Y1 · 2027, Jul 2026 – Jun 2027)".
- A projection start on the 29th–31st maps an **As of** date to the right projection year
  (ADR 0150, #113): with 31.08.2026, 28.02.2027 now shows year 1, as value growth and
  inflation count it, instead of the records in force.
- When the **As of** date shows the projection year a property is bought in, Property
  detail reads "purchased", not "pending", above that year's figures, and Properties drops
  its **Pending** badge (ADR 0150, #113).
- The restore confirm step dates a backup by the local calendar day, like its file name and
  the "Last backup" line (ADR 0149, #119). A backup made just after midnight (before 02:00
  in Prague in summer) showed the previous day.
- The **As of** field follows the day when the app stays open over midnight (ADR 0149,
  #119). At Today it kept showing yesterday, and leaving the field saved yesterday as a
  picked date.
- Dates before 01.01.1900 follow one rule (ADR 0149, #119). CSV import now refuses them,
  as the form already did, so a typo such as `1026-09-01` no longer imports as the earliest
  lease; the message names the earliest accepted date, in the form too. A database that
  already holds such a date keeps loading: a restore lists it and asks to **Restore
  anyway**, and the Data check lists it under **Needs attention** with a link to the
  record. A year below 100 is no longer read as 19xx anywhere.
- A backup with a value outside the ranges the forms accept, such as a 60-year fixation
  from an older version, is no longer refused (ADR 0148, #133). The confirm step lists the
  values and asks to **Restore anyway**. Before, the app refused its own exports and the
  safety copy it saved before a restore or Clear sample, so a restore could not be undone.
  A value above ten times the range (for example a 2 000-year horizon) is still refused.
- Restore checks a property's garage and active flags before anything is changed (ADR 0148,
  #133). A bad flag passed the confirm step, and the restore then failed with "A yes/no
  value is not valid" after the safety copy was saved; the issue table now names the
  record and column.
- A backup holding two property names that differ only in case or surrounding spaces
  ("Byt A", "byt a") is refused as a duplicate (ADR 0148, #133), as CSV import and the
  property form already match names. Before, it restored, and later CSV rows for either
  name went to one of them.
- A saved amount or rate is read only in the app's own decimal notation (ADR 0148, #133).
  Forms such as `0x10`, `1_000`, `+5` or `1e3` in a hand-edited backup are refused, as in
  CSV import; the very small or large values the app writes as `1e-7` still read.
- The Data check lists a saved value outside the range the forms accept, under **Needs
  attention**, with the value, the range and a link to fix it (ADR 0148, #133): a
  property's size, a mortgage's fixation or loan term, and on the Dashboard the projection
  horizon. Such values could come from an older version and were not shown anywhere.
- A crash in the app's core, including a failure to set up the window menu at start, is
  now written to the error log (ADR 0147, #122). Before, it reached only the terminal,
  which is not shown when the app is opened from Finder.
- The error log's folder is now private to your user (`0700`, files `0600`), as the
  README said (ADR 0147, #122). Only the app's data folder was restricted before.
- The error log masks every number, not only those of four or more digits, so a short
  amount such as `850 Kč` is not recorded (ADR 0147, #122). The bug form names what to
  replace in a pasted log excerpt: property and scenario names, record ids built from
  them, and folder paths.
- When Import cannot check the chosen files against your saved data, an error says so
  (ADR 0147, #122). Before, the Import button stayed greyed out with no reason.
- A backup file that cannot be read (an unplugged disk, a file not yet downloaded from
  iCloud) now says "The file could not be read" (ADR 0147, #122). It said the file was not
  a valid backup of this app, which could make you throw away a good backup. A failure to
  read your current data for the safety backup before a restore or Clear sample now says
  that the safety backup could not be saved, not that the action failed and was rolled
  back.
- The error log names where a failure happened (ADR 0147, #122). A failed reload after a
  save was logged as a failed save, and failures to restore a backup, load the sample or
  clear it were all logged as `BACKUP_FAILED`. They are now `RELOAD_FAILED`,
  `RESTORE_FAILED` and `SAMPLE_FAILED`.
- After moving to another page from the sidebar or the menu, keyboard focus is on the new
  page's content (ADR 0146, #131). Before, it fell back to the start of the window, so the
  next Tab went to "Skip to content" again and a screen reader was not told the page
  changed. Focus is not moved at startup, and focus a page sets itself (a dialog, a
  glossary term, a section) is kept.
- With saved data that breaks a calculation rule, the sidebar stays (ADR 0146, #131).
  Dashboard, Properties and Projections showed the invalid-data notice in place of the
  whole window, sidebar included, so Settings (to restore a backup) and Import could not
  be opened from the sidebar. The notice now shows inside the page, under its title. This
  holds for any page that fails to render.
- Moving to another page clears a crash notice (ADR 0146, #131). Before, the notice that
  replaced the window stayed when a menu shortcut (⌘1–⌘5, ⌘,) changed the page; only its
  own button cleared it.
- With saved data that breaks a calculation rule, Import opens again (ADR 0146, #131). It
  ran the full calculation only to list the property names, so it showed the invalid-data
  notice instead of the page that can load a corrected CSV. It now reads the names from
  the saved properties.
- Excel exports show text exactly as typed: a scenario named `+2 % rates` was exported as
  `'+2 % rates` (ADR 0145, #139). Text that starts with `=`, `+`, `-` or `@` now gets the
  Text cell format instead of an apostrophe, so re-entering it in Excel keeps it as text. A
  figure with no finite value (for example a CAGR that cannot be computed) is an empty cell;
  before, it was written as `NaN`, which is not a valid number in the file.
- The Dashboard's financing panel names the period of its interest-saved figure: "Interest
  saved by prepayments over the loans' remaining life (nominal)" (ADR 0144, #172). Before,
  "Interest saved by prepayments (nominal)" next to "Total interest (Yrs 1–N)" read as the same N years.
  The figure is unchanged.
- Adding a valuation or lease with an end date no longer asks to end the previous
  open-ended record (ADR 0144, #121). For a lease, ending the previous one removed its
  rent from the months after the new lease ends. Adding an open-ended record still asks,
  as before (ADR 0099).
- A delete confirm in a property's valuations, leases and mortgages names the row, for
  example "Delete the valuation from 01.01.2026?" (ADR 0143, #132). Before, it asked only
  "Delete this record?". Every inline confirm (delete a property, a record or a scenario,
  deactivate a property) now moves focus to its Cancel button, and Cancel puts focus back
  on the button that opened it; a screen reader reads the question with the button. A
  failed scenario delete keeps the confirm open with the reason next to the buttons, as the
  other confirms do; before, it closed before the delete ran.
- In a property's valuations, leases, mortgages and holding costs, a click on another row's
  Edit or Delete while the form holds typed edits now asks first (Keep editing / Discard),
  as leaving the page does (ADR 0142, #132). Before, the edits were lost without a word.
  A form with unsaved edits in another panel does not make it ask, and keeps its edits.
- While Clear sample, the property form or the scenario form is writing, ✕ is disabled, and
  Esc and a click outside do not close the dialog (ADR 0142, #132). Before, ✕ could close it
  mid-write, so a failure had nowhere to show.
- A form save refused by an input rule shows its message once, in the form (ADR 0141,
  #125). Before, the banner at the top of the page repeated it and stayed after Cancel. The
  Assumptions form lists a rule on a field it does not show in its error summary. Adding a
  preset or duplicating a scenario, with no form open, still shows the banner.
- Editing a field clears its error in the record forms, Assumptions and the scenario form,
  as the property form already did (ADR 0141, #125). Before, the error stayed until the next
  save. The scenario Name is marked required, like the other required fields.
- A first loan taken out after the projection start on a property you already own now
  counts its principal as cash paid to you, in the year it is drawn (ADR 0134, #181). Its
  debt was already counted, but its money was not, so cumulative net cash flow and levered
  IRR were too low by the loan's principal. A development loan's tranches still do not
  count: they pay the builder.
- A future purchase whose loan was drawn before the projection start (an off-plan loan)
  now pays the principal that loan repaid before the projection start, together with the
  down payment (ADR 0134, #193). It showed as equity you had not paid for, so cumulative
  net cash flow and levered IRR were too high. A loan already refinanced before the
  projection start is not traced.
- LTV and the yields read **n/a** when the value is 0, instead of 0 % (ADR 0133, #129). A
  100 % value crash in a scenario, or a 0 Kč valuation, showed LTV 0,0 % in the
  "Conservative" band with the debt still owed, and yields of 0 %. The Dashboard and
  property tiles, the Properties table, the projection grid and the LTV charts' tooltip and
  table now show "n/a" with no band badge; the LTV line leaves a gap and the Excel exports
  leave the cell blank. With no value and no debt, LTV stays 0 %.
- Interest saved and the refinance difference (ADR 0130, #172):
  - **Interest saved by prepayments** is shown only when a prepayment repaid some
    principal and saved something; a prepayment that a later block replaced, one after
    payoff, or one on the day a new block starts no longer shows 0 Kč. When a maturity change takes effect only because of the prepayment, the
    figure would be negative: the property page and the Dashboard show "n/a: a recast
    depends on the prepayment" instead, and the Dashboard total leaves it out.
  - A planned refix (a later loan block) no longer makes the **Drawn** and **Draws**
    columns appear. The successor's principal less the balance it pays off shows in its
    own **Refinance difference** column, in the amortization table, the projection grid
    and both Excel exports. Optional columns appear from half a haléř, so a successor
    typed to the haléř shows no column.

- Loan schedule edge cases (ADR 0129, #135):
  - A prepayment or maturity change dated after the last payment due by the snapshot date
    now counts a development-loan tranche drawn earlier in that window. A 300,000 Kč
    prepayment was cut to the balance before the tranche, depending on the snapshot date's
    day.
  - A development loan's payment is interest-only when its due date is on or before the
    completion date, in the projection as in the history. The projection read it on the
    grid date, so a payment due just before completion could amortize.
  - A tranche dated after the loan's last-but-one payment is refused: the final payment
    would have repaid it in one shot.
  - The "Fixation ended" warning (property page and Data check) also shows when the next
    loan block leaves at least one payment at the assumed reset rate, with "from … until
    …".
  - An error raised for an invalid stored prepayment or maturity change names its row.

- Saving a form no longer rounds a stored rate it did not change (ADR 0131, #208). A rate
  imported or restored with more than six decimals (e.g. interest rate `0.03591234`) was
  rewritten to six (`0.035912`) by any edit of the same record. Forms now show and save the
  stored rate in full, as a percentage (`3.591234`).

- Assumptions that broke the maths are refused instead of showing `Infinity`, `NaN` or
  negative interest (ADR 0128, #114). The Assumptions page, the scenario form, the property
  form, CSV import and restore now check that:
  - the post-fixation reset rate lies within 0–100 %, like a loan's own rate;
  - growth, rent indexation, inflation and a property's growth overrides are above −100 %
    (an inflation of −100 % gave an infinite real net worth);
  - a scenario's rate shock keeps the reset rate within 0–100 %, and its inflation shock
    keeps inflation above −100 %; the scenario form shows this on the shock's field;
  - a value crash percentage is a finite number.

  Saving the assumptions is refused when the new value would break a saved scenario's
  shock; the message names the scenario. A scenario that broke the rule before the edit
  does not block it. Stored values are not changed: a value already outside these bounds
  shows the invalid-input message until it is corrected.

- A backup exported while a change was being saved could mix the data from before and
  after it: for example a new flat's valuation without the flat. Such a file could fail its
  own restore check, or restore with records missing, and the export still reported
  success. The export, and the safety backup before a restore or Clear sample, now read the
  whole database at one moment (ADR 0132, #138). A backup file now lists each record's
  fields in alphabetical order; every backup, old or new, restores as before.
- The **Reload** button on the "change may not be shown yet" banner could finish after a
  save made while it ran and put the older data back on screen, with the banner gone: the
  saved record seemed to vanish until the next change. Reload now waits for pending saves
  and shows what they wrote (ADR 0132, #138, #199).
- A property whose name has no Latin letters or digits (for example a Cyrillic name) was
  saved with an empty internal id. It showed in the list, but its page, its edit form, its
  "Open property" link and the Dashboard filter treated it as "no property", and a CSV file
  could not add its loans, valuations or rents. Such a property now works like any other
  (ADR 0127, #105).
- A new property gets a random internal id, from the property form and from a CSV import,
  instead of one made from its name (ADR 0127, #105). A Cyrillic name no longer gets an
  empty id. Names that differ only in punctuation or accents ("Byt 1" and "Byt-1",
  "Lipová 2" and "Lipova 2") no longer fail with "a record with the same internal id
  already exists".
- **Clear sample** deleted any property whose internal id was a sample one, so it could
  delete your own flat named after a sample street (for example "Dubová") with all its
  loans, leases and valuations. It now deletes a property only while it still has both the
  sample's id and its name ("Byt Javorova", "Byt Lipova", "Byt Dubova"). A sample flat you
  renamed counts as yours and is kept. The sample banner follows the same rule (ADR 0127,
  #101).
- After a restore, the sample banner no longer comes back over your own data. On a new Mac,
  the first launch fills in the sample; restoring your backup then kept the sample label,
  and **Clear sample** could delete your own flat if its internal id matched a sample one
  (for example a flat named "Lipová"). A restore now clears the sample label (ADR 0127,
  #101).
- Saving a form no longer rounds a stored amount it did not change (ADR 0131, #201). An
  amount imported, restored or typed with more than two decimals (e.g. own cash `1000.005`) was
  rewritten to two (`1000.01`) by any edit of the same record, such as a rename. Forms now
  show and save the stored amount in full.
- Headline KPIs no longer contradict their inputs in edge cases (ADR 0126, #129):
  - The net-worth multiple shows "—" when equity at the projection start is zero or less,
    instead of "0,00x" or a negative multiple (−31,19x after a deep crash at Today).
  - CAGR shows "—" when net worth at the horizon is zero or less, instead of "NaN %".
  - "Debt fully repaid" is the year from which debt stays repaid; debt drawn later moves it
    on, and it shows "—" while debt is still owed at the horizon.
  - A property or portfolio with no debt shows DSCR "—" with no "Shortfall" badge.
- A restore, Clear sample, Load sample or CSV import that went through but whose screen
  could not reload said it had failed and been rolled back, with the data unchanged. It now
  reports success, naming the safety backup, and the banner asks you to reload. A form save
  in the same case closes instead of refusing a retry as a duplicate, and the Assumptions
  page shows the values just saved (ADR 0125, #106).
- Scenarios now follow the same rules as the assumptions (ADR 0123, #107, #108):
  - The scenario form refuses a vacancy or a value crash outside 0–100 % and shows why on
    the field. A crash is entered as a positive number (20 = values fall by 20 %); "-20"
    used to be saved and then broke the whole Scenarios page until a restart.
  - A saved scenario that breaks a rule is left out of the compare and named above it,
    instead of breaking the page.
  - A fast double Return in the scenario form no longer saves the scenario twice.
- A scenario with an invalid creation date, restored from a hand-edited backup, stopped
  the app from starting. The app no longer reads that date, and restore now checks that
  every scenario in the backup can be read before it changes anything. A scenario that
  breaks a rule still restores and is left out of the compare until it is fixed, so every
  backup the app writes can be restored (ADR 0123, #107).
- One scenario the app cannot read no longer stops startup: it is listed on the Scenarios
  page with a Delete button (ADR 0123, #107).
- A property bought in the future whose mortgage started earlier (an off-plan flat, the loan
  drawn at contract and the purchase date set to the handover) now pays the loan's
  instalments before the handover. Their interest and principal, and any prepayment and fee,
  lower the cumulative net cash flow and the levered IRR in the years they are paid, and the
  interest counts in total interest. Before, those years were left out. The projection rows
  before the purchase stay empty (ADR 0124, #104).
- A valuation's "Valid to" date no longer changes the property's value. Before, once it
  passed, the value fell back to the purchase price or to an older valuation. The latest
  valuation now keeps governing, grown by appreciation, until a newer one replaces it; in a
  gap between two valuations the earlier one governs. The purchase price stands in only when
  a property has no valuation, and the Data check then says "No valuation is recorded"
  (ADR 0122, #110).
- The levered IRR no longer reports "No IRR between −90 % and +1000 %" when the cash flows
  break even exactly at −90 % or at +1000 %. A break-even exactly on a search bound (−90 %,
  +100 % … +1000 %) is now that rate, not a value next to it, and cash flows that break even
  on a bound and at a second rate show "No unique IRR" (ADR 0121, #185).
- The "first cash-flow-positive year" no longer names a year that earned nothing. With only
  properties bought in the future (or a Dashboard filter on them), it showed the first
  projection year; it now shows the first year whose net cash flow is above zero, or "—"
  (ADR 0121, #102).
- A development tranche paid out in the month of an agreed new instalment no longer leaves
  the loan with too low an instalment and a large final payment. That month still pays the
  agreed instalment, and the next payment is recalculated for the higher balance (ADR 0120,
  #109).
- Stat lists (the property page's Loan outlook, the Dashboard financing panel, Backup) no
  longer draw a short line under their last label (ADR 0117).
- A development loan completed after its last payment before the projection start, with no
  tranche in the first projection month, stayed interest-only to maturity and repaid
  everything at the end. It now starts amortizing from the first projection month (ADR
  0116).
- Loan prepayments and maturity changes (engine, ahead of the form):
  - A development tranche that lands on the last payment of a shortened term restores the
    contract term instead of being repaid at once.
  - A refinance that pays two identical prepayments charges each its own fee.
  - The as-of snapshot shows the lowered instalment in the month of a prepayment.
  - The Scenarios rate-shock note reads the maturity in force, so a loan repaid by a
    prepayment before its refix no longer counts as hit (ADR 0116, #32).
- Settings → Backup: the **Sample portfolio** panel no longer says the apartments were
  added on first launch. Its hint now reads "Fictional apartments to explore the app",
  also when the sample was loaded later (ADR 0115, #97).

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
