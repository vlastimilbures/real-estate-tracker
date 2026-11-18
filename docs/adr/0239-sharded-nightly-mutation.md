# 0239. Sharded nightly mutation testing, gated on the combined score

- Status: Accepted
- Date: 2026-11-16
- Source: issue #443 (AC3: a cold Stryker run exceeds the job timeout); the owner's decision
  on #443 to shard the run with one incremental cache per shard; CI and tooling decisions
  delegated by the owner for the 2026-11-16 night run
- Amends: [0151](0151-ci-gates-after-going-public.md) §3 (one cache file; the break enforced
  by Stryker in the one job)
- Related: [0026](0026-mutation-testing.md) (Stryker nightly),
  [0068](0068-no-branch-protection.md) item (3) (skip when main is unchanged; the break
  only ratchets up), [0073](0073-scenario-compare-budget.md) (the bench job beside it)

## Context

ADR 0151 §3 runs nightly Stryker incrementally from one cached result file, in one job, and
Stryker itself fails the job below `thresholds.break`. A run with no usable cache tests every
mutant. Run 43834527278 did that for 2750 mutants: about 6 h on a 4-vCPU runner, past the
300-minute job timeout, so it ended with no score at all. The first 800 mutants took 20 min
and held all 38 survivors; the other ~1950 took 4 h 40 min and held all 164 timeouts. Every
cold run (a new branch, an expired cache, a change to the test setup) hits the same wall.

That run used its branch's earlier `report` job (`if: failure()`), which skips a cancelled
or timed-out job, so it opened no `nightly-failure` issue. main (since c153ee48) already
reports a failed, cancelled or timed-out job. Sharding adds a new gap: each leg can be green
on its own while the run as a whole has no valid combined score, for example when a leg's
report is missing or only part of a split file was tested.

## Decision

1. **The nightly run is sharded** into seven matrix legs: `schedule-a` and `schedule-b`
   (`src/engine/schedule.ts` split before the top-level `function undrawnMonthStep`),
   `validate-a` and `validate-b` (`validate.ts` split before `function checkMortgage`),
   `projections` (with `financing.ts`), `kpis` (with `dates.ts` and `metrics.ts`) and `rest`
   (every other engine file, so a new file needs no change). The table lives in
   `scripts/mutation-shards.mjs`; `stryker.shard.config.mjs` builds one leg's config from
   `stryker.config.json`. A split is a Stryker line range computed from the anchor at run
   time; a missing or repeated anchor fails the leg. Each leg has a 180-minute timeout and
   its own incremental file and cache (`stryker-incremental-<shard>`), so one leg's cache
   miss reruns only that leg's mutants.
2. **The break applies to the combined score**, not to each leg. A leg runs with
   `break: null` and reports its own score. A `mutation-score` job merges the legs'
   `mutation.json` reports and fails below `thresholds.break` in `stryker.config.json`
   (98), with Stryker's formula: Killed + Timeout over Killed + Timeout + Survived +
   NoCoverage, unrounded. It also fails when a leg's report is missing, when two legs report
   the same mutant, or when a split file lacks a part, so a dead leg cannot pass by
   omission. The break rules of ADR 0068 item (3) are unchanged.
3. **`timeoutMS`, `timeoutFactor` and `ignoreStatic` are unchanged.** A timed-out mutant
   counts as detected, so a shorter timeout would make runs faster by raising the score and
   weakening the gate. Skipping static mutants would drop mutants from the score. Speed comes
   from parallel legs only.
4. **The skip rule is kept.** Mutation still runs only when main had a commit in the last
   24 h, or on a manual dispatch (ADR 0068 item (3)); there is no weekly run regardless of
   changes. A manual dispatch with `mutation_cold` skips the cache restore, to prove a cold
   run fits.
5. `pnpm mutation` (the whole engine in one local run, break 98) is unchanged;
   `STRYKER_SHARD=<name> pnpm mutation:shard` reproduces one leg.

## Consequences

- A cold run fits. The proof run 43924585493 (`mutation_cold`, 2026-11-17) passed with a
  combined score of 98.22 % (2699 of 2748 valid mutants detected; break 98). Its cold leg
  times in minutes: schedule-a 32, projections 34, rest 65, validate-a 84, kpis 90,
  schedule-b 109, validate-b 110. The planned 120-minute timeout would have left the two
  slowest legs about 10 minutes of headroom, so the timeout is 180 minutes, still under
  GitHub's 360-minute job limit. If schedule-b or validate-b grows, split it again at
  another top-level function before the timeout is raised further.
- `report` needs `mutation-score`, which always runs once the change check passed. A
  missing, partial or below-break combined score fails it, even when every leg's own result
  is green, so that failure also opens or updates the `nightly-failure` issue. A failed,
  cancelled or timed-out leg was already reported (c153ee48).
- A leg's score is not gated on its own: a leg below 98 % passes when the combined score is
  at or above break. The step summary shows every leg and file so a weak area stays visible.
- When `schedule.ts` or `validate.ts` drops its anchor function, or another file outgrows its
  leg, the shard table changes in `scripts/mutation-shards.mjs`; its test fails first when
  an anchor is gone.
