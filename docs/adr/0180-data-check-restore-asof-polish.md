# 0180. Data check, restore and as-of polish: stored columns, non-integers, a pick nobody made

- Status: Accepted
- Date: 2026-10-11
- Source: issues #263 (items 2, 3, 4, 6), #260 (items 1–6; owner, 2026-10-11: show decimals
  and report a non-integer as a finding), #265 (items 6, 7), #276 (item 3; owner, 2026-10-11:
  write the pruned filter back); Track 14 PR N3
- Amends: [0148](0148-restore-rules-vs-stored-data.md) §1, §2 and §4,
  [0150](0150-one-asof-resolver.md) §1, [0155](0155-lifecycle-states-on-the-pages.md) §4
- Related: [0149](0149-calendar-days.md) §5 (early dates),
  [0152](0152-wording-log-and-generated-index.md) (wording log),
  [0118](0118-data-check.md) (data check)

## Context

The reviews of the restore rules (#259, ADR 0148), the calendar days (#262, ADR 0149), the
as-of resolver (#264, ADR 0150) and the lifecycle states (#275, ADR 0155) left small gaps:

1. **#263 item 2:** the restore issue table derived the column from the engine field name.
   `completionDate` read `completion_date` (the column is `interest_only_until`), and an
   assumption default such as `defaults.propertyTaxYr` read `defaults.property_tax_yr` (the
   column is `default_property_tax_yr`).
2. **#260 item 1:** the Data check rounded the stored value to a whole number. `size_m2` has no
   CHECK and can hold a fraction: 10 000.4 m² was flagged but shown as "10 000", 0.4 as "0",
   and 50.5 m², inside the range, was not flagged although the forms refuse it.
3. **#263 item 4:** an early mortgage date read "A mortgage date 01.01.1850" without saying
   which loan, while the out-of-range rows name the loan by its start date.
4. **#263 item 3, #260 item 3:** the restore warning says the Data check lists the values after
   the restore, but the Dashboard check covers only the active properties in its filter, and
   nothing at all when no property is active. Where each value is listed was not written down.
5. **#260 item 2:** the stored-decimal reader accepts exponent forms decimal.js never writes
   (`1e+5`, `1.50e-7`); ADR 0148 §4 did not say so.
6. **#263 item 6, #265 item 6:** committing the date the as-of picker already shows went
   through `pick`. At a future base date with nothing picked, focus and blur stored the base
   date, so the page stopped following Today once today passed it. A re-typed same day
   (`2.10.2026`) also stayed unformatted after Enter or blur.
7. **#276 item 3:** the Dashboard pruned its saved filter on every read but never stored the
   pruned list. A filter `["dev", "inactive"]` with only `dev` active read as no filter (ADR 0155
   §4); after a third property was reactivated it read "1 of 2", a filter the owner never chose.

## Decision

1. **The restore table names the stored column.** The field-to-column step maps
   `completionDate` to `interest_only_until` and an assumption default `defaults.<field>` to
   `default_<field>`; every other field keeps its snake-case name. A test pins every column
   restore can name to `BACKUP_COLUMNS`.
2. **A whole-number field that is not whole is a value the forms do not accept** (amends 0148
   §1 and §2). `outOfRangeFields` flags it as well as a value outside the range, so the Data
   check lists it and restore asks about it (`OUT_OF_RANGE`, "Must be a whole number from …
   to …", "Restore anyway"). The Data check shows the stored value with every decimal
   (`fmtNumber`): "Size 10 000,4 m² is outside the range …"; a size inside the range reads with
   the new `dataCheck.notWholeSize`. Only the size can reach this: the engine already refuses a
   non-integer horizon, fixation or loan term, and that engine error is the one reported.
3. **An early mortgage date names its loan.** The finding carries the loan's start date and
   reads with the new `dataCheck.earlyDateLoan` ("Mortgage from 01.05.2019: a date 01.01.1850 is
   before …"), like the out-of-range rows. When the early date is the start date itself, the
   date already names the loan and `earlyDateRecord.mortgage` stays.
4. **Where the Data check lists a stored value** (amends 0148 §2, written down, no change):
   - the Dashboard: the active properties its filter shows, plus the portfolio rows (the
     horizon, the base date); with no active property (none recorded, or all deactivated) the
     Dashboard shows its empty or all-inactive state and no Data check;
   - Property detail: its own property, when active. An inactive property has no Data check
     (ADR 0155, owner decision D11) and is left out of every computation; its values are listed
     once it is reactivated, and the restore confirm table names the record either way.

   The restore warning's "the Data check lists them" means these places together; its text
   does not change.

5. **The stored-decimal reader stays as written** (amends 0148 §4). It also accepts a `+` in the
   exponent of any value and trailing fraction zeros (`1e+5`, `1.50e-7`), which `toString()`
   never writes. They are harmless, and the same reader loads the live database, so narrowing
   it could stop a database from opening. A test pins the accepted forms.
6. **Committing the shown date changes nothing in the store** (amends 0150 §1). When the typed
   date, moved into the window, equals the date the picker shows, the picker reformats its
   text (`02.10.2026`) and calls nothing. A blur at a future base date no longer stores a pick,
   so the page keeps following Today.
7. **The Dashboard stores the filter it shows** (amends 0155 §4). When the saved filter holds a
   property that is not active, the Dashboard writes back the filter it shows: the active ids,
   or no filter (`[]`) when those filter nothing (none left, or every active property). So
   `["dev", "inactive"]` with only `dev` active becomes no filter, and a reactivated property
   finds All. A saved filter of active properties only is left as picked, every active
   property included: `[a, b]` of `{a, b, c}` reads as All while `c` is deactivated and as
   "2 of 3" again when `c` returns. The cost: a filter that names the deactivated property is
   rewritten. `[a, x]` of `{a, b, x}` becomes `[a]` once `x` is deactivated, so `x` does not
   come back with it; and `[a, x]` of `{a, x}` becomes no filter, so it stays All when `x`
   returns (selling and buying back an apartment).

## Consequences

- Computed numbers do not change: parity, the golden master and the bench budgets are
  unchanged; no engine file changes.
- New user-visible text (en, cs, ru): `dataCheck.notWholeSize`, `dataCheck.earlyDateLoan`.
  `dataCheck.assumptions` is removed; the fix link reuses `settings.tabs.assumptions` (same
  text). The cs/ru year word after an out-of-range value and the ru restore warning wording
  are copy fixes, logged in `docs/decisions/wording.md`.
- A backup holding a fractional size now asks before it restores, where it restored silently.
- `docs/data-safety.md` says where the Data check lists a value.
- Tests added for the remaining gaps: a refusal before the rules run lists no out-of-range
  value (#260 item 6); a refused file's rows use the error colour; Property detail at a future
  base date and the tiles at a clamped horizon (#265 item 7).
