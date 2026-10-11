# 0181. A property with no valuation grows its purchase price to the projection start

- Status: Accepted
- Date: 2026-10-11
- Source: issue #157 (owner, 2026-10-11: options B + D; Q3 = sharpen the stale-valuation
  text only, no Settings note; Q4 = the property's own rate, else the base rate), issue #152
  item 1 (Guide "Value"); Track 14 PR E5a
- Amends: [0032](0032-value-reanchor.md) (the purchase-price anchor),
  [0118](0118-data-check.md) §3 (the stale and no-valuation finding texts)
- Related: [0122](0122-valuation-persists-past-valid-to.md) (the purchase price stands in
  only when a property has no valuation), [0119](0119-acquisition-funding.md) (a future buy
  starts from its price), [0102](0102-scenario-form-groups.md) (a property's own
  rate wins over a scenario level)

## Context

When a property has no valuation at all, the purchase price stands in as its market value
(`valueAnchor`, SPEC §4.3, ADR 0122). The price was anchored at the projection start with no
growth before it. A flat bought in 2015 for 4,080,000 therefore showed 4,080,000 today, and
kept that value when the base date moved forward a year: the value jumped only when a
valuation was entered (#157, the "1.15 M jump").

Entered valuations are facts: a valuation in force on the base date is today's value as
entered, not grown for the months before the base date (ADR 0032). The Data check already
flags a valuation older than 12 months and a property with no valuation (ADR 0118 §3), but
neither text said how the value is anchored, and the Guide said value is "grown from the
latest recorded valuation" (#152 item 1), which is wrong.

The projection read its year-0 value through a second copy of the rule (`openingValue`).

## Decision

1. **One rule.** The projection's year-0 value reads `valueAnchor`, the snapshot's rule;
   `openingValue` is removed. This part is a refactor and moves no number.
2. **The purchase-price fallback grows to the basis.** With no valuation, the value at the
   basis date (the base date, or the purchase date of a property bought after it) is
   `purchasePrice × (1 + g) ^ (months / 12)`, where `months` counts whole months from the
   purchase date to the basis by the month-end rule (ADR 0032, D-45). The anchor stays at
   the basis, so growth after it is unchanged and snapshot(baseDate + N y) == projection
   year N still holds.
   - A future buy has 0 months: its value and acquisition outflow (ADR 0119) are unchanged.
   - Entered valuations are unchanged.
3. **The rate before the basis** is the property's own appreciation rate, else the **base**
   appreciation rate, never a scenario's level (owner Q4). Today's value is therefore the
   same in every scenario; scenarios change only the future (SPEC §7). `applyScenario`
   carries the base level in an optional engine-only field, `openingAppreciationPa`
   (undefined outside a scenario ⇒ the assumption level is the base level).
4. **Text (en/cs/ru), carried by this ADR, not by `docs/decisions/wording.md`:**
   - `dataCheck.noValuation` names the purchase date: the price "grown at the appreciation
     rate since {date}" stands in. The finding carries the purchase date; the UI computes no
     grown number (CLAUDE.md §4).
   - `dataCheck.valuationStale` adds that value, equity and LTV use the valuation as entered;
     it is not grown to the projection start (owner Q3). No Settings note.
   - Guide `snapshotDefs.value` (`meaning`, `eg`): today's value is the valuation in force on
     the projection start, as entered, and grows from there or from a later valuation's
     date; with no valuation, the purchase price grown since the purchase.
     None of these strings is an accessible name or a live-region announcement: the finding
     text is the fix button's description (`aria-describedby`), and the Guide text is prose.

## Consequences

- Parity targets do not move: every sample property has a valuation. No target change-log
  row. The golden master is unchanged.
- One test pin moves: `valuation-valid-to.test.ts`, a property bought 2018-03-01 for
  4,000,000 with no valuation, reads 5,528,216 at the base date 2026-06-07 (99 months at 4 %).
- A portfolio with a property without any valuation shows a higher value, equity and net
  worth, and a lower LTV and IRR, than before. Example: the sample with Javorová's valuation
  removed values Javorová at 6,280,972.55 (4,080,000 × 1.04^11), not 4,080,000; one year
  later it reads 6,532,211.45, with no jump.
- The Data check still lists "no valuation" as needing attention: the grown price is an
  estimate, and a recorded valuation replaces it.
