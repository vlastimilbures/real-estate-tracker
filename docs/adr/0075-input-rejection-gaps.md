# 0075. Input-rejection gaps: negative cost defaults, as-of, horizon, whole-number bounds

- Status: Accepted
- Date: 2026-10-02
- Source IDs: DR-176, DR-131, DR-115, DR-078 (P14 plan)
- Extends: [0037](0037-data-integrity-codes.md), [0038](0038-range-codes.md)
- Amended by: ADR 0086

## Context

Four inputs still get through that the engine or the forms should refuse:

- **DR-176.** A negative Assumptions cost default (property tax, insurance, SVJ, other) is
  accepted by the form, the engine and the database. It lowers holding costs and raises NOI.
  Holding-cost overrides already reject negatives (D-54).
- **DR-131.** An as-of date before the base date raises ASOF_BEFORE_BASEDATE only when the
  portfolio has a property; an empty portfolio returns an empty snapshot.
- **DR-115.** An invalid `horizonYears` can reach the checked `at()` on some engine entry
  points before the typed HORIZON_NOT_POSITIVE error, so the error reads "Engine invariant
  broken: index …".
- **DR-078.** The forms' whole-number parser has no bound: a 400-digit entry becomes
  `Infinity`, and a 1,000-year horizon or fixation is accepted.

## Decision

Owner, 2026-10-02 (P14 plan):

1. **Negative cost defaults are rejected.** `validateInputs` reports NEGATIVE_AMOUNT on
   `defaults.propertyTaxYr`, `defaults.insuranceYr`, `defaults.svjMonthly` and
   `defaults.otherYr`, the same rule D-54 puts on the overrides. Every engine entry point,
   CSV import and restore inherit it. The Assumptions form parses money like every other
   form (0 or more) and shows the field hint.
2. **No migration for stored negatives.** A database that already holds a negative default
   loads; the engine raises NEGATIVE_AMOUNT and the app shows the existing invalid-input
   message (UX-049) until the owner corrects the value in Settings → Assumptions. No DB
   CHECK is added (as for D-54).
3. **As-of is checked once per portfolio snapshot,** so an empty portfolio raises
   ASOF_BEFORE_BASEDATE too.
4. **HORIZON_NOT_POSITIVE comes first** on every public engine entry point that takes
   assumptions: each one validates the assumptions before it indexes by the horizon.
5. **Whole-number form fields are bounded:** at most 9 digits everywhere (as CSV import),
   and per field —

   | Field                     | Range    |
   | ------------------------- | -------- |
   | Projection horizon        | 1–100    |
   | Mortgage fixation (years) | 0–50     |
   | Mortgage term (years)     | 1–50     |
   | Property size (m²)        | 1–10 000 |

   An entry outside the range shows "Enter a whole number from {min} to {max}" (en/cs/ru).
   The engine and CSV import keep their current integer rules (no upper bound); the
   `D(number)` half of DR-078 stays open.

## Consequences

Valid input computes the same numbers: parity, the golden master and the bench budgets are
unchanged. New rejections are user-visible (UX-067, UX-068). A stored negative default or an
out-of-range stored value is not rewritten; the owner fixes it through the form.
