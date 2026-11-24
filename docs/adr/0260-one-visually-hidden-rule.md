# 0260. One visually-hidden rule

- Status: Accepted
- Date: 2026-11-24
- Source: #495 (part 4, PR C1; plan in #495 comment 7123640803), approved by the owner on
  2026-11-24 (the next comment on #495); owner decision 2026-11-18 to merge the
  near-duplicate classes one group at a time, starting with visually hidden (#435 comment
  6965976270); tracking #435
- Related: [0199](0199-icon-only-row-actions.md) (the row-action tooltip that names an
  icon-only button), [0215](0215-property-detail-top.md) §2 (the `propertyDetail.deactivate` /
  `propertyDetail.activate` label hidden below a 1100 px window), [0157](0157-accessibility-batch.md) (visually hidden
  `common.actions` in the action-column headers)

## Context

Three rules hid text visually while keeping it for screen readers:

- **A.** `.sr-only` in `src/ui/components/layout.css`, nine declarations:
  `position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden;
clip: rect(0 0 0 0); white-space: nowrap; border: 0`. 22 places in the source used it.
- **B.** `.row-action-tip` at rest in `src/ui/components/table.css`, the same nine
  declarations copied (ADR 0199). Its hover / focus-visible rule reveals it.
- **C.** `.topbar .narrow-hide` inside `@media (max-width: 1099px)` in
  `src/ui/components/shell.css` (ADR 0215 §2): `position`, `width`, `height`, `overflow`
  and `white-space` as A, but `clip-path: inset(50%)` instead of `clip`, and no `padding`,
  `margin` or `border`.

The three differ by a 1 px margin and a clipping property. Nothing in the design calls for
the differences.

## Decision

1. **`.sr-only` is the one visually-hidden block.** Its nine declarations stay exactly as
   they are.
2. **The row-action tooltip hides with `.sr-only` at rest.** The span is
   `sr-only row-action-tip`, and table.css no longer has an at-rest `.row-action-tip`
   block. The reveal rule (`.row-action:not(.tip-off):hover > .row-action-tip` and its
   `:focus-visible` twin, specificity 0,4,0) only reveals: it resets every hiding property
   `.sr-only` sets (`width`, `height`, `margin`, `overflow`, `clip`, `padding`). Computed
   style is unchanged at rest and revealed.
3. **`.topbar .narrow-hide` keeps its media query** (a class cannot be applied from a
   media query) **and copies `.sr-only`'s block word for word**, in the same order. Below a
   1100 px window the label now has `margin: -1px` and `clip: rect(0 0 0 0)` instead of
   `clip-path: inset(50%)`, and `padding: 0` and `border: 0` are now explicit. At 1100 px
   and wider nothing changes.
4. **A test keeps it so.** `src/ui/styles/__tests__/visuallyHidden.test.ts` fails when a
   rule other than `.sr-only` and `.topbar .narrow-hide` has the hidden shape (`width: 1px` and
   `height: 1px` with `overflow: hidden` or `clip`, or with a `clip` or `clip-path`
   declaration), when the two blocks differ, when `.sr-only` loses one of its nine
   declarations, or when the tooltip's reveal stops resetting a hiding property to its
   shown value (`width` and `height` auto, `margin: 0`, `overflow: visible`, `clip: auto`,
   a non-zero `padding`).

## Why

One block is one thing to get right. A screen-reader fix to `.sr-only` (for example a
change of clipping technique) now reaches every hidden label, and a new hidden label has
one rule to use, not three to choose from.

## Risk

None visible. Before and after, the label is a 1 × 1 px, fully clipped, absolutely
positioned box. The new −1 px margin could move the narrow top-bar label's box by
(−1, −1) px; measured, it does not move (Capture results), and it causes no overflow or
scroll. Accessible names are unchanged (`propertyDetail.deactivate`,
`propertyDetail.activate`, `propertyDetail.activating` and the row-action labels). A test or scene that queries `.sr-only` could now also match a tooltip span; every
current query was checked and is scoped to a cell, tile or marker without row actions.

## Capture results

2026-11-24, en × light and dark × 1280×800 and min (900×600): 88 screens and 2 manifest
checks per variant, 360 runs per tree, head against origin/main @ e7a830a9 (`git archive`).

| Check                                         | Result                                                                                                                                                                  |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Built CSS (unminified, one rule per selector) | 3 entries differ, all allow-listed: the at-rest `.row-action-tip` rule removed, and `.topbar .narrow-hide` (in its 1099 px query) from 6 declarations to `.sr-only`'s 9 |
| Screens run, layout assertions included       | 360 passed on each tree                                                                                                                                                 |
| axe (`pnpm ux:axe-check`)                     | 388 scans, 0 violations                                                                                                                                                 |
| `pnpm ux:diff` (default thresholds)           | 404 shots; 3 over the threshold, all #536 flakes (below)                                                                                                                |

A computed-style probe (12 properties and the page box of every `.sr-only`,
`.row-action-tip` and `.narrow-hide` element, on every shot; 6,748 elements) found:

- **`.sr-only`** (5,520) and **the row-action tooltip** (1,132) identical on both trees,
  at rest and revealed (10c: the revealed tooltip has the same size, padding, transform and
  box).
- **`.narrow-hide` at 1280×800** (48) identical.
- **`.narrow-hide` at min** (48): only `margin` (0 → −1px), `clip` (auto →
  `rect(0px, 0px, 0px, 0px)`) and `clip-path` (`inset(50%)` → none) differ. The box does
  not move: the label is the abspos child of a flex button, and its static position centres
  its margin box, so the −1 px margins on both sides cancel.

The three shots over the threshold are 26 (light and dark) and 29 (light) at 1280×800,
both on the #536 list, where the label is not hidden and the probe is identical. Re-captured
three more times on each tree, main itself produces the 6,814 px state of 26 dark (two of
three runs), and two head re-captures match the first main run on all four shots. With
both thresholds at 0, four more shots differ, all under the default thresholds: 21, 22 and
26 dark at min by 36 px of at most 2 levels in the top bar's right-hand buttons (not the
label's button), 10c light by 9 px of 2 levels, and 52 light by 63 px (13 over the default
tolerance) in one text line near the bottom left, where no hidden element is.

By owner decision of 2026-11-24, this evidence is kept as text and no images are
attached. Seven before/after pairs were compared: `10c-properties-row-action-tooltip` at
1280×800 light and dark, `20-property-detail` at min light and dark and at 1280×800 light,
and `23-property-deactivate-confirm` and `83-property-inactive` at min light. They are
byte-identical PNGs except 10c light, which differs by 9 px at 2 colour levels, below the
ux:diff tolerance (8 levels). Across the run, ux:diff compared 404 shots with 3 over the
threshold (the #536 flakes above), and the probe found the differences listed above and no
others among 6,748 elements.

## Consequences

- One visually-hidden block in the stylesheets; a copy of it is allowed only where a media
  query must apply it, and the test keeps that copy equal.
- The remaining near-duplicate groups of #495 (buttons, banners, pills) stay open.
