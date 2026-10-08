# 0085. Properties list keeps its risk columns in view

- Status: Accepted
- Date: 2026-10-03
- Source: issue #17 (pre-release review 2026-10, finding A05)
- Amended by: [0158](0158-layouts-hold-in-czech-and-russian.md) (the promise holds in every
  UI language; headers and band badges may wrap)

## Context

On Properties, the pinned name column had no width cap, so a long property name pushed LTV,
NOI, Net cash flow and DSCR off-screen at 1280×800. At the minimum window (900×600), LTV and
everything after it were cut off even with short names: the table needs about 800 px and has
about 600 px. The table's scroll shadow is painted on the scroll container's background, so
the opaque pinned name and action columns covered it, and nothing showed that more columns
were off to the side.

## Decision

Owner, 2026-10-03:

- The property name is cut to one line with an ellipsis at a capped width. Hovering shows the
  full name (`title`), and the accessible name stays the full name.
- The column order is Property, LTV, Net cash flow, DSCR, Value, Debt, Equity, NOI, at every
  width, so the risk and cash-flow columns come right after the name.
- In narrow windows, Edit and Delete show only their icons. Both stay visible, and their
  accessible names do not change. Delete is never hidden.
- When a table scrolls sideways, the pinned columns show an edge shadow on the side where
  more content is (pure CSS, scroll-driven where the engine supports it).

## Consequences

Layout only; no computed number changes. The short-name Properties screen changes, because the
column order changes. With a long name at 1280×800 and at the minimum window, LTV and Net cash
flow are visible without scrolling.
