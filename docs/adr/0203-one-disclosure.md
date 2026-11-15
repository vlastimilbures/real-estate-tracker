# 0203. One disclosure: a quiet chevron button

- Status: Accepted (delegated, owner review pending)
- Date: 2026-11-15
- Source: issue #381 (UX/UI review 2026-11, tracking #392, finding F10); direction approved
  by the owner on 2026-11-15; acceptance delegated by the owner for the 2026-11-15 run
  (comment on #392)
- Amends: [0107](0107-property-section-nav.md) (the amortization toggle moves from the
  panel body to the panel head)
- Related: [0106](0106-collapsible-stress-presets.md) (presets open state, kept),
  [0118](0118-data-check.md) (Data check open state, kept),
  [0144](0144-small-user-visible-corrections.md) (interest saved by property),
  [0160](0160-csv-import-and-stored-loan-events.md) (an add with notes opens), [0201](0201-button-roles.md)

## Context

1. Showing and hiding a section was done three ways: a quiet chevron button in a panel
   head (Data check, stress presets, the property form's Acquisition), an outlined button
   inside a panel body (the amortization schedule), and the browser's `<details>` with
   its triangle (Financing's interest saved "By property", the Import summary's "Will add"
   / "Will update" lists).
2. Each looked and behaved differently: the `<details>` triangle has its own focus ring
   and no chevron; the amortization toggle took a row of its own.

## Decision

1. **One component,** `DisclosureButton` in `src/ui/components/Disclosure.tsx`: a quiet
   (ghost, small) button with a chevron (down when shut, up when open), `aria-expanded`
   and `aria-controls` naming a region that is always in the DOM (`hidden` while shut),
   the same focus ring as every button. Enter and Space toggle it, as any button.
   `Disclosure` wraps it with its own open state and region, for sections whose state is
   not remembered.
2. **Placement:** in a panel head it sits on the right (Data check, stress presets,
   amortization: before "Export to Excel"); inside a body it leads the line it opens
   (Acquisition, interest saved by property, the Import lists).
3. **Remembered state stays remembered:** Data check and the presets for the session
   (uiStore), the amortization schedule as before. The Import lists keep their defaults:
   an add list opens when one of its adds has notes (ADR 0160), the update list opens in
   the preview; when the default changes (preview to report), the list takes the new
   default, as `<details open>` did.
4. **No `<details>` in `src/ui`.** Text of the toggles is unchanged
   (`propertyDetail.showAmortization`, `hideAmortization`,
   `dashboard.financingInterestSavedByProperty`, `importPage.willAdd`, `willUpdate`,
   `added`, `updated`).
5. **What assistive technology announces:** a `<summary>` was read as a disclosure
   triangle ("summary, collapsed" in VoiceOver); it is now "button, collapsed" /
   "expanded", and the region it controls is skipped while hidden, as a closed
   `<details>`'s content was. The button's name is its text, as the summary's was.

## Consequences

- Every show/hide reads and works the same; the chart Table toggles stay pressed-state
  toggles (`aria-pressed`), not disclosures.
- Property detail's amortization panel loses its toggle row: the schedule starts right
  under the head when open.
- No computed number, stored data or remembered state changes.
