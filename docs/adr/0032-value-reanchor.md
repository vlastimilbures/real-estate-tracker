# 0032. Value re-anchor granularity

- Status: Accepted
- Date: 2026-09-30
- Source IDs: D-32, J-23

## Context

The snapshot and the projection grew property value on different granularities after a later valuation (J-23).

Options considered for J-23 (Value re-anchor granularity (DR-029, DR-105)): (a) snapshot follows the projection (whole years from the anchor's turn-on year); (b) projection follows the snapshot (fractional months from the anchor date); (c) keep both, document the SPEC invariant as owned-at-baseDate only. Recommendation at planning: (b) — values continuous in time and matches the as-of lens; parity targets unchanged (seed has no later valuation or future buy)

## Decision

**Value re-anchor granularity (answers J-23):** option (b) — the projection follows the snapshot: value grows by whole completed months ÷ 12 from its anchor (a later valuation's validFrom, or the purchase date of a property bought after baseDate), so snapshot(baseDate + N y) == projection year N for every property.

Related follow-up decisions:

- **D-45**: **Value-growth month count (answers DR-123):** count whole months of value growth with the D-21 month-end rule (`lastGridMonthOnOrBefore`) on both the snapshot and the projection, so a 29 Feb baseDate (clamped to 28 Feb) still counts a full year.

## Consequences

P4b fixes DR-029 and DR-105: the two `it.fails` value-invariant tests become normal tests first. Seed parity unchanged (no later valuation or future buy in the seed); other portfolios' projected values change (user-visible under D-01).
