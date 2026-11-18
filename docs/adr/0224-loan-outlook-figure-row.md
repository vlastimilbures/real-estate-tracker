# 0224. Loan outlook: after the charts, as a figure row

- Status: Accepted
- Date: 2026-11-16
- Source: issue #423 (UX/UI review 2026-11, round 2, tracking #425); direction approved
  by the owner on 2026-11-16 (point 6 of the round-2 plan); acceptance delegated by the
  owner for the 2026-11-16 run
- Amends: [0107](0107-property-section-nav.md) (the Loan outlook moves from the Financing
  section to the Overview), [0117](0117-property-loan-outlook.md) §1 (the label…value list
  becomes a figure row; the note moves behind the info icon)
- Related: [0103](0103-financing-exposure.md) (the Dashboard's Financing figures, now a
  shared figure row), [0217](0217-info-tip.md) (the info icon),
  [0167](0167-drawdown-schedule.md) (drawdown blocks, kept)

## Context

On Property detail the Loan outlook sits under Mortgages, halfway down the page. It reads
as a full-width label…value list, and a three-sentence note closes it. The figures answer
"when does my rate change, how much debt moves, when is it paid off". They belong next to
the charts that show the same debt over time. The Dashboard's Financing panel shows the
same kind of figures as a row of large values (`.fx-figures`), which reads faster.

## Decision

1. **Place.** The Loan outlook moves into the Overview section, right after the charts.
   No new section-nav entry. Mortgages and the loan warnings stay under Financing.
2. **Figure row.** The panel opens with a figure row, in this order:
   - Next rate reset (`propertyDetail.outlookStatus.nextReset`): the next fixation end,
     or `propertyDetail.outlookNextResetNone` when none is ahead.
   - Debt at reset (`propertyDetail.colBalanceAtReset`): that reset's balance, "—" without
     one.
   - Modelled payoff (`propertyDetail.loanPayoff`).
   - Remaining term (`propertyDetail.remainingTerm`), when known.
   - Interest saved (`propertyDetail.interestSaved`), when shown before (ADR 0130).
     Every figure shown before is still shown; the next reset's date and balance were
     already in the resets table and stay there.
3. **Shared component.** `.fx-figures` markup becomes a `FigureRow` component used by
   the Dashboard's Financing panel and the Loan outlook. The Dashboard looks the same.
4. **Below the row.** Drawdown blocks keep their bar and table, and the resets table stays
   below them, unchanged.
5. **The note** (`propertyDetail.loanSummaryNote`) moves behind the panel head's info icon.
   The hint (`propertyDetail.loanSummaryHint`) stays on the title's line.

New key: `propertyDetail.outlookNextResetNone` (en "None ahead", the Dashboard's wording).

## Consequences

- The Overview answers the loan questions without scrolling past Records and Mortgages.
- The figure row follows the Dashboard's, so both pages read alike.
- The note is one click away instead of always shown, as with the other panel notes
  since ADR 0217.
- No number, stored data or export changes.
- Found on the way, restoring ADR 0217's keyboard behaviour: Tab from an open info icon
  dropped focus to the page, because the popover clipped its own hover bridges and so
  became a scroller that Chromium makes a tab stop. A long text now scrolls in an inner
  body; the popover is no scroller and its hover bridges reach the icon again. The
  capture check Tabs on from every info icon it opens.
