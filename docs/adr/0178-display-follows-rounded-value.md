# 0178. Signs, colours and optional columns follow the displayed value

- Status: Accepted
- Date: 2026-10-11
- Source: issues #186 and #220 (owner option A, 2026-10-11), #146 items R4-04, R4-08, R4-20 and
  G2-2-09 (owner: rates keep 2 decimals), #263 item 5; owner answers to the N2 plan
  (2026-10-11: Czech year word in the list summary only, Compare Δ money stays in M Kč);
  Track 14 PR N2
- Amends: [0130](0130-interest-saved-refinance.md) §5 (the optional-column threshold),
  [0110](0110-backup-recency-indicator.md) §5 (backup age gains months),
  [0097](0097-compare-delta-view.md) (when a Δ cell gets a "+"),
  [0090](0090-scenario-wording.md) §2 (the summary signs a shock once)
- Related: DR-110 (zero shown without a minus), [0010](0010-excel-export-rounded.md) (export
  rounded like the screen), [0093](0093-scenario-add-flow.md) (a preset is found by its name),
  [0149](0149-calendar-days.md) §5 (full years)

## Context

The display rounds money to whole Kč and percentage points to one decimal, and since DR-110 a
value that rounds to zero is printed without a minus. Several places still decided the sign,
the colour or the visibility from the unrounded value:

1. **#186:** `Money` coloured by the exact sign. −0.3 Kč showed a red "(0 Kč)"; a signed flow of
   +0.3 Kč a green "0 Kč".
2. **#220:** ADR 0130 §5 shows an optional column (Drawn/Draws, Prepaid, Prepayment fee,
   Refinance difference, Undrawn) once some row has |value| ≥ 0.005 Kč. A successor principal
   typed from the bank's payoff balance can differ from the engine's balance by a few tenths of
   a crown: 1,386,249.50 against 1,386,249.89 gives −0.39 Kč, and the screen and both Excel
   exports showed a column of "0 Kč" cells.
3. **#146 R4-08:** Compare "Δ vs Base" put "+" on any positive difference, so a tiny gain read
   "+0,0 M Kč" beside a tiny loss's "0,0 M Kč".
4. **#146 R4-04:** the scenario list summary templates hard-code "+", and `fmtPp` signs a
   negative, so a user-typed rate cut read "rates +−1,0 pp for 2y". The Czech summary also used
   "l." (short for "let", right only for 5 or more years) for every count: "na 3 l.".
5. **#146 R4-20:** backup age had no unit above weeks: a year-old backup read "57 weeks ago".
6. **#263 item 5:** dates did not pad the year: 01.01.850 instead of 01.01.0850.

## Decision

1. **One rule: sign, colour and visibility follow the value as it is displayed.**
   - `Money` takes its tone from `roundCzk(value)`: anything that prints "0 Kč" is neutral.
     `signTone` itself keeps the exact-zero rule.
   - `nonZeroColumns` shows an optional column when some row's `roundCzk(value)` is not zero,
     that is from half a crown (|v| ≥ 0.5 Kč, half-up as `fmtCzk` rounds). Screen and both
     Excel exports share the rule, as before. This replaces ADR 0130 §5's 0.005 Kč.
2. **"+" only on a non-zero displayed value.** `fmtSigned(value, fmt)` (`lib/format`) formats
   first and adds "+" only when the value is positive and its text differs from the formatted
   zero; a negative is signed by the formatter. Compare Δ cells (decimal rows and the Δ net
   worth row) and the scenario summary use it. The summary templates (`sumInflationShock`,
   `sumRateShock` in en, cs, ru) no longer carry a sign.
3. **Czech year word in the list summary.** cs `sumInflationShock` / `sumRateShock` use
   `csPlural`: "na 1 rok", "na 3 roky", "na 5 let". Preset names (`rateForYears`,
   `inflForYears`) keep "l.": they are saved scenario names and a preset is found by its name
   (ADR 0093), so a renamed preset would add a duplicate. Logged in `docs/decisions/wording.md`.
4. **Backup age in months.** Below 14 days: days; below 60 days: whole weeks; from 60 days:
   whole months of 30 days (`floor(days / 30)`): 60 days → "2 months ago", 399 days →
   "13 months ago". New entry `backup.agoMonths` in en, cs, ru.
5. **Four-digit years.** `fmtDate` and `isoDay` pad the year to four digits. The forms still
   refuse years before 1900 (ADR 0149 §5), so a padded draft is never saved.

### What stays as it is

- The engine keeps full precision; golden master and parity targets do not change.
- **Rates keep two decimals** on screen and in the Excel export (#146 G2-2-09, option C):
  the owner confirmed on 2026-10-11 that no loan uses a third decimal. The mortgage form
  keeps showing the exact entered rate (4 decimals). ADR 0010 holds unchanged.
- **Compare Δ money stays in M Kč with one decimal** (owner, 2026-10-11): a difference under
  50,000 Kč reads "0,0 M Kč", now without a "+".
- Built-in preset names and the preset buttons' titles do not change.
- Not covered by the rule yet: interest saved still hides or notes on its unrounded figure
  (`interestSavedShown`, ADR 0130 §2), tracked in #327. Charts are out of scope: a tooltip
  swatch or bar colour by sign and the undrawn-debt series visibility are not text.

## Consequences

- A refinance difference of a few haléř to 0.49 Kč no longer shows a column; 0.5 Kč and more
  does, and its cells read at least "1 Kč" or "(1 Kč)".
- No sample-portfolio screen changes: the sample has no sub-crown amounts, no successor block,
  positive presets and no year before 1000 (ux-capture unchanged).
