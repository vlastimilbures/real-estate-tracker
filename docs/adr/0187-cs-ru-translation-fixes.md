# 0187. Czech and Russian translation fixes

- Status: Accepted
- Date: 2026-10-13
- Source: issues #169 and #152 (items 2–6), 2026-10 review; owner approved the exact
  wording on 2026-10-13; Track 14 PR N7b
- Related: [0152](0152-wording-log-and-generated-index.md) (accessible names, live regions,
  exports and code need an ADR), [0093](0093-scenario-add-flow.md) (presets matched by name),
  [0003](0003-czech-practice-decides.md) (banking terms)

## Context

The Czech and Russian dictionaries name one concept in several ways (principal, draws,
fixation end, the payment schedule, the pre-restore safety copy), leave English words
("Development", "Start", "refix"), break grammar ("годовых" after no number) and print
fixed plurals. A duplicated scenario is saved as "Name (copy)" in every language. Many of these strings are accessible names
(labels, table headers, toggle options, the Projections picker's aria-label), form alerts,
or text written to the xlsx exports, so the change is recorded here; the plain-text rest is
in the wording log (2026-10-13 · N7b).

## Decision

The keys below are accessible names (labels, table headers, toggle options, button text,
the Projections picker's aria-label), form alerts or status toasts, or text written to the
xlsx exports. Their new text follows one term per concept:

1. Principal, draws and nominal (ru): `propertyDetail.colInitialPrincipal`,
   `propertyDetail.fieldInitialPrincipal`, `propertyDetail.calcDisabled`,
   `propertyDetail.amColPrincipal`, `propertyDetail.amColDrawn`, `projGrid.principal`,
   `inputRules.DRAW_BEFORE_START`, `common.nominal`, `scenarios.kpiNetWorthNominal`,
   `scenarios.kpiCagrNominal`, `scenarios.kpiLeveredIrrNominal`.
2. Yearly rates (ru): `propertyDetail.fieldInterestRate`, `assumptions.appreciation`,
   `assumptions.rentIndexation`, `assumptions.inflation`, `scenarios.fieldAppreciation`,
   `scenarios.fieldRentIndexation`, `scenarios.fieldInflation`.
3. Czech names: `propertyDetail.colDevelopment`, `scenarios.atStart`,
   `propertyDetail.drawnAtStart`, `inputRules.DRAW_BEFORE_START`,
   `propertyDetail.fieldPropertyTax`, `assumptions.propertyTax`,
   `inputRules.DUPLICATE_HOLDING_COST`, `inputRules.ASOF_BEFORE_BASEDATE`.
4. The schedule (cs, ru): `propertyDetail.sectionAmortization`,
   `propertyDetail.amortizationTitle`, `propertyDetail.showAmortization`,
   `propertyDetail.hideAmortization`.
5. The Projections picker (cs, ru): `projections.entity`.
6. The fixation end (en drops "refix"; cs, ru): `scenarios.rateShockAtRefix`,
   `scenarios.fieldRateShock`, and `scenarios.reachHits` / `scenarios.reachNone`, which
   are part of a compare column header's name; `scenarios.keyFiguresHintReal` (the compare
   export's lens note); `guide.glossary.reset.term`. English keeps "rate reset".
7. Count words use the plural helpers: `scenarios.addedCompareFull`,
   `scenarios.duplicatedCompareFull` (status toasts) and `scenarios.listHint` read the same
   at today's limit of three.
8. A duplicate's name comes from `scenarios.copyName` in the UI language; names saved
   before keep "(copy)".
9. No preset name changes (ADR 0093): the keys that build saved preset names are untouched,
   and the crash labels "−20%" stay.
10. A test fails when a cs/ru string equals English (allow-list) or uses a retired term.

## Consequences

Copy only: no computed number, parity target or golden master changes. Exports carry the new
headers and lens notes. Raw OS error text in export failures (#169 G2-5-07) stays open. Translated file-type names
for the save dialogs were tried and dropped: on macOS the dialog shows only the extensions.
