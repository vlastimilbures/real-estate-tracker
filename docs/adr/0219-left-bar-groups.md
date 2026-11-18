# 0219. Left bar: the pages on top, the tools above the footer

- Status: Accepted
- Date: 2026-11-16
- Source: issue #419 (UX/UI review 2026-11, round 2, tracking #425); direction approved
  by the owner on 2026-11-16 (point 10 of the round-2 plan, with the owner's answer
  "leave the footer as it is"); acceptance delegated by the owner for the 2026-11-16 run
- Related: [0105](0105-one-product-name-and-format-note.md) (the sidebar brand, unchanged),
  [0110](0110-backup-recency-indicator.md) (the backup hint in the footer, unchanged),
  [0146](0146-app-shell-survives-page-errors.md) (where focus goes after a page change,
  unchanged)

## Context

The left bar lists seven pages in one column: Dashboard, Properties, Projections,
Scenarios, Import, Settings, Guide. The first four are where the portfolio is read. The
last three are tools the owner opens now and then. In one list they all look the same,
and a tall gap separates the list from the footer.

## Decision

1. The navigation has **two groups** in one `<nav>`:
   - **Pages** at the top: Dashboard, Properties, Projections, Scenarios.
   - **Tools** pinned to the bottom of the bar, right above the footer, behind a hairline:
     Import, Settings, Guide.
2. The **footer is unchanged** (backup hint, language, theme, projection start, offline
   note), at the owner's choice.
3. The **collapsed bar** keeps both groups, the hairline and every icon's tooltip.
4. The order, labels, icons, keyboard order (top to bottom) and active state do not
   change.

## Consequences

- The four reading pages stand apart from the tools. The free space now separates the
  pages from the tools instead of the list from the footer.
- In a window too short for the bar (900 × 600 with a long backup hint), the bar scrolls
  instead of letting the tools overlap the footer.
- The groups are visual only. The bar is still one `<nav>` in the same tab order, and
  naming the groups for screen readers would need new dictionary entries.
- No dictionary, computed number, stored data or export changes.
- The ux capture checks the two groups at 1280 × 800 and 900 × 600, in the expanded and
  the collapsed bar: the tools sit under the pages and above the footer, and nothing
  overlaps.
