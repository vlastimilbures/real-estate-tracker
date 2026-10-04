# 0121. The first cash-flow-positive year is strictly positive

- Status: Accepted
- Date: 2026-10-04
- Source: issue #102 (2026-10 code review, findings R8-01 and R2-03)
- Amended: 2026-10-04 (issue #185, found by the independent review of PR #183: the same zero
  trap in the IRR bracket, decided by the owner)
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
- A purchase on 2029-01-01 with a 2.0 M Kč loan (10,614.53 Kč a month) and rent of
  20,000 Kč showed **2027**. The first positive year is 2029. With rent of 8,000 Kč no year
  is ever positive: it showed 2027 instead of "—".
- A test fixture's planned purchase alone (`mixed` filtered to it, as a Dashboard chip
  filter does) nets 0, then losses until 2048. It showed **2027** instead of 2048.

The Dashboard KPI row, the Scenario compare delta and Values view, and the compare Excel
export show this year.

## Decision

The first cash-flow-positive year is the first projection year (1..N) whose net cash flow is
**strictly** greater than zero, else `null`, as the doc comment already stated. A year that
nets exactly 0 never counts. Only the implementation changes; the rule does not.

The test oracle in `loan-events-kpis.test.ts` repeated the same `isPositive()` call, so it
would have confirmed the bug. It now pins the seed's 2031 and checks that the prepayment lands
in that year. The new tests pin the examples above. They also check that the KPI year nets
above 0 and that no earlier year does.

**The same trap in the IRR bracket (#185).** `irrResult` looked for a bracket whose end NPVs
differ in sign by testing `!nlo.times(npv(hi)).isPositive()`. When an end's NPV is exactly 0,
the product is ±0: +0 counted as "same sign", so the bracket was skipped, and −0 reached
`bisect` only by accident. Now:

- A bracket end (−90 %, or +100 %, +200 %, +400 %, +800 %, +1000 %) whose NPV passes the
  tolerance test `bisect` uses to accept a midpoint (|NPV| < 1e-9 Kč) is the IRR. Exact 0 is
  not required: 1/3 or 1/9 does not round back exactly in 40-digit decimals, so an NPV that
  is 0 in exact arithmetic can come out as −1e-40.
- A bracket is bisected only when both end NPVs are off the root and their product is
  negative. Testing the product with `lessThanOrEqualTo(ZERO)` alone would not do: with a
  zero NPV at −90 % and a positive NPV above it, `bisect` would move away from the root and
  return a wrong rate.
- The uniqueness scan counts a grid point at the root (by the same test) as a root, once per
  run of such points, beside the sign changes between points. Before, it skipped exact zeros,
  so a root on a bracket end plus a second root passed as unique, and the end root would have
  won. Such cash flows now give `NOT_UNIQUE`.
- Cash flows that are all zero have a zero NPV at every rate, so they keep having no IRR
  (`NO_ROOT`, DR-061). Two roots between the same two grid points stay a grid-resolution
  limit, as before.

## Consequences

- A future-only portfolio or filter now shows the first year whose net cash flow (after debt
  service) is above zero, or "—" when no year is.
- An empty or fully deactivated portfolio now returns `null` inside the engine. Before, it
  returned year 1. The UI shows the empty state for these, so nothing visible changes there.
- No parity target changes: the seed stays 2031 (Y5). The golden master does not change.
- IRR (#185): `[−1, 11]` now gives +1000 % and `[10, −1]` gives −90 %; both gave no IRR
  ("No IRR between −90 % and +1000 %"). `[−1, 5]`, `[−1, 3]` and `[−10, 1]` now give +400 %,
  +200 % and −90 % instead of a bisection value next to them. `[−10, 11, −1]` (roots −90 % and
  0 %) and `[−4, 21, −36, 20]` (a crossing at 25 %, a touch at +100 %) now give "No unique
  IRR"; before, they showed one of their roots. Real portfolio cash flows (millions of Kč)
  do not land within 1e-9 Kč of 0 on a grid point, so no parity target, golden figure or
  visible KPI changes.
