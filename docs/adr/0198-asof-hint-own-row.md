# 0198. As-of hint: its own row of the filter bar

- Status: Accepted (delegated, owner review pending)
- Date: 2026-11-15
- Source: issue #372 (UX/UI review 2026-11, tracking #392, finding F5); acceptance delegated
  by the owner for the 2026-11-15 run (comment on #392)
- Amended by: [0218](0218-dashboard-pill-and-chart-grid.md) (the hint row has no lead)
- Amends: [0088](0088-asof-basis-labels.md) §5 (where the hint sits)

## Context

1. A future As-of date shows a hint (`common.asOfHintProjection` and siblings, ADR 0088 §5)
   under the picker on the Dashboard and Property detail. It sat inside the picker's
   inline box with `flex-basis: 100%` and `contain: inline-size`, so it could never be
   wider than the picker (about 350 px). At 1280 × 800 it broke into two right-aligned
   lines in the middle of the bracket (capture `03-dashboard-asof-5y`), although the
   filter bar had about 600 px free.
2. The hint grew the picker's height, so the property chips, centred beside it, moved
   down when a hint appeared.

## Decision

1. **The hint is a row of the filter bar, not part of the picker.** `AsOfPicker` renders
   the picker group and, after it, the hint as a sibling. Both callers already place the
   picker as a direct child of `.filter-bar`, so the hint becomes the bar's last flex item
   with `flex-basis: 100%`, right-aligned, under the chips and the picker. It may use the
   bar's full width.
2. **The picker keeps its size and position** whether or not a hint shows: the hint no
   longer sits in the picker's box, and the first row (chips, picker) is laid out as
   before. The hint row sits 4 px under the picker (`margin-top` pulls the bar's 12 px
   row gap in), so it reads as the picker's note.
3. **The `contain: inline-size` workaround is removed.** At 900 × 600 the hint wraps
   inside the bar's width (at most two lines) and never widens the page.
4. **Accessibility is unchanged:** the hint keeps its generated `id`, and the date input
   is still described by it (`aria-describedby`, ADR 0088). The picker group's name
   (`common.asOfGroup`) does not change.
5. Same change on Property detail, through the same component.

## Consequences

- At 1280 × 800 the hint is one line on the Dashboard and on Property detail at +5y in en,
  cs and ru; the capture screens `03-dashboard-asof-5y` and the new
  `20b-property-detail-asof-5y` assert it, and that the picker does not move.
- `AsOfPicker` must be placed directly in a `.filter-bar` (both callers do); elsewhere the
  hint would be an ordinary inline sibling.
- Layout only: no computed number, dictionary text or stored data changes.
