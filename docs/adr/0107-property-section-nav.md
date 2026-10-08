# 0107. Property detail: section navigation and a collapsed amortization schedule

- Status: Accepted
- Date: 2026-10-03
- Source: issue #23 (pre-release review 2026-10, finding A07 and F6)
- Amended by: [0155](0155-lifecycle-states-on-the-pages.md) (an inactive property shows no
  loan warnings and has no Data check entry),
  [0158](0158-layouts-hold-in-czech-and-russian.md) (the section nav wraps instead of
  scrolling sideways)

## Context

Property detail is one long column: the as-of picker and tiles, Valuations, Leases, Mortgage
blocks, Holding costs, the projection table, the loan warnings and the full amortization
schedule. Routine record upkeep (add a valuation, update a lease) sits between analytical
output, and the amortization table (hundreds of monthly rows) dominates the page. There is
no in-page navigation and nothing collapses. The loan warnings render after the projection,
far from the mortgage blocks they describe.

Triage rejected tabs and separate routes: they hide context behind a mode.

## Decision

Owner, 2026-10-03 (#23 plan):

1. **A section nav in the sticky topbar.** Property detail lists its sections as in-page
   links in a second row of the page header: Overview · Records · Financing · Holding costs ·
   Projection · Amortization. Only sections on the page are listed (with invalid stored
   data: Records, Financing and Holding costs). A link scrolls its section under the topbar
   and moves focus to the section heading; it does not change the route, so the unsaved-
   changes guard is not involved and an open record form keeps its draft. The section in
   view is marked with `aria-current="location"`.
2. **Overview gets a heading for screen readers only**, as the focus target for its link.
   The tiles area looks the same.
3. **The loan warnings move under the mortgage blocks**, inside the Financing section. The
   rest of the order is unchanged: Overview → Records → Financing → Holding costs →
   Projection → Amortization.
4. **The amortization schedule is collapsed by default.** Its panel header (title, payment
   count, Excel export) is always shown, so export works while collapsed. A button "Show
   amortization schedule (N payments)" expands it (`aria-expanded`). The open state is
   remembered for the app session, across properties, and resets when the app restarts.

## Consequences

Layout only: no computed number, parity target, golden master, export content or data
change. The page opens shorter; a user who wants the schedule clicks once per app session.
New strings in en, cs and ru for the nav, the Overview heading and the toggle. Other pages
are unchanged; the topbar's new row exists only where a page passes one.
