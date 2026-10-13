# 0191. Projections portfolio choice, stale scenario list, presets matched by settings

- Status: Accepted
- Date: 2026-10-13
- Source: issues #210 (option A), #215 (option A), #162 (option B); owner decisions
  2026-10-11 (options) and 2026-10-13 (toast names the saved scenario); Track 14 PR N11
- Amends: [0127](0127-opaque-property-ids-sample-match.md) (Consequences: the `"portfolio"`
  value clash), [0128](0128-assumption-bounds.md) §6 (the scenarios an assumptions save
  checks), [0093](0093-scenario-add-flow.md) decision 1 and Consequences (presets matched by
  name)
- Related: [0125](0125-committed-write-reload-failure.md) (a committed write whose reload fails),
  [0123](0123-scenario-rules-every-entry-point.md) §5 (the compare leaves a broken scenario out)

## Context

Three small state gaps left by earlier decisions:

1. The Projections page holds the whole-portfolio choice as the value `"portfolio"`, in the
   same space as property ids. A property created before ADR 0127 from the name "Portfolio"
   has the id `portfolio`: picking it shows the whole portfolio, and the two options share a
   value (#210).
2. ADR 0128 §6 refuses an assumptions save that newly breaks a saved scenario, checked
   against the in-memory scenario list. When a scenario write commits but the reload after it
   fails (ADR 0125), the list misses the new or changed row, so the check can miss it (#215).
3. ADR 0093 matches a preset click to a saved scenario by its name in the UI language. A
   preset saved in another language is saved again, and a saved preset that was edited but
   kept its name blocks the real preset: the toast says "Already saved" and ticks a scenario
   with other settings (#162).

## Decision

1. **Projections keeps the portfolio choice outside the property ids.** Property options
   carry a prefixed value, so no property id, `portfolio` included, can select the whole
   portfolio. Labels, export file names and notes are unchanged.
2. **A committed scenario write updates the scenario list when the reload fails.** After
   add, save, duplicate or remove commits and the store is stale (ADR 0125), the in-memory
   list gets the written row (or loses the removed one), as `saveAssumptions` already does
   for the assumptions. The ADR 0128 §6 check then sees it. Load sample and Clear sample are
   unchanged: they replace the data on purpose, and the compare notice names any scenario it
   leaves out (ADR 0123 §5).
3. **A preset click matches a saved scenario by its settings, not its name.** A saved
   scenario whose overrides equal the preset's (same fields set, equal values) is ticked for
   compare instead of saving a row, and the "Already saved" toast names that saved scenario.
   Names stay free: a saved scenario with the preset's name but other settings no longer
   blocks the preset, which is saved as its own row.

No new dictionary key; `scenarios.alreadySaved` gets the saved scenario's name.

## Consequences

- State and selection only: no computed number, parity target, golden master or export
  content changes. While the screen is stale, the Scenarios list and compare now show an
  added or duplicated scenario and drop a removed one.
- A renamed preset, or one saved in another language, is found again by its settings. ADR
  0093's language-switch caveat no longer applies.
- Two rows can share a preset's name (an edited preset that kept its name, then the preset
  itself). The list's overrides summary tells them apart; the compare headers, chart legends
  and export columns show both under the same name. Free names were already the form's
  rule.
- An edited preset whose settings match another preset again counts as that preset.
