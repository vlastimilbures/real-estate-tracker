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
   differ. Hover, keyboard focus or a click shows the text in a small popover under the
   button, kept inside the window. It stays open while the pointer is over the button or
   the popover. A click pins it open. Escape hides it without moving focus (and stops
   there, as a row action's tooltip does, ADR 0199), and so does a click outside it. The
   button carries `aria-expanded` and `aria-controls`, and the popover stays in the DOM
   while hidden. `Panel` and `EntityPanel` take `info?`, shown after the title and hint.
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

   Visible help lines that stay: `importPage.dropOnRow` and `scenarios.listHint`. The
   Loan outlook note and the Data check's as-of note move with their panels' rework
   (issues #423, #422).

## Consequences

- Panel bodies start with their data. A definition is one hover or one keypress away.
- No computed number, stored data, export or dictionary text changes. `common.aboutThis`
  now names the icon instead of the disclosure.
- The ux capture checks that an open popover sits inside the window at 1280 × 800 and at
  the 900 × 600 minimum.
