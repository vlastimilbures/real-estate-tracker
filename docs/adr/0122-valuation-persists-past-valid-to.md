# 0122. A valuation keeps governing after its "Valid to" date

- Status: Accepted
- Date: 2026-10-04
- Source: issue #110 (2026-10 code review, findings G1-1-01, G1-4-01 and G1-4-10); the
  valuation half of issue #121 (G1-4-02)
- Amends: [0118](0118-data-check.md) (the "No valuation" finding)
- Related: [0032](0032-value-reanchor.md), [0080](0080-close-out.md),
  [0099](0099-close-previous-open-record.md)

## Context

A valuation has an optional "Valid to" date. It is entered in the form, read from CSV
(`valid_to`), and written by "End previous record" (ADR 0099). The engine picked the
valuation in force (`selectValuation`): the latest `validFrom` on or before the date whose
`validTo` was blank or not yet passed. Failing that, it took the nearest upcoming one, and
then the purchase price. Nothing warned the owner when a "Valid to" date changed the value:

- In the sample portfolio, Javorova's 10,200,000 Kč valuation with "Valid to" 31.12.2027
  became 4,412,928 Kč in 2028: the 2015 purchase price grown from 2026. Horizon net worth fell
  from 93,182,810 to 73,333,218 Kč.
- An appraisal that had already expired before baseDate showed the purchase price as today's
  value.
- With an older open-ended valuation next to it (5,000,000 Kč from 2020), the same "Valid to"
  brought the older value back: horizon net worth 76,317,143 Kč. ADR 0099's "Keep as is"
  leaves older rows open on purpose, and data from before ADR 0099 has them too. So
  "End previous record" and "Keep as is" gave different numbers (#121).
- In a gap between two valuations, the later, upcoming one governed.

SPEC §4.3 said the purchase price is used "when no valuation exists". The Guide says value
grows "from the latest recorded valuation". The last lease keeps renting in the projection
(ADR 0080). Mortgage blocks are selected by their start date alone.

The owner first chose option A: the valuation in force, else the latest started. The
independent review of PR #184 showed that A still lets an older open-ended valuation govern
again. The owner then chose option B.

## Decision

1. **The governing valuation at a date** (`selectValuation`) is the **latest valuation that
   started on or before the date**. Its "Valid to" is not read. Failing that, it is the
   nearest upcoming valuation (as before). The purchase price stands in only when the
   property has no valuation.
2. A market value is a point-in-time estimate, not a contract. It does not expire at its
   "Valid to" date; the next valuation replaces it. This is the same rule as the mortgage-block
   selection (`selectBlock`).
3. "Valid to" stays as an informational field: an appraisal's stated validity, and the
   record ADR 0099 closes. It no longer changes a computed number.
   `valuationInForce`, the strict "in force" selector, does not change.
4. The snapshot (`valueAnchor`) and the projection basis (`openingValue`) both read
   `selectValuation`. So snapshot(baseDate + N years) still equals projection year N (D-32).
   The invariant suite adds a fixture with a closed, a gapped and an overlapped valuation.
5. **Data check (amends ADR 0118).** It reads `selectValuation` too:
   - "No valuation" now appears only when the property has no valuation at all. Its text
     says "No valuation is recorded".
   - A closed last valuation is the "valuation in use", so it is flagged "Stale" once it is
     more than 12 months old.

## Consequences

- A "Valid to" date never changes a number. The seed example keeps 93,182,810.46 Kč horizon
  net worth, with or without an older open-ended valuation.
- "End previous record" and "Keep as is" (ADR 0099) give the same values, which settles the
  valuation half of #121. The lease half is separate.
- **Existing data can change in three places:**
  - after the last valuation's "Valid to": that valuation instead of the purchase price;
  - in a gap between two valuations: the earlier valuation, grown, instead of the upcoming
    one, until the next one starts;
  - where a newer, closed valuation overlaps an older open-ended one: the newer one keeps
    governing after its "Valid to".
- SPEC §4.3 states the rule. No parity target and no golden-master hash changes: the
  sample's valuations and the golden fixtures are open-ended.
- Tests:
  - `valuation-valid-to.test.ts` covers the seed invariant (also with an older open-ended
    row) and a single valuation that is open, closed inside the projection, or closed before
    baseDate. It also covers the gap, the overlap, the upcoming fallback and no valuation.
  - A fast-check property in `properties.test.ts` checks the selector against a brute-force
    oracle. It also checks that the purchase price stands in only without a valuation.
