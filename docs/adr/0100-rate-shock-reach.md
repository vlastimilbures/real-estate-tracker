# 0100. Scenarios: show which loans a rate shock hits

- Status: Accepted
- Date: 2026-10-03
- Source: issue #47 (Scenarios critical review after #15)

## Context

A scenario rate shock raises the post-fixation rate only for payments due in the window
(fixation end, fixation end + N years] and after baseDate (`rateAt`, ADR 0028, DR-117). Some
loans never feel it: a loan fixed to maturity, a loan that refixes after the horizon, a loan
whose window ended before baseDate, or a block replaced by a successor before it refixes. The
Scenarios page does not say which loans a shock reaches, so a shock that changes little or
nothing looks broken.

## Decision

1. A scenario with a rate shock adds a reach note to its list summary, after the
   "rates +x pp for Ny" text:
   - "hits N of M loans (refix 2029, 2031)" when at least one loan has a payment inside the
     shock window. The years are the calendar years of the hit fixation ends, deduplicated
     and sorted;
   - "no loan refixes inside the shock window, so no effect" when no loan does;
   - nothing extra when the portfolio has no active property with a mortgage.
2. A loan is one property's block chain (the block in force at baseDate and its successors).
   A refinance or refix block is the same loan. Inactive properties are not counted, as in the
   projection.
3. The reach is decided per payment, as the engine does: a block is hit when one of its
   payments counted in the projection (inside the horizon, before a successor takes over, up
   to maturity) is due after its fixation end, after baseDate and on or before fixation end +
   N years. A pure UI-model helper decides it from block dates only; it does no rate maths.
   A test runs the engine with and without the shock to keep the helper in step with
   `rateAt`.
4. The compare column header of that scenario shows the same note as a tooltip, with a copy
   for screen readers.
5. The rate-shock form help says the shock starts at each loan's fixation end. The inflation
   shock keeps its own help text.
6. No note explains an unchanged net worth (for example, every loan is repaid before the
   horizon). The compare Δ figures already show the effect.

## Consequences

Display only: no computed number, parity target, golden master or engine output changes.
New strings in en, cs and ru, with Czech and Russian plurals.
