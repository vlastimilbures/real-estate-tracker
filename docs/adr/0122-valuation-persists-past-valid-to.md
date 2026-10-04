# 0122. A valuation keeps governing after its "Valid to" date

- Status: Accepted
- Date: 2026-10-04
- Source: issue #110 (2026-10 code review, findings G1-1-01, G1-4-01 and G1-4-10)
- Amends: [0118](0118-data-check.md) (the "No valuation" finding)
- Related: [0032](0032-value-reanchor.md), [0080](0080-close-out.md),
  [0099](0099-close-previous-open-record.md)

## Context

A valuation has an optional "Valid to" date. It is entered in the form, read from CSV
(`valid_to`), and written by "End previous record" (ADR 0099). The engine picked the
valuation in force (`selectValuation`), else the nearest upcoming one. When the **last**
valuation's "Valid to" had passed, neither existed. The value then fell back to the purchase
price, grown from baseDate. Nothing warned the owner.

- In the sample portfolio, Javorova's 10,200,000 Kč valuation with "Valid to" 31.12.2027
  became 4,412,928 Kč in 2028: the 2015 purchase price grown from 2026. Horizon net worth fell
  from 93,182,810 to 73,333,218 Kč.
- An appraisal that had already expired before baseDate showed the purchase price as today's
  value.
- In a gap between two valuations, the later, upcoming one governed.

SPEC §4.3 said the purchase price is used "when no valuation exists". The Guide says value
grows "from the latest recorded valuation". The last lease keeps renting in the projection
(ADR 0080). Mortgage blocks are selected by their start date alone.

## Decision

1. **The governing valuation at a date** (`selectValuation`) is, in this order:
   1. the valuation in force (the latest `validFrom` ≤ date whose `validTo` is blank or ≥
      date), as before;
   2. else the **latest valuation that started on or before the date**, ignoring its
      `validTo`;
   3. else the nearest upcoming valuation, as before;
   4. else none. The purchase price stands in only when the property has no valuation.
2. A market value is a point-in-time estimate, not a contract. It does not expire at its
   "Valid to" date; the next valuation replaces it. The "Valid to" date still matters when
   an earlier, open-ended valuation overlaps it: after the closed one ends, the open one is
   in force again.
3. In a gap between two valuations, the earlier one governs, grown from its anchor, until the
   next one starts. Before, the upcoming one governed.
4. The snapshot, the projection (`valueAnchor`, `openingValue`) and the KPIs all read
   `selectValuation`, so snapshot(baseDate + N years) still equals projection year N (D-32).
   `valuationInForce` (the strict "in force" selector) does not change.
5. **Data check (amends ADR 0118).** It reads `selectValuation` too:
   - "No valuation" now appears only when the property has no valuation at all.
   - A closed last valuation is the "valuation in use", so it is flagged "Stale" once it is
     more than 12 months old.

## Consequences

- Adding a "Valid to" date to the last valuation no longer changes any number. The seed
  example keeps 93,182,810.46 Kč horizon net worth.
- When "End previous record" (ADR 0099) closed an older valuation and the owner later deletes
  the newer one, the older one keeps governing. Before, the value fell back to the purchase
  price.
- SPEC §4.3 states the rule. No parity target and no golden-master hash changes: the
  sample's valuations and the golden fixtures are open-ended.
- Tests:
  - `valuation-valid-to.test.ts` checks the invariant on the seed and the three cases of a
    single valuation (open, closed inside the projection, closed before baseDate), plus the
    gap, the overlap, the upcoming fallback and the no-valuation cases.
  - A fast-check property in `properties.test.ts` checks the selector order. It also checks
    that the purchase price stands in only without a valuation.
