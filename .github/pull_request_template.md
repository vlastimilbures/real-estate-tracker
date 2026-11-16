## What and why

<!-- One logical change. Link the issue: "Closes #123". -->

<!-- Changelog: an accepted ADR must be cited as "ADR NNNN" in CHANGELOG.md [Unreleased].
     With nothing user-visible to record, add a line "Changelog: none (reason)" here. -->

## Checklist

- [ ] `pnpm check` passes (gates: CONTRIBUTING.md#checks)
- [ ] Engine changes have tests written first; parity targets unchanged, or changed with an ADR
- [ ] User-visible change: ADR accepted (ADR 0001), or for a copy-only change an entry in `docs/decisions/wording.md` (ADR 0152); `CHANGELOG.md` `[Unreleased]` updated
- [ ] New or changed ADR header: `pnpm adr:index` run (index regenerated)
- [ ] Docs impact checked (SPEC / Guide / README / user docs / roadmap)
- [ ] No real personal data (databases, backups, statements, screenshots of real portfolios)
