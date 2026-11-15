# 0206. Dashboard Data check: last, summary first, findings grouped by problem

- Status: Accepted (delegated, owner review pending)
- Date: 2026-11-16
- Source: issue #378 (UX/UI review 2026-11, tracking #392); direction approved by the
  owner on 2026-11-15 (the issue's layout); acceptance delegated by the owner for the
  2026-11-15 run (comment on #392)
- Amends: [0118](0118-data-check.md) (decision 6: where the Dashboard panel sits and how
  it lists findings), [0202](0202-dashboard-hierarchy.md) (§1: the Data check moves
  last)
- Related: [0107](0107-property-section-nav.md) (the focusable panel heading),
  [0148](0148-restore-rules-vs-stored-data.md), [0149](0149-calendar-days.md) (portfolio
  rows first), [0203](0203-one-disclosure.md) (Show / Hide)

## Context

The Dashboard Data check sat between Financing and the charts and was all text. With the
sample portfolio at +5 years it listed 12 two-line sentences, where six were the same two
sentences repeated for each property and the other six were likewise. Collapsed, it was a
full panel whose body said only "Checked as of …". Nothing could be scanned: no icons, no
counts beside the findings, no grouping.

## Decision

1. **Position:** the Data check is the last section of the Dashboard, after the KPI list.
2. **Top link:** when at least one finding needs attention, the filter bar shows
   `dataCheck.toReview(n)` ("6 to review") with a warning icon, on the bar's second row
   under the property chips, where the as-of hint sits on the right (ADR 0198). The first
   row is full in Russian at 1280 px, and the link comes and goes with the date, so it
   would otherwise push the picker to a new row. It opens the panel, scrolls
   it to the top and moves focus to its heading (`focusSection`, ADR 0107). It is absent
   when nothing needs attention; defaults never show it.
3. **Summary row**, always visible under the heading, with the as-of date as the panel's
   hint (`dataCheck.asOfNote`): two counts with icons, `dataCheck.needAttention(n)`
   (warning icon) and `dataCheck.useDefaults(n)` (info icon). With nothing to review the
   first reads `dataCheck.attentionNone`, and the defaults count shows only when there
   are any. Counts stay counts of findings, not of groups. There is no empty body: a
   panel with no findings, or a collapsed one, is the summary row.
4. **Findings grouped by problem** (`dataCheckGroups`, `src/ui/model/dataCheck.ts`): one
   line states the problem and its effect once; under it one chip per affected property
   with that property's detail. The chip is the link to the fix (`DataCheckFix`, as
   before); its accessible name is the chip text followed by the problem line, and its
   description and tooltip name the destination ("Go to Records").
   - Valuation older than 12 months: `valuationStaleGroup`; chip detail the age and the
     valuation date.
   - No valuation: `noValuationGroup`; detail the purchase price and date.
   - Lease ended / ending: `leaseEndedGroup` / `leaseEndingGroup`; detail the end date.
   - Fixation ended with no follow-on block: `fixationEndedGroup(rate)`; detail the
     fixation end. The sentence's loan start date is left out: a property's loan is named
     by the property, and the fix opens its Financing. A gap before a later block
     (`fixationEndedUntil`) keeps its own sentence.
   - Every other finding (growth defaults, holding-cost defaults, own cash, no lease,
     stored values out of range, dates before 1900, overlapping leases) keeps its current
     sentence as the line; equal sentences share a line, each property a chip without
     detail.
   - Portfolio rows (no property) come first, as before (ADR 0148, 0149); their chip
     reads the fix ("Go to Assumptions").
   - The two lists keep their names for assistive technology (`attentionTitle`,
     `defaultsTitle` as list labels); the visible subheads give way to an icon on each
     line (warning for attention, info for defaults).
5. **Open state** is unchanged (ADR 0118, ADR 0203): open by default when something needs
   attention, the summary only otherwise; the manual Show / Hide holds for the session.
6. **Property detail** keeps its per-property sentences (`DataCheckList`), which no longer
   needs a name prefix.

## Consequences

- At +5 years the sample's Data check is 4 lines (stale valuation, fixation ended, growth
  defaults, own cash) with 12 chips, instead of 12 sentences; every finding is still one
  click from its chip.
- Which findings exist, their thresholds and their counts do not change. No computed
  number, stored data or export changes.
- New dictionary entries in en, cs and ru: `toReview`, `needAttention`, `useDefaults` (plural
  forms), `valuationStaleGroup`, `noValuationGroup`, `leaseEndedGroup`,
  `leaseEndingGroup`, `fixationEndedGroup`.
