# 0220. Scenarios: the presets fold into the Scenarios panel

- Status: Accepted (delegated, owner review pending)
- Date: 2026-11-16
- Source: issue #417 (UX/UI review 2026-11, round 2, tracking #425); direction approved
  by the owner on 2026-11-16 (point 8 of the round-2 plan); acceptance delegated by the
  owner for the 2026-11-16 run
- Amends: [0106](0106-collapsible-stress-presets.md) (the presets become a disclosure in
  the Scenarios panel instead of a panel of their own), [0217](0217-info-tip.md) §4 (the
  presets' explanation is the Scenarios panel's info icon)
- Related: [0216](0216-scenario-compare-layout.md) (Key figures and the three charts,
  unchanged), [0203](0203-one-disclosure.md) (the shared disclosure),
  [0101](0101-scenario-session-state.md) (session state, unchanged)

## Context

Above the compare, the Scenarios page had two panels: Stress presets, with a Show/Hide
toggle and, while hidden, a line saying the presets are hidden, and then the Scenarios
list. Both are ways to fill one list, but they read as two separate things, and the
compare starts lower on the page.

## Decision

1. **One panel, "Scenarios"** (`scenarios.listTitle`). The head holds:
   - the title;
   - the hint `scenarios.comparedOf(n, max)` ("1 of 3 compared"; Base does not count);
   - the info icon with `scenarios.presetsHint`;
   - an **"Add from preset"** disclosure (`scenarios.addFromPreset`, ADR 0203). It
     controls a region under the list that holds the preset bar under the sub-heading
     `scenarios.presetsTitle`.
2. The **open state is unchanged** (ADR 0106): open by default while nothing is saved
   when the page opens, and a manual open or close holds for the app session.
3. **Body:** the instruction `scenarios.listHint` stays a visible help line (ADR 0217),
   then the list, then the presets region. Rows are denser: one line of tick, name,
   summary and row actions, with less padding. The summary still moves under the name in
   a narrow panel.
4. **Removed:** the separate Stress presets panel, its Show/Hide labels
   (`scenarios.showPresets`, `scenarios.hidePresets`) and the collapsed line
   `scenarios.presetsCollapsedSummary`. That line only said that the presets were
   hidden, which the closed "Add from preset" disclosure now shows. Logged in #415.
5. Key figures and the three charts below are unchanged (ADR 0216).

## Consequences

- There is one panel fewer above the compare, and the presets sit where scenarios are
  added. The count of compared scenarios is visible in the head.
- No computed number, stored data or export changes. Dictionary: new
  `scenarios.addFromPreset` and `scenarios.comparedOf` (en, cs, ru); three keys removed
  (§4).
