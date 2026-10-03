# 0089. Scenario compare shows the owner's loss

- Status: Accepted
- Date: 2026-10-03
- Source: issue #14 (pre-release review 2026-10, finding A03)

## Context

A price crash timed at Today haircuts property values at t = 0, so it lowers equity₀. Equity₀
is the denominator of the net-worth multiple and CAGR and the opening outlay of the levered
IRR (`src/engine/kpis.ts`). With the sample portfolio, "Price crash −20%" at Today ends with
less net worth than Base (87.7 M vs 109.6 M Kč) but shows a higher multiple (5.53x vs 4.85x),
CAGR and IRR. The maths is consistent, but Scenario compare showed only the rebased returns,
so a user could read the crash as making them better off.

## Decision

The primary reading of a stress scenario is the existing owner's downside. The return maths
does not change; the compare table shows the loss and explains the rebased returns.

1. Two rows at the top of the Scenario compare key figures:
   - **Starting equity**: equity in projection year 0 under the Nominal/Real lens (CPI₀ = 1,
     so both lenses show the same value).
   - **Δ net worth vs Base**: the scenario's horizon net worth minus Base's, in the lens.
     The Base column shows "—". The row is shown only when Base is in the comparison.
2. When a scenario's starting equity differs from Base's, its multiple, CAGR and IRR cells
   carry a "\*" marker and a footnote under the table says that its returns are measured from
   its lower starting equity after the crash, and points to Δ net worth for the loss.
3. The Guide entry for the value crash explains that a crash at Today lowers starting equity,
   so percentage returns can rise while wealth falls.
4. The IRR n/a reason notes stay.

## Consequences

Copy and layout only; no computed number, parity target or engine output changes. Measuring
crash returns from the unshocked Base equity would be an engine change and needs its own ADR.
