# 0079. Engine edge cases: month-end growth, handover tranches, shock history, late draws, IRR

- Status: Accepted
- Date: 2026-10-02
- Source IDs: DR-123, DR-126, DR-117, DR-074, DR-158 (P17 plan)
- Builds on: D-21, D-28, D-32, D-45, D-47, ADR 0001, ADR 0003 (legacy IDs, ADR 0081)

## Context

- **DR-123.** With baseDate on 29 Feb, the snapshot counts value growth in whole completed
  months (`monthsBetween`) while the projection grows exactly `t` years on the baseDate
  anchor, so snapshot(baseDate + 1 y) ≠ projection year 1. D-45 decided the fix but it was
  never implemented.
- **DR-126.** A development tranche dated after its successor's start but in the same grid
  month stays in the kept draw row, so the successor pays it off. D-47 drops payments due
  after the start; the tranche escaped that rule.
- **DR-117.** A scenario `rateShock` is anchored at the loan's fixation end (D-28). For a
  loan whose fixation ended before baseDate the window starts in the past, so the what-if
  re-prices replayed payments and changes the opening balance.
- **DR-074.** A draw dated after the last schedule month is clamped into the final month
  and re-amortized as a one-shot payoff instead of being rejected.
- **DR-158.** The IRR bracket is fixed at [−90 %, 100 %]: a higher IRR shows blank, and a
  cash-flow vector whose NPV has several roots silently returns one of them.

## Decision

Owner, 2026-10-02 (P17 plan):

1. **Value growth counts months with the D-21 month-end rule** on both the snapshot and the
   projection (`lastGridMonthOnOrBefore`), as D-45 decided (DR-123).
2. **Tranches are dropped by date at a handover.** Every development tranche dated after
   its successor's start is excluded from the kept draw row, the same rule as D-47,
   whatever its grid month (DR-126).
3. **A scenario rate shock applies only to payments due after baseDate.** The window stays
   anchored at fixation end (D-28); history and the opening balance never change in a
   what-if. The base case is untouched (DR-117).
4. **A draw dated on or after the loan's final payment date (start + term) is rejected**
   (it has no payment left to repay it) with the new validation code
   `DRAW_AFTER_SCHEDULE_END` at every entry point (engine validation, draw form, restore;
   CSV cannot create draws), with an en/cs/ru message like `DRAW_BEFORE_START` (DR-074,
   UX-078).
5. **IRR search widens and flags non-unique roots.** When there is no sign change in
   [−90 %, 100 %] the upper bound expands (up to 1000 %). When an NPV sign scan over the
   search range finds more than one root, the IRR is "n/a" with the reason "no unique
   IRR"; with no root it is "n/a" with that reason. Dashboard and Compare show the reason
   instead of a blank (DR-158, UX-079). Counting cash-flow sign changes is not used: a
   future purchase gives several sign changes with one root.

## Consequences

No seed fixture hits these edges, so the parity targets and the target change log do not
change. Computed numbers change only for month-end value anchors, handovers with a late
tranche, shocked scenarios on loans whose fixation ended before baseDate, and IRRs above
100 % (user-visible under ADR 0001). A stored draw after its loan's end now makes the
engine report a validation error, so the owner checks their data before upgrading.
