# 0186. Scenario compare says net worth excludes cash

- Status: Accepted
- Date: 2026-10-13
- Source: issue #155 (2026-10 review G1-1-02; owner chose option C, copy only, on
  2026-10-11; wording approved 2026-10-13); Track 14 PR N7a
- Amends: [0089](0089-compare-owner-loss.md) §1 and §2 (the row label and the footnote's
  pointer)
- Related: [0097](0097-compare-delta-view.md) (Δ vs Base view), [0152](0152-wording-log-and-generated-index.md)
  (an export change needs an ADR, not a wording-log entry)

## Context

Net worth is equity at the horizon: projected value minus remaining debt. Cash taken out or
paid in over the horizon is not in it. When every loan is repaid before the horizon, a rate
shock cannot change horizon equity, so on the sample portfolio "Δ net worth vs Base" reads
0 Kč for a +6 pp rate shock that costs about 1.6 M Kč of extra interest. The cost shows in
cumulative cash to owner and the IRR in the same table, but the row label does not say that
cash is left out, and the ADR 0089 footnote points to Δ net worth alone "for the loss to
you".

The row label and the footnote are also written into the scenario-compare xlsx export, so the
change is recorded here rather than in the wording log (ADR 0152 §1).

## Decision

1. The row `scenarios.kpiNetWorthDeltaVsBase` says that it leaves out cash.
2. The footnote `scenarios.rebasedReturnsFootnote` points to both Δ net worth vs Base and
   cumulative cash to owner for the loss to you.
3. The Guide's net-worth multiple entry (`guide.returnsDefs.multiple.meaning`) says that cash
   taken out or paid in over the years is not included; `docs/model-limitations.md` and
   SPEC.md say the same.
4. The xlsx export carries the same text in the same cells.

## Consequences

Copy only (en, cs, ru): no computed number, row, cell, parity target or golden master
changes. The headline still reads 0 for a stress that costs cash only; adding a Δ cumulative
cash row (option B of #155) would need its own ADR.
