# 0269. A page's one-shot request travels with the navigation and ends with the visit

- Status: Accepted
- Date: 2026-11-26
- Source: issue #468, step 5 (code review 2026-11, CR-16, R04-07, tracking #435). The owner
  decided on #468 on 2026-11-26: do the tagged route and drop stale requests; keep that
  going to the page already shown never asks, keep that a repeated ⌘N re-opens Add, and
  keep `guardedAction` a closure.
- Related: [0118](0118-data-check.md) (the Data check's landing targets),
  [0142](0142-row-switch-guard-busy-dialog.md) (the leave guard's guarded actions),
  [0072](0072-layer-map-platform-and-type-edges.md) (the layer map)

## Context

Three navigations hand their page a one-off request: File ▸ New Property… (⌘N) asks
Properties to open its Add form, a metric label asks the Guide to bring a glossary term
into view, and a Data check fix link asks Property detail to land on a section or open the
property form. Each was a store flag (`newPropertyRequested`, `guideTerm`,
`propertyTarget`) that the navigation set and the page cleared in an effect, two of them
after setting their own state during render to avoid a flash.

A flag stayed until its page cleared it. A request whose page never handled it (the page
did not mount, or failed first) was still there after the user left, and fired on a later
visit: the Add form opened, or the Guide jumped to a term, with nothing asked for. The
leave guard compared the flags with the fields a navigation sets, so a still-pending
request also changed what counted as "leaving the page".

## Decision

1. **One request field, tagged by page.** The three flags and their `clear…` actions are
   replaced by `request`: `{ page: "properties" }`, `{ page: "guide", term }` or
   `{ page: "property", target }`, each with an `id`, or null. Only the navigation that
   carries it sets it; every other navigation sets it to null. `route` stays the plain page
   name, and `selectedPropertyId` the open property, so the shell and the menu are
   unchanged.
2. **A request ends with its visit.** Leaving the page drops it, handled or not; a later
   visit starts without one. This is the one change users can see: a request its page
   never handled no longer fires on a later visit.
3. **The page acts on each request once, by its id.** It never clears the request. A
   repeated ⌘N on Properties makes a new id, so it re-opens Add. Properties and Property
   detail derive their open form from the request during render, with no `setState` in
   render.
4. **The leave guard compares the location by value.** A navigation moves when the page,
   the open property or the Settings tab changes, or when it carries a request. Going to
   the page already shown, with no request, never asks; a request on the page already
   shown asks, as a new location would. `guardedAction` keeps holding a closure (ADR 0142).

## Consequences

- No one-shot flag with a `clear…` action remains; Properties and Property detail set no
  state during render for a request (#468 acceptance).
- The leftover pins change from "still fires on the next visit" to "dropped" (the request
  pins in `OneShotLeftover.test.tsx` and `uiStoreGuardCompare.test.ts`).
- A request still waits on its own visit: Property detail lands on its target once the
  portfolio has loaded, as before.
