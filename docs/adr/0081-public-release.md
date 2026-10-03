# 0081. Public release: fictional sample portfolio, own regression baseline, archive retired

- Status: Accepted
- Date: 2026-10-03
- Supersedes: ADR 0011
- Amends: ADR 0003, ADR 0016, ADR 0039, ADR 0068, ADR 0070

## Context

The project is to be published as a public repository. Three things written for a private,
single-owner repository no longer fit:

- **The sample portfolio is real.** It is the owner's own flats, purchase prices, loans and
  rents (ADR 0011). It is the parity fixture, the golden master, the screenshot data and the
  first-run seed every new install receives (ADR 0016).
- **The spreadsheet is no longer the reference.** The engine started as a port of a private
  Excel workbook whose numbers served as the parity targets. Since then the targets have been
  re-baselined several times for Czech banking practice (ADR 0003), the engine is covered by an
  independent mortgage reference model, invariant and property-based tests and a full-precision
  golden master (ADR 0039), and the workbook is not part of the repository. Describing it as the
  authority is misleading.
- **The refactor-programme archive** (`docs/refactor/`: plan, decision log, debt register, phase
  reports) is internal working material.

## Decision

Owner, 2026-10-03:

1. **Fictional sample portfolio.** The three sample flats get fictional names (Byt Lipová,
   Byt Javorová, Byt Dubová) and ids, fictional sizes and descriptions, and **every money
   figure is scaled by 0.85** (prices, valuations, principals, instalments, rents, holding
   costs and cost defaults). The engine is homogeneous in money (no instalment rounding,
   ADR 0020), so every rate, ratio, date, IRR, CAGR and edge case (fixation boundary, lease
   step, first positive cash-flow year, debt-free year) stays exactly as before. Dates and
   interest rates are kept; without names, addresses or amounts they identify nothing.
2. **The regression baseline is the project's own.** The parity targets in
   `.claude/rules/engine-parity.md`, the golden master (ADR 0039) and the independent mortgage
   reference (`src/engine/__tests__/reference/`) are the baseline. A change to a target needs
   an accepted ADR (ADR 0001, ADR 0003) and a row in the target change log; the golden master
   is updated in the same commit. Documentation no longer calls a spreadsheet the oracle.
3. **Archive retired.** `docs/refactor/` is removed from the published tree (it stays in the
   private repository's history). `D-nn` in code comments resolves to ADR `00nn` via the index;
   `DR-nnn`, `UX-nnn`, `J-nn`, `Q-nn` and `P-nn` are legacy IDs from that archive and are not
   renumbered. New debt and ideas go to GitHub issues; known limitations are summarised in
   `docs/roadmap.md`; user-visible changes are recorded in the CHANGELOG and, when they need a
   decision, an ADR.
4. **Published as a new repository** with a single initial commit, so no earlier history,
   pull request or CI log carries the real figures.

## Consequences

- First-run seed changes (user-visible, ADR 0001): a new install shows the fictional
  portfolio; existing databases are untouched (`seedIfEmpty`).
- Every money parity target moves to its engine value for the scaled seed (≈ old × 0.85,
  within the ±1 Kč tolerance); ratio, rate and year targets do not move. Recorded as one row
  in the target change log; the golden master is regenerated in the same commit.
- ADR 0011 is superseded. ADR 0068 (no branch protection) applied to a private repository;
  a public repository can enable it.
- Third-party AI design skills are dropped from the repository; the domain glossary and the
  engine-parity rule stay.
