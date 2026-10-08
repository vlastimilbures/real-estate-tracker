# 0158. Layouts hold in Czech and Russian at the minimum window

- Status: Accepted
- Date: 2026-10-08
- Source: issue #134 (2026-10 code review, findings G2-3-01, G2-3-03, G2-3-04); owner
  decision D13 (2026-10-08: option A, layouts that do not depend on string length, plus a
  CI check in Czech and Russian; the section nav wraps; CI checks the layout screens);
  Track 11 PR 11.9
- Amends: [0085](0085-properties-long-names.md) (the risk-column promise holds in every UI
  language; headers and band badges may wrap),
  [0107](0107-property-section-nav.md) (the section nav wraps instead of scrolling
  sideways), [0078](0078-ux-a11y-round-b-charts-menu-axe.md) (CI also captures the layout
  screens in Czech and Russian)
- Related: [0106](0106-collapsible-stress-presets.md) (the Scenarios page layout),
  [0157](0157-accessibility-batch.md) (axe with best practices, 0 violations)

## Context

Several layouts were sized for English strings. At the minimum window (900×600) in Russian:

1. **Properties list.** The `properties.colNetCashFlow` header never wrapped and the LTV
   band badge (`properties` LTV cell, `bandPill`) is long, so Net cash flow slid 76 px under
   the pinned Edit/Delete column. ADR 0085 promises LTV and Net cash flow in view at the
   minimum window. Czech had 12 px to spare. CI ran the capture harness in English only, so
   the existing screen-14 assertion never ran in Czech or Russian.
2. **Clipped controls.** The Financing panel's reset-window toggle
   (`dashboard.financingWindowOption`) shrank inside a panel head that did not wrap, and
   `.segmented` hides its overflow, so the last option was cut. The Property detail section
   nav (`propertyDetail.sectionNavLabel`) scrolled sideways with a hidden macOS scrollbar, so
   `propertyDetail.sectionAmortization` was cut with no cue. This also happened in English
   at the minimum window.
3. **Scenario list.** Each row was its own grid, so the actions column was sized per row:
   `common.edit`, `scenarios.duplicate` and `common.delete` sat at a different x in each row,
   and the summary shrank to a 72 px, 9-line column in Russian.

## Decision

Owner, 2026-10-08 (D13 = A): fix the layouts so they do not depend on string length.

- **Properties list.** The word headers (`properties.colNetCashFlow`, `colValue`, `colDebt`,
  `colEquity`) are as wide as their text up to 11em and wrap to at most two balanced lines.
  A band badge in the LTV and DSCR columns wraps its word under the figure when the table is
  squeezed (the Pending and Inactive badges in the name cell do not). The
  metric headers (LTV, DSCR, NOI) are unchanged. The ADR 0085 promise (LTV and Net cash
  flow visible without scrolling at 1280×800 and at the minimum window, with a long name)
  now holds in English, Czech and Russian.
- **Panel heads.** The title and hint fill the row and shrink first, down to 16em (the hint
  wraps). Only then does the action (a toggle or button) wrap to a second row. An action
  never shrinks, and it stays at the right edge, on either row.
- **Section nav.** Its links wrap to a second row instead of scrolling sideways, so every
  link is visible. The sticky topbar is one row taller when that happens; an in-page jump
  still lands below it (`--topbar-h` follows its height), and the section the nav marks as
  current is measured from below the topbar's current height.
- **Scenario list.** One grid for the whole list, shared by every row (CSS subgrid), so the
  actions line up across rows. The summary column is at least 200 px wide. Where the list is
  narrower than 48rem, the summary moves under the name at full width (the actions stay on
  the name's row; the reading order is still name, summary, actions).
- **Checks.** `ux-capture` asserts, in every language: no clipped `.segmented` toggle or
  section nav link, Properties headers at most two lines, Net cash flow clear of the pinned
  actions, panel-head actions at the right edge, scenario actions at one x and a scenario
  summary at least 200 px wide (also at window widths 960 to 1160 px). CI runs
  the layout screens (01, 14, 20, 27, 42) in Czech and Russian, light, at 1280×800 and the
  minimum window, with the axe check.

Rejected: shorter Russian strings (B; fixes today's strings only and not the scenario grid)
and limiting ADR 0085 to English (C; documents the gap).

## Consequences

Layout only; no computed number changes. In narrow windows, Properties headers and band
badges can take two lines, panel heads can take two rows, and on Property detail the topbar
can take one more row (Russian and English at 900 px). The scenario list stacks the summary
under the name in narrow panels, in every language. Subgrid and container queries need
Safari 16, within the macOS 13 minimum; `text-wrap: balance` needs Safari 17.5, and before
that the lines wrap unbalanced (same line count). The app font has no Cyrillic, so Russian
renders in the system fallback font, which differs between macOS and the Linux CI runner;
the CI check measures the fallback there. CI takes about a minute longer.
