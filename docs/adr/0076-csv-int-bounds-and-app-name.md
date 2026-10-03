# 0076. CSV whole-number bounds and one app name

- Status: Accepted
- Date: 2026-10-02
- Source IDs: DR-177, DR-175 (P15 plan)
- Extends: [0075](0075-input-rejection-gaps.md)

## Context

- **DR-177.** ADR 0075 bounded the whole-number form fields, but CSV import still accepts
  any 9-digit value: a mortgage with `fixation_years` 60 or a property with `size_m2` 0
  imports, although the same values are refused in the forms.
- **DR-175.** The app is called "Real Estate Tracker" (bundle, menu bar, Finder), but the
  window title, the About menu item and the About page say "Real Estate Portfolio Tracker".

## Decision

Owner, 2026-10-02 (P15 plan):

1. **CSV import applies the ADR 0075 ranges.** `fixation_years` 0–50, `loan_term_years`
   1–50 and `size_m2` 1–10 000 (the projection horizon is not a CSV column). A value
   outside the range refuses the row with "{value} must be a whole number from {min} to
   {max}" (en/cs/ru). A loan term of 0 keeps its existing message ("the loan term must be
   at least one year"). The ranges live in one shared module used by the forms and the
   importer.
2. **One app name: "Real Estate Tracker".** The window title, the page title, the About
   menu item and the About page subtitle follow `productName`. The bundle name, the bundle
   identifier and the data folder do not change.

The engine keeps its current integer rules (no upper bound); engine range codes for these
fields would be a separate decision.

## Consequences

Valid input computes the same numbers: parity, the golden master and the bench budgets are
unchanged. A CSV that previously imported out-of-range values is now refused (UX-069).
The visible name changes in four places (UX-070). Rows already stored are not rewritten.
