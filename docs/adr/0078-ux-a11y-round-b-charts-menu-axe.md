# 0078. UX and accessibility round B: chart tables, menu language, axe in CI

- Status: Accepted
- Date: 2026-10-02
- Source IDs: DR-144, DR-155, F-08, DR-180 (P16b plan)
- Builds on: ADR 0077, UX-023, UX-066, D-06 (legacy IDs, ADR 0081)

## Context

- **DR-144.** The charts have no text alternative and their tooltips need a mouse (UX-023
  only named the SVG). A keyboard or screen-reader user cannot read the plotted values.
- **DR-155.** The native menu items the app adds (About, Settings…, New Property…, View ▸
  pages) are English only, while the UI is en/cs/ru.
- **F-08.** The axe scan of `pnpm ux:capture` runs by hand only, so an accessibility
  regression reaches main unnoticed until the next UX round (D-06 kept Playwright optional).
- **DR-180.** The `42-scenarios-compare` capture orders its two presets by random id, so
  the screenshot flips between runs.

## Decision

Owner, 2026-10-02 (P16b plan):

1. **Every chart card has a "Show as table" toggle.** It swaps the chart for a table of the
   same rows (one row per year, one column per series, formatted like the rest of the app).
   Each card toggles on its own; the choice is not saved (UX-075).
2. **The app's own menu items follow the UI language.** The webview sends the labels from
   the en/cs/ru dictionaries to the Rust shell at start and on every language change. The
   items macOS supplies (Edit, Window, Quit…) and the submenu titles stay English (UX-076).
3. **CI runs the axe scan.** A CI job runs `ux:capture` in Linux Chromium for English,
   light and dark, at 1280×800 and the minimum window, and fails on any axe violation. This
   revisits D-06 for the axe scan only; Playwright E2E stays optional (UX-077).
4. **The capture harness creates ids in a fixed order** (DR-180), a tooling change with no
   effect on the app.

## Consequences

No computed number changes: parity, the golden master and the bench budgets are unchanged.
The visible changes are UX-075…UX-077. The menu shows English for a moment at start until
the webview sends its labels. A pull request now needs the axe job green as well.
