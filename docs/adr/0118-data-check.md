# 0118. Data check: stale, defaulted and missing inputs

- Status: Accepted
- Date: 2026-10-04
- Source: issue #35 (pre-release review 2026-10, §6 and F5); independent review of PR #179
- Amended by: ADR 0122 (a closed last valuation stays in use)

## Context

The engine falls back quietly when an input is missing, old or left blank:

- no valuation → the purchase price stands in as the market value (SPEC §4.3);
- no lease in force → rent is 0 in the snapshot;
- no per-property growth → the portfolio appreciation and rent indexation apply;
- a blank holding-cost field → the portfolio default applies, field by field (SPEC §4.1);
- a fixation that ended with no follow-on block → the post-fixation reset rate applies.

None of this is visible. The user cannot tell how far to trust value, equity, LTV and the
projection, or which record to update.

## Decision

Owner, 2026-10-04 (#35 plan):

1. **A pure presentation model, `src/ui/model/dataCheck.ts`.** It lists findings for a
   property at an explicit as-of date and never reads the clock. It calls the engine's own
   selectors (`selectValuation`, `leaseInForce`, `leaseEndWithoutFollowOn`, `renewedLease`,
   `loanWarnings`), so a finding appears exactly when the engine falls back. There is no
   completeness score or grade: each finding states its effect and where to fix it. An
   effect is stated only where it is true for both the snapshot and the projection, or says
   how they differ.
2. **The as-of date is the page's snapshot date** (the picked date, else today, never before
   the base date), the same date as the numbers on screen.
3. **"Needs attention" findings** (counted in the panel header):
   - **Stale valuation:** the valuation in use is dated on or before the as-of date and is
     more than 12 months old (as-of after validFrom + 12 months). Exactly 12 months is not
     stale. The age is shown in whole months. A valuation that only starts later is used by
     the engine and is not flagged.
   - **No valuation** in force (or upcoming) at the as-of date: the purchase price stands
     in as the value. Since ADR 0122 this means the property has no valuation at all.
   - **Lease ended:** no lease is in force and the last lease ended before the as-of date,
     on or after the projection's basis date. The snapshot has no rent after its end; the
     projection treats it as renewed (`renewedLease`, ADR 0080), so a Dashboard read from a
     projection year still shows its rent. The finding says both.
   - **No lease in force** otherwise (no lease, a gap before a later lease, or a last lease
     that ended before the basis date): rent counts as 0.
   - **Lease ending:** the lease in force ends within 3 months, the as-of date included,
     and no later lease is entered. This is the rule of the Dashboard's upcoming lease ends
     (ADR 0103), now one shared engine helper.
   - **Fixation ended with no follow-on block** at the as-of date: the existing Property
     detail loan warning (D-30), with the same text. That warning stays where it is and is
     still evaluated at the base date, so for a fixation ending between the base date and
     the as-of date only the Data check shows it.
4. **"Using portfolio defaults" findings** (listed below, not counted): the property has no
   own appreciation and/or rent indexation; the property's holding costs are missing or have
   blank fields (the fields are named). These are often deliberate, so they are shown
   quietly.
5. **Scope:** a property not yet purchased at the as-of date has no findings. The Dashboard
   covers the active properties in its filter; Property detail covers its own property.
6. **Where it shows:**
   - A **Data check** panel on the Dashboard, after "Financing & upcoming". It opens when
     something needs attention and is collapsed otherwise; the header always shows the
     counts. A manual open or close holds for the app session.
   - A **Data check** section on Property detail, right after Overview, listed in the
     section nav (ADR 0107).
7. **Each finding links straight to its fix:** valuation and lease findings to Records, the
   fixation to Financing, holding costs to Holding costs, growth to the property form. From
   the Dashboard the link opens the property and then moves to that section; the
   unsaved-changes guard applies as for any navigation.
8. **Not in this decision:** "funding history unknown" waits for the acquisition funding
   record (#33); a valuation source field (roadmap); gaps between consecutive leases (model
   limitations).

## Consequences

Presentation only: no computed number, parity target, golden master, export or stored data
changes. Two engine selectors are exported, and the lease-end and renewed-lease rules move
into shared helpers, all behaviour-neutral. New strings in en, cs and ru; the section nav
gains one link. The sample portfolio shows no attention findings at its base date, and the
growth defaults for all three properties.
