# 0172. Recast and prepayment bench budgets, a same-run ratio, a checked factor

- Status: Accepted
- Date: 2026-10-11
- Source: issue #141 (2026-10 code review, finding G1-6-03, option A); owner decision
  (2026-10-11, Track 13 PR 13.4: absolute budgets plus a same-run ratio for the recast case)
- Amends: [0073](0073-scenario-compare-budget.md) (decision 2: which benches the nightly run
  asserts, and how)

## Context

ADR 0073 made the nightly run fail when a p99 exceeds 2 × its budget, for two of the engine
benches: one recompute and the 3-scenario compare (20 properties each). The recast bench, added
with the ADR 0116 fix that stops an instalment-recast build at the last payment instead of
building all 600 months to the 50-year cap, had no budget. No bench timed a prepayment: the
synthetic portfolio has none. `scripts/check-bench.mjs` also took any factor, so `abc` gave
"limit NaN ms" for every bench and exit 1 instead of the usage message.

Measured on the owner's machine (3 runs of `pnpm bench`, 20 properties, `schedulesByProperty`):

| Bench                         | p99          | median |
| ----------------------------- | ------------ | ------ |
| plain build (no events)       | 38.5–40.5 ms | ~30 ms |
| an instalment recast per loan | 38.5–40.4 ms | ~37 ms |
| a prepayment per loan         | 36.8–37.9 ms | ~36 ms |
| recast, ADR 0116 fix undone   | 52.4 ms      | ~43 ms |

Undoing the ADR 0116 fix makes the recast case only about 35 % slower. A budget of about 2 × p99
(80 ms, nightly limit 160 ms) would not see that. The ratio of medians, recast ÷ plain build in
the same run, moves from 1.24–1.25 to 1.45 and does not depend on the machine. The p99 ratio is
too noisy to use (0.95–1.04 across the three normal runs).

## Decision

1. **Absolute budgets:** p99 ≤ **80 ms** for "recasts, synthetic 20 properties / schedulesByProperty,
   an instalment recast on every loan" and for "prepayments, synthetic 20 properties /
   schedulesByProperty, a prepayment on every loan" (one prepayment of 10 % of the principal per
   loan, a year after its start, effects alternating). Like the ADR 0073 budgets they are about
   2 × today's p99, and the nightly limit is factor × budget (160 ms at the default factor 2).
2. **Same-run ratio:** the recast case's median must stay at or below **1.35 ×** the median of
   "pieces, synthetic 20 properties / schedulesByProperty". The factor does not scale a ratio.
   This is the check that catches a return to the 600-month build.
3. **Checked factor:** `pnpm bench:check <file> <factor>` exits 2 with the usage message when the
   factor is not a positive number.

## Consequences

The nightly bench now guards the recast fast path and times the prepayment path. The ratio can
fail if the plain build alone gets much faster; then the plain build's speed-up is the news, and
the ratio limit is re-measured in an amendment. The prepayment case has an absolute budget only:
no regression in it is known that an absolute budget would miss.
