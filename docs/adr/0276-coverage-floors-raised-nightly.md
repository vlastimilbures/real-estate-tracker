# 0276. Coverage floors: a PR fails only on a broken floor; the nightly run lists the raises

- Status: Accepted
- Date: 2026-11-27
- Source: issue #499 (owner decision 2026-11-27, option A), implemented in PR #712; owner
  approval of this record in session on 2026-11-27
- Amends: [0083](0083-coverage-rebaseline-vitest-4.md) (the ratchet no longer fails a PR
  whose coverage rose; raises are listed by the nightly run)
- Topic: CI: coverage floors
- Trigger: n/a
- Likelihood: n/a

## Context

ADR 0083 kept the per-folder coverage ratchet: the floors in `coverage-floors.json` only go
up. Until PR #712, `pnpm coverage:ratchet` enforced this on every pull request by failing
when a floor sat more than `MAX_SLACK` (3) points below the measured value. A PR that added
well-covered code therefore failed until it also edited `coverage-floors.json`, a change
unrelated to its purpose.

## Decision

1. **The PR gate fails only on a broken floor.** `pnpm coverage:ratchet` fails when a
   folder's measured lines or branches are below its floor, or when a floor's glob matches
   no covered file. A floor far below measured passes.
2. **The nightly run, on main only, keeps one issue with the floors to raise.** The daily
   `coverage` job (when main changed in the last 24 h, and on a manual run) runs
   `pnpm test:coverage` and `pnpm coverage:ratchet --raise --out coverage-floors.md` with
   the read-only token. A floor is listed when it sits more than `MAX_SLACK` (3) points
   below measured; its new value is measured minus the headroom (2 points under `src/ui`,
   1 elsewhere), rounded down. The `coverage-floors` job, only when the ref is main, finds
   the one open issue labelled `coverage-floors` ("Coverage floors to raise") and replaces
   its body, or opens it. The body has one table row per folder and metric and the whole
   new `coverage-floors.json`. Floors are raised from that issue in a PR of their own.
3. **A sentinel marks "nothing to raise".** When no floor lags by more than `MAX_SLACK`,
   the script writes the single line `<!-- coverage-floors: none -->` (never an empty
   file). On that first line the issue job closes the open issue, if there is one, with a
   comment naming the commit and run, and opens nothing.

## Consequences

Not user-visible; no floor value changes. The floors still only go up, but between a rise
in coverage and the PR that raises the floor they can lag by more than 3 points.

- `scripts/check-coverage-ratchet.mjs`: `ratchet()` (point 1), `MAX_SLACK`, `headroom()`,
  `raise()` and `issueBody()` (point 2), `NONE` (point 3).
- `.github/workflows/nightly.yml`: the `coverage` job (read-only) and the
  `coverage-floors` job (`issues: write` only, no checkout, so no repository code runs with
  that token); `report` also needs both, so their failure opens or comments on the
  `nightly-failure` issue.
- `CONTRIBUTING.md` ("Coverage floors") and the gate list in `scripts/gates.mjs` describe
  the rule; tests in `scripts/__tests__/coverage-ratchet.test.mjs`.
