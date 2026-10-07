# 0151. CI gates after going public

- Status: Proposed
- Date: 2026-10-07
- Source: issue #111 (2026-10 code review, findings R7-07, R8-16); owner decision D1
  (2026-10-07: `strict` checks stay off); Track 11 PR 11.3
- Amends: [0068](0068-no-branch-protection.md) (supersedes items (1) and (2) and D-69 G-1 and
  G-2), [0013](0013-ci-runners.md) (Consequences: when the macOS bundle runs)
- Related: [0081](0081-public-release.md) ("a public repository can enable it"),
  [0026](0026-mutation-testing.md) (Stryker nightly)

## Context

ADR 0068 item (1) says `main` has no server-side protection because the repository is private
on the free plan. Since ADR 0081 the repository is public, and protection is on, but no ADR
records it. `.husky/pre-push` still says "main has no server-side protection".

The release trigger is described three ways. ADR 0068 item (2) says `v*` tags and manual
dispatch. D-69 G-2 (quoted in ADR 0068) says manual dispatch only, tag trigger removed. ADR
0013's Consequences say the macOS bundle runs on PRs to main or nightly. The workflow
`.github/workflows/release-macos.yml` runs on `v*` tags and manual dispatch.

The nightly Stryker run is incremental, but `nightly.yml` and `stryker.config.json` cite
"D-72" for it. D-72 would resolve to ADR 0072 (the layer map), an unrelated decision, and no
ADR records incremental mutation testing.

## Decision

1. **`main` is protected.** A pull request into `main` needs three passing checks: "Frontend
   (typecheck · lint · format · test)", "Rust (fmt · clippy · test · audit · build)" and
   "Accessibility (axe scan)". `strict` stays off (owner, D1): one track merges at a time, and
   strict would add a rebase and a full CI run per PR. Admins are not enforced, so the owner
   can still act in an emergency. The local husky hooks stay as a fast first check.
2. **The macOS bundle** (build, ad-hoc sign, `codesign --verify`) runs on `v*` tags and on
   manual dispatch, as `release-macos.yml` does. It does not run on pull requests or nightly.
3. **Nightly Stryker is incremental.** The previous run's result file is restored from the
   Actions cache, so only mutants in changed engine code or tests rerun.
   `pnpm mutation --force` reruns all. The break threshold rules of ADR 0068 item (3) are
   unchanged.

ADR 0068 items (3) to (6) stay in force.

## Consequences

- `.husky/pre-push`, `nightly.yml` and `stryker.config.json` cite this ADR instead of D-68 and
  "D-72".
- If parallel tracks come back and two green PRs break `main` together, revisit `strict`.
- Changing the required checks (a renamed CI job, a new required job) needs an ADR that
  amends this one.
