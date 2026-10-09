# 0162. A floating (0-year) block keeps its entered rate up to baseDate

- Status: Proposed
- Date: 2026-10-09
- Source: issue #124 (2026-10 code review); owner decision D4 (2026-10-09: option A);
  Track 11 PR 11.14
- Amends: [0103](0103-financing-exposure.md) (point 2: what a 0-year block's rate is)
- Related: D-21 (the payment due on the fixation end is still fixed), D-30 (an ended fixation
  needs new terms), [0100](0100-rate-shock-reach.md) (which loans a rate shock reaches),
  [0129](0129-loan-schedule-edge-cases.md) (§4 refix gap warning)

## Context

A mortgage block with 0 fixation years is a floating-rate loan. The engine took its fixation
end as `startDate + 0 months`, so:

- `rateAt` never used the entered rate. Every payment, history included, ran at the
  assumed reset rate, and the opening balance was replayed at that rate rather than at the
  rate the owner actually entered (and paid).
- `fixationExpired` was true for every started floating block, so the property's Financing
  section and the Data check warned that the fixation had ended and asked for new terms that
  do not exist.
- A scenario rate shock ran for N years from the loan start. For a floating loan started
  more than N years ago it had already elapsed and the shock changed nothing.

No test pinned this behaviour, and no parity or golden fixture has a 0-year block.

## Decision

1. The **entered rate** of a 0-year block applies to every payment due on or before
   baseDate. Payments due after baseDate run at the assumed reset rate
   (`postFixationResetRatePa`). The engine reads this from one helper,
   `rateFixedUntil(block, baseDate)`: the fixation end (`blockEndDate`) for a fixed block,
   and the later of the start date and baseDate for a 0-year block. A floating block that
   starts after baseDate therefore runs at the reset rate from its first payment, as before.
2. The opening balance of a started floating block is the closed-form balance at its entered
   rate (the same path as a fixed block still in its fixation).
3. A scenario **rate shock** on a floating block starts at baseDate (the first payment after
   it) and lasts `durationYears` from there; for a future floating block it starts at the
   block's start. The Scenarios list of loans a shock reaches (ADR 0100) follows the same
   rule, and names baseDate's year (or the start year) as the refix year.
4. A 0-year block **never counts as an ended fixation**: `fixationExpired` is false, so
   there is no "fixation ended" warning on the property or in the Data check.
5. ADR 0103 point 2 now reads: a block with 0 fixation years floats; it pays its entered rate
   up to baseDate and the reset rate after it, and it has no fixation end. Financing exposure,
   upcoming events and the loan outlook are unchanged (a floating block still has no
   fixation end and shows as floating).

## Consequences

- Only portfolios with a started 0-year block see different numbers: a different opening
  balance (and so every later balance, interest and net-worth figure), and a rate shock that
  now applies. Parity targets and the golden master do not change (no fixture has such a
  block).
- The entered rate stands for the whole past. If a floating loan's rate moved in the past,
  the opening balance is an approximation; entering the past rate changes as blocks gives the
  exact history (docs/model-limitations.md).
- No new strings and no new fields.
