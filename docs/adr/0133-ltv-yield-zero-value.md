# 0133. LTV and yields with no value: "n/a", not 0 %

- Status: Accepted
- Date: 2026-10-04
- Source: issue #129 item 5 (2026-10 code review, finding G1-4-05)
- Amends: SPEC §Snapshot ("LTV = debt ÷ value", yields) and §Projection (`LTV_t`)
- Related: [0017](0017-reject-invalid-loan-inputs.md) (no NaN),
  [0038](0038-range-codes.md) (a 100 % value crash is allowed),
  [0126](0126-degenerate-kpis.md) (items 1–4 and 6 of #129), [0035](0035-dscr-cap.md)

## Context

LTV, gross yield and net yield divide by the property value. When the value was 0 the
engine returned **0** instead (`ratioOrZero` in `src/engine/metrics.ts`, and the same
`value.isZero() ? ZERO : …` pattern in the portfolio snapshot, the projection and the
real-lens snapshot). A value of 0 happens with a 100 % value crash (ADR 0038 allows it on
purpose) or a 0 Kč valuation. Probe on the sample portfolio with a 100 % crash at Today:

```
Y0 value=0 balance=9515405 ltv=0.0000  Y5 value=0 ltv=0.0000
```

The worst state read as the best: LTV 0,0 % in the "Conservative" band with 9.5 M Kč owed,
and a yield of 0 % that looked like a flat with no rent.

ADR 0126 fixed the other five findings of #129 and left this one for a wider type change.

## Decision

The owner chose option A of #129 on 2026-10-04 (item 5).

1. **LTV** (`ltvOf(debt, value)`): debt ÷ value; **null** when the value is 0 and debt is
   owed; **0** when both are 0 (nothing owed on nothing, e.g. a planned purchase before its
   handover). Snapshot, portfolio snapshot and every projection year use it.
2. **Yields** (`yieldOf(income, value)`): income ÷ value; **null** when the value is 0,
   whatever the rent. Snapshot, portfolio snapshot and the snapshot read off a projection
   year (`portfolioSnapshotAtYear`, `propertySnapshotAtYear`) use it.
3. **Types.** `ltv`, `grossYield` and `netYield` of `PropertySnapshot` and
   `PortfolioSnapshot`, and `ProjectionYear.ltv`, become `Decimal | null`. The real lens
   keeps them unchanged (ratios are lens-invariant).
4. **Display.** A null LTV or yield shows "n/a" (`common.notApplicable`): the Dashboard and
   Property detail tiles (no LTV badge), the Properties table and the projection grid.
   The LTV charts leave a gap; their tooltip and table view read "n/a".
   The Excel exports write a blank cell. No code path turns a null back into 0.

## Consequences

- Parity targets do not change: every sample property has a positive value.
- The golden master changes once: in the edge-loan `devFuture` case, Javorova has a value
  of 0 and no debt until its development loan starts on 2026-09-01, with rent of
  326,400 Kč a year. Its snapshot yields at Today, a month later and on 2026-08-31 become
  null (they were 0); its LTV stays 0. The snapshot is updated in the same commit
  (ADR 0039).
- A value above 0 with no debt still reads LTV 0 %.
- A 0 Kč valuation stays valid input; only the ratios it feeds become "n/a".
