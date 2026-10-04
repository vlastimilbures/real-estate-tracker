# 0121. The first cash-flow-positive year is strictly positive

- Status: Accepted
- Date: 2026-10-04
- Source: issue #102 (2026-10 code review, findings R8-01 and R2-03)
- Related: [0022](0022-year-labelling.md) (D-22), [0034](0034-cagr-null.md),
  [0097](0097-compare-delta-view.md)

## Context

The KPI "first cash-flow-positive year" is meant to be the first projection year after year 0
whose net cash flow is above zero. The code's doc comment says to test it with
`greaterThan(ZERO)`, because in decimal.js `new Decimal(0).isPositive()` is `true`. The code
used `isPositive()`. It has done so since the first public release.

A year nets exactly 0 when no property contributes anything in it. In practice this is a
portfolio, or a Dashboard property filter, made only of properties bought after baseDate.
That is the "start your own portfolio" first-use flow (ADR 0094, ADR 0112). The KPI then named
year 1 although nothing was earned in it:

- A cash purchase on 2030-06-01 with rent of 25,000 Kč showed **2027**. The first year with
  income is 2030.
- A purchase on 2029-01-01 with a 2.0 M Kč loan and rent of 20,000 Kč showed **2027**. The first
  positive year is 2029.

The Dashboard KPI row and the Scenario compare delta show this year.

## Decision

The first cash-flow-positive year is the first projection year (1..N) whose net cash flow is
**strictly** greater than zero, else `null`, as the doc comment already stated. A year that
nets exactly 0 never counts. Only the implementation changes; the rule does not.

The test oracle in `loan-events-kpis.test.ts` repeated the same `isPositive()` call, so it
would have confirmed the bug. It now uses `greaterThan(ZERO)` as well. The new tests pin the two
examples above and check that every year before the KPI year nets 0 or less.

## Consequences

- A future-only portfolio or filter now shows the first year with real income, or "—" when
  no year is positive.
- An empty or fully deactivated portfolio now returns `null` inside the engine. Before, it
  returned year 1. The UI shows the empty state for these, so nothing visible changes there.
- No parity target changes: the seed stays 2031 (Y5). The golden master does not change.
