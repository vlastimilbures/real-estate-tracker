# 0093. Scenario add flow: no duplicate presets, new scenarios join the compare

- Status: Accepted
- Date: 2026-10-03
- Source: issues #48 and #49 (Scenarios critical review after #15)

## Context

1. Each click on a stress preset saves a new scenario, even when one with the same name
   exists. Two clicks on "+2 pp" give two "Rates +2 pp for 3y" rows that cannot be told apart
   in the list, the compare headers or the chart legends (#48).
2. A scenario added from a preset, the form or Duplicate is not ticked for compare. With
   Base alone ticked, adding a preset seems to do nothing below the list (#49).

## Decision

1. A preset click whose name matches a saved scenario exactly creates no row. The existing
   scenario is ticked for compare (same rule as point 2) and the toast says "Already saved:
   …". There is no Undo action; one-click save stays (triage of #15).
2. After a successful add (preset, "New scenario" form or Duplicate), the new scenario is
   ticked for compare when fewer than 3 saved scenarios are ticked. At the limit the selection
   is unchanged, nothing is unticked, and the toast says that compare already shows 3
   scenarios. Editing a scenario does not change the selection.

## Consequences

Selection and messages only; no computed number, parity target or engine output changes.
Preset names are built in the UI language, so a preset saved in Czech does not match the
English name of the same preset; switching language and clicking it again saves a second row.
