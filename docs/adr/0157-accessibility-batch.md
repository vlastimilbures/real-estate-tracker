# 0157. Keyboard and screen-reader batch: dropdown, dialog stack, headings, tabs, contrast

- Status: Proposed
- Date: 2026-10-08
- Source: issue #128 (2026-10 code review, findings R5-05, R5-14, G2-3-09, G2-3-10,
  R5-15); owner decision D12 (2026-10-08: option A, keep the custom popover and fix the
  whole batch, plus axe best practices); issue #276 item 2 (the empty-state heading level);
  Track 11 PR 11.8
- Amends: [0057](0057-ux-capture-tool.md) (the axe scan adds the `best-practice` rule set
  to WCAG 2.2 AA)
- Related: [0078](0078-ux-a11y-round-b-charts-menu-axe.md) (CI fails on any axe violation),
  [0107](0107-property-section-nav.md) (section headings take focus),
  [0114](0114-a11y-skip-link-charts.md) (the previous accessibility round)

## Context

The axe scan of `pnpm ux:capture` ran the WCAG tags only, so axe's best-practice rules
(`page-has-heading-one`, `heading-order`, `empty-table-header`, landmarks) never ran. The
review found five gaps on fresh `main`:

1. **R5-05, the property selector past five options.** Both dropdown modes called
   `useModalA11y` when the component mounted, while the popover was closed, so opening it
   never moved focus in. Every option was a Tab stop, only Enter worked, and Escape from an
   option left focus on `<body>`. The trigger had no `aria-controls`. The search box sat
   inside the `listbox`, and a multiple selection was named in English in every language.
   No ux screen opened the dropdown: the sample has five properties.
2. **R5-14, one Escape closed stacked dialogs.** Every `useModalA11y` listened for Escape on
   the document, with no notion of the top-most dialog, and `menu://about` opened About
   even with a dialog open. About re-implemented the `Modal` chrome.
3. **G2-3-09.** The action columns of the Properties table and the records tables had an
   empty `<th>`.
4. **G2-3-10.** `.proj-na` used `--ink-faint` on the `--paper-2` totals rows (4.41:1). In
   dark mode `--negative` fell to 4.47:1 on a hovered row, 3.98:1 on a milestone row, and the
   `.badge.bad` text to 3.88:1 on a hovered row. Axe cannot see a hover in a screenshot.
5. **R5-15.** No page had an `<h1>` (the title was a `<div>`); panels were `h3`, so every
   page skipped a level, and the empty-state notices were `h3` right under the title
   (#276 item 2). The Settings tabs had the tab roles but not the pattern (every tab a Tab
   stop, no arrows, no `aria-controls`, `role="tablist"` on a `<nav>`). The persistent loan
   warnings were `role="alert"`, so each visit to Property detail announced them as news.

## Decision

1. **Dropdown (D12 = A).** The custom popover stays. Its open list is a child component
   that mounts on open, so `useModalA11y` moves focus in and, on Escape or a pick that
   closes the list, returns it to the trigger. The options use a roving tabindex (one Tab
   stop): ArrowUp/ArrowDown move, Home/End jump, Space and Enter pick. Focus starts on the
   selected option (single mode) or on `common.all` (multi mode); ArrowDown or ArrowUp on
   the trigger opens the list. Tabbing out or clicking elsewhere closes it without pulling
   focus back. The trigger has `aria-controls`; the listbox is named and holds options
   only (the search box sits beside it). A multiple selection reads `common.nSelected`.
   The two modes share one implementation. The look is unchanged, plus a focus ring on the
   focused option.
2. **Dialog stack.** `useModalA11y` keeps a stack of open dialogs and popovers: Escape and
   the Tab trap act on the top-most only, so one Escape closes one layer. On close, focus
   returns to the opener only when it was lost with the dialog's nodes. `menu://about`
   waits for an open dialog like the other menu items, and About renders through `Modal`
   (its scrolling body stays a focusable region, UX-071).
3. **Action columns.** Both headers carry a visually hidden `common.actions`.
4. **Contrast.** `.proj-na` uses `--ink-soft`. Dark `--negative` becomes `#ea8c7e` (6.37:1
   on the surface, 5.33:1 on a hovered row, 4.74:1 on a milestone row; the red badge 4.52:1
   on a hovered row), and `--negative-wash` follows its colour. A unit test composites the
   translucent row washes from `tokens.css` and checks 4.5:1 for these cases in both themes.
   The dark `--ink-faint` comment is corrected (4.55:1 on the surface, not 4.3:1).
5. **Headings.** The page title is the page's `<h1>` (it keeps its look). Panel titles,
   empty states, the getting-started card, dialog titles and the crash and invalid-data
   notices are `h2`; their subheads are `h3`. An empty state inside a titled panel is `h3`.
   In About, the dialog title is the `h2`, its sections `h3`, and the app name a styled
   paragraph. The startup screens (loading, database failure, restored) are the `<main>`
   landmark with an `h1`: the eyebrow line, or the app name for screen readers only on the
   restored screen.
6. **Settings tabs.** The tablist is a vertical `div` (not the `<nav>`), with one Tab stop
   on the selected tab. Arrows, Home and End move focus; Enter or Space switches. This is
   manual activation, because a switch can raise the unsaved-changes guard and moving focus
   alone must not. Tabs and panel reference each other (`aria-controls`,
   `aria-labelledby`).
7. **Loan warnings** are `role="status"`.
8. **Axe gate.** `AXE_TAGS` adds `best-practice`. No rule is excluded: on the full capture
   run (en, light and dark, 1280×800 and the minimum window) every screen has zero
   violations. New screens `05b-dashboard-filter-open` and `30b-projections-entity-open`
   add a sixth property and scan the open dropdowns.

## Consequences

- Keyboard and VoiceOver users can work the property selector, stacked dialogs and the
  Settings tabs, and the heading rotor reads an outline with one `h1` per page.
- New dictionary keys: `common.actions`, `common.nSelected`. No existing text changes.
- Visual changes: dark-mode red text and badges are a little lighter, the N/A dash in light
  totals rows is a little darker, and a focused dropdown option shows a focus ring. The
  heading and landmark changes keep the look.
- No computed number, stored data or export changes; parity targets and the golden master
  do not move.
- A best-practice violation now fails the CI axe job, like a WCAG one.
