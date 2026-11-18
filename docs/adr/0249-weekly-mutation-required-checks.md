# 0249. Weekly mutation testing; required checks renamed and Changelog required

- Status: Accepted
- Date: 2026-11-18
- Source: owner decisions 2026-11-18 (#435 comment 6965976270, "CI / tooling"); issues
  #496, #499; plan on #499
- Amends: [0239](0239-sharded-nightly-mutation.md) (§4: mutation runs weekly and on
  demand, skipped when main had no commit in 7 days),
  [0151](0151-ci-gates-after-going-public.md) (§1: the axe check is renamed "UI captures
  and axe", and "Changelog (ADR entries)" is required)
- Related: [0068](0068-no-branch-protection.md) item (3) (skip when main is unchanged),
  [0078](0078-ux-a11y-round-b-charts-menu-axe.md) (the axe scan),
  [0158](0158-layouts-hold-in-czech-and-russian.md) (the Czech and Russian layout
  captures)

## Context

ADR 0239 §4 runs the sharded Stryker run every night that main had a commit in the last
24 h. Seven legs of up to 110 minutes each (cold) is a lot of runner time for a check whose
score moves only when engine code or its tests change, and engine changes land in batches.
The bench and the property runs are cheap and stay nightly.

ADR 0151 §1 names three required checks. The third, "Accessibility (axe scan)", is the
aggregate of the axe shards, which since ADR 0158 also capture the layout screens in Czech
and Russian and fail on a clipped or covered string: the name says less than the job does.
The Changelog check (`changelog.yml`, #461) runs on every pull request but is not required,
so a PR that adds an accepted ADR without a CHANGELOG entry can still merge.

## Decision

1. **Mutation testing runs weekly and on demand** (amends ADR 0239 §4). `nightly.yml` has
   two schedules: `17 2 * * *` (daily) for the bench and the property runs, and
   `47 3 * * 0` (Sunday 03:47 UTC) for mutation, a minute of its own so it never depends on
   how GitHub delivers two schedules due in the same minute. The scheduled mutation run is
   skipped when main had no commit in the last 7 days; the bench keeps its 24 h rule. A
   manual dispatch runs every job, and `mutation_cold` still skips the cache restore. The
   shards, their caches and the combined-score gate of ADR 0239 §1–§3 do not change, nor
   do the break rules of ADR 0068 item (3).
2. **The required checks** (amends ADR 0151 §1) are "Frontend (typecheck · lint · format ·
   test)", "Rust (fmt · clippy · test · audit · build)", **"UI captures and axe"** (the axe
   aggregate job `axe` in `ci.yml`, renamed from "Accessibility (axe scan)"; its id and its
   shards do not change) and **"Changelog (ADR entries)"**. `strict` stays off and admins
   stay unenforced, as ADR 0151 §1 says.
3. Branch protection changes in the same step as the merge of the rename: the old context
   is swapped for "UI captures and axe" and "Changelog (ADR entries)" is added, so no PR
   waits on a check that no longer reports.

## Consequences

- A mutation regression is found within a week instead of a night. Run the shard locally
  (`STRYKER_SHARD=<name> pnpm mutation:shard`), or dispatch `nightly.yml`, after an engine
  change that might weaken the tests.
- GitHub evicts an Actions cache that has not been used for 7 days, so a weekly run, and
  always one after a skipped week, can find a leg's incremental file gone and run that leg
  cold. A cold leg took 32–110 minutes (ADR 0239), inside the 180-minute timeout.
- On Sunday there are two scheduled runs: the daily one at 02:17 UTC (bench and
  properties) and the weekly one at 03:47 UTC (mutation). Each has its own skip check, and
  the `nightly-failure` report of either opens or updates the one issue. The weekly cron
  string also appears in the `changed` step and the property job's `if:`;
  `scripts/__tests__/nightly-schedule.test.mjs` fails when they differ.
- The gate list (`scripts/gates.mjs`) gives mutation `where: "weekly"`, and the README
  table says "Weekly".
- Until branch protection is changed, the PR that renames the job shows "Accessibility (axe
  scan)" as expected and missing.
- A PR with nothing for the changelog still opts out with `Changelog: none (reason)` in
  its body; the check is now what enforces it.
