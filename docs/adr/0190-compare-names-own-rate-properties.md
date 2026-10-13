# 0190. Scenario compare names the properties a level does not reach

- Status: Accepted
- Date: 2026-10-13
- Source: issue #166 (option C); owner decision 2026-10-13 (placement and short wording);
  Track 14 PR N10b
- Amends: [0102](0102-scenario-form-groups.md) (Consequences),
  [0108](0108-scenario-compare-xlsx-export.md) (§6, notes)

## Context

A property's own appreciation or rent-indexation rate wins over a scenario's level (ADR
0102 §3). The form help says so, but the compare does not: a "Low growth" column for a
portfolio whose properties all have their own rate looks like Base, with nothing on screen
or in the export to say why.

## Decision

1. **One note line per affected scenario** under the compare key-figures table, after the
   rebased-returns footnote, as dictionary entry `scenarios.levelNotApplied` (scenario
   name, then the property names joined with ", ").
2. **A property is named** when it is active and either the scenario sets an appreciation
   level and the property has its own appreciation rate, or the scenario sets a
   rent-indexation level and the property has its own rent-indexation rate. Each property
   is named once per scenario, in portfolio order. It is named even when its own rate
   equals the scenario's level.
3. **No line** for Base, for a scenario that sets neither level (shocks or a crash only),
   or when no active property has its own rate. A scenario left out of the comparison
   (ADR 0123) gets no line.
4. **The Excel export** (ADR 0108 §6) adds the same lines to the Key figures notes, after
   the rebased-returns footnote and before the n/a IRR reasons.

New dictionary key: `scenarios.levelNotApplied`. No existing text changes.

## Consequences

- Display and export only: no computed number, parity target, golden master or engine
  output changes. The sample portfolio has no own rates, so no screenshot changes.
- ADR 0102's consequence stands (a scenario level still does not override a property's own
  rate); the compare now names the properties it misses.
- Tests: `compare.test.ts`, `compareXlsx.test.ts`, `ScenarioCompareOwnRate.test.tsx`.
