# 0104. Scenarios: combined stress presets

- Status: Accepted
- Date: 2026-10-03
- Source: issue #55 (Scenarios critical review after #15)

## Context

Each stress preset changes one thing: a rate shock, an inflation shock or a price crash. A
realistic stress test combines shocks, for example rates +4 pp at refix and a −20 % price
crash. Today the user must open the form and enter both by hand. The scenario overrides
already hold every shock at once, so no engine change is needed.

## Decision

1. The Stress presets panel gets a fourth group, "Combined", with two fixed recipes:
   - **Mild**: rates +2 pp and a −10 % price crash.
   - **Severe**: rates +4 pp, inflation +3 pp and a −20 % price crash.
2. The rate and inflation shocks last the default shock length (3 years), like the single
   presets, then revert. The crash is permanent.
3. The crash uses the "When" timing (ADR 0101), like the single crash buttons. A button shows
   its timing when it is not Start: "Mild @ +5y". At Start it shows "Mild".
4. The saved name lists the parts with the single presets' own wording, for example
   "Mild: Rates +2pp for 3y · Price crash −10%" or "… · Price crash −10% @ +5y". The button
   tooltip is that name; at Start it also names the projection start date.
5. An already saved combined preset is found by name and not added twice (ADR 0093).

## Consequences

Display and data entry only: no computed number, parity target, golden master or engine
output changes. New strings in en, cs and ru: the group label, the two recipe names and the
name pattern.
