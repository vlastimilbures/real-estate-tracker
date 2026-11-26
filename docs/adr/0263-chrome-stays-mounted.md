# 0263. The app's chrome stays mounted across pages

- Status: Accepted
- Date: 2026-11-25
- Source: issue #601, which follows the behaviour-neutral split of #483 (PR #598). It adopts
  #131 option B, which ADR 0146 set aside. Draft in #601 comment 7166287437, approved by the
  owner on #601 on 2026-11-26 (comment 7178483933, as drafted).
- Amends: [0146](0146-app-shell-survives-page-errors.md) §1 and §4

## Context

Since #598, the chrome (`AppLayout`: skip link, sidebar, content column) is built in one
place, `PageBoundary`. It is keyed by the route, and the page boundary's fallback has its
own copy at another place in the tree. So the chrome still mounts again on a page change,
and again when a page throws or recovers, as when each page rendered its own `AppShell`.
Mounting it again is user-visible:

1. **Focus after a page change.** The nav button that was pressed leaves the page, so focus
   falls to `<body>`. `PageFrame` then moves it to `<main>` (ADR 0146 §4) through a
   module-level "last shown route" (`state/shellMemory.ts`).
2. **Focus when a page throws in place.** When the fallback replaces the page on the same
   route, focus that was in the sidebar falls to `<body>` and stays there. This is pinned
   by `ShellLifetime.test.tsx:211` ("a crash screen coming in drops focus from the sidebar
   to the page body").
3. **The sidebar's scroll position** goes back to the top. This matters in a short window,
   where the sidebar scrolls (`shell.css`, ADR 0219).
4. **Text selection, hover and native tooltips** in the sidebar are lost.
5. **First visit to a lazy page.** While the page's code loads, the whole window is blank:
   Suspense, around the layout, hides the outgoing chrome.

## Decision

1. **One chrome while the app is ready.** `PageBoundary` renders `AppLayout` once, with no
   route key. Suspense sits inside the layout, around the content column (`.content`). The
   boundary's fallback renders inside the same layout. The sidebar's nodes, scroll position
   and focus outlive a page change and a page error. They still go when the app leaves the
   ready state (loading, a boot or read-back failure), as today. This amends ADR 0146 §1:
   the fallback no longer brings its own chrome.
2. **Restate ADR 0146 §4.** "When the route changes and focus is on `<body>` **or in the
   chrome (skip link, sidebar)**, focus moves to `<main>`." Without this, a pressed nav
   button would keep focus. Focus a page places on purpose still wins (a dialog, a glossary
   term, a section).
   - _Note:_ the focus effect moves from a child of the page (`PageFrame`) to its parent
     (`AppLayout`). The page's own effects now run **before** it instead of after it.
     The "last shown route" becomes a ref in the layout, and `shellMemory.swapShownRoute`
     goes. The pins that prove focus a page sets still wins are in `NavFocus.test.tsx`,
     and they must pass unchanged:
     - the glossary term from a metric link (Guide's focus effect);
     - the ⌘N New Property dialog.
3. **A page that throws in place leaves sidebar focus where it is.** Today focus falls to
   `<body>` (Context 2); under this ADR it stays on the sidebar control.
4. **While a page's code loads** for the first time, the sidebar stays visible and the
   content column is empty.
5. **The sidebar keeps its scroll position** across pages.

Out of scope: taking "a dialog is open" from the layer stack instead of the DOM (a
modal-only layer flag for the menu bridge, #600).

## Consequences

- While the app is ready, the sidebar is mounted once. Behaviour changes 2-5 above:
  keyboard and pointer users keep a steady sidebar, and the focus rule has one more clause.
- Unchanged: kept banners (`useFirstShow`), the window scroll to the top, `--topbar-h` and
  its ResizeObserver. They belong to the page's frame (`PageFrame`), which still mounts per
  page.
- Tests: the #483 lifetime pins in `ShellLifetime.test.tsx` change on purpose and become
  the new rules:
  - node identity per route;
  - focus on a throw in place (`:211`);
  - the chrome hidden while a lazy page loads.

  `NavFocus.test.tsx` stays unchanged.
