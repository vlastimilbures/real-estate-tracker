# 0244. The engine may read lib/rules.ts

- Status: Accepted (owner-delegated, night run 2026-11-16; owner review pending)
- Date: 2026-11-17
- Source: issue #464 (code review 2026-11, tracking #435: the input rules in one place),
  part 1; the plan posted on #464; non-critical decisions delegated by the owner for the
  2026-11-16 night run
- Amends: [0072](0072-layer-map-platform-and-type-edges.md) (layer-map row Engine),
  [0171](0171-layer-map-corrections.md) (its layer map, whose other rows stay as they are)
- Related: [0075](0075-input-rejection-gaps.md) and
  [0076](0076-csv-int-bounds-and-app-name.md) (the bounded ranges), [0086](0086-restore-int-bounds.md) (restore applies them),
  [0109](0109-loan-prepayments-and-recasts.md) (the recast cap is the longest loan term),
  [0128](0128-assumption-bounds.md) (the unit-rate range and the growth floor),
  [0149](0149-calendar-days.md) §5 (the date floor)

## Context

Each input limit was written where it is checked. The bounded ranges and the date floor
lived in `src/lib` (`intRanges.ts`, `day.ts`), but the engine repeated the unit-rate range
(a fraction from 0 to 1) and the growth floor (above −100 %), CSV import repeated the
unit-rate range, and the recast cap restated the 50-year loan term as the literal 600
months, pinned only by a test (`src/import/__tests__/loanTermCap.test.ts`). The engine may
import only `src/lib/money.ts` (ADR 0072; `engine-pure-layers` in
`.dependency-cruiser.cjs`, the engine block in `eslint.config.js`), so it could not read a
shared rule.

## Decision

1. **One module names the input rules:** `src/lib/rules.ts` holds the bounded ranges, the
   scenario form's shock years and crash year, the date floor year, the whole-number
   grammar, the unit-rate range and the growth floor. A layer whose limit differs gets its
   own named rule; no layer's limit or message changes.
2. **The engine may import `src/lib/rules.ts`** as well as `src/lib/money.ts`.
   `rules.ts` imports only `./money`, never `day` or `format`, so the engine still reaches
   no clock and no display code. `engine-pure-layers` in `.dependency-cruiser.cjs` and the
   engine block in `eslint.config.js` let the engine import it; the `lib-rules-pure` rule
   keeps `rules.ts` to `./money`.
3. **What the engine reads from it:** the unit-rate and growth-floor predicates, and the
   recast cap (`MAX_LOAN_TERM_MONTHS = INT_RANGES.loanTermYears.max × 12`, still 600). The
   engine reads no other maximum: its rules stay open-ended above, as today.

Layer map row after this ADR (the other rows of ADR 0072 and ADR 0171 are unchanged):

| Layer  | Path         | May import (runtime)                                 |
| ------ | ------------ | ---------------------------------------------------- |
| Engine | `src/engine` | `decimal.js`, `src/lib/money.ts`, `src/lib/rules.ts` |

## Owner review

If the owner prefers the engine to keep importing nothing but `money.ts`, the fallback is
to keep the unit-rate range, the growth floor and the recast cap in the engine and have CSV
import read them from the engine (which import may already use, ADR 0171).

## Consequences

- A limit is changed in one place; the engine and CSV import cannot drift on the unit-rate
  range, and the recast cap follows the longest loan term without a pinning test.
- `rules.ts` is now an engine dependency: an import added to it from `day`, `format` or any
  other module fails `pnpm depcruise` (`lib-rules-pure`).
- No computed number, limit, message, stored data, export or layout changes.
