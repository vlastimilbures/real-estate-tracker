# 0152. Copy-only changes go to a wording log; the ADR index is generated

- Status: Proposed
- Date: 2026-10-07
- Source: issue #111 (2026-10 code review, findings R7-09, R8-10, R8-11, R7-08, R8-16);
  owner decision D1 (2026-10-07: Group 1 option B, Group 2 option D′); Track 11 PR 11.3
- Amends: [0001](0001-behaviour-change-gate.md) (where the sign-off for a copy change is
  recorded), [0002](0002-dependency-policy.md) (upgrades of runtime dependencies),
  [0070](0070-decision-records.md) (numbering and the index)
- Related: [0081](0081-public-release.md) point 3 (CHANGELOG and ADRs),
  [0151](0151-ci-gates-after-going-public.md) (CI gates)

## Context

The project docs ask for an accepted ADR for every user-visible change, including one message
string. ADR 0001 itself asks only for owner sign-off and new tests. Wording-only ADRs (for
example 0105, 0113, 0115) cost a number, an index row and a merge conflict each, and they
quote the new strings in three languages, so they go stale at the next copy change.

ADR numbers are picked by hand, and the index in `docs/adr/README.md` is kept by hand. The
index had no Status column, its titles drifted from the files, and eleven Amends / Amended-by
links were one-sided; nothing checked them.

The docs also say a "new or upgraded" runtime dependency needs a justification, while ADR
0002 covers only a new one. Read literally, every Dependabot runtime bump is a decision.

## Decision

1. **Copy-only changes go to a wording log.** A change that only edits the text of existing
   i18n dictionary entries is recorded as a dated entry in `docs/decisions/wording.md`,
   with the owner's OK, not as an ADR. The entry cites dictionary keys, the issue or PR, what
   changed, and the rejected option. A change to a number, a limit, a rejection, an export,
   the stored data, the layout or what assistive technology announces still needs an ADR. The
   gate of ADR 0001 is unchanged: owner sign-off and a test first.
2. **ADRs cite dictionary keys, not translated strings**, so they stay true when the copy
   changes.
3. **Runtime dependencies.** A new runtime dependency needs a written justification and owner
   approval (ADR 0002, unchanged). A patch or minor upgrade of an existing one passes on green
   CI. A major upgrade gets the owner's review in its PR.
4. **Numbering stays by hand**: the next number that is free on `origin/main` and in open PRs.
5. **The index is generated.** `pnpm adr:index` writes the index table in `docs/adr/README.md`
   (number, title from the file's heading, status, IDs) from the ADR headers.
   `pnpm adr:check` runs in the Frontend CI job and fails on a stale index, a bad header, a
   link to a missing ADR, or a one-sided Amends / Amended-by or Supersedes / Superseded-by
   link.

## Consequences

- CLAUDE.md §8, CONTRIBUTING.md, `docs/adr/README.md` and the PR template describe the
  wording log and the dependency rule.
- An ADR never edits the index table by hand; it runs `pnpm adr:index`. A merge conflict in the
  index is resolved by rerunning the script, not by hand.
- Merge-time numbering (issue #111 option D) can be added later if parallel tracks return.
