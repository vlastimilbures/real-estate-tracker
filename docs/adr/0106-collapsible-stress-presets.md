# 0106. Scenarios: collapsible stress presets

- Status: Accepted
- Date: 2026-10-03
- Source: issue #54 (Scenarios critical review after #15)

## Context

The Scenarios page renders the Stress presets panel, then the scenario list, then the
compare. With a few saved scenarios the Key figures table starts low on a 1280×800 window and
the charts are far below it. The presets panel grew with the Combined group (ADR 0104). Once
the user has saved scenarios, the compare is what they work with; the presets are used less.

Issue #54 offered two layouts: collapse the presets panel, or move the list and presets into
a side column on wide windows. A side column narrows the compare tables and charts and needs
a new breakpoint; collapsing keeps one column and works at the 900×600 minimum window.

## Decision

1. **Collapse only.** The page keeps its single-column order. No side column.
2. The Stress presets panel has a **Show presets / Hide presets** button in its header
   (`aria-expanded`, `aria-controls` the panel body).
3. **Default:** when the page opens, the panel is collapsed if at least one scenario is
   saved, and open if none is. The default is decided when the page opens, so saving the
   first preset does not close the panel under the user's pointer; the next visit opens
   it collapsed.
4. **A manual Show or Hide sticks for the app session** (in memory, like the compare
   selection, ADR 0101) and then wins over the default. It is not saved across launches.
5. Collapsed, the panel shows one line saying what it holds. The preset buttons are not
   rendered, so they leave the tab order.

## Consequences

Display only: no computed number, parity target, golden master or engine output changes.
New strings in en, cs and ru: the two button labels and the collapsed summary. Tests that
render the Scenarios page reset the new session flag. The 42/43 ux-capture screens leave and
re-open the page before the capture, so they show the collapsed panel.
