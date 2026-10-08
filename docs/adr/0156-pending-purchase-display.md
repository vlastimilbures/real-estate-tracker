# 0156. A pending purchase shows no figures before it is owned

- Status: Proposed
- Date: 2026-10-08
- Source: issue #126 item 1 (2026-10 code review, finding G2-1-02); owner decision D10
  item 1 (2026-10-08: option A, UI only; the Dashboard with only pending purchases active
  stays as it is); issue #276 item 1 (lifecycle test coverage); Track 11 PR 11.7
- Amends: [0150](0150-one-asof-resolver.md) (a Properties row and the Property detail
  tiles of a property not owned under the as-of basis show no figures; `owned` on the tiles
  follows `ownedOn`)
- Related: [0155](0155-lifecycle-states-on-the-pages.md) (a pending purchase counts as
  active), [0119](0119-acquisition-funding.md) (the acquisition summary the panel reads)

## Context

A property with a purchase date after the as-of date ("pending", SPEC.md §4.5) is listed on
Properties and has its own page. The engine's per-property snapshot computes every figure
whether or not the property is owned, by design: with no valuation the purchase price
stands in, and an upcoming valuation is used (SPEC.md:190-192). Only the portfolio totals
skip it. The pages showed those figures as if the flat were owned:

1. Properties: the `properties.badgePending` badge, then an LTV of 0 % with the
   `dashboard.badgeConservative` word, the whole value as equity and a negative NOI and net
   cash flow from holding costs that only start at handover.
2. Property detail: the same figures on the four tiles, while the projection on the same
   page shows 0 for the years before the purchase.
3. The detail subtitle decided "purchased" or "pending" by `ownedOn` under the as-of basis
   (a projection year counts as owned when it holds the purchase), while the tiles carried
   the engine's `owned`, read at the as-of date. The two could disagree in a projection year
   that holds the purchase date.

## Decision

1. **UI only (D10 item 1 = A).** The engine snapshot does not change. Items 2 (equity-change
   chart), 3 (holding-cost base year) and (d) (pending debt in totals) of #126 are decided
   separately (Track 11 PR 11.17).
2. **One owned rule.** `propertyTilesForAsOf` takes the purchase date and sets `owned` by
   `ownedOn` under the as-of basis. Properties rows and Property detail (tiles and subtitle)
   read that one flag.
3. **Properties.** A row that is not owned shows "—" in every figure column (LTV, net cash
   flow, DSCR, value, debt, equity, NOI). Under the name, next to `properties.badgePending`,
   a second line `properties.pendingPurchaseOn` gives the purchase date. It adds height,
   not width, so the figure columns keep their room (ADR 0085).
4. **Property detail.** While not owned, a panel `propertyDetail.notOwnedTitle` with the
   hint `propertyDetail.notOwnedHint` replaces the four tiles. It lists the purchase date
   (`propertyForm.purchaseDate`), the price (`propertyDetail.acqPrice`) and the acquisition
   loan (`propertyDetail.acqLoan`, or `propertyDetail.acqLoanNone`), from the engine's
   acquisition summary. The two projection charts stay; they show 0 before the purchase.
   Ownership follows ADR 0150: at a date by that date, in a projection year by the year's
   end. So an as-of a few months after the purchase can still read a year that ends before
   it, and the panel stays, as the subtitle (`propertyDetail.pendingPurchase`) says. An
   as-of whose year holds the purchase brings the tiles back.
5. **Unchanged on purpose.** A pending property keeps its Data check, which before the
   purchase date has only the own-cash finding (`dataCheck.ts`), and its loan warnings: the
   future loan is real data to get right before handover. The Dashboard with only pending
   purchases active shows today's totals (0 Kč, LTV 0 %), which are true at the date.
6. **Tests.** `LifecycleStates.test.tsx` covers the pending row (also inactive), the
   pending page before, in and after the purchase year (including an as-of after the
   purchase whose year ends before it), a developing property's page, a debt-free Dashboard
   and the only-pending Dashboard. `pendingOwned.test.ts` checks `owned` on every basis
   kind under both lenses. Screen `84-pending-property` captures the row and the page.

## Consequences

- A pending purchase no longer reads as owned equity with a "Conservative" LTV.
- New dictionary keys: `properties.pendingPurchaseOn`, `propertyDetail.notOwnedTitle`,
  `propertyDetail.notOwnedHint`. No existing text changes.
- No computed number, stored data or export changes; parity targets and the golden master
  do not move. The projection table and its export still list the pre-purchase years.
- The Dashboard with only pending purchases still shows LTV 0 % "Conservative"; if that
  reads wrong in use, it is a separate decision.
