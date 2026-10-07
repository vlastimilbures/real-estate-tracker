# 0146. App shell: the sidebar survives page errors; navigation resets the error and moves focus

- Status: Proposed
- Date: 2026-10-07
- Source: issue #131 (review findings R5-04, R4-10, G2-5-04, R5-03), option A; Track 10 PR 10.7
- Related: [0075](0075-input-rejection-gaps.md) (stored data that breaks a rule shows the
  UX-049 invalid-data notice)

## Context

Every page renders its own `AppShell`, and `App` picks the page by route. Three faults followed.

- **The sidebar disappears on an engine error (R5-04, R4-10).** Dashboard, Properties,
  Projections and Import call the engine before they render their `AppShell`. When stored
  data breaks an engine rule (for example rows written by an older app version), the
  `EngineInputError` reaches the App-level boundary, which replaces the whole window with the
  invalid-data notice. Import ran the full engine only to get the property names, so the page
  that could load a corrected CSV did not open either.
- **The App-level boundary never resets (G2-5-04).** It kept its error until "Try again" or
  "Open property" was pressed. The native menu (⌘1–⌘5, ⌘,) changed the route, but the notice
  stayed.
- **Focus is lost on navigation (R5-03).** A page change unmounts the shell, including the nav
  button just pressed. Focus falls to `<body>`, the next Tab starts again at the skip link, and
  a screen reader is not told that the page changed.

Issue #131 option A planned to render `AppShell` first in Dashboard, Properties and
Projections, with the engine call in a child. This does not work as written: the Dashboard
subtitle uses the as-of date the engine resolves, the lens toggle is hidden when there is no
engine result, and the Properties subtitle uses the snapshot date. An outer shell cannot show
those headers without calling the engine itself. The owner chose a fallback shell instead
(2026-10-07).

## Decision

1. **A page error keeps the sidebar.** `App` wraps the current page in a `PageBoundary`. When
   the page throws while rendering, its fallback is an `AppShell` with the page title and no
   lens toggle, and inside it the same notice as before: the invalid-data notice for an
   engine input error, otherwise the generic "Something went wrong" message. This covers all
   eight pages. The pages themselves are unchanged. The App-level boundary stays as a backstop
   for a crash outside the page (the shell, dialogs).
2. **Import reads property names from the stored portfolio.** The CSV checks for known
   property names use `portfolio.properties`, not the engine snapshot. For valid data the
   names are the same (the snapshot lists every property); with invalid data Import now opens.
3. **Navigation clears an error.** `ErrorBoundary` gets a `resetKey`; when it changes while an
   error is shown, the boundary renders its children again. `PageBoundary` and the App-level
   boundary use the route as the key. AppShell's inner boundary needs none: the shell mounts
   again with each page.
4. **Focus moves to the main region after navigation.** When the route changes and focus was
   lost (it is on `<body>`), focus moves to `<main id="main">` (already focusable for the skip
   link, no visible ring) without scrolling. Focus is not moved at startup, so the first Tab
   still reaches the skip link. Focus that the new page sets on purpose wins: a dialog opened
   by ⌘N, a glossary term from a metric link, a section from a data check link.

## Consequences

- With invalid stored data the sidebar, Settings (backup restore) and Import stay usable, and
  the notice shows only on pages that need engine figures. While it shows, the header has the
  page title only.
- Menu shortcuts and sidebar clicks leave a crash notice behind them.
- Keyboard and screen-reader users land in the new page's content after navigation; Tab
  continues from there.
- No computed number, parity target or golden-master change.
- The per-page shell remount stays (option B in #131 would hoist the shell); the sidebar and
  its effects are still rebuilt on every navigation.
- Tests: the review probes R5-04A, R4-10A, VG2504A and VR503A became regression tests, plus
  pins that startup focus and a glossary-term focus are unchanged.
