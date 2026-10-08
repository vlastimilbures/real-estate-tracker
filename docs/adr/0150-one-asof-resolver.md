# 0150. One as-of resolver: the date shown is the date computed, on every page

- Status: Accepted
- Date: 2026-10-07
- Source: issue #113 (review findings G1-3-02, G2-1-04, G1-1-08, G2-1-13, G2-1-03, R2-07),
  owner decision D7 option A (2026-10-06); future base date and `cpiAt` answered by the
  owner on 2026-10-07; Track 10 PR 10.11
- Amends: [0019](0019-projection-start-asof.md) (the as-of clamp),
  [0088](0088-asof-basis-labels.md) (the year count, the past-horizon basis, the ownership
  label), [0111](0111-table-context-line.md) (the Properties date)
- Amended by: [0156](0156-pending-purchase-display.md) (a property not owned under the
  basis shows no figures on its Properties row or tiles; the tiles' `owned` follows `ownedOn`)
- Related: [0021](0021-schedule-calendar.md) and [0080](0080-close-out.md) (D-21 month-end
  grid, DR-182), [0149](0149-calendar-days.md)
  (calendar days), D-62 (one as-of rule on Dashboard and Property detail)

## Context

The as-of rule decides which date, and which basis (today's snapshot, a projection year, or
the records in force), the Dashboard and Property detail tiles are computed for. The rule was
worked out in several places, and the copies had drifted apart:

1. **The date shown was not the date computed.** Only the engine call clamped the stored
   as-of, and only at the lower end. The picker text, the Today pill and the Property detail
   subtitle showed the raw stored value. With a future base date and Today selected, the
   picker read today (a date its own calendar disables) and the tiles said "current", while
   every number was for the base date. After a base-date change, the Dashboard and Property
   detail named different dates for one computation. ADR 0019 says a stale value is clamped;
   the code did not do it.
2. **Properties and Property detail disagreed at Today.** Once the base date is six months or
   more in the past, Property detail and the Dashboard show projection year Y1 (ADR 0088),
   while the Properties table showed the effective-dated snapshot at today. The same flat had
   a different value, debt, LTV and net cash flow on the two screens, both as today. This
   recurs every year until the owner moves the projection start.
3. **Month-end base dates picked the wrong year.** The year count used calendar months, while
   value growth and the CPI index use the D-21 month-end grid. With a 31 Aug base date,
   28 Feb counted as 5 months (year 0) instead of 6 (year 1).
4. **The rule was written three times**, so tiles and labels agreed only by convention.
5. **"Pending" above owned figures.** When the as-of date rounds into the purchase year, the
   subtitle read "pending — purchase …" while the tiles showed the loan and LTV of the owned
   flat at that year's end.
6. **Past the horizon the tiles mixed projected and unprojected figures** (value grown to the
   date, rent at the lease in force, costs uninflated, CPI stopped at the horizon) under a
   hint that said "not a projection". Only a stale stored date could reach it.

## Decision

Option A of D7: one resolver and one basis rule, used by every page.

1. **One resolver, clamped at both ends** (amends ADR 0019). `resolveAsOf(picked, today,
bounds)` (`src/ui/model/asOf.ts`) returns the date the pages compute for: the picked date,
   or today, moved into [baseDate, baseDate + horizonYears]. The engine call, the picker text,
   the Today pill and both page subtitles read this one date. The clamp is applied on every
   read; the stored value is not rewritten, so a stale value never shows.
2. **Today means today** (owner, 2026-10-07). The Today pill is pressed, and the labels say
   "current", only when the resolved date is today. With a future base date the picker shows
   the base date, the pill is not pressed and the labels are dated ("as of 01.01.2027").
   Pressing Today still selects the default: today moved into the window. A RangeError from `cpiAt` would surface as a crash, not as the invalid-data notice; it is unreachable by construction.
3. **One basis rule with the grid month count** (amends ADR 0088 decision 1). `asOfView`
   (`src/ui/model/dashboard.ts`) decides the basis once; the tile mappers and every label read
   it. The projection year is the nearest whole year of D-21 grid months
   (`lastGridMonthOnOrBefore(baseDate, asOf)`), the count value growth and the CPI index use.
   A base date on the 29th–31st now maps like any other day: 31 Aug → 28 Feb is year 1.
4. **No past-horizon basis** (amends ADR 0088 decisions 1 and 5). With the upper clamp, every
   date lands on years 0 … horizon. The "records in force … beyond the horizon" basis and its
   picker hint are removed. The engine's `cpiAt` no longer clamps at the horizon: it raises a
   `RangeError` for an as-of date after baseDate + horizonYears (owner, 2026-10-07), so a
   caller bug fails loudly instead of returning a stopped index.
5. **The ownership label comes from the same basis** (amends ADR 0088). In a projection year
   a property counts as owned when its purchase date is on or before that year's end, the
   date the year's balances are read at; otherwise when it is on or before the as-of date.
   The Property detail subtitle ("purchased …" / "pending — purchase …") and the Properties
   "Pending" badge use this rule.
6. **Properties uses the same Today basis and names it** (amends ADR 0111 decision 1). Each
   Properties row is the Property detail tile at Today, in nominal Kč (the page has no lens).
   When today maps to a projection year, the context line names it:
   "3 apartments · as of 15.01.2027 (projection year Y1 · 2027, Jul 2026 – Jun 2027) · amounts
   in Kč, flows per year". Otherwise the line is unchanged. Properties does not follow the
   picked as-of date and gets no as-of control (that was option B).

## Consequences

- No stored data, migration, golden master or parity target changes. The engine's projection
  and snapshot are unchanged; the engine change is the `cpiAt` domain (decision 4) and one
  new export (`lastGridMonthOnOrBefore`).
- User-visible changes: the picker, the Today pill and the subtitles show the computed date;
  the Properties figures at Today match Property detail once the base date is six months or
  more old, and the context line says which projection year they are; month-end base dates
  map to the grid year; the purchase-year label matches the figures; the beyond-horizon hint
  is gone.
- The nearest-whole-year mapping stays (ADR 0088); exact-date interpolation is still out of
  scope.
- New string in en, cs and ru (`properties.asOfProjection`); `common.asOfHintBeyond` is
  removed.
