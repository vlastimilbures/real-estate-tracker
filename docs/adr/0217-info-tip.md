# 0217. Definitions behind an info icon; instructions stay visible

- Status: Accepted (delegated, owner review pending)
- Date: 2026-11-16
- Source: issue #416 (UX/UI review 2026-11, round 2, tracking #425); direction approved
  by the owner on 2026-11-16 (point 7 of the round-2 plan); acceptance delegated by the
  owner for the 2026-11-16 run
- Amends: [0214](0214-panel-help-text.md) §2 and §4 (the "About this" disclosure is
  removed; definitions move from the body to an info icon in the head)
- Related: [0203](0203-one-disclosure.md) (the shared disclosure, unchanged elsewhere),
  [0199](0199-row-actions.md) (Escape hides a tooltip first, WCAG 1.4.13)

## Context

ADR 0214 moved explanations out of panel heads into the body: a help line, or an "About
this" disclosure when longer. Most of those texts are definitions (how a figure is
modelled, what a field means). Read once, they then take a line, or a button, at the top of
every panel on every visit, and push the data down. The texts the user needs in order to
act ("Drop a CSV file on its row", "Tick up to 3 scenarios") are a different kind of text.

## Decision

1. **Rule.** A definition, or a note on how something is modelled, goes behind an **info
   icon** beside the panel title or sub-heading. An instruction the user needs in order to
   act stays a visible help line at the top of the body (`Panel` `help`, `HelpText`).
2. **`InfoTip`** (`src/ui/components/InfoTip.tsx`): an "i" icon button. Its accessible
   name is `common.aboutThis` plus the topic ("About this: Valuations"), so two on a page
   differ, and the text is its accessible description (`aria-describedby`), read on focus
   whether or not it shows. Hover or keyboard focus shows the text in a small popover
   under the button (above it when there is more room there), kept inside the window
   and hidden while the button is scrolled under the top bar. It stays while the pointer
   is over the button or the popover. The button is a toggle: a click pins a hovered tip
   open, and closes a pinned one or one shown by focus alone. A pin ends when focus
   leaves the tip. Escape or a click outside hides it, and it shows again once the
   pointer or focus that showed it leaves and comes back. While the user is on the tip
   (hovering or focused), Escape stops there, as a row action's tooltip does (ADR 0199).
   A tip that is only pinned lets the Escape through to the form or dialog. The button
   carries `aria-expanded` and `aria-controls`, and the popover stays in the DOM while
   hidden. `Panel` and `EntityPanel` take `info?: string`, shown after the title and hint.
3. The `about` (disclosure) variant of `HelpText` is removed.
4. **Moved texts** (wording unchanged, nothing removed):

   | Text                              | Was (ADR 0214)            | Now                         |
   | --------------------------------- | ------------------------- | --------------------------- |
   | `propertyDetail.valuationsHint`   | "About this" disclosure   | info icon, Valuations       |
   | `propertyDetail.leasesHint`       | help line                 | info icon, Leases           |
   | `propertyDetail.mortgagesHint`    | help line                 | info icon, Mortgage blocks  |
   | `propertyDetail.holdingCostsHint` | help line                 | info icon, Holding costs    |
   | `propertyDetail.notOwnedHint`     | help line                 | info icon, Not owned yet    |
   | `propertyDetail.drawdownNote`     | "About this" disclosure   | info icon, drawdown heading |
   | `propertyDetail.acqNote`          | "About this" disclosure   | info icon, Acquisition      |
   | `assumptions.defaultsHint`        | help line                 | info icon, defaults panel   |
   | `backup.exportHint`               | help line                 | info icon, Export backup    |
   | `scenarios.presetsHint`           | help line in open presets | info icon, Stress presets   |

   The presets' explanation is now reachable from the icon while the presets are
   collapsed too, which replaces ADR 0214's amendment of ADR 0106 (shown only while open).

   Visible help lines that stay: `importPage.dropOnRow` and `scenarios.listHint`. The
   Loan outlook note and the Data check's as-of note move with their panels' rework
   (issues #423, #422).

## Consequences

- Panel bodies start with their data. A definition is one hover or one keypress away.
- No computed number, stored data, export or dictionary text changes. `common.aboutThis`
  now names the icon instead of the disclosure.
- The ux capture checks that an open popover sits inside the window at 1280 × 800 and at
  the 900 × 600 minimum.
