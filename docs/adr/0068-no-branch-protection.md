# 0068. No server-side branch protection

- Status: Accepted
- Amended by: ADR 0081
- Date: 2026-10-02
- Source IDs: D-68

## Context

The repository is private on the free plan; the branch-protection API returns 403.

## Decision

**P10 plan (owner, 2026-10-02):** (1) No server-side branch protection: the repo is private on the free plan (`gh api .../branches/main/protection` → 403 "Upgrade to GitHub Pro or make this repository public"); quality is enforced by CI plus local husky hooks (DR-161). (2) The macOS bundle job (build + ad-hoc sign + `codesign --verify`) runs on `v*` tags and manual dispatch only (macOS minutes bill at 10x). (3) Stryker on `src/engine` runs nightly (answers J-09/D-26) and skips when main has no commit in the last 24 h; the break threshold is the measured baseline floored to a whole percent and only ratchets up. (4) DR-052: enable `noImplicitOverride` only; `noUncheckedIndexedAccess` outside the engine goes to the backlog. (5) Rule 6: move `@tauri-apps/api` from devDependencies to dependencies at the same version (DR-011/DR-153; it is imported at runtime). (6) Existing §4.1 layering violations are frozen in a dependency-cruiser baseline and logged, not fixed, in P10.

Related follow-up decisions:

- **D-69**: **P10 gate (owner, 2026-10-02):** P10 approved as delivered (PR #63). G-1 (a): no branch protection while the repo is private; CI + local hooks (DR-161). G-2: do **not** spend billed macOS minutes — the macOS bundle workflow runs on manual dispatch only (tag trigger removed) and is first exercised when the repo may go public after the refactor, clean-up and docs review. G-3 (a): type-only import cycles allowed. G-4 (a): fix the H-14 probe later, then add `cargo test` to CI (DR-169).

## Consequences

Gate action "branch protection" replaced by item (1).
